import { createHash,randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import nodemailer from 'nodemailer'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { isAcceptedImageUrl, resolveLegacyImageUrl } from './imageUrls.js'

const types=new Set(['Objective','Subjective','Fill in the Blanks','Match the Following','True/False'])
const sha=s=>createHash('sha256').update(s).digest('hex')
const clean=(s,n=1000)=>typeof s==='string'?s.trim().slice(0,n):''
export const fingerprint=(type,text)=>sha(`${type}|${clean(text,10000).toLocaleLowerCase().replace(/\s+/g,' ')}`)
const validId = x => typeof x==='string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(x)
const fail=(message,status=400)=>Object.assign(new Error(message),{status})
function cleanBank(q){
 if(!q || !types.has(q.type) || !clean(q.text || q.body,10000)) throw fail('Question text and a valid type are required')
 const text=clean(q.text || q.body,10000)
 const options=Array.isArray(q.options)?q.options.slice(0,20).map(x=>clean(x,1000)):[]
 const pairs=Array.isArray(q.pairs)?q.pairs.slice(0,30).map(p=>({left:clean(p.left,1000),right:clean(p.right,1000)})):[]
 const difficulty=['easy','medium','hard'].includes(q.difficulty)?q.difficulty:'medium'
 const marks=Number(q.marks??1)
 if(!Number.isFinite(marks)||marks<0||marks>1000)throw fail('Marks must be between 0 and 1000')
 const image=clean(q.image || q.image_url,2048)
 if(image && !isAcceptedImageUrl(image)) throw fail('Invalid image URL: upload an image first')
 return {type:q.type,body:text,options,pairs,difficulty,marks,subject:clean(q.subject,150),chapter:clean(q.chapter,150),topic:clean(q.topic,150),answer:clean(q.answer,10000),image_url:image||null,fingerprint:fingerprint(q.type,text)}
}
let transporter
const ses = new SESv2Client({region: process.env.AWS_REGION || 'ap-south-1'})
async function email(to,subject,link,purpose){
 if (process.env.SES_FROM_EMAIL) {
  await ses.send(new SendEmailCommand({
   FromEmailAddress: process.env.SES_FROM_EMAIL,
   Destination: {ToAddresses: [to]},
   Content: {Simple: {Subject: {Data:subject}, Body: {Text: {Data:`${purpose}\n\n${link}\n\nIf this was unexpected, ignore this email.`}}}}
  }))
  return true
 }
 if(!process.env.SMTP_HOST) return false
 if(!transporter)transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined})
 await transporter.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to,subject,text:`${purpose}\n\n${link}\n\nIf this was unexpected, ignore this email.`})
 return true
}
const origin=()=> (process.env.APP_URL||process.env.CLIENT_ORIGIN||'http://localhost:5173').replace(/\/$/,'')
export function registerFeatures(app,{pool,auth,roles,asyncRoute,authLimit,validEmail,savePaper,validatePaper}){
 const permitted = (req,owner) => req.user.role==='admin'||req.user.id===owner

 // Shared authenticated read-only institution configuration.
 app.get('/api/institution',asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT name,logo_url,address,website,accent_color FROM institution_settings WHERE singleton=true');res.json({institution:rows[0]})}))
 app.put('/api/admin/institution',auth,roles('admin'),asyncRoute(async(req,res)=>{
  const {name,address,website,accent_color,logo_url}=req.body
  if(!clean(name,200))throw fail('Institution name required')
  if(accent_color&&!/^#[0-9a-fA-F]{6}$/.test(accent_color))throw fail('Invalid hex color')
  if(logo_url&&!isAcceptedImageUrl(logo_url))throw fail('Logo must be an uploaded image URL')
  const {rows}=await pool.query('UPDATE institution_settings SET name=$1,address=$2,website=$3,accent_color=$4,logo_url=$5,updated_at=now() WHERE singleton=true RETURNING *',[clean(name,200),clean(address,2000),clean(website,500),accent_color||'#4f46e5',logo_url||null]);res.json({institution:rows[0]})
 }))
 app.get('/api/academic-years',auth,asyncRoute(async(req,res)=>{res.json({years:(await pool.query('SELECT * FROM academic_years ORDER BY active DESC,starts_on DESC NULLS LAST,created_at DESC')).rows})}))
 app.post('/api/admin/academic-years',auth,roles('admin'),asyncRoute(async(req,res)=>{
  const name=clean(req.body.name,100);if(!name)throw fail('Academic year name is required')
  const {rows}=await pool.query('INSERT INTO academic_years(name,starts_on,ends_on) VALUES($1,$2,$3) RETURNING *',[name,req.body.starts_on||null,req.body.ends_on||null]);res.status(201).json({year:rows[0]})
 }))
 app.patch('/api/admin/academic-years/:id',auth,roles('admin'),asyncRoute(async(req,res)=>{
  if(!validId(req.params.id))throw fail('Invalid year ID')
  const c=await pool.connect();try{await c.query('BEGIN');if(req.body.active===true)await c.query('UPDATE academic_years SET active=false WHERE active=true');const {rows}=await c.query('UPDATE academic_years SET name=COALESCE($1,name),starts_on=COALESCE($2,starts_on),ends_on=COALESCE($3,ends_on),active=COALESCE($4,active) WHERE id=$5 RETURNING *',[req.body.name?clean(req.body.name,100):null,req.body.starts_on||null,req.body.ends_on||null,typeof req.body.active==='boolean'?req.body.active:null,req.params.id]);if(!rows.length)throw fail('Year not found',404);await c.query('COMMIT');res.json({year:rows[0]})}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }))

 // Search and import questions, with duplicate checks scoped to the creator.
 app.get('/api/bank',auth,roles('teacher','admin'),asyncRoute(async(req,res)=>{
  const search=clean(req.query.search,200), subject=clean(req.query.subject,150),difficulty=clean(req.query.difficulty,10)
  const limit=Math.min(100,Math.max(1,Number(req.query.limit)||30)),page=Math.max(1,Number(req.query.page)||1)
  const where=[req.user.role==='admin'?'true':'owner_id=$1'];const values=req.user.role==='admin'?[]:[req.user.id]
  if(search){values.push(`%${search}%`);where.push(`(body ILIKE $${values.length} OR chapter ILIKE $${values.length} OR topic ILIKE $${values.length} OR subject ILIKE $${values.length})`)}
  if(subject){values.push(subject);where.push(`subject=$${values.length}`)}
  if(difficulty){values.push(difficulty);where.push(`difficulty=$${values.length}`)}
  values.push(limit,(page-1)*limit)
  const {rows}=await pool.query(`SELECT * FROM question_bank WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values)
  res.json({questions:rows.map(q=>({...q,image_url:resolveLegacyImageUrl(q.image_url,process.env.STORAGE_PROVIDER==='r2'?process.env.R2_PUBLIC_URL:process.env.S3_PUBLIC_BASE_URL)})),page,hasMore:rows.length===limit})
 }))
 app.post('/api/bank/duplicates',auth,roles('teacher','admin'),asyncRoute(async(req,res)=>{
  const q=cleanBank(req.body)
  const {rows}=await pool.query('SELECT id,body,type,subject,chapter FROM question_bank WHERE owner_id=$1 AND fingerprint=$2',[req.user.id,q.fingerprint]);res.json({duplicates:rows})
 }))
 app.post('/api/bank/import',auth,roles('teacher','admin'),asyncRoute(async(req,res)=>{
  if(!Array.isArray(req.body.questions)||req.body.questions.length>500||!req.body.questions.length)throw fail('Import 1–500 questions per request')
  const parsed=req.body.questions.map(cleanBank);const c=await pool.connect();let inserted=0,duplicates=0
  try {await c.query('BEGIN');for(const q of parsed){const {rowCount}=await c.query(`INSERT INTO question_bank(owner_id,subject,chapter,topic,difficulty,marks,type,body,options,pairs,answer,image_url,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13) ON CONFLICT(owner_id,fingerprint) DO NOTHING`,[req.user.id,q.subject,q.chapter,q.topic,q.difficulty,q.marks,q.type,q.body,JSON.stringify(q.options),JSON.stringify(q.pairs),q.answer,q.image_url,q.fingerprint]);rowCount?inserted++:duplicates++}await c.query('COMMIT');res.status(201).json({inserted,duplicates})}catch(err){await c.query('ROLLBACK');throw err}finally{c.release()}
 }))
 app.post('/api/bank',auth,roles('teacher','admin'),asyncRoute(async(req,res)=>{
  const q=cleanBank(req.body)
  const {rows}=await pool.query(`INSERT INTO question_bank(owner_id,subject,chapter,topic,difficulty,marks,type,body,options,pairs,answer,image_url,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13) ON CONFLICT(owner_id,fingerprint) DO NOTHING RETURNING *`,[req.user.id,q.subject,q.chapter,q.topic,q.difficulty,q.marks,q.type,q.body,JSON.stringify(q.options),JSON.stringify(q.pairs),q.answer,q.image_url,q.fingerprint]);if(!rows[0])throw fail('Duplicate question already exists in your bank',409);res.status(201).json({question:rows[0]})
 }))
 app.put('/api/bank/:id',auth,roles('teacher','admin'),asyncRoute(async(req,res)=>{
  const q=cleanBank(req.body)
  try{
   const {rows}=await pool.query(`UPDATE question_bank SET subject=$1,chapter=$2,topic=$3,difficulty=$4,marks=$5,type=$6,body=$7,options=$8::jsonb,pairs=$9::jsonb,answer=$10,image_url=$11,fingerprint=$12,updated_at=now() WHERE id=$13 ${req.user.role==='admin'?'':'AND owner_id=$14'} RETURNING *`,[q.subject,q.chapter,q.topic,q.difficulty,q.marks,q.type,q.body,JSON.stringify(q.options),JSON.stringify(q.pairs),q.answer,q.image_url,q.fingerprint,req.params.id,...(req.user.role==='admin'?[]:[req.user.id])]);
   if(!rows.length)throw fail('Question not found',404);res.json({question:rows[0]})
  }catch(e){if(e.code==='23505')throw fail('Another question with this wording already exists',409);throw e}
 }))
 app.delete('/api/bank/:id',auth,roles('teacher','admin'),asyncRoute(async(req,res)=>{const {rowCount}=await pool.query(req.user.role==='admin'?'DELETE FROM question_bank WHERE id=$1':'DELETE FROM question_bank WHERE id=$1 AND owner_id=$2',req.user.role==='admin'?[req.params.id]:[req.params.id,req.user.id]);res.status(rowCount?200:404).json(rowCount?{ok:true}:{error:'Question not found'})}))

 // Custom reusable templates. Legacy layouts with questionCount are still supported.
 const starters=[
  {id:'starter-unit',name:'Unit test',description:'10 objective questions + 5 short answers',is_builtin:true,layout:{paperType:'Both',sections:[{name:'A',title:'Objective',marksPerQ:1,questionCount:10,type:'Objective'},{name:'B',title:'Short Answers',marksPerQ:2,questionCount:5,type:'Subjective'}]}},
  {id:'starter-term',name:'Term examination',description:'Objective, short and long answers',is_builtin:true,layout:{paperType:'Both',sections:[{name:'A',title:'Multiple choice',marksPerQ:1,questionCount:20,type:'Objective'},{name:'B',title:'Short Answers',marksPerQ:3,questionCount:8,type:'Subjective'},{name:'C',title:'Long Answers',marksPerQ:5,questionCount:4,type:'Subjective'}]}}
 ]
 function cleanTemplateLayout(layout){
  if(!layout||typeof layout!=='object'||!Array.isArray(layout.sections)||!layout.sections.length||layout.sections.length>30)throw fail('A template needs 1–30 sections')
  let total=0
  const sections=layout.sections.map((s,i)=>{
   const original=Array.isArray(s.questions)?s.questions:null
   const count=original?original.length:Number(s.questionCount??1)
   if(!Number.isInteger(count)||count<1||count>100)throw fail('Each section needs 1–100 questions')
   total+=count
   const marks=Number(s.marksPerQ??1)
   if(!Number.isFinite(marks)||marks<0||marks>1000)throw fail('Marks per question must be between 0 and 1000')
   const type=types.has(s.type)?s.type:'Objective'
   const result={name:clean(s.name,20)||String.fromCharCode(65+i),title:clean(s.title,255),instructions:clean(s.instructions,3000),marksPerQ:marks,type,questionCount:count}
   if(original){result.questions=original.map(q=>{
    const qt=types.has(q?.type)?q.type:type
    const image=clean(q?.image,2048)
    if(image && !isAcceptedImageUrl(image))throw fail('Template images must be uploaded first')
    return {type:qt,text:clean(q?.text,10000),options:Array.isArray(q?.options)?q.options.slice(0,20).map(v=>clean(v,1000)):[],pairs:Array.isArray(q?.pairs)?q.pairs.slice(0,100).map(p=>({left:clean(p?.left,1000),right:clean(p?.right,1000)})):[],answer:clean(q?.answer,10000),image:image||null}
   })}
   return result
  })
  if(total>2000)throw fail('Template cannot exceed 2000 questions')
  const info=layout.info&&typeof layout.info==='object'?{subject:clean(layout.info.subject,255),exam:clean(layout.info.exam,255),duration:clean(layout.info.duration,80),totalMarks:layout.info.totalMarks===undefined?'':clean(String(layout.info.totalMarks),30)}:undefined
  return {version:2,paperType:['Both','Objective','Subjective'].includes(layout.paperType)?layout.paperType:'Both',...(info?{info}:{}),sections}
 }
 app.get('/api/templates',auth,asyncRoute(async(req,res)=>{
  if(req.user.role==='student')return res.json({templates:starters})
  const {rows}=await pool.query(`SELECT id,name,description,layout,is_public,owner_id,created_at,updated_at FROM paper_templates WHERE ${req.user.role==='admin'?'TRUE':'is_public=true OR owner_id=$1'} ORDER BY updated_at DESC`,req.user.role==='admin'?[]:[req.user.id])
  res.json({templates:[...starters,...rows.map(t=>({...t,layout:{...t.layout,sections:t.layout?.sections?.map(s=>({...s,questions:s.questions?.map(q=>({...q,image:resolveLegacyImageUrl(q.image,process.env.STORAGE_PROVIDER==='r2'?process.env.R2_PUBLIC_URL:process.env.S3_PUBLIC_BASE_URL)}))}))}}))]})
 }))
 app.post('/api/templates',auth,roles('teacher','admin'),asyncRoute(async(req,res)=>{
  const name=clean(req.body?.name,120)
  if(!name)throw fail('Template name is required')
  const layout=cleanTemplateLayout(req.body?.layout)
  const {rows}=await pool.query('INSERT INTO paper_templates(owner_id,name,description,layout,is_public) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *',[req.user.id,name,clean(req.body.description,2000),JSON.stringify(layout),req.user.role==='admin'&&req.body.is_public===true])
  res.status(201).json({template:rows[0]})
 }))
 app.put('/api/templates/:id',auth,roles('teacher','admin'),asyncRoute(async(req,res)=>{
  if(!validId(req.params.id))throw fail('Built-in templates cannot be edited')
  const name=clean(req.body?.name,120)
  if(!name)throw fail('Template name is required')
  const layout=cleanTemplateLayout(req.body?.layout)
  const values=[name,clean(req.body.description,2000),JSON.stringify(layout),req.user.role==='admin'&&req.body.is_public===true,req.params.id]
  const own=req.user.role==='admin'?'':' AND owner_id=$6'
  if(own)values.push(req.user.id)
  const {rows}=await pool.query(`UPDATE paper_templates SET name=$1,description=$2,layout=$3::jsonb,is_public=$4,updated_at=now() WHERE id=$5${own} RETURNING *`,values)
  if(!rows.length)throw fail('Template not found or permission denied',404)
  res.json({template:rows[0]})
 }))
 app.delete('/api/templates/:id',auth,roles('teacher','admin'),asyncRoute(async(req,res)=>{
  if(!validId(req.params.id))throw fail('Built-in templates cannot be deleted')
  const {rowCount}=await pool.query(req.user.role==='admin'?'DELETE FROM paper_templates WHERE id=$1':'DELETE FROM paper_templates WHERE id=$1 AND owner_id=$2',req.user.role==='admin'?[req.params.id]:[req.params.id,req.user.id]);res.status(rowCount?200:404).json(rowCount?{ok:true}:{error:'Template not found or permission denied'})
 }))

 // Charts use real, role-scoped database counts. Students see only published-paper aggregates.
 app.get('/api/analytics',auth,asyncRoute(async(req,res)=>{
  const days=[30,90,365].includes(Number(req.query.days))?Number(req.query.days):90
  const granularity=days===30?'day':days===90?'week':'month'
  const paperFilter=req.user.role==='admin'?'TRUE':req.user.role==='student'?"p.status='published'":'p.author_id=$1'
  const paperArgs=req.user.role==='teacher'?[req.user.id]:[]
  const bucketArg=paperArgs.length+1
  const bucketLabel=`to_char(date_trunc('${granularity}',p.created_at),'YYYY-MM-DD')`
  const queries=[
   pool.query(`SELECT count(*)::int AS papers,count(*) FILTER(WHERE p.status='published')::int AS published,count(*) FILTER(WHERE p.status='draft')::int AS drafts,count(DISTINCT NULLIF(trim(p.subject),''))::int AS subjects FROM papers p WHERE ${paperFilter}`,paperArgs),
   pool.query(`SELECT ${bucketLabel} AS bucket,count(*)::int AS count FROM papers p WHERE ${paperFilter} AND p.created_at::date>=CURRENT_DATE-($${bucketArg}::int-1) GROUP BY 1 ORDER BY 1`,[...paperArgs,days]),
   pool.query(`SELECT coalesce(nullif(trim(p.subject),''),'Unspecified') AS label,count(*)::int AS count FROM papers p WHERE ${paperFilter} GROUP BY 1 ORDER BY count DESC,label LIMIT 8`,paperArgs),
   pool.query(`SELECT q.type AS label,count(*)::int AS count FROM papers p JOIN sections s ON s.paper_id=p.id JOIN questions q ON q.section_id=s.id WHERE ${paperFilter} GROUP BY q.type ORDER BY count DESC`,paperArgs),
   pool.query(`SELECT count(q.id)::int AS count FROM papers p JOIN sections s ON s.paper_id=p.id JOIN questions q ON q.section_id=s.id WHERE ${paperFilter}`,paperArgs)
  ]
  const [summary,trend,subjects,typesResult,questionTotal]=await Promise.all(queries)
  let bankCount=0,bankDifficulty=[],templateCount=0
  if(req.user.role!=='student'){
   const where=req.user.role==='admin'?'TRUE':'owner_id=$1'
   const vals=req.user.role==='admin'?[]:[req.user.id]
   const results=await Promise.all([
    pool.query(`SELECT count(*)::int AS count FROM question_bank WHERE ${where}`,vals),
    pool.query(`SELECT difficulty AS label,count(*)::int AS count FROM question_bank WHERE ${where} GROUP BY difficulty ORDER BY difficulty`,vals),
    pool.query(`SELECT count(*)::int AS count FROM paper_templates WHERE ${where}`,vals)
   ])
   bankCount=results[0].rows[0].count;bankDifficulty=results[1].rows;templateCount=results[2].rows[0].count
  }
  const points=new Map(trend.rows.map(row=>[row.bucket,row.count]))
  const now=new Date();now.setUTCHours(0,0,0,0)
  const start=new Date(now);start.setUTCDate(start.getUTCDate()-days+1)
  const first=new Date(start)
  if(granularity==='week')first.setUTCDate(first.getUTCDate()-(first.getUTCDay()+6)%7)
  if(granularity==='month')first.setUTCDate(1)
  const timeline=[]
  for(const date=new Date(first);date<=now;){
   const key=date.toISOString().slice(0,10)
   timeline.push({date:key,count:points.get(key)||0})
   if(granularity==='day')date.setUTCDate(date.getUTCDate()+1)
   else if(granularity==='week')date.setUTCDate(date.getUTCDate()+7)
   else date.setUTCMonth(date.getUTCMonth()+1)
  }
  res.json({periodDays:days,granularity,summary:{...summary.rows[0],questions:questionTotal.rows[0].count,bankQuestions:bankCount,customTemplates:templateCount},timeline,subjects:subjects.rows,questionTypes:typesResult.rows,bankDifficulty})
 }))

 // Version history: every successful save has a snapshot. Restore creates a new version, never destroys history.
 const accessPaper=async(req,id)=>{if(!validId(id))throw fail('Invalid paper ID');const {rows}=await pool.query('SELECT author_id FROM papers WHERE id=$1',[id]);if(!rows[0])throw fail('Paper not found',404);if(!permitted(req,rows[0].author_id))throw fail('Permission denied',403)}
 app.get('/api/papers/:id/versions',auth,roles('teacher','admin'),asyncRoute(async(req,res)=>{await accessPaper(req,req.params.id);const {rows}=await pool.query('SELECT id,version_number,created_at FROM paper_versions WHERE paper_id=$1 ORDER BY version_number DESC LIMIT 100',[req.params.id]);res.json({versions:rows})}))
 app.get('/api/papers/:id/versions/:versionId',auth,roles('teacher','admin'),asyncRoute(async(req,res)=>{await accessPaper(req,req.params.id);const {rows}=await pool.query('SELECT snapshot,version_number FROM paper_versions WHERE paper_id=$1 AND id=$2',[req.params.id,req.params.versionId]);if(!rows.length)throw fail('Version not found',404);res.json({version:rows[0]})}))
 app.post('/api/papers/:id/restore/:versionId',auth,roles('teacher','admin'),asyncRoute(async(req,res)=>{
  await accessPaper(req,req.params.id);const c=await pool.connect()
  try {await c.query('BEGIN');await c.query('SELECT id FROM papers WHERE id=$1 FOR UPDATE',[req.params.id]);const {rows}=await c.query('SELECT snapshot FROM paper_versions WHERE paper_id=$1 AND id=$2',[req.params.id,req.params.versionId]);if(!rows.length)throw fail('Version not found',404);validatePaper(rows[0].snapshot);await savePaper(c,rows[0].snapshot,req.user.id,req.params.id);await c.query('COMMIT');res.json({ok:true})}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }))

 // One-time invitations. Tokens are hashed in PostgreSQL and expire after 7 days.
 app.get('/api/admin/invitations',auth,roles('admin'),asyncRoute(async(req,res)=>{res.json({invitations:(await pool.query('SELECT id,email,name,role,created_at,expires_at,accepted_at FROM invitations ORDER BY created_at DESC LIMIT 100')).rows})}))
 app.post('/api/admin/invitations',auth,roles('admin'),asyncRoute(async(req,res)=>{
  const {email:target,role='teacher',name=''}=req.body
  if(!validEmail(target)||!['teacher','student'].includes(role))throw fail('Valid email and teacher/student role required')
  const token=randomBytes(32).toString('hex'),hash=sha(token),normalized=target.toLowerCase().trim()
  const {rows}=await pool.query('INSERT INTO invitations(email,name,role,token_hash,invited_by,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval \'7 days\') RETURNING id,email,role,expires_at',[normalized,clean(name,120),role,hash,req.user.id]);const link=`${origin()}/#/invite/${token}`
  const sent=await email(normalized,'Your QPaper Studio invitation',link,'You have been invited to join QPaper Studio').catch(()=>false)
  res.status(201).json({invitation:rows[0],sent,inviteUrl:link})
 }))
 app.get('/api/auth/invitations/:token',authLimit,asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT email,role,name,expires_at FROM invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now()',[sha(req.params.token)]);if(!rows[0])throw fail('Invitation is invalid or expired',404);res.json({invitation:rows[0]})}))
 app.post('/api/auth/accept-invite',authLimit,asyncRoute(async(req,res)=>{
  const {token,name,password}=req.body||{}
  if(typeof token!=='string'||typeof password!=='string'||password.length<12||password.length>128||!clean(name,120))throw fail('Name and password (12+ characters) required')
  const c=await pool.connect();try{await c.query('BEGIN');const {rows}=await c.query('SELECT * FROM invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE',[sha(token)]);if(!rows[0])throw fail('Invitation is invalid or expired',404);const hash=await bcrypt.hash(password,12);const {rows:users}=await c.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role',[clean(name,120),rows[0].email,hash,rows[0].role]);await c.query('UPDATE invitations SET accepted_at=now() WHERE id=$1',[rows[0].id]);await c.query('COMMIT');res.status(201).json({user:users[0]})}catch(e){await c.query('ROLLBACK');if(e.code==='23505')throw fail('An account already exists for this email',409);throw e}finally{c.release()}
 }))

 // No account enumeration. Email reset links only (no plain tokens retained in DB).
 app.post('/api/auth/forgot-password',authLimit,asyncRoute(async(req,res)=>{
  const message='If the address exists, a password reset link has been sent.'
  if(!validEmail(req.body?.email))return res.json({message})
  const {rows}=await pool.query('SELECT id,email FROM users WHERE email=$1 AND active=true',[req.body.email.toLowerCase().trim()])
  if(rows[0]){const token=randomBytes(32).toString('hex'),link=`${origin()}/#/reset-password/${token}`;await pool.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[rows[0].id,sha(token)]);await email(rows[0].email,'Reset your QPaper Studio password',link,'This link expires in 30 minutes').catch(e=>console.error('Reset email delivery failed:',e.message));if(process.env.NODE_ENV!=='production'&&process.env.DEV_SHOW_RESET_LINKS==='true')console.log('Development password reset link:',link)}
  res.json({message})
 }))
 app.post('/api/auth/reset-password',authLimit,asyncRoute(async(req,res)=>{
  const {token,password}=req.body||{};if(typeof token!=='string'||typeof password!=='string'||password.length<12||password.length>128)throw fail('Valid token and password (12+ characters) required')
  const c=await pool.connect();try{await c.query('BEGIN');const {rows}=await c.query('SELECT * FROM password_reset_tokens WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE',[sha(token)]);if(!rows.length)throw fail('Invalid or expired reset link',400);await c.query('UPDATE users SET password_hash=$1 WHERE id=$2',[await bcrypt.hash(password,12),rows[0].user_id]);await c.query('UPDATE password_reset_tokens SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL',[rows[0].user_id]);await c.query('COMMIT');res.json({ok:true})}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }))

 app.post('/api/contact',authLimit,asyncRoute(async(req,res)=>{const name=clean(req.body?.name,120),target=clean(req.body?.email,255),message=clean(req.body?.message,5000);if(name.length<2||!validEmail(target)||message.length<10)throw fail('Name, email and a message (10+ characters) required');await pool.query('INSERT INTO contact_messages(name,email,message) VALUES($1,$2,$3)',[name,target,message]);res.status(201).json({ok:true})}))
 app.get('/api/admin/contact',auth,roles('admin'),asyncRoute(async(req,res)=>{res.json({messages:(await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100')).rows})}))
}
