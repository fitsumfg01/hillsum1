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
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 w-80 flex flex-col gap-4">
      <p className="text-center text-primary-700 dark:text-primary-300 font-medium">
        How do you want to join?
      </p>
      <button
        onClick={() => setMode('guest')}
        className="w-full py-3 rounded-xl border-2 border-primary-300 text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-gray-700 transition font-medium"
      >
        Continue as Guest
      </button>
      <button
        onClick={() => setMode('signup')}
        className="w-full py-3 rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition font-medium"
      >
        Create Account
      </button>
      <button
        onClick={() => setMode('login')}
        className="text-sm text-center text-primary-500 hover:underline"
      >
        Already have an account? Sign in
      </button>
    </div>
  )
}
