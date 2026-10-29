import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getStorageConfig } from './storageConfig.js'
import { imageParamsToKey, objectKeyToImageUrl, isAcceptedImageUrl, resolveLegacyImageUrl } from './imageUrls.js'
import { pool } from './db.js'
import { registerFeatures } from './features.js'

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || !(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD))) throw new Error('Configure database credentials and a strong JWT_SECRET (32+ chars)')
const app = express()
app.disable('x-powered-by')
if (process.env.NODE_ENV === 'production') app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 2))
app.use(helmet())
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
// Cookie authentication must not permit cross-site form submissions or CSRF.
// Every mutating frontend request includes a non-simple header. A hostile site
// cannot add it without passing the CORS preflight, and CORS is restricted.
app.use('/api', (req, res, next) => {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next()
  if (req.get('X-QPaper-Request') !== '1') return res.status(403).json({error:'Missing request verification header'})
  const origin = req.get('Origin')
  if (origin && origin !== (process.env.CLIENT_ORIGIN || 'http://localhost:5173')) return res.status(403).json({error:'Origin not allowed'})
  next()
})
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next)
// HTTP cookies are allowed only for explicit localhost testing. A public
// deployment always requires HTTPS so login cookies cannot cross plain HTTP.
const localOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(process.env.CLIENT_ORIGIN || '')


// const sessionCookie = { httpOnly:true, secure:process.env.NODE_ENV === 'production' && !(localOrigin && process.env.COOKIE_SECURE === 'false'), sameSite:'lax', maxAge: 7*24*60*60*1000, path:'/' }

const sessionCookie = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE !== 'false',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/'
};


const publicUser = u => ({id:u.id,name:u.name,email:u.email,role:u.role})
const signIn = (res,u) => {res.cookie('qpaper_session',jwt.sign({sub:u.id},process.env.JWT_SECRET,{expiresIn:'7d'}),sessionCookie);res.json({user:publicUser(u)})}
const auth = asyncRoute(async(req,res,next)=>{
 const token = req.cookies.qpaper_session
 if (!token) return res.status(401).json({error:'Login required'})
 let payload; try {payload=jwt.verify(token,process.env.JWT_SECRET)} catch {return res.status(401).json({error:'Invalid or expired session'})}
 const {rows} = await pool.query('SELECT id,name,email,role,active FROM users WHERE id=$1',[payload.sub])
 if (!rows[0]?.active) return res.status(401).json({error:'Account disabled or missing'})
 req.user=rows[0]; next()
})
const roles = (...allowed)=>(req,res,next)=> allowed.includes(req.user.role)?next():res.status(403).json({error:'Permission denied'})
const authLimit=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-7',legacyHeaders:false})
const validEmail = e => typeof e==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <=255
app.get('/api/health/live',(req,res)=>res.json({ok:true}))
app.get('/api/health',asyncRoute(async(req,res)=>{await pool.query('SELECT 1');res.json({ok:true})}))
app.post('/api/auth/register',authLimit,asyncRoute(async(req,res)=>{
 if (process.env.ALLOW_SELF_REGISTRATION === 'false') return res.status(403).json({error:'Registration is invitation-only'})
 const {name,email,password}=req.body
 if(typeof name!=='string'||name.trim().length<2||name.length>120||!validEmail(email)||typeof password!=='string'||password.length<12||password.length>128)return res.status(400).json({error:'Valid name, email and password (12+ characters) required'})
 const hash=await bcrypt.hash(password,12)
 try {const {rows}=await pool.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'teacher') RETURNING *",[name.trim(),email.trim().toLowerCase(),hash]);signIn(res,rows[0])}
 catch(err){if(err.code==='23505')return res.status(409).json({error:'Email is already registered'});throw err}
}))
app.post('/api/auth/login',authLimit,asyncRoute(async(req,res)=>{
 const {email,password}=req.body
 if(!validEmail(email)||typeof password!=='string')return res.status(400).json({error:'Invalid login'})
 const {rows}=await pool.query('SELECT * FROM users WHERE email=$1',[email.trim().toLowerCase()])
 const u=rows[0]
 if(!u||!u.active||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:'Invalid credentials'})
 signIn(res,u)
}))
app.post('/api/auth/logout',(req,res)=>{res.clearCookie('qpaper_session',{path:'/',sameSite:'lax',secure:sessionCookie.secure});res.json({ok:true})})
app.get('/api/auth/me',auth,(req,res)=>res.json({user:publicUser(req.user)}))

const allowedTypes=new Set(['Objective','Subjective','Fill in the Blanks','Match the Following','True/False'])
const trimText=(v,max=10000)=>typeof v==='string'?v.slice(0,max):''
function validatePaper(p){
 if(!p||typeof p!=='object'||!p.info||!Array.isArray(p.sections)||p.sections.length>100)throw Object.assign(new Error('Invalid paper or too many sections'),{status:400})
 let qcount=0
 for(const s of p.sections){if(!Array.isArray(s.questions)||s.questions.length>250||!Number.isFinite(Number(s.marksPerQ))||Number(s.marksPerQ)<0||Number(s.marksPerQ)>10000)throw Object.assign(new Error('Invalid section'),{status:400});for(const q of s.questions){qcount++;if(!allowedTypes.has(q.type)|| (q.image && !isAcceptedImageUrl(q.image)))throw Object.assign(new Error('Invalid question type or image URL. Upload images first.'),{status:400});if(q.options && (!Array.isArray(q.options)||q.options.length>20))throw Object.assign(new Error('Invalid options'),{status:400});if(q.pairs && (!Array.isArray(q.pairs)||q.pairs.length>100))throw Object.assign(new Error('Invalid pairs'),{status:400})}}
 if(qcount>2000)throw Object.assign(new Error('Paper exceeds 2000 questions'),{status:400})
}
async function savePaper(client,p,author,id){
 const i=p.info
 let paperId=id
 if(id)await client.query('UPDATE papers SET school=$1,exam=$2,subject=$3,duration=$4,total_marks=$5,paper_type=$6,updated_at=now() WHERE id=$7',[trimText(i.school,255),trimText(i.exam,255),trimText(i.subject,255),trimText(i.duration,80),i.totalMarks===''||i.totalMarks==null?null:Number(i.totalMarks)||0,trimText(p.paperType,30),id])
 else {const {rows}=await client.query('INSERT INTO papers(author_id,school,exam,subject,duration,total_marks,paper_type) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[author,trimText(i.school,255),trimText(i.exam,255),trimText(i.subject,255),trimText(i.duration,80),i.totalMarks===''||i.totalMarks==null?null:Number(i.totalMarks)||0,trimText(p.paperType,30)]);paperId=rows[0].id}
 if (p.academicYearId !== undefined) await client.query('UPDATE papers SET academic_year_id=$1 WHERE id=$2',[p.academicYearId||null,paperId])
 await client.query('DELETE FROM sections WHERE paper_id=$1',[paperId])
 for(let si=0;si<p.sections.length;si++){
  const s=p.sections[si];const {rows:sr}=await client.query('INSERT INTO sections(paper_id,position,name,title,instructions,marks_per_question) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[paperId,si,trimText(s.name,20),trimText(s.title,255),trimText(s.instructions,3000),Number(s.marksPerQ)])
  for(let qi=0;qi<s.questions.length;qi++){
   const q=s.questions[qi];const {rows:qr}=await client.query('INSERT INTO questions(section_id,position,type,body,image_url,image_key,answer,bank_question_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[sr[0].id,qi,q.type,trimText(q.text),q.image||null,null,trimText(q.answer),q.bankQuestionId||null])
   for(let oi=0;oi<(q.options||[]).length;oi++)await client.query('INSERT INTO question_options(question_id,position,value) VALUES($1,$2,$3)',[qr[0].id,oi,trimText(q.options[oi],1000)])
   for(let pi=0;pi<(q.pairs||[]).length;pi++)await client.query('INSERT INTO question_pairs(question_id,position,left_text,right_text) VALUES($1,$2,$3,$4)',[qr[0].id,pi,trimText(q.pairs[pi]?.left,1000),trimText(q.pairs[pi]?.right,1000)])
  }
 }
 const {rows:vr}=await client.query('SELECT COALESCE(MAX(version_number),0)+1 AS n FROM paper_versions WHERE paper_id=$1',[paperId])
 await client.query('INSERT INTO paper_versions(paper_id,version_number,snapshot,saved_by) VALUES($1,$2,$3::jsonb,$4)',[paperId,vr[0].n,JSON.stringify(p),author])
 return paperId
}
async function ownsPaper(id,user){const {rows}=await pool.query('SELECT author_id FROM papers WHERE id=$1',[id]);return rows[0] && (user.role==='admin'||rows[0].author_id===user.id)}
app.get('/api/papers',auth,asyncRoute(async(req,res)=>{
 const sql=req.user.role==='admin'?'SELECT p.*,u.name AS author_name FROM papers p JOIN users u ON u.id=p.author_id ORDER BY p.updated_at DESC LIMIT 200':req.user.role==='student'?"SELECT p.*,u.name AS author_name FROM papers p JOIN users u ON u.id=p.author_id WHERE p.status='published' ORDER BY p.updated_at DESC LIMIT 200":'SELECT p.*,u.name AS author_name FROM papers p JOIN users u ON u.id=p.author_id WHERE p.author_id=$1 ORDER BY p.updated_at DESC LIMIT 200'
 const {rows}=await pool.query(sql,req.user.role==='teacher'?[req.user.id]:[]);res.json({papers:rows})
}))
app.get('/api/papers/:id',auth,asyncRoute(async(req,res)=>{
 const {rows}=await pool.query('SELECT * FROM papers WHERE id=$1',[req.params.id]);const p=rows[0]
 if(!p)return res.status(404).json({error:'Paper not found'})
 if(req.user.role!=='admin'&&p.author_id!==req.user.id&&!(req.user.role==='student'&&p.status==='published'))return res.status(403).json({error:'Permission denied'})
 const sections=(await pool.query('SELECT * FROM sections WHERE paper_id=$1 ORDER BY position',[p.id])).rows
 for(const s of sections){s.questions=(await pool.query('SELECT * FROM questions WHERE section_id=$1 ORDER BY position',[s.id])).rows;for(const q of s.questions){q.options=(await pool.query('SELECT value FROM question_options WHERE question_id=$1 ORDER BY position',[q.id])).rows.map(x=>x.value);q.pairs=(await pool.query('SELECT left_text AS left,right_text AS right FROM question_pairs WHERE question_id=$1 ORDER BY position',[q.id])).rows}}
 res.json({paper:{id:p.id,status:p.status,info:{school:p.school,exam:p.exam,subject:p.subject,duration:p.duration,totalMarks:p.total_marks??''},paperType:p.paper_type,academicYearId:p.academic_year_id,sections:sections.map(s=>({id:s.id,name:s.name,title:s.title,instructions:s.instructions,marksPerQ:s.marks_per_question,questions:s.questions.map(q=>({id:q.id,type:q.type,text:q.body,image:resolveLegacyImageUrl(q.image_url, process.env.STORAGE_PROVIDER === 'r2' ? process.env.R2_PUBLIC_URL : process.env.S3_PUBLIC_BASE_URL),options:q.options,pairs:q.pairs,answer:req.user.role==='student'?'':q.answer,bankQuestionId:q.bank_question_id}))}))}})
}))
app.post('/api/papers',auth,roles('admin','teacher'),asyncRoute(async(req,res)=>{
 validatePaper(req.body);const c=await pool.connect();try{await c.query('BEGIN');const id=await savePaper(c,req.body,req.user.id);await c.query('COMMIT');res.status(201).json({id})}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}))
app.put('/api/papers/:id',auth,roles('admin','teacher'),asyncRoute(async(req,res)=>{
 validatePaper(req.body);const c=await pool.connect();try{await c.query('BEGIN');const {rows}=await c.query('SELECT author_id FROM papers WHERE id=$1 FOR UPDATE',[req.params.id]);if(!rows[0]){await c.query('ROLLBACK');return res.status(404).json({error:'Paper not found'})}if(req.user.role!=='admin'&&rows[0].author_id!==req.user.id){await c.query('ROLLBACK');return res.status(403).json({error:'Permission denied'})}const id=await savePaper(c,req.body,req.user.id,req.params.id);await c.query('COMMIT');res.json({id})}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}))
app.delete('/api/papers/:id',auth,roles('admin','teacher'),asyncRoute(async(req,res)=>{if(!(await ownsPaper(req.params.id,req.user)))return res.status(404).json({error:'Paper not found or forbidden'});await pool.query('DELETE FROM papers WHERE id=$1',[req.params.id]);res.json({ok:true})}))
app.patch('/api/papers/:id/status',auth,roles('admin','teacher'),asyncRoute(async(req,res)=>{if(!['draft','published'].includes(req.body.status))return res.status(400).json({error:'Invalid status'});if(!(await ownsPaper(req.params.id,req.user)))return res.status(404).json({error:'Paper not found or forbidden'});await pool.query('UPDATE papers SET status=$1,updated_at=now() WHERE id=$2',[req.body.status,req.params.id]);res.json({ok:true})}))

const detectedImageMime = buffer => {
 if (buffer.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff]))) return 'image/jpeg'
 if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png'
 if (buffer.subarray(0,4).toString()==='RIFF' && buffer.subarray(8,12).toString()==='WEBP') return 'image/webp'
 if (['GIF87a','GIF89a'].includes(buffer.subarray(0,6).toString())) return 'image/gif'
 return null
}
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024},fileFilter:(req,file,cb)=>{const types=['image/jpeg','image/png','image/webp','image/gif'];cb(types.includes(file.mimetype)?null:new Error('Only JPEG, PNG, WEBP and GIF images allowed'),types.includes(file.mimetype))}})
app.post('/api/uploads/image',auth,roles('admin','teacher'),upload.single('image'),asyncRoute(async(req,res)=>{
 if(!req.file)return res.status(400).json({error:'Image is required'})
 if(detectedImageMime(req.file.buffer)!==req.file.mimetype)return res.status(400).json({error:'Image contents do not match its type'})
 const storage = getStorageConfig()
 const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[req.file.mimetype]
 const key=`questions/${req.user.id}/${randomUUID()}.${ext}`
 await new S3Client(storage.clientOptions).send(new PutObjectCommand({
  Bucket:storage.bucket,
  Key:key,
  Body:req.file.buffer,
  ContentType:req.file.mimetype
 }))
 res.status(201).json({url:objectKeyToImageUrl(key),key})
}))
// Images are retrieved through our own API, not the public R2 domain. This
// works with private R2 buckets, supports dev's Vite /api proxy, and avoids
// cross-origin image failures in the preview and DOCX export.
// Logged-in users can read opaque image URLs; the institution's saved logo can
// also be read without logging in (e.g. on a public institution page).
app.get('/api/uploads/image/:ownerId/:filename',
 asyncRoute(async (req,res,next) => {
  const key = imageParamsToKey(req.params.ownerId, req.params.filename)
  if(!key)return res.status(404).end()
  req.imageObjectKey = key
  if(req.cookies.qpaper_session) return auth(req,res,next)
  const url = objectKeyToImageUrl(key)
  const {rows} = await pool.query('SELECT 1 FROM institution_settings WHERE singleton=true AND logo_url=$1', [url])
  if(!rows.length) return res.status(401).json({error:'Login required to view this image'})
  next()
 }),
 asyncRoute(async (req,res) => {
  const storage = getStorageConfig()
  let object
  try {
   object = await new S3Client(storage.clientOptions).send(new GetObjectCommand({Bucket:storage.bucket,Key:req.imageObjectKey}))
  } catch(err) {
   if(err.name==='NoSuchKey'||err.name==='NotFound'||err.$metadata?.httpStatusCode===404) return res.status(404).end()
   throw err
  }
  if(!object.Body)return res.status(404).end()
  const ext = req.params.filename.split('.').pop().toLowerCase()
  const types = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'}
  res.setHeader('Content-Type',types[ext]||'application/octet-stream')
  res.setHeader('Cache-Control','private, max-age=600')
  if(object.ContentLength!=null)res.setHeader('Content-Length',object.ContentLength)
  // SDK GetObject.Body is a Node stream in the Express runtime.
  object.Body.on('error',err => { console.error('Image stream error:',err); res.destroy(err) })
  object.Body.pipe(res)
 })
)
app.get('/api/admin/stats',auth,roles('admin'),asyncRoute(async(req,res)=>{const {rows}=await pool.query("SELECT (SELECT count(*) FROM users)::int AS users,(SELECT count(*) FROM papers)::int AS papers,(SELECT count(*) FROM papers WHERE status='published')::int AS published,(SELECT count(*) FROM questions)::int AS questions");res.json(rows[0])}))
app.get('/api/admin/users',auth,roles('admin'),asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT id,name,email,role,active,created_at FROM users ORDER BY created_at DESC LIMIT 500');res.json({users:rows})}))
app.patch('/api/admin/users/:id',auth,roles('admin'),asyncRoute(async(req,res)=>{
 const {role,active}=req.body
 if(role!==undefined&&!['admin','teacher','student'].includes(role))return res.status(400).json({error:'Invalid role'})
 if(active!==undefined&&typeof active!=='boolean')return res.status(400).json({error:'Invalid active value'})
 if(req.params.id===req.user.id&&(active===false||role&&role!=='admin'))return res.status(400).json({error:'You cannot revoke your own admin access'})
 const {rows}=await pool.query('UPDATE users SET role=COALESCE($1,role),active=COALESCE($2,active) WHERE id=$3 RETURNING id,name,email,role,active',[role??null,active??null,req.params.id]);if(!rows[0])return res.status(404).json({error:'User not found'});res.json({user:rows[0]})
}))
registerFeatures(app,{pool,auth,roles,asyncRoute,authLimit,validEmail,savePaper,validatePaper})
app.use((err,req,res,next)=>{console.error(err);res.status(err.status|| (err.code==='LIMIT_FILE_SIZE'?413:err.code==='23503'?400:500)).json({error:err.status?err.message:err.code==='LIMIT_FILE_SIZE'?'Image exceeds 5MB':err.message==='Only JPEG, PNG, WEBP and GIF images allowed'?err.message:err.status?err.message:'Request failed'})})
app.listen(process.env.PORT||4000,()=>console.log(`QPaper API listening on ${process.env.PORT||4000}`))
