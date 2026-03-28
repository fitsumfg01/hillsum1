'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AuthGate from '@/components/AuthGate'

export const dynamic = 'force-dynamic'

export default function Home() {
  const [loaded, setLoaded] = useState(false)
  const [checking, setChecking] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Auto-redirect if already logged in
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace('/lobby')
      } else {
        setChecking(false)
      }
    })
    const t = setTimeout(() => setLoaded(true), 1000)
    return () => clearTimeout(t)
  }, [])

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <h1 className="font-display text-5xl font-bold text-primary-600 dark:text-primary-400 tracking-widest opacity-60 animate-pulse">hillsum</h1>
    </div>
  )

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div
        className={`absolute inset-0 flex items-center justify-center bg-primary-600 transition-opacity duration-700 pointer-events-none ${
          loaded ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <h1 className="font-display text-5xl font-bold text-white tracking-widest">hillsum</h1>
      </div>

      <div className={`transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}>
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-bold text-primary-700 dark:text-primary-300 tracking-widest">
            hillsum
          </h1>
          <p className="text-primary-400 mt-1 text-sm font-display">focus together</p>
        </div>
        <AuthGate />
      </div>
    </main>
  )
}
