'use client'
import { useState } from 'react'
import GuestForm from './GuestForm'
import LoginForm from './LoginForm'
import SignupForm from './SignupForm'

type Mode = 'choose' | 'guest' | 'login' | 'signup'

export default function AuthGate() {
  const [mode, setMode] = useState<Mode>('choose')

  if (mode === 'guest')  return <GuestForm onBack={() => setMode('choose')} />
  if (mode === 'login')  return <LoginForm onBack={() => setMode('choose')} onSignup={() => setMode('signup')} />
  if (mode === 'signup') return <SignupForm onBack={() => setMode('choose')} onLogin={() => setMode('login')} />

  return (
    <div className="glass rounded-card p-8 w-[340px] flex flex-col gap-3" style={{ boxShadow: 'var(--shadow-lg)' }}>
      <p className="text-center text-sm font-medium mb-1" style={{ color: 'var(--fg-2)' }}>
        How would you like to continue?
      </p>
      <button
        onClick={() => setMode('signup')}
        className="w-full py-3 rounded-pill text-sm font-semibold text-white transition-all active:scale-[0.98]"
        style={{ background: 'var(--accent)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-h)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}
      >
        Create Account
      </button>
      <button
        onClick={() => setMode('login')}
        className="w-full py-3 rounded-pill text-sm font-semibold transition-all active:scale-[0.98]"
        style={{ background: 'var(--bg-2)', color: 'var(--fg)', border: '1px solid var(--border)' }}
      >
        Sign In
      </button>
      <button
        onClick={() => setMode('guest')}
        className="w-full py-2.5 text-sm transition-all"
        style={{ color: 'var(--accent)' }}
      >
        Continue as Guest
      </button>
    </div>
  )
}
