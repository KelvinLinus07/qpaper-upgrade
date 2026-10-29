import React, { useState, useEffect } from 'react'

const DEMO_USERS = [
  { username: 'admin',   password: 'admin123',   role: 'Admin',   name: 'Admin User',    initials: 'AU' },
  { username: 'teacher', password: 'teacher123', role: 'Teacher', name: 'Prof. Sharma',  initials: 'PS' },
  { username: 'demo',    password: 'demo',        role: 'Guest',   name: 'Demo User',     initials: 'DU' },
]

const FEATURES = [
  { icon: '✦', title: 'Multiple Question Types', desc: 'MCQ, Subjective, Fill-in, Match, True/False' },
  { icon: '◈', title: 'Live Preview',            desc: 'See your exam paper update in real-time' },
  { icon: '⬡', title: 'PDF Export',              desc: 'One-click professional A4 PDF generation' },
  { icon: '◉', title: 'Smart Sections',          desc: 'Auto-calculate marks, instructions & totals' },
]

export default function Login({ onLogin }) {
  const [form, setForm]         = useState({ username: '', password: '' })
  const [error, setError]       = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [focused, setFocused]   = useState('')
  const [mounted, setMounted]   = useState(false)
  const [shake, setShake]       = useState(false)

  useEffect(() => { setTimeout(() => setMounted(true), 60) }, [])

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setError('') }

  const handleSubmit = e => {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => {
      const user = DEMO_USERS.find(
        u => u.username === form.username.trim() && u.password === form.password
      )
      if (user) {
        onLogin(user)
      } else {
        setError('Invalid username or password.')
        setLoading(false)
        setShake(true)
        setTimeout(() => setShake(false), 600)
      }
    }, 800)
  }

  return (
    <div className={`lg-root${mounted ? ' lg-in' : ''}`}>

      {/* ── Animated background ── */}
      <div className="lg-bg">
        <div className="lg-orb lg-orb-1" />
        <div className="lg-orb lg-orb-2" />
        <div className="lg-orb lg-orb-3" />
        <div className="lg-grid" />
      </div>

      {/* ── Left info strip (compact, subordinate) ── */}
      <div className="lg-info">
        <div className="lg-info-brand">
          <div className="lg-info-icon">📋</div>
          <div>
            <div className="lg-info-title">Question Paper Builder</div>
            <div className="lg-info-sub">Professional Exam Management</div>
          </div>
        </div>
        <div className="lg-info-features">
          {FEATURES.map((f, i) => (
            <div className="lg-feat" key={i} style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
              <span className="lg-feat-icon">{f.icon}</span>
              <div>
                <div className="lg-feat-title">{f.title}</div>
                <div className="lg-feat-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="lg-info-quote">
          "The art of teaching is the art of assisting discovery."
          <span> — Mark Van Doren</span>
        </div>
      </div>

      {/* ── Right: DOMINANT login form ── */}
      <div className="lg-main">
        <div className={`lg-card${shake ? ' lg-shake' : ''}`}>

          {/* Glow ring */}
          <div className="lg-card-glow" />

          {/* Header */}
          <div className="lg-card-top">
            <div className="lg-logo-ring">
              <div className="lg-logo-inner">📋</div>
            </div>
            <h1 className="lg-title">Welcome Back</h1>
            <p className="lg-subtitle">Sign in to your exam builder account</p>
          </div>

          {/* Form */}
          <form className="lg-form" onSubmit={handleSubmit}>

            <div className={`lg-field${focused === 'user' ? ' lg-field-focus' : ''}${form.username ? ' lg-field-filled' : ''}`}>
              <label className="lg-label">Username</label>
              <div className="lg-input-wrap">
                <svg className="lg-input-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                <input
                  type="text"
                  placeholder="Enter username"
                  value={form.username}
                  onChange={e => set('username', e.target.value)}
                  onFocus={() => setFocused('user')}
                  onBlur={() => setFocused('')}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className={`lg-field${focused === 'pass' ? ' lg-field-focus' : ''}${form.password ? ' lg-field-filled' : ''}`}>
              <label className="lg-label">Password</label>
              <div className="lg-input-wrap">
                <svg className="lg-input-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  onFocus={() => setFocused('pass')}
                  onBlur={() => setFocused('')}
                  autoComplete="current-password"
                  required
                />
                <button type="button" className="lg-eye" onClick={() => setShowPass(p => !p)}>
                  {showPass
                    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {error && (
              <div className="lg-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <button type="submit" className="lg-btn" disabled={loading || !form.username || !form.password}>
              {loading
                ? <><span className="lg-spin" /> Authenticating…</>
                : <><span>Sign In</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><path d="M5 12h14M12 5l7 7-7 7"/></svg></>
              }
              <div className="lg-btn-shine" />
            </button>
          </form>

          {/* Quick access */}
          <div className="lg-divider"><span>Quick Access</span></div>
          <div className="lg-quick">
            {DEMO_USERS.map(u => (
              <button key={u.username} className="lg-quick-btn"
                onClick={() => { setForm({ username: u.username, password: u.password }); setError('') }}>
                <div className="lg-quick-avatar">{u.initials}</div>
                <div className="lg-quick-info">
                  <strong>{u.role}</strong>
                  <span>{u.username}</span>
                </div>
              </button>
            ))}
          </div>

          <p className="lg-note">🔒 Frontend-only demo · No data leaves your browser</p>
        </div>
      </div>

    </div>
  )
}
