'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AuthGate from '@/components/AuthGate'
import ThemeToggle from '@/components/ThemeToggle'

export const dynamic = 'force-dynamic'

export default function Home() {
  const [loaded, setLoaded] = useState(false)
  const [checking, setChecking] = useState(true)
  const router = useRouter()

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      if (data.session) { router.replace('/lobby'); return }
      setChecking(false)
    })
    const t = setTimeout(() => setLoaded(true), 600)
    return () => clearTimeout(t)
  }, [])

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <span className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--fg-2)', letterSpacing: '-0.03em' }}>hillsum</span>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <header className="flex items-center justify-between px-8 py-5">
        <span className="text-[17px] font-semibold tracking-tight" style={{ color: 'var(--fg)', letterSpacing: '-0.02em' }}>hillsum</span>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-10 px-6">
        <div
          className="text-center transition-all duration-700"
          style={{ opacity: loaded ? 1 : 0, transform: loaded ? 'none' : 'translateY(12px)' }}
        >
          <h1 className="text-[48px] font-semibold tracking-tight leading-tight mb-3"
            style={{ color: 'var(--fg)', letterSpacing: '-0.04em' }}>
            Focus together.
          </h1>
          <p className="text-[17px]" style={{ color: 'var(--fg-2)' }}>
            A shared pomodoro space for you and your people.
          </p>
        </div>

        <div
          className="transition-all duration-700 delay-100"
          style={{ opacity: loaded ? 1 : 0, transform: loaded ? 'none' : 'translateY(12px)' }}
        >
          <AuthGate />
        </div>
      </main>
    </div>
  )
}
