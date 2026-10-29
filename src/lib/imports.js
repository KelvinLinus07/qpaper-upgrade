import Papa from 'papaparse'
import {makeId} from '../utils.js'
const types = ['Objective','Subjective','Fill in the Blanks','Match the Following','True/False']
export const templateCsv='type,text,options,answer,subject,chapter,topic,difficulty,marks\nObjective,"What is 2 + 2?","3|4|5|6","4",Mathematics,Arithmetic,Addition,easy,1\nSubjective,"Explain photosynthesis",,"Photosynthesis uses sunlight",Science,Biology,Plants,medium,5\n'
export function parseQuestions(rows){
 if(!Array.isArray(rows) || rows.length>500)throw new Error('Import 1–500 questions per file')
 return rows.filter(row=>row && typeof row==='object' && (row.text||row.body)).map(row=>{
  const type=types.includes(row.type)?row.type:'Objective'
  const raw=row.options
  const options=Array.isArray(raw)?raw:typeof raw==='string'?raw.split('|').map(x=>x.trim()):[]
  const pairs=Array.isArray(row.pairs)?row.pairs:[]
  return {id:makeId(),type,text:String(row.text||row.body||'').trim(),options:type==='Objective'?[...options,'','','',''].slice(0,4):options,pairs:pairs.length?pairs:[{left:'',right:''}],answer:String(row.answer||''),image:row.image_url||row.image||null,subject:String(row.subject||''),chapter:String(row.chapter||''),topic:String(row.topic||''),difficulty:row.difficulty||'medium',marks:Number(row.marks)||1}
 })
}
export async function readImport(file){
 const raw=await file.text()
 if(file.name.toLowerCase().endsWith('.json')){
  const result=JSON.parse(raw)
  return parseQuestions(Array.isArray(result)?result:result.questions||result.sections?.flatMap(x=>x.questions)||[])
 }
 if(!file.name.toLowerCase().endsWith('.csv'))throw new Error('Choose a .csv or .json file')
 const result=Papa.parse(raw,{header:true,skipEmptyLines:true,transformHeader:h=>h.trim()})
 if(result.errors.length)throw new Error(`CSV error: ${result.errors[0].message}`)
 return parseQuestions(result.data)
}
