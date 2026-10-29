import React,{useEffect,useMemo,useState} from 'react'
import {Link} from 'react-router-dom'
import {api} from '../lib/api.js'
import {PAPER_TYPES,QUESTION_TYPES,templateDetails} from '../lib/templates.js'
import {Layers3,ArrowUpRight,Trash2,Plus,Copy,Edit3,Search,X,Save,BookOpen,Clock3} from 'lucide-react'

const newSection=i=>({name:String.fromCharCode(65+i),title:'',instructions:'',marksPerQ:1,questionCount:5,type:'Objective',originalQuestions:null,originalType:'Objective'})
const emptyForm=()=>({name:'',description:'',paperType:'Both',is_public:false,sections:[newSection(0)]})
function formFromTemplate(t){
 return {name:t.name||'',description:t.description||'',paperType:t.layout?.paperType||'Both',is_public:!!t.is_public,info:t.layout?.info,
  sections:(t.layout?.sections||[]).map((s,i)=>({name:s.name||String.fromCharCode(65+i),title:s.title||'',instructions:s.instructions||'',marksPerQ:s.marksPerQ??1,questionCount:s.questions?.length??s.questionCount??1,type:s.type||s.questions?.[0]?.type||'Objective',originalQuestions:s.questions||null,originalType:s.type||s.questions?.[0]?.type||'Objective'}))}
}
function toLayout(form){
 return {version:2,paperType:form.paperType,...(form.info?{info:form.info}:{}),sections:form.sections.map(s=>({
  name:s.name,title:s.title,instructions:s.instructions,marksPerQ:Number(s.marksPerQ),questionCount:Number(s.questionCount),type:s.type,
  ...(s.originalQuestions?{questions:Array.from({length:Number(s.questionCount)},(_,i)=>{
   const existing=s.originalQuestions[i]
   return existing?{...existing,type:s.type===s.originalType?existing.type:s.type}:{type:s.type,text:'',options:['','','',''],pairs:[{left:'',right:''}],answer:'',image:null}
  })}:{}),
 }))}
}
function TemplateEditor({initial,onClose,onSaved,isAdmin}){
 const [form,setForm]=useState(()=>initial?formFromTemplate(initial):emptyForm())
 const [saving,setSaving]=useState(false),[error,setError]=useState('')
 const total=form.sections.reduce((n,s)=>n+(Number(s.questionCount)||0),0)
 const update=(key,value)=>setForm(f=>({...f,[key]:value}))
 const updateSection=(i,key,value)=>setForm(f=>({...f,sections:f.sections.map((s,j)=>j===i?{...s,[key]:value}:s)}))
 async function submit(e){
  e.preventDefault();setError('')
  if(form.sections.length<1)return setError('Add at least one section.')
  if(form.sections.some(s=>!Number.isInteger(Number(s.questionCount))||Number(s.questionCount)<1||Number(s.questionCount)>100||!Number.isFinite(Number(s.marksPerQ))||Number(s.marksPerQ)<0))return setError('Each section needs 1–100 questions and valid, nonnegative marks.')
  setSaving(true)
  try{
   const payload={name:form.name.trim(),description:form.description.trim(),is_public:isAdmin&&form.is_public,layout:toLayout(form)}
   await api(initial?`/templates/${initial.id}`:'/templates',{method:initial?'PUT':'POST',body:payload})
   onSaved()
  }catch(err){setError(err.message)}finally{setSaving(false)}
 }
 return <div className="fixed inset-0 z-[1200] bg-slate-950/70 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <form onSubmit={submit} className="bg-white text-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-y-auto p-5 sm:p-8 space-y-5" aria-label="Template editor">
   <div className="flex justify-between items-start gap-3"><div><p className="eyebrow-new">CUSTOM TEMPLATE</p><h2 className="text-2xl font-extrabold mt-1">{initial?'Edit reusable template':'Create a reusable template'}</h2><p className="text-slate-500 text-sm mt-1">Specify the sections, question counts, formats and marking rules.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close editor"><X size={22}/></button></div>
   {error&&<p className="error-new" role="alert">{error}</p>}
   <div className="grid sm:grid-cols-2 gap-4"><label className="field-new">Template name<input required maxLength={120} value={form.name} onChange={e=>update('name',e.target.value)} placeholder="e.g. Weekly science test"/></label><label className="field-new">Paper format<select value={form.paperType} onChange={e=>update('paperType',e.target.value)}>{PAPER_TYPES.map(type=><option key={type}>{type}</option>)}</select></label></div>
   <label className="field-new">Description<textarea rows={2} maxLength={2000} value={form.description} onChange={e=>update('description',e.target.value)} placeholder="Purpose, class or syllabus of this layout"/></label>
   <div className="flex justify-between items-center gap-3"><div><h3 className="font-bold text-lg">Sections</h3><p className="text-xs text-slate-500">{form.sections.length} sections · {total} questions</p></div><button type="button" className="btn-outline !px-3 !py-2 gap-2 text-sm" disabled={form.sections.length>=30} onClick={()=>setForm(f=>({...f,sections:[...f.sections,newSection(f.sections.length)]}))}><Plus size={16}/> Add section</button></div>
   <div className="space-y-4">{form.sections.map((s,i)=><div key={i} className="p-4 border border-slate-200 bg-slate-50/70 rounded-2xl space-y-3"><div className="flex justify-between items-center"><strong>Section {i+1}</strong><button type="button" className="text-rose-600 disabled:text-slate-300" disabled={form.sections.length===1} onClick={()=>setForm(f=>({...f,sections:f.sections.filter((_,j)=>j!==i)}))} aria-label={`Remove section ${i+1}`}><Trash2 size={17}/></button></div>
    <div className="grid grid-cols-1 sm:grid-cols-[85px_1fr] gap-3"><label className="field-new">Label<input maxLength={20} value={s.name} onChange={e=>updateSection(i,'name',e.target.value)}/></label><label className="field-new">Section title<input maxLength={255} value={s.title} onChange={e=>updateSection(i,'title',e.target.value)} placeholder="Multiple choice / Short answer"/></label></div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><label className="field-new">Question type<select value={s.type} onChange={e=>updateSection(i,'type',e.target.value)}>{QUESTION_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></label><label className="field-new">Questions<input type="number" min={1} max={100} required value={s.questionCount} onChange={e=>updateSection(i,'questionCount',e.target.value)}/></label><label className="field-new">Marks per question<input type="number" min={0} max={1000} step="0.5" required value={s.marksPerQ} onChange={e=>updateSection(i,'marksPerQ',e.target.value)}/></label></div>
    <label className="field-new">Section instructions<textarea rows={2} maxLength={3000} value={s.instructions} onChange={e=>updateSection(i,'instructions',e.target.value)} placeholder="Attempt all questions…"/></label>
   </div>)}</div>
   {isAdmin&&<label className="flex gap-3 items-center text-sm text-slate-700 font-semibold"><input type="checkbox" checked={form.is_public} onChange={e=>update('is_public',e.target.checked)}/> Share this template with teachers</label>}
   {initial?.layout?.sections?.some(s=>s.questions?.length)&&<p className="text-xs text-indigo-700">This template includes question content. Editing its section count keeps existing questions wherever possible.</p>}
   <div className="flex justify-end gap-3 border-t pt-5"><button type="button" className="btn-outline" onClick={onClose}>Cancel</button><button type="submit" disabled={saving||!form.name.trim()} className="btn-brand gap-2"><Save size={16}/>{saving?'Saving…':initial?'Update template':'Create template'}</button></div>
  </form>
 </div>
}

export default function TemplatePage({user}){
 const [templates,setTemplates]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[search,setSearch]=useState(''),[editing,setEditing]=useState(undefined),[busyId,setBusyId]=useState(null),[notice,setNotice]=useState('')
 const canManage=user.role!=='student'
 async function refresh(){try{const r=await api('/templates');setTemplates(r.templates);setError('')}catch(e){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{refresh()},[])
 const displayed=useMemo(()=>templates.filter(t=>`${t.name} ${t.description}`.toLowerCase().includes(search.trim().toLowerCase())),[templates,search])
 const canEdit=t=>canManage&&!t.is_builtin&&(t.owner_id===user.id||user.role==='admin')
 async function del(t){if(!window.confirm(`Delete “${t.name}”? Papers already created using this template won't be changed.`))return;setBusyId(t.id);try{await api(`/templates/${t.id}`,{method:'DELETE'});setNotice('Template deleted. Existing question papers remain unchanged.');await refresh()}catch(e){setError(e.message)}finally{setBusyId(null)}}
 async function duplicate(t){if(!canManage)return;setBusyId(t.id);try{await api('/templates',{method:'POST',body:{name:`${t.name} (copy)`,description:t.description||'',layout:t.layout,is_public:false}});setNotice('Template copied to your library.');await refresh()}catch(e){setError(e.message)}finally{setBusyId(null)}}
 return <><div className="flex flex-wrap justify-between items-start gap-5"><div><p className="eyebrow-new">SAVE ONCE · REUSE ANYTIME</p><h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-2">Template library</h1><p className="text-slate-500 mt-3 max-w-2xl">Create your own examination layouts, reuse them for future papers, and manage shared templates. Using a template makes an independent copy.</p></div>{canManage&&<button className="btn-brand gap-2" onClick={()=>setEditing(null)}><Plus size={18}/> Create template</button>}</div>
 {error&&<p role="alert" className="error-new">{error}</p>}{notice&&<p className="success-new" role="status">{notice}</p>}
 <div className="flex flex-wrap items-center gap-3 mt-8"><label className="relative max-w-md flex-1 min-w-[180px]"><Search size={18} className="absolute left-3 top-3 text-slate-400"/><input aria-label="Search templates" placeholder="Search templates…" className="input-new pl-10" value={search} onChange={e=>setSearch(e.target.value)}/></label><span className="text-sm text-slate-500">{displayed.length} template{displayed.length===1?'':'s'}</span></div>
 <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5 mt-6">{displayed.map(t=>{const meta=templateDetails(t);return <article key={t.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 flex flex-col min-h-[310px]"><div className="flex justify-between items-start gap-2"><div className="rounded-xl bg-indigo-50 text-indigo-600 p-3"><Layers3 size={24}/></div><span className={`text-xs font-bold rounded-full px-2.5 py-1 ${t.is_builtin?'bg-slate-100 text-slate-600':t.is_public?'bg-emerald-50 text-emerald-700':'bg-indigo-50 text-indigo-700'}`}>{t.is_builtin?'Starter':t.is_public?'Shared':'My template'}</span></div><h2 className="font-bold text-xl mt-5 break-words">{t.name}</h2><p className="text-slate-500 text-sm mt-2 line-clamp-2">{t.description||'Reusable examination layout'}</p><div className="flex flex-wrap gap-2 text-xs text-slate-600 mt-4"><span className="px-2.5 py-1 bg-slate-50 rounded-md">{meta.sections} sections</span><span className="px-2.5 py-1 bg-slate-50 rounded-md">{meta.questions} questions</span><span className="px-2.5 py-1 bg-slate-50 rounded-md">{meta.marks} marks</span></div><div className="mt-auto pt-6 flex flex-wrap gap-2 items-center"><Link to={`/builder?template=${encodeURIComponent(t.id)}`} className="btn-brand !py-2 !px-3 text-sm no-underline gap-1">Use <ArrowUpRight size={15}/></Link>{canManage&&<button onClick={()=>duplicate(t)} disabled={busyId===t.id} className="btn-outline !py-2 !px-3 text-sm gap-1" title="Duplicate template"><Copy size={15}/> Copy</button>}{canEdit(t)&&<><button onClick={()=>setEditing(t)} className="btn-outline !py-2 !px-3 text-sm gap-1"><Edit3 size={15}/> Edit</button><button className="text-rose-600 border border-rose-100 rounded-lg p-2 hover:bg-rose-50" disabled={busyId===t.id} onClick={()=>del(t)} title="Delete template" aria-label={`Delete ${t.name}`}><Trash2 size={17}/></button></>}</div>{t.updated_at&&<p className="text-xs text-slate-400 mt-3 flex gap-1 items-center"><Clock3 size={12}/> Updated {new Date(t.updated_at).toLocaleDateString()}</p>}</article>})}</div>
 {loading&&<div className="text-slate-500 mt-8">Loading templates…</div>}{!loading&&!displayed.length&&<div className="text-center bg-white border border-dashed border-slate-300 p-12 rounded-2xl mt-6"><BookOpen className="mx-auto text-indigo-400" size={32}/><h3 className="font-bold mt-3">No templates found</h3><p className="text-slate-500 mt-2">Try a different search, or create your first template.</p></div>}
 {editing!==undefined&&<TemplateEditor key={editing?.id||'new'} initial={editing} isAdmin={user.role==='admin'} onClose={()=>setEditing(undefined)} onSaved={async()=>{setEditing(undefined);setNotice(editing?'Template updated successfully.':'Template saved for future use.');await refresh()}}/>}
 </>
}
