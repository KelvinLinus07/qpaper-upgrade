import React, {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import Preview from './Preview.jsx'
import AnswerKeyPreview from './AnswerKeyPreview.jsx'

/**
 * Browser print uses the EXACT SAME React <Preview> tree and styling as the
 * builder. Native print/PDF preserves vector text, Unicode, tables and borders.
 * Keeping the editor mounted also protects unsaved changes during export.
 */
export default function PrintOverlay({info, sections, institution, answerKey=false, autoPrint=false, onClose}) {
  const ref = useRef(null)
  const [preparing, setPreparing] = useState(false)
  const autoPrintStarted = useRef(false)

  useEffect(() => {
    const previousTitle = document.title
    document.body.classList.add('qpaper-print-active')
    return () => {document.title = previousTitle;document.body.classList.remove('qpaper-print-active')}
  }, [])

  useEffect(() => {
    // Set a meaningful filename for browsers that suggest the page title as PDF name.
    const filename = [info.exam, info.subject, answerKey ? 'Answer-Key' : 'Question-Paper'].filter(Boolean).join(' - ')
    document.title = filename || 'QPaper Studio - Question Paper'
  }, [answerKey, info.exam, info.subject])

  useEffect(() => {
    const onKey = event => {if (event.key === 'Escape') onClose()}
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function printPdf() {
    if (preparing) return
    setPreparing(true)
    try {
      // Wait for S3/institution images and fonts before opening the print dialog.
      // Failed/missing images should not block printing the text of the paper.
      const imgs = Array.from(ref.current?.querySelectorAll('img') || [])
      await Promise.all([
        document.fonts?.ready || Promise.resolve(),
        ...imgs.map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
          img.addEventListener('load', resolve, {once:true})
          img.addEventListener('error', resolve, {once:true})
          setTimeout(resolve, 8000)
        }))
      ])
      window.print()
    } finally {setPreparing(false)}
  }

  useEffect(() => {
    if (!autoPrint || autoPrintStarted.current) return
    autoPrintStarted.current = true
    let frame2
    const frame1 = requestAnimationFrame(() => {frame2 = requestAnimationFrame(() => {void printPdf()})})
    return () => {cancelAnimationFrame(frame1);if(frame2)cancelAnimationFrame(frame2)}
  }, [autoPrint])

  return createPortal(
    <div className="paper-print-modal" role="dialog" aria-modal="true" aria-label={answerKey ? 'Answer key PDF preview' : 'Question paper PDF preview'} ref={ref}>
      <div className="paper-print-toolbar">
        <div className="paper-print-heading"><strong>{answerKey ? 'Answer key' : 'Question paper'} — A4 print preview</strong><span>This uses the same layout as the builder preview. Choose “Save as PDF” in your browser's print dialog.</span></div>
        <div className="paper-print-actions">
          <button type="button" className="paper-print-close" onClick={onClose}>Back to editor</button>
          <button type="button" className="paper-print-save" onClick={printPdf} disabled={preparing}>{preparing ? 'Preparing images…' : 'Print / Save as PDF'}</button>
        </div>
      </div>
      <div className="paper-print-scroll">
        {answerKey ? <AnswerKeyPreview info={info} sections={sections} institution={institution}/> : <Preview info={info} sections={sections} institution={institution} printMode/>}
      </div>
    </div>,
    document.body
  )
}
