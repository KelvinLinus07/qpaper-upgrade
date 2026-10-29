import React, {useEffect, useState} from 'react'
import {Link, useNavigate, useParams} from 'react-router-dom'
import {api} from '../lib/api.js'
import {GraduationCap, ArrowLeft, Eye, EyeOff} from 'lucide-react'

const publicRegistration = import.meta.env.VITE_ALLOW_SELF_REGISTRATION !== 'false'

export default function AuthPage({mode = 'login', onLogin}) {
  const {token} = useParams()
  const nav = useNavigate()
  const [form, setForm] = useState({name: '', email: '', password: ''})
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [invitation, setInvitation] = useState(null)

  useEffect(() => { setShowPassword(false) }, [mode])
  useEffect(() => {
    if (mode !== 'invite') return
    let active = true
    api(`/auth/invitations/${encodeURIComponent(token)}`)
      .then(r => {
        if (!active) return
        setInvitation(r.invitation)
        setForm(f => ({...f, email: r.invitation.email, name: r.invitation.name || ''}))
      })
      .catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [token, mode])

  const set = (key, value) => setForm(prev => ({...prev, [key]: value}))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'forgot') {
        const r = await api('/auth/forgot-password', {method: 'POST', body: {email: form.email}})
        setMessage(r.message)
      } else if (mode === 'reset') {
        await api('/auth/reset-password', {method: 'POST', body: {token, password: form.password}})
        setMessage('Password updated. Sign in with your new password.')
      } else if (mode === 'invite') {
        await api('/auth/accept-invite', {method: 'POST', body: {token, name: form.name, password: form.password}})
        setMessage('Invitation accepted. Please sign in.')
        setTimeout(() => nav('/login'), 1500)
      } else {
        const r = await api(mode === 'register' ? '/auth/register' : '/auth/login', {
          method: 'POST',
          body: mode === 'register' ? form : {email: form.email, password: form.password}
        })
        onLogin(r.user)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const headings = {
    login: 'Welcome back',
    register: 'Create your account',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
    invite: 'Join QPaper Studio'
  }

  if (mode === 'register' && !publicRegistration) {
    return <div className="min-h-screen grid place-items-center p-8"><div className="text-center max-w-md">
      <h1 className="text-2xl font-bold">Invitation only</h1>
      <p className="my-4">New accounts require an invitation from your institution administrator.</p>
      <Link to="/login">Sign in</Link>
    </div></div>
  }

  return (
    <div className="public-site min-h-screen bg-[linear-gradient(135deg,#eef2ff,#f8fafc_55%,#fff)] text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto px-5 py-7">
        <Link to="/" className="font-extrabold text-lg flex items-center gap-2 text-slate-900 no-underline">
          <div className="bg-indigo-600 text-white p-2 rounded-xl"><GraduationCap size={22}/></div>
          QPaper Studio
        </Link>
      </div>
      <div className="mx-auto max-w-lg px-5 py-14">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-soft p-7 sm:p-10">
          <p className="eyebrow-new">YOUR EXAM WORKSPACE</p>
          <h1 className="text-3xl font-extrabold tracking-tight mt-3">{headings[mode]}</h1>
          <p className="text-slate-500 mt-3 mb-8">
            {mode === 'forgot' ? 'Enter your account email to receive a one-time reset link.'
              : mode === 'reset' ? 'Use at least 12 characters for your new password.'
              : mode === 'invite' ? `You've been invited as a ${invitation?.role || 'team member'}.`
              : 'Manage exams in one organized place.'}
          </p>
          <form onSubmit={submit} className="space-y-5">
            {['register', 'invite'].includes(mode) && (
              <label className="field-new">Full name
                <input autoComplete="name" required minLength={2} maxLength={120} value={form.name} onChange={e => set('name', e.target.value)}/>
              </label>
            )}
            {['login', 'register', 'forgot'].includes(mode) && (
              <label className="field-new">Email
                <input type="email" autoComplete="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@school.edu"/>
              </label>
            )}
            {mode === 'invite' && <div className="bg-slate-50 rounded-lg p-3 text-sm">Invitation for <strong>{form.email || 'Loading…'}</strong></div>}
            {mode !== 'forgot' && (
              <div className="field-new">
                <label htmlFor="auth-password">Password</label>
                <div className="relative">
                  <input
                    id="auth-password"
                    className="!pr-14"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required minLength={mode === 'login' ? 1 : 12} maxLength={128}
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    placeholder={mode === 'login' ? 'Your password' : 'At least 12 characters'}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    aria-controls="auth-password"
                    onClick={() => setShowPassword(v => !v)}
                  >
                    {showPassword ? <EyeOff size={20} aria-hidden="true"/> : <Eye size={20} aria-hidden="true"/>}
                  </button>
                </div>
              </div>
            )}
            {error && <p role="alert" className="text-rose-600 text-sm">{error}</p>}
            {message && <p role="status" className="text-green-700 text-sm">{message}</p>}
            <button type="submit" disabled={busy || (mode === 'invite' && !invitation)} className="btn-brand w-full">
              {busy ? 'Working…'
                : mode === 'login' ? 'Sign in'
                : mode === 'register' ? 'Create account'
                : mode === 'forgot' ? 'Send reset link'
                : mode === 'reset' ? 'Update password'
                : 'Accept invitation'}
            </button>
          </form>
          <div className="text-sm text-slate-600 mt-7 flex flex-wrap justify-center gap-5">
            {mode === 'login' ? <>
              <Link to="/forgot-password">Forgot password?</Link>
              {publicRegistration && <Link to="/register">Create account</Link>}
            </> : <Link to="/login">Back to sign in</Link>}
          </div>
        </div>
        <Link to="/" className="flex justify-center mt-8 gap-2 text-sm text-slate-500 no-underline"><ArrowLeft size={16}/> Back to website</Link>
      </div>
    </div>
  )
}
