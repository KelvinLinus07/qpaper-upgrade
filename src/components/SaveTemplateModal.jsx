import React,{useState} from 'react'
import {X,Layers3,Save,BookCopy} from 'lucide-react'
import {api} from '../lib/api.js'
import {layoutFromPaper} from '../lib/templates.js'

export default function SaveTemplateModal({paper,onClose,onSaved,isAdmin}){
 const [name,setName]=useState(''),[description,setDescription]=useState('')
 const [includeQuestions,setIncludeQuestions]=useState(false),[publicTemplate,setPublicTemplate]=useState(false)
 const [saving,setSaving]=useState(false),[error,setError]=useState('')
 const count=paper.sections.reduce((n,s)=>n+s.questions.length,0)
 async function save(e){
  e.preventDefault();setSaving(true);setError('')
  try{
   const {template}=await api('/templates',{method:'POST',body:{name:name.trim(),description:description.trim(),is_public:isAdmin&&publicTemplate,layout:layoutFromPaper(paper,includeQuestions)}})
   onSaved(template)
  }catch(err){setError(err.message)}finally{setSaving(false)}
 }
 return <div className="fixed inset-0 z-[1250] bg-slate-950/75 p-3 sm:p-6 flex items-center justify-center" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <form onSubmit={save} className="w-full max-w-xl max-h-[90vh] overflow-auto rounded-2xl bg-white text-slate-900 shadow-2xl p-6 sm:p-8 space-y-5" aria-label="Save reusable template">
   <div className="flex justify-between items-start"><div className="flex gap-3 items-center"><div className="rounded-xl p-3 bg-indigo-50 text-indigo-600"><Layers3/></div><div><h2 className="text-xl font-bold">Save reusable template</h2><p className="text-sm text-slate-500">Keep this layout in your template library.</p></div></div><button type="button" aria-label="Close" className="p-2 rounded-lg hover:bg-slate-100" onClick={onClose}><X size={20}/></button></div>
   {error&&<p className="error-new" role="alert">{error}</p>}
   <label className="field-new">Template name <input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Grade 8 science midterm" autoFocus/></label>
   <label className="field-new">Description <textarea maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="When should teachers use this template?" rows={2}/></label>
   <fieldset className="space-y-3"><legend className="font-bold text-sm mb-2">What should be reusable?</legend>
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${!includeQuestions?'border-indigo-300 bg-indigo-50':'border-slate-200'}`}><input type="radio" checked={!includeQuestions} onChange={()=>setIncludeQuestions(false)} name="template-mode" className="mt-1"/><span><strong className="text-sm">Layout only</strong><span className="block text-xs text-slate-500 mt-1">Preserve {paper.sections.length} sections, marks, numbering and question types. Start with empty questions.</span></span></label>
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${includeQuestions?'border-indigo-300 bg-indigo-50':'border-slate-200'}`}><input type="radio" checked={includeQuestions} onChange={()=>setIncludeQuestions(true)} name="template-mode" className="mt-1"/><span><strong className="text-sm">Layout + question content</strong><span className="block text-xs text-slate-500 mt-1">Also preserve the wording, options, answers and images for all {count} questions.</span></span></label>
   </fieldset>
   {isAdmin&&<label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={publicTemplate} onChange={e=>setPublicTemplate(e.target.checked)}/> Share this template with all teachers</label>}
   <p className="text-xs text-slate-500 flex items-center gap-2"><BookCopy size={15}/> Using a template creates an independent new paper. Saved templates stay available after logout.</p>
   <div className="flex justify-end gap-3 pt-2"><button type="button" className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-brand gap-2" type="submit" disabled={saving||!name.trim()}><Save size={16}/>{saving?'Saving…':'Save template'}</button></div>
  </form>
 </div>
}
