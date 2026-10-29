import React, { useRef, useState } from 'react'
import { makePair } from '../utils.js'
import { api } from '../lib/api.js'
import MathField from './MathField.jsx'

const ALL_TYPES = ['Objective', 'Subjective', 'Fill in the Blanks', 'Match the Following', 'True/False']

const TYPE_META = {
  'Objective':           { cls: 'obj',   label: 'MCQ' },
  'Subjective':          { cls: 'sub',   label: 'Descriptive' },
  'Fill in the Blanks':  { cls: 'fill',  label: 'Fill-in' },
  'Match the Following': { cls: 'match', label: 'Match' },
  'True/False':          { cls: 'tf',    label: 'T / F' },
}

const OPTION_LABELS = ['A', 'B', 'C', 'D']

function getAvailableTypes(paperType) {
  if (paperType === 'Objective')  return ['Objective', 'True/False']
  if (paperType === 'Subjective') return ['Subjective', 'Fill in the Blanks', 'Match the Following']
  return ALL_TYPES
}

function McqOptions({ options = ['','','',''], onChange }) {
  const opts = options.length === 4 ? options : ['','','','']
  return (
    <div className="q-options-grid">
      {OPTION_LABELS.map((lbl, i) => (
        <div className="q-option-row" key={lbl}>
          <span className="q-option-label">{lbl}</span>
          <MathField as="input" className="q-option-input" wrapperClassName="math-field-small" label={`option ${lbl}`} placeholder={`Option ${lbl}`} value={opts[i]} onChange={val => { const n = [...opts]; n[i] = val; onChange(n) }} />
        </div>
      ))}
    </div>
  )
}

function MatchPairs({ pairs = [{ left:'', right:'' }], onChange }) {
  const upd = (idx, side, val) => onChange(pairs.map((p, i) => i === idx ? { ...p, [side]: val } : p))
  return (
    <div className="q-pairs-wrap">
      <div className="q-pairs-header"><span>Column A</span><span>Column B</span><span /></div>
      {pairs.map((pair, idx) => (
        <div className="q-pair-row" key={idx}>
          <MathField as="input" className="q-pair-input" wrapperClassName="math-field-small" label={`matching pair ${idx+1} left`} placeholder={`Left ${idx + 1}`} value={pair.left} onChange={val => upd(idx,'left',val)} />
          <span className="q-pair-arrow">↔</span>
          <MathField as="input" className="q-pair-input" wrapperClassName="math-field-small" label={`matching pair ${idx+1} right`} placeholder={`Right ${idx + 1}`} value={pair.right} onChange={val => upd(idx,'right',val)} />
          <button className="q-pair-remove" onClick={() => onChange(pairs.filter((_,i) => i !== idx))} disabled={pairs.length === 1}>×</button>
        </div>
      ))}
      <button className="q-add-pair-btn" onClick={() => onChange([...pairs, makePair()])}>+ Add Pair</button>
    </div>
  )
}

export default function Question({ q, localIdx, globalIdx, sectionIdx, paperType, setSections, subject = '', marks = 1, readOnly = false }) {
  const fileRef = useRef()
  const [duplicate,setDuplicate]=useState('')
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState('')
  const [imageBroken, setImageBroken] = useState(false)
  const available = getAvailableTypes(paperType)
  const { cls, label } = TYPE_META[q.type] || TYPE_META['Objective']

  const update = (key, val) =>
    setSections(prev => prev.map((s, si) =>
      si !== sectionIdx ? s : {
        ...s,
        questions: s.questions.map(q2 => q2.id !== q.id ? q2 : { ...q2, [key]: val })
      }
    ))

  const changeType = newType =>
    setSections(prev => prev.map((s, si) =>
      si !== sectionIdx ? s : {
        ...s,
        questions: s.questions.map((q2, qi) =>
          qi !== localIdx ? q2 : {
            ...q2, type: newType,
            options: q2.options?.length === 4 ? q2.options : ['','','',''],
            pairs:   q2.pairs?.length   > 0   ? q2.pairs   : [{ left:'', right:'' }],
          }
        )
      }
    ))

  const remove = () =>
    setSections(prev => prev.map((s, si) =>
      si !== sectionIdx ? s : { ...s, questions: s.questions.filter((_,qi) => qi !== localIdx) }
    ))

  const handleImage = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageError('')
    setImageBroken(false)
    if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) {
      setImageError('Choose a JPEG, PNG, WebP or GIF image.')
      e.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Image must be 5 MB or smaller.')
      e.target.value = ''
      return
    }
    setImageUploading(true)
    const body = new FormData()
    body.append('image',file)
    try {
      const result = await api('/uploads/image',{method:'POST',body})
      if (typeof result.url !== 'string' || !result.url) throw new Error('The upload server did not return an image URL.')
      update('image',result.url)
    } catch(err) {
      setImageError(`Upload failed: ${err.message}`)
    } finally {
      setImageUploading(false)
      e.target.value = ''
    }
  }

  const saveToBank=async()=>{if(!q.text.trim())return;try{await api('/bank',{method:'POST',body:{...q,subject,marks}});setDuplicate('✓ Added to your question bank')}catch(e){setDuplicate(e.message)}}
  const checkDuplicate=async()=>{if(!q.text.trim())return;try{const {duplicates}=await api('/bank/duplicates',{method:'POST',body:{type:q.type,text:q.text}});setDuplicate(duplicates.length?'⚠ Already exists in your question bank':'✓ Not found in your question bank')}catch(e){setDuplicate(e.message)}}
  const placeholder =
    q.type === 'Fill in the Blanks'   ? 'Use ___ for blanks, e.g. "The capital of India is ___."' :
    q.type === 'Match the Following'  ? 'Optional heading, e.g. "Match the following animals."' :
    q.type === 'True/False'           ? 'Enter a statement, e.g. "The Earth is flat."' :
    'Enter question text here…'

  return (
    <div className="question-item">
      {/* Top row */}
      <div className="q-top-row">
        <div className="q-num-badge">{globalIdx}</div>
        <MathField as="textarea" label={`question ${globalIdx}`} className="q-textarea" placeholder={placeholder} value={q.text} onChange={val => update('text',val)} />
      </div>

      {/* Type-specific editors */}
      {q.type === 'Objective' && (
        <McqOptions options={q.options} onChange={val => update('options', val)} />
      )}
      {q.type === 'Match the Following' && (
        <MatchPairs pairs={q.pairs} onChange={val => update('pairs', val)} />
      )}
      {q.type === 'True/False' && (
        <div className="q-tf-hint">Preview will show <strong>True / False</strong> choices automatically.</div>
      )}

      <div className="question-answer-field"><label htmlFor={`answer-${q.id}`}>Answer key / marking notes</label><MathField as="textarea" rows={2} id={`answer-${q.id}`} label={`answer key for question ${globalIdx}`} placeholder="Correct answer, worked solution, or marking guidance" value={q.answer||''} onChange={val=>update('answer',val)} /></div>
      {duplicate&&<p className="text-xs mt-2" style={{color:'#eab676'}} role="status">{duplicate}</p>}
      {/* Bottom toolbar */}
      <div className="q-bottom-row">
        <div className="q-bottom-left">
          <select className="q-type-select" value={q.type} onChange={e => changeType(e.target.value)}>
            {available.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className={`q-type-chip ${cls}`}>{label}</span>
          <button className="q-img-btn" onClick={checkDuplicate} title="Check against your question bank">Check duplicates</button>
          <button className="q-img-btn" onClick={saveToBank} title="Save a reusable copy of this question">Save to bank</button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display:'none' }} onChange={handleImage} />
          <button type="button" className="q-img-btn" disabled={imageUploading || readOnly} onClick={() => fileRef.current?.click()} aria-busy={imageUploading}>
            {imageUploading ? 'Uploading image…' : `📎 ${q.image ? 'Replace image' : 'Add image'}`}
          </button>
          {q.image && (
            <button className="q-img-btn" style={{ color:'var(--red)' }} onClick={() => {update('image', null);setImageError('');setImageBroken(false)}}>
              ✕ Remove
            </button>
          )}
        </div>
        <button className="q-remove-btn" onClick={remove}>×</button>
      </div>

      {imageUploading && <p role="status" className="q-image-status">Uploading to object storage…</p>}
      {imageError && <p role="alert" className="q-image-error">{imageError}</p>}
      {q.image && <div className="q-image-attachment">
        {!imageBroken && <img key={q.image} src={q.image} className="q-img-preview" alt="Attached question diagram" onError={() => setImageBroken(true)} onLoad={() => setImageBroken(false)} />}
        {imageBroken && <p role="alert" className="q-image-error">Image uploaded but could not be displayed. Check the image API and your R2 credentials, or replace it.</p>}
        <span className="q-image-status">Image attached to question {globalIdx}; it will appear in the live preview and saved paper.</span>
      </div>}
    </div>
  )
}
