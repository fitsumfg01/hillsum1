'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginForm({
  onBack,
  onSignup,
}: {
  onBack: () => void
  onSignup: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    router.push('/lobby')
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }

  return (
    <form onSubmit={handleLogin} className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 w-80 flex flex-col gap-4">
      <h2 className="text-primary-700 dark:text-primary-300 font-semibold text-lg text-center">Sign In</h2>

      {error && <p className="text-red-500 text-sm text-center">{error}</p>}

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        className="border border-primary-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
        className="border border-primary-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition font-medium disabled:opacity-60"
      >
        {loading ? 'Signing in…' : 'Sign In'}
      </button>

      <div className="flex items-center gap-2">
        <hr className="flex-1 border-primary-100" />
        <span className="text-xs text-primary-300">or</span>
        <hr className="flex-1 border-primary-100" />
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        className="w-full py-3 rounded-xl border-2 border-primary-200 text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-gray-700 transition font-medium flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in with Google
      </button>

      <button type="button" onClick={onSignup} className="text-sm text-primary-500 hover:underline text-center">
        Don't have an account? Sign up
      </button>
      <button type="button" onClick={onBack} className="text-sm text-primary-400 hover:underline text-center">
        ← Back
      </button>
    </form>
  )
}
