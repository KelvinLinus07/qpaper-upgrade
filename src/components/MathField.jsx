import React, {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import katex from 'katex'
import {insertAtSelection} from '../lib/math.js'

const snippets = [
  ['Fraction', '\\frac{a}{b}'], ['Power', 'x^{2}'], ['Root', '\\sqrt{x}'],
  ['Integral', '\\int_{a}^{b} f(x)\\,dx'], ['Sum', '\\sum_{i=1}^{n} i'],
  ['Limit', '\\lim_{x\\to 0}'], ['Pi', '\\pi'], ['Alpha', '\\alpha'],
  ['Theta', '\\theta'], ['Infinity', '\\infty'], ['≤', '\\leq'],
  ['≥', '\\geq'], ['±', '\\pm'], ['Vector', '\\vec{v}'],
  ['Matrix', '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}']
]

function EquationDialog({label, onClose, onInsert}) {
  const [latex, setLatex] = useState('')
  const [display, setDisplay] = useState(false)
  const editor = useRef(null)
  let html = null
  let error = ''
  if (latex.trim()) {
    try {html = katex.renderToString(latex, {displayMode: display, output: 'htmlAndMathml', throwOnError: true, trust:false, strict:'ignore', maxExpand:1000,maxSize:20})}
    catch (e) {error = e.message}
  }
  useEffect(() => {
    const closeOnEscape = e => {if(e.key === 'Escape') {e.stopPropagation();onClose()}}
    document.addEventListener('keydown', closeOnEscape, true)
    editor.current?.focus()
    return () => document.removeEventListener('keydown', closeOnEscape, true)
  }, [onClose])
  function addSnippet(snippet) {
    const el = editor.current
    const start = el?.selectionStart ?? latex.length
    const end = el?.selectionEnd ?? start
    setLatex(current => current.slice(0,start) + snippet + current.slice(end))
    requestAnimationFrame(() => {el?.focus();el?.setSelectionRange(start+snippet.length,start+snippet.length)})
  }
  return createPortal(<div className="math-dialog-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="math-dialog" role="dialog" aria-modal="true" aria-label={`Insert equation in ${label}`}>
      <div className="math-dialog-header"><div><strong>Insert mathematical equation</strong><p>Editing {label} · LaTeX notation</p></div><button type="button" onClick={onClose} aria-label="Close equation editor">×</button></div>
      <div className="math-dialog-content">
        <p className="math-dialog-label">Common symbols and structures</p>
        <div className="math-snippet-grid">{snippets.map(([name, snippet]) => <button type="button" key={name} onClick={()=>addSnippet(snippet)} title={snippet}>{name}</button>)}</div>
        <label htmlFor="math-latex-input" className="math-dialog-label">LaTeX equation</label>
        <textarea ref={editor} id="math-latex-input" spellCheck="false" rows={3} value={latex} onChange={e=>setLatex(e.target.value)} placeholder="e.g. \\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}" />
        <label className="math-display-toggle"><input type="checkbox" checked={display} onChange={e=>setDisplay(e.target.checked)}/> Display equation on its own line</label>
        <p className="math-dialog-label">Live preview</p>
        <div className="math-live-preview" aria-live="polite">{html ? <span dangerouslySetInnerHTML={{__html:html}}/> : error ? <span className="math-live-error">{error}</span> : <span className="math-live-placeholder">Select a symbol or enter an equation to preview it.</span>}</div>
        <p className="math-dialog-help">Equations are stored as text with LaTeX delimiters and rendered in the preview and PDF. You can also type \( ... \) directly.</p>
      </div>
      <div className="math-dialog-actions"><button type="button" className="math-dialog-cancel" onClick={onClose}>Cancel</button><button type="button" className="math-dialog-submit" disabled={!latex.trim() || !!error} onClick={()=>onInsert(latex,display)}>Insert equation</button></div>
    </section>
  </div>, document.body)
}

/** A normal controlled input/textarea with an adjacent math insertion tool.
 * Selection is captured before the popover takes focus. */
export default function MathField({value='', onChange, label='question', as='input', className='', wrapperClassName='', ...rest}) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const selection = useRef({start:0,end:0})
  const capture = () => {
    const el=ref.current
    if(el)selection.current={start:el.selectionStart ?? value.length,end:el.selectionEnd ?? value.length}
  }
  const show = () => {capture();setOpen(true)}
  const insert = (latex, display) => {
    const {text,caret} = insertAtSelection(value, selection.current.start, selection.current.end, latex, display)
    onChange(text)
    setOpen(false)
    requestAnimationFrame(()=>{ref.current?.focus();ref.current?.setSelectionRange(caret,caret)})
  }
  const Input = as
  return <div className={`math-field ${wrapperClassName}`}>
    <Input {...rest} ref={ref} className={className} value={value ?? ''} onChange={e=>onChange(e.target.value)} onClick={capture} onKeyUp={capture} onSelect={capture}/>
    <button type="button" className="math-field-trigger" aria-label={`Insert equation in ${label}`} title={`Insert mathematical equation in ${label}`} onMouseDown={capture} onClick={show}><span aria-hidden="true">∑</span> Equation</button>
    {open && <EquationDialog label={label} onClose={()=>setOpen(false)} onInsert={insert} />}
  </div>
}
