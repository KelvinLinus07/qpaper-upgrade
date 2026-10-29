import React from 'react'
import MathText from './MathText.jsx'

// The printable answer key uses the same A4 page styling as the paper preview.
// This is not displayed in student read-only workflows.
export default function AnswerKeyPreview({info, sections, institution}) {
  let number = 0
  const total = sections.reduce((sum, section) => sum + Number(section.marksPerQ || 0) * section.questions.length, 0)
  return <div className="pv-wrapper pv-print-page">
    <div className="pv-paper pv-answer-paper">
      <div className="pv-header" style={institution?.accent_color ? {borderTop:`4px solid ${institution.accent_color}`,paddingTop:12} : undefined}>
        {institution?.logo_url && <img className="pv-institution-logo" src={institution.logo_url} alt="Institution logo" />}
        <div className="pv-school">{info.school || institution?.name || 'Institution'}</div>
        <div className="pv-exam">{info.exam || 'Examination'}</div>
        <div className="pv-header-rule" />
        <div className="pv-subject">{info.subject || 'Subject'}</div>
      </div>
      <h1 className="pv-answer-title">Answer Key — Teacher Copy</h1>
      <div className="pv-meta"><span><strong>Time Allowed:</strong> {info.duration || '—'}</span><span><strong>Maximum Marks:</strong> {info.totalMarks || total || '—'}</span></div>
      <div className="pv-thick-rule" />
      {sections.map(section => <section className="pv-section" key={section.id}>
        <div className="pv-sec-heading-row"><div className="pv-sec-heading">SECTION {section.name}{section.title ? ` — ${section.title}` : ''}</div><div className="pv-sec-marks-summary">{section.marksPerQ} marks per question</div></div>
        <table className="pv-q-table pv-answer-table">
          <thead><tr><th className="pv-th-qno">Q No.</th><th className="pv-th-q">Question / Answer</th><th className="pv-th-marks">Marks</th></tr></thead>
          <tbody>{section.questions.map(q => {
            number += 1
            return <tr className="pv-q-row" key={q.id}>
              <td className="pv-q-num">Q{number}.</td>
              <td className="pv-q-body"><div className="pv-q-text"><MathText text={q.text || '(Empty question)'} /></div><div className="pv-key-answer"><strong>Answer:</strong> <MathText text={q.answer?.trim() || 'Not provided'} /></div></td>
              <td className="pv-q-marks">[{section.marksPerQ}]</td>
            </tr>
          })}</tbody>
        </table>
      </section>)}
      <div className="pv-footer-rule"/><div className="pv-footer"><span>Teacher Copy • Confidential</span><span>Total: {info.totalMarks || total} Marks</span></div>
    </div>
  </div>
}
