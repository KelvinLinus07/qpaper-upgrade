import React from 'react'

const FIELDS = [
  { key: 'school',     label: 'School / Institution', placeholder: 'e.g. Delhi Public School' },
  { key: 'exam',       label: 'Exam Name',             placeholder: 'e.g. Mid-Term Examination' },
  { key: 'subject',    label: 'Subject',               placeholder: 'e.g. Mathematics — Class X' },
  { key: 'duration',   label: 'Time Duration',         placeholder: 'e.g. 3 Hours' },
  { key: 'totalMarks', label: 'Total Marks',           placeholder: 'e.g. 100' },
]

export default function HeaderForm({ info, onChange }) {
  return (
    <div className="sidebar-block">
      <div className="sidebar-block-title">Paper Details</div>
      {FIELDS.map(f => (
        <div className="field" key={f.key}>
          <label>{f.label}</label>
          <input
            value={info[f.key]}
            onChange={e => onChange(f.key, e.target.value)}
            placeholder={f.placeholder}
          />
        </div>
      ))}
    </div>
  )
}
