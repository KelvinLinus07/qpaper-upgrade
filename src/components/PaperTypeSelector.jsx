import React from 'react'

const TYPES = ['Objective', 'Subjective', 'Both']

export default function PaperTypeSelector({ value, onChange }) {
  return (
    <div className="sidebar-block">
      <div className="sidebar-block-title">Paper Type</div>
      <div className="type-pills">
        {TYPES.map(t => (
          <button
            key={t}
            className={`type-pill${value === t ? ' selected' : ''}`}
            onClick={() => onChange(t)}
          >{t}</button>
        ))}
      </div>
      <p style={{ marginTop: 9, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
        Controls available question types inside each section.
      </p>
    </div>
  )
}
