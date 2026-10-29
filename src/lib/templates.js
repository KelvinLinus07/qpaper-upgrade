import {makeId,makeQuestion,makeSection} from '../utils.js'

export const QUESTION_TYPES=['Objective','Subjective','Fill in the Blanks','Match the Following','True/False']
export const PAPER_TYPES=['Both','Objective','Subjective']
const defaultQuestion=(type='Objective')=>({...makeQuestion(),type})

/** Template snapshots never share React ids with their source paper. */
export function layoutFromPaper({paperType,info,sections},includeQuestions=false){
 return {
  version:2,
  paperType:paperType||'Both',
  info:{subject:info?.subject||'',exam:info?.exam||'',duration:info?.duration||'',totalMarks:info?.totalMarks??''},
  sections:sections.map(s=>({
   name:s.name||'',title:s.title||'',instructions:s.instructions||'',marksPerQ:Number(s.marksPerQ)||0,
   type:s.questions?.[0]?.type||'Objective',questionCount:s.questions?.length||1,
   questions:(s.questions?.length?s.questions:[defaultQuestion()]).map(q=>({
    type:q.type||'Objective',text:includeQuestions?(q.text||''):'',
    options:includeQuestions?[...(q.options||[])]:['','','',''],
    pairs:includeQuestions?(q.pairs||[]).map(p=>({left:p.left||'',right:p.right||''})):((q.pairs||[]).length?(q.pairs||[]).map(()=>({left:'',right:''})):[{left:'',right:''}]),
    answer:includeQuestions?(q.answer||''):'',image:includeQuestions?(q.image||null):null
   })),
  }))
 }
}

/** Converts both legacy section-count templates and new question snapshots to real editor state. */
export function instantiateTemplate(layout){
 if(!layout||!Array.isArray(layout.sections))throw new Error('Invalid template layout')
 const sections=layout.sections.map((s,i)=>{
  const questions=Array.isArray(s.questions)?s.questions:
   Array.from({length:Math.max(1,Math.min(100,Number(s.questionCount)||1))},()=>({type:s.type||'Objective'}))
  return {
   ...makeSection(i),id:makeId(),name:s.name||String.fromCharCode(65+i),title:s.title||'',
   instructions:s.instructions||'',marksPerQ:s.marksPerQ??1,
   questions:questions.map(q=>({
    ...defaultQuestion(q.type||s.type||'Objective'),id:makeId(),text:q.text||'',
    options:Array.isArray(q.options)&&q.options.length?q.options.slice():['','','',''],
    pairs:Array.isArray(q.pairs)&&q.pairs.length?q.pairs.map(p=>({...p})):[{left:'',right:''}],
    answer:q.answer||'',image:q.image||null,bankQuestionId:null
   }))
  }
 })
 return {paperType:layout.paperType||'Both',info:layout.info||{},sections}
}

export function templateDetails(t){
 const sections=t.layout?.sections||[]
 const count=sections.reduce((n,s)=>n+(s.questions?.length??s.questionCount??1),0)
 const marks=sections.reduce((n,s)=>n+(s.questions?.length??s.questionCount??1)*Number(s.marksPerQ||0),0)
 return {sections:sections.length,questions:count,marks}
}
