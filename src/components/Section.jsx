import React from 'react'
import Question from './Question.jsx'
import { makeQuestion } from '../utils.js'

export default function Section({ section, sectionIdx, sections, setSections, paperType, globalOffset, subject }) {
  const update = (key, val) =>
    setSections(prev => prev.map((s, i) => i !== sectionIdx ? s : { ...s, [key]: val }))

  const remove = () =>
    setSections(prev => prev.filter((_, i) => i !== sectionIdx))

  const addQuestion = () =>
    setSections(prev => prev.map((s, i) =>
      i !== sectionIdx ? s : { ...s, questions: [...s.questions, makeQuestion()] }
    ))

  const autoInstruction = `Answer all questions. Each question carries ${section.marksPerQ || 1} mark${Number(section.marksPerQ) !== 1 ? 's' : ''}.`
  const sectionTotal = (Number(section.marksPerQ) * section.questions.length).toFixed(1).replace(/\.0$/, '')

  return (
    <div className="section-card">

      {/* ── Header ── */}
      <div className="section-header">
        <div className="section-header-left">
          <span className="section-drag-handle">⠿</span>
          <input
            className="section-name-input"
            value={section.name}
            onChange={e => update('name', e.target.value)}
            placeholder="A"
            title="Section letter"
          />
          <span className="section-label-text">Section</span>
          <span className="section-badge">
            {section.questions.length} {section.questions.length === 1 ? 'Q' : 'Qs'} · {sectionTotal} marks
          </span>
        </div>
        <button className="section-remove-btn" onClick={remove}>Remove</button>
      </div>

      {/* ── Body ── */}
      <div className="section-body">

        {/* Meta row */}
        <div className="section-meta-row">
          <div className="field" style={{ margin: 0 }}>
            <label>Section Title</label>
            <input
              value={section.title || ''}
              onChange={e => update('title', e.target.value)}
              placeholder={`e.g. Reading Comprehension`}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Marks / Question</label>
            <div className="marks-input-wrap">
              <input
                type="number" min="0.5" step="0.5"
                value={section.marksPerQ}
                onChange={e => update('marksPerQ', e.target.value)}
              />
              <span className="marks-suffix">marks</span>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div>
          <div className="instructions-label-row">
            <label>Instructions (optional)</label>
            <button className="autofill-btn" onClick={() => update('instructions', autoInstruction)}>
              ✦ Auto-fill
            </button>
          </div>
          <textarea
            className="section-instructions"
            value={section.instructions}
            onChange={e => update('instructions', e.target.value)}
            placeholder={autoInstruction}
          />
        </div>

        {/* Questions list */}
        {section.questions.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '18px',
            color: 'var(--text-3)', fontSize: 12, fontStyle: 'italic',
            border: '1px dashed var(--border-2)', borderRadius: 'var(--r)',
            marginBottom: 12, background: 'var(--bg-3)'
          }}>
            No questions yet — add one below.
          </div>
        )}

        <div className="questions-list">
          {section.questions.map((q, qi) => (
            <Question
              key={q.id}
              q={q}
              localIdx={qi}
              globalIdx={globalOffset + qi + 1}
              sectionIdx={sectionIdx}
              paperType={paperType}
              subject={subject}
              marks={section.marksPerQ}
              setSections={setSections}
            />
          ))}
        </div>

        {/* Add question bar */}
        <div className="add-q-bar">
          <button className="btn btn-outline" onClick={addQuestion}>+ Add Question</button>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {section.questions.length} question{section.questions.length !== 1 ? 's' : ''} · {sectionTotal} marks total
          </span>
        </div>
      </div>
    </div>
  )
}
