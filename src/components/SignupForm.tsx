'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const GoogleIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

function inputClass() {
  return 'w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all'
}
function inputStyle() {
  return { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }
}

export default function SignupForm({ onBack, onLogin }: { onBack: () => void; onLogin: () => void }) {
  const [preferredName, setPreferredName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { preferred_name: preferredName } } })
    setLoading(false)
    if (error) { setError(error.message); return }
    router.push('/lobby')
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/auth/callback` } })
  }

  return (
    <form onSubmit={handleSignup} className="glass rounded-card p-8 w-[340px] flex flex-col gap-4" style={{ boxShadow: 'var(--shadow-lg)' }}>
      <div>
        <h2 className="text-[17px] font-semibold" style={{ color: 'var(--fg)' }}>Create Account</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--fg-2)' }}>Join Hillsum and start focusing.</p>
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}

      {[
        { placeholder: 'Preferred name', value: preferredName, onChange: setPreferredName, type: 'text' },
        { placeholder: 'Email', value: email, onChange: setEmail, type: 'email' },
        { placeholder: 'Password', value: password, onChange: setPassword, type: 'password' },
      ].map(({ placeholder, value, onChange, type }) => (
        <input key={placeholder} type={type} placeholder={placeholder} value={value}
          onChange={e => onChange(e.target.value)} required
          className={inputClass()} style={inputStyle()}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
      ))}

      <button type="submit" disabled={loading}
        className="w-full py-3 rounded-pill text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ background: 'var(--accent)' }}>
        {loading ? 'Creating account…' : 'Create Account'}
      </button>

      <div className="flex items-center gap-2">
        <hr className="flex-1" style={{ borderColor: 'var(--border)' }} />
        <span className="text-xs" style={{ color: 'var(--fg-2)' }}>or</span>
        <hr className="flex-1" style={{ borderColor: 'var(--border)' }} />
      </div>

      <button type="button" onClick={handleGoogle}
        className="w-full py-2.5 rounded-pill text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--fg)' }}>
        <GoogleIcon /> Continue with Google
      </button>

      <button type="button" onClick={onLogin} className="text-sm text-center" style={{ color: 'var(--accent)' }}>
        Already have an account? Sign in
      </button>
      <button type="button" onClick={onBack} className="text-sm text-center" style={{ color: 'var(--fg-2)' }}>
        Back
      </button>
    </form>
  )
}
