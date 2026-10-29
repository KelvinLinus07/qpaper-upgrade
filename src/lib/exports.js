import {Document,Packer,Paragraph,TextRun,HeadingLevel,AlignmentType,ImageRun} from 'docx'
import {saveAs} from 'file-saver'

const safeName = s=>(s||'Question Paper').replace(/[\\/:*?"<>|]/g,'-').slice(0,100)
const getTotal=sections=>sections.reduce((a,s)=>a+s.questions.length*(Number(s.marksPerQ)||0),0)
const text=(val)=>String(val??'')
const answers=q=>q.answer?.trim()||'Not provided'
const nameFile=(info,suffix,ext)=>safeName([info.exam,info.subject,suffix].filter(Boolean).join(' - '))+'.'+ext
async function fetchImage(url){
 if(!url)return null
 try{
  const response=await fetch(url,{mode:'cors'});if(!response.ok)return null
  const buffer=await response.arrayBuffer();if(buffer.byteLength>4*1024*1024)return null
  let bytes=new Uint8Array(buffer),type=bytes[0]===137&&bytes[1]===80?'png':bytes[0]===255&&bytes[1]===216?'jpg':null
  let width=280,height=180
  if(typeof createImageBitmap==='function'){
   const blob=new Blob([bytes],{type:response.headers.get('content-type')||'image/webp'})
   const bitmap=await createImageBitmap(blob);width=bitmap.width;height=bitmap.height
   if(!type){const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);const converted=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!converted)return null;bytes=new Uint8Array(await converted.arrayBuffer());type='png'}
   bitmap.close?.()
  }
  if(!type)return null
  return {bytes,type,width,height}
 }catch{return null}
}
const bold=(t)=>new TextRun({text:text(t),bold:true})
const norm=(t)=>new TextRun({text:text(t)})
export async function exportDocx({info,sections,logoUrl,institution},answerKey=false){
 const children=[]
 if(logoUrl){const img=await fetchImage(logoUrl);if(img)children.push(new Paragraph({alignment:AlignmentType.CENTER,children:[new ImageRun({data:img.bytes,transformation:{width:68,height:Math.round(68*img.height/img.width)},type:img.type})]}))}
 children.push(new Paragraph({text:text(info.school||institution?.name),heading:HeadingLevel.HEADING_1,alignment:AlignmentType.CENTER}))
 children.push(new Paragraph({text:answerKey?'ANSWER KEY':text(info.exam||'Examination'),heading:HeadingLevel.HEADING_2,alignment:AlignmentType.CENTER}))
 children.push(new Paragraph({text:text(info.subject),alignment:AlignmentType.CENTER}))
 children.push(new Paragraph({children:[bold('Time: '),norm(info.duration||'—'),bold('     Maximum marks: '),norm(info.totalMarks||getTotal(sections))],spacing:{after:280}}))
 if(!answerKey)children.push(new Paragraph({text:'General Instructions: Answer all questions unless stated otherwise.',spacing:{after:160}}))
 let index=0
 for(const sec of sections){
  children.push(new Paragraph({text:`SECTION ${sec.name} — ${sec.title||''}`,heading:HeadingLevel.HEADING_2,spacing:{before:260,after:120}}))
  if(sec.instructions&&!answerKey)children.push(new Paragraph({text:sec.instructions,italic:true}))
  for(const q of sec.questions){index++
   children.push(new Paragraph({children:[bold(`Q${index}. `),norm(q.text||'(Empty question)'),bold(`  [${sec.marksPerQ}]`)],spacing:{before:130,after:75},keepNext:!!q.image}))
   if(!answerKey && q.type==='Objective')for(let j=0;j<(q.options||[]).length;j++){if(q.options[j])children.push(new Paragraph({text:`(${String.fromCharCode(97+j)})  ${q.options[j]}`,indent:{left:360}}))}
   if(!answerKey && q.type==='True/False')children.push(new Paragraph({text:'True / False',indent:{left:360}}))
   if(!answerKey && q.type==='Match the Following')for(const p of q.pairs||[])children.push(new Paragraph({text:`${p.left}          —          ${p.right}`,indent:{left:360}}))
   if(!answerKey&&q.image){const img=await fetchImage(q.image);if(img){const scale=Math.min(280/img.width,180/img.height);children.push(new Paragraph({children:[new ImageRun({data:img.bytes,transformation:{width:Math.round(img.width*scale),height:Math.round(img.height*scale)},type:img.type})]}))}}
   if(answerKey)children.push(new Paragraph({children:[bold('Answer: '),norm(answers(q))],indent:{left:240},spacing:{after:110}}))
  }
 }
 const doc=new Document({creator:'QPaper Studio',title:answerKey?'Answer key':'Examination paper',sections:[{properties:{page:{margin:{top:800,bottom:800,left:880,right:880}}},children}]})
 saveAs(await Packer.toBlob(doc),nameFile(info,answerKey?'Answers':'Editable','docx'))
}
