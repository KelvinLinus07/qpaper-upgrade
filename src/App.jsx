import React, { useState, useEffect, useRef } from 'react'
import {api} from './lib/api.js'
import HeaderForm from './components/HeaderForm.jsx'
import PaperTypeSelector from './components/PaperTypeSelector.jsx'
import Section from './components/Section.jsx'
import Preview from './components/Preview.jsx'
import { makeSection, makeId, makeQuestion } from './utils.js'
import {readImport} from './lib/imports.js'
import {exportDocx} from './lib/exports.js'
import PrintOverlay from './components/PrintOverlay.jsx'
import FullscreenPreview from './components/FullscreenPreview.jsx'
import './fullscreen-preview.css'
import BankPicker from './components/BankPicker.jsx'
import SaveTemplateModal from './components/SaveTemplateModal.jsx'
import {instantiateTemplate} from './lib/templates.js'

export default function Builder({user,onLogout,onDashboard,paperId,onPaperId,readOnly=false,templateId=null}) {
  const [info, setInfo]               = useState({ school:'', exam:'', subject:'', duration:'', totalMarks:'' })
  const [paperType, setPaperType]     = useState('Both')
  const [sections, setSections]       = useState([makeSection(0)])
  const [toast, setToast]             = useState(null)
  const [generating, setGenerating]   = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // Mobile only: 'builder' | 'preview'
  const [mobileTab, setMobileTab]     = useState('builder')
  const [saving,setSaving]=useState(false),[ready,setReady]=useState(!paperId),[saveState,setSaveState]=useState('Not yet saved'),[savedSignature,setSavedSignature]=useState('')
  const [printJob,setPrintJob]=useState(null),[showSaveTemplate,setShowSaveTemplate]=useState(false),[fullscreenPreview,setFullscreenPreview]=useState(false)
  const [showBank,setShowBank]=useState(false),[showHistory,setShowHistory]=useState(false),[exportOpen,setExportOpen]=useState(false),[versions,setVersions]=useState([]),[academicYearId,setAcademicYearId]=useState(null),[years,setYears]=useState([]),[branding,setBranding]=useState(null)
  const importRef=useRef(null),savedIdRef=useRef(null),busyRef=useRef(false)
  useEffect(()=>{api('/academic-years').then(r=>setYears(r.years)).catch(()=>{});api('/institution').then(r=>setBranding(r.institution)).catch(()=>{})},[])
  useEffect(()=>{
    if(!paperId){setReady(true);return}
    if(savedIdRef.current===paperId)return
    let active=true;setReady(false)
    api(`/papers/${paperId}`).then(({paper})=>{if(!active)return;setInfo(paper.info);setPaperType(paper.paperType);setSections(paper.sections);setAcademicYearId(paper.academicYearId||null);setSavedSignature(JSON.stringify({info:paper.info,paperType:paper.paperType,sections:paper.sections,academicYearId:paper.academicYearId||null}));setSaveState('Saved');setReady(true)}).catch(e=>{if(active){showToast(e.message,'error');setReady(true)}})
    return()=>{active=false}
  },[paperId])
  useEffect(()=>{
    if(!templateId||paperId)return
    let active=true
    api('/templates').then(({templates})=>{
      if(!active)return;const t=templates.find(x=>x.id===templateId);if(!t)return
      const layout=instantiateTemplate(t.layout)
      setPaperType(layout.paperType)
      setSections(layout.sections)
      setInfo(previous=>({...previous,...Object.fromEntries(Object.entries(layout.info).filter(([,value])=>value!==''))}))
      showToast(`Template applied: ${t.name}`)
    }).catch(e=>showToast(e.message,'error'))
    return()=>{active=false}
  },[templateId,paperId])
  const currentSnapshot=()=>({info,paperType,sections,academicYearId})
  const signature=JSON.stringify(currentSnapshot())
  const savePaper=async(auto=false)=>{
    if(busyRef.current||readOnly||!ready)return
    busyRef.current=true;setSaving(true);setSaveState('Saving…')
    const payload=currentSnapshot(),hash=JSON.stringify(payload)
    try {const r=await api(paperId?`/papers/${paperId}`:'/papers',{method:paperId?'PUT':'POST',body:payload});savedIdRef.current=r.id;setSavedSignature(hash);setSaveState('Saved • '+new Date().toLocaleTimeString());if(!paperId)onPaperId(r.id);if(!auto)showToast('Paper saved and version recorded!')}
    catch(e){setSaveState('Save failed');showToast(e.message,'error')}
    finally{busyRef.current=false;setSaving(false)}
  }
  useEffect(()=>{
    if(!ready||readOnly||signature===savedSignature)return
    if(!info.exam&&!info.subject&&!sections.some(s=>s.questions.some(q=>q.text.trim())))return
    setSaveState('Unsaved changes')
    const timer=setTimeout(()=>savePaper(true),9000)
    return()=>clearTimeout(timer)
  },[signature,ready,readOnly,savedSignature])
  async function importQuestions(e){const file=e.target.files?.[0];if(!file)return;try{const imported=await readImport(file);if(!imported.length)throw new Error('No questions found');setSections(prev=>prev.length?prev.map((s,i)=>i===0?{...s,questions:[...s.questions.filter(q=>q.text.trim()),...imported]}:s):[{...makeSection(0),questions:imported}]);showToast(`Imported ${imported.length} questions from ${file.name}`)}catch(e){showToast(e.message,'error')}finally{e.target.value=''}}
  const addFromBank=q=>{const item={...makeQuestion(),id:makeId(),type:q.type,text:q.body,options:q.options||[],pairs:q.pairs||[],answer:q.answer||'',image:q.image_url||null,bankQuestionId:q.id};setSections(prev=>prev.length?prev.map((s,i)=>i===0?{...s,questions:[...s.questions,item]}:s):[{...makeSection(0),questions:[item]}]);showToast('Question added from bank')}
  async function showVersions(){if(!paperId){showToast('Save this paper before viewing history','info');return}try{const r=await api(`/papers/${paperId}/versions`);setVersions(r.versions);setShowHistory(true)}catch(e){showToast(e.message,'error')}}
  async function restore(versionId){if(!window.confirm('Restore this version? A new version will be saved, preserving current history.'))return;try{await api(`/papers/${paperId}/restore/${versionId}`,{method:'POST'});const {paper}=await api(`/papers/${paperId}`);setInfo(paper.info);setSections(paper.sections);setPaperType(paper.paperType);setAcademicYearId(paper.academicYearId||null);setSavedSignature(JSON.stringify({info:paper.info,paperType:paper.paperType,sections:paper.sections,academicYearId:paper.academicYearId||null}));setShowHistory(false);showToast('Version restored and saved')}catch(e){showToast(e.message,'error')}}
  const exportFile=async(kind,answers=false)=>{
    if(kind==='pdf'){setPrintJob({answerKey:answers,autoPrint:true});return}
    setGenerating(true)
    try{await exportDocx({info,sections,logoUrl:branding?.logo_url,institution:branding},answers);showToast(`${answers?'Answer key':'Paper'} exported as DOCX`)}
    catch(e){showToast(e.message,'error')}finally{setGenerating(false)}
  }

  const updateInfo = (key, val) => setInfo(p => ({ ...p, [key]: val }))

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3200)
  }

  const addSection = () => {
    setSections(p => [...p, makeSection(p.length)])
    showToast('Section added ✓')
  }

  const sectionOffsets = sections.reduce((acc, sec, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + sections[i - 1].questions.length)
    return acc
  }, [])

  const totalQuestions = sections.reduce((a, s) => a + s.questions.length, 0)
  const totalMarksCalc = sections.reduce((a, s) => a + Number(s.marksPerQ) * s.questions.length, 0)

  const generatePDF=()=>exportFile('pdf')

  return (
    <div className="app-shell">

      {/* ══ NAV ══ */}
      <nav className="nav">
        <div className="nav-left">
          <button className="nav-menu-btn" onClick={() => setSidebarOpen(p => !p)} title="Toggle sidebar">
            <span /><span /><span />
          </button>
          <div className="nav-brand">
            <div className="nav-brand-icon">📋</div>
            <span>QPaper <em>Builder</em></span>
          </div>
        </div>

        {/* Mobile tab switcher — only visible on small screens */}
        <div className="nav-mobile-tabs">
          <button className={`nmt-btn${mobileTab === 'builder' ? ' active' : ''}`} onClick={() => setMobileTab('builder')}>
            ✏ Builder
          </button>
          <button className={`nmt-btn${mobileTab === 'preview' ? ' active' : ''}`} onClick={() => setMobileTab('preview')}>
            📄 Preview
          </button>
        </div>

        <div className="nav-right">
          <div className="nav-stats">
            <span className="nav-stat"><strong>{sections.length}</strong> Sections</span>
            <span className="nav-stat-sep">·</span>
            <span className="nav-stat"><strong>{totalQuestions}</strong> Qs</span>
            <span className="nav-stat-sep">·</span>
            <span className="nav-stat"><strong>{totalMarksCalc}</strong> Marks</span>
          </div>
          {!readOnly&&<button className="nav-pdf-btn" onClick={()=>savePaper()} disabled={saving}>{saving?'Saving…':'💾 Save'}</button>}
          <div className="relative">
            <button className="nav-pdf-btn" onClick={()=>setExportOpen(v=>!v)} disabled={generating} aria-expanded={exportOpen} aria-haspopup="true">{generating?'Working…':'↓ Export ▾'}</button>
            {exportOpen&&<div className="export-popover"><button onClick={()=>{setExportOpen(false);exportFile('pdf')}}>Question paper PDF</button><button onClick={()=>{setExportOpen(false);exportFile('docx')}}>Editable Word (.docx)</button>{!readOnly&&<><button onClick={()=>{setExportOpen(false);exportFile('pdf',true)}}>Answer key PDF</button><button onClick={()=>{setExportOpen(false);exportFile('docx',true)}}>Answer key Word (.docx)</button></>}<button onClick={()=>{setExportOpen(false);exportFile('pdf')}}>A4 print preview</button></div>}
          </div>
          <div className="nav-user">
            <div className="nav-user-avatar">
              {user.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
            <div className="nav-user-info">
              <span className="nav-user-role">{user.role}</span>
              <span className="nav-user-name">{user.name}</span>
            </div>
          </div>
          <button className="nav-logout" onClick={onDashboard} title="Dashboard">⌂</button>
          <button className="nav-logout" onClick={onLogout} title="Sign out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </nav>

      {/* ══ BODY — 3 columns ══ */}
      <div className="app-body">

        {/* ── COL 1: Sidebar ── */}
        <aside className={`app-sidebar${sidebarOpen ? '' : ' sidebar-collapsed'} ${mobileTab === 'preview' ? 'mob-hide' : ''}`}>
          <div className={readOnly?"readonly-block":""}><HeaderForm info={info} onChange={updateInfo} /></div>
          <div className={readOnly?"readonly-block":""}><PaperTypeSelector value={paperType} onChange={setPaperType} /></div>
          <div className="sb-block"><div className="sb-block-title">Workflow</div>
            <p className="text-xs mb-2" style={{color:'#91a9ce'}} aria-live="polite">{saveState}</p>
            <label className="text-xs block mb-2" style={{color:'#aabbd4'}}>Academic year</label>
            <select className="w-full rounded-md p-2 text-sm mb-3" style={{background:'#172239',color:'#fff',border:'1px solid #30435f'}} value={academicYearId||''} onChange={e=>setAcademicYearId(e.target.value||null)}><option value="">Not assigned</option>{years.map(y=><option key={y.id} value={y.id}>{y.name}{y.active?' (Active)':''}</option>)}</select>
            {!readOnly&&<div className="grid grid-cols-2 gap-2"><button className="builder-extra" onClick={()=>importRef.current.click()}>↑ Import CSV / JSON</button><button className="builder-extra" onClick={()=>setShowBank(true)}>▤ Question bank</button><button className="builder-extra" onClick={()=>setShowSaveTemplate(true)}>▧ Save template</button><button className="builder-extra" onClick={showVersions}>↺ Versions</button></div>}
            <input className="hidden" type="file" accept=".csv,.json" ref={importRef} onChange={importQuestions}/>
          </div>
          <div className="sb-block">
            <div className="sb-block-title">Summary</div>
            <div className="sb-stats">
              {[
                { label: 'Sections',  val: sections.length, icon: '▤' },
                { label: 'Questions', val: totalQuestions,  icon: '#' },
                { label: 'Marks',     val: totalMarksCalc,  icon: '★' },
              ].map(s => (
                <div className="sb-stat-card" key={s.label}>
                  <span className="sb-stat-icon">{s.icon}</span>
                  <span className="sb-stat-val">{s.val}</span>
                  <span className="sb-stat-label">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── COL 2: Builder ── */}
        <main className={`app-builder ${readOnly?'readonly-block':''} ${mobileTab === 'preview' ? 'mob-hide' : ''}`}>
          <div className="builder-toolbar">
            <button className="tb-add-btn" onClick={addSection}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Section
            </button>
            {sections.length > 0 && (
              <span className="tb-hint">
                {sections.length} section{sections.length !== 1 ? 's' : ''} · {totalMarksCalc} total marks
              </span>
            )}
          </div>

          {sections.length === 0 ? (
            <div className="builder-empty">
              <div className="be-icon">📄</div>
              <h3>Start Building</h3>
              <p>Click <strong>Add Section</strong> to create your first exam section.</p>
              <button className="be-cta" onClick={addSection}>+ Add First Section</button>
            </div>
          ) : (
            <div className="builder-sections">
              {sections.map((sec, si) => (
                <Section
                  key={sec.id}
                  section={sec}
                  sectionIdx={si}
                  sections={sections}
                  setSections={setSections}
                  paperType={paperType}
                  globalOffset={sectionOffsets[si]}
                  subject={info.subject}
                />
              ))}
            </div>
          )}
        </main>

        {/* ── COL 3: Live Preview ── ALWAYS VISIBLE on desktop ── */}
        <aside className={`app-preview-panel ${mobileTab === 'builder' ? 'mob-hide' : ''}`}>
          <div className="pvp-header">
            <div className="pvp-header-left">
              <div className="pvp-live-dot" />
              <span className="pvp-label">Live Preview</span>
            </div>
            <div className="pvp-header-actions">
              <button type="button" className="pvp-enlarge-btn" onClick={()=>setFullscreenPreview(true)} title="Enlarge question paper preview" aria-label="Enlarge question paper preview">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3"/></svg>
                Enlarge
              </button>
              <button className="pvp-pdf-btn" onClick={generatePDF} disabled={generating}>
                {generating ? '⏳' : '⬇ PDF'}
              </button>
            </div>
          </div>
          <div className="pvp-scroll">
            <Preview info={info} sections={sections} institution={branding}/>
          </div>
        </aside>

      </div>

      {fullscreenPreview&&<FullscreenPreview info={info} sections={sections} institution={branding} onClose={()=>setFullscreenPreview(false)} onPrint={()=>{setFullscreenPreview(false);generatePDF()}}/>}
      {printJob&&<PrintOverlay info={info} sections={sections} institution={branding} answerKey={printJob.answerKey} autoPrint={printJob.autoPrint} onClose={()=>setPrintJob(null)}/>}
      {showSaveTemplate&&<SaveTemplateModal paper={{info,paperType,sections}} isAdmin={user.role==='admin'} onClose={()=>setShowSaveTemplate(false)} onSaved={t=>{setShowSaveTemplate(false);showToast(`Template saved: ${t.name}. Available in Templates.`)}}/>}
      {showBank&&<BankPicker onPick={addFromBank} onClose={()=>setShowBank(false)}/>}
      {showHistory&&<div className="fixed inset-0 z-[1100] bg-black/70 p-4 flex items-center justify-center" onClick={()=>setShowHistory(false)}><div className="rounded-2xl bg-white text-slate-800 p-6 max-w-lg w-full max-h-[80vh] overflow-auto" onClick={e=>e.stopPropagation()}><div className="flex justify-between gap-3"><h2 className="font-bold text-xl">Version history</h2><button className="text-indigo-700" onClick={()=>setShowHistory(false)}>Close</button></div><p className="text-sm text-slate-500 mt-2">Every save creates a restorable database snapshot.</p><div className="space-y-2 mt-5">{versions.map(v=><div key={v.id} className="border rounded-lg p-3 flex justify-between items-center gap-3"><div><strong>Version {v.version_number}</strong><p className="text-xs text-slate-500">{new Date(v.created_at).toLocaleString()}</p></div><button className="bg-indigo-600 text-white rounded-lg px-3 py-2 text-sm font-semibold" onClick={()=>restore(v.id)}>Restore</button></div>)}</div></div></div>}
      {/* ── Toast ── */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'error' ? '✕' : toast.type === 'info' ? 'ℹ' : '✓'}
          </span>
          {toast.msg}
        </div>
      )}

    </div>
  )
}
