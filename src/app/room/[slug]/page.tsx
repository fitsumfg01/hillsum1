'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PomodoroSetup from '@/components/PomodoroSetup'
import PomodoroRoom from '@/components/PomodoroRoom'
import ThemeToggle from '@/components/ThemeToggle'
import UserAvatar from '@/components/UserAvatar'
import type { User } from '@supabase/supabase-js'

export type TimerConfig = { focusMinutes: number; breakMinutes: number }

export default function RoomPage() {
  const { slug } = useParams<{ slug: string }>()
  const [user, setUser] = useState<User | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [roomExists, setRoomExists] = useState<boolean | null>(null)
  const [config, setConfig] = useState<TimerConfig | null>(null)
  const [phase, setPhase] = useState<'setup' | 'running'>('setup')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/'); return }
      setUser(data.user)
      setDisplayName(
        data.user.user_metadata?.preferred_name
        ?? data.user.user_metadata?.full_name
        ?? data.user.email?.split('@')[0]
        ?? 'User'
      )
    })
    // solo rooms don't exist in DB — treat slug starting with "solo-" as always valid
    if (slug.startsWith('solo-')) { setRoomExists(true); return }
    supabase.from('rooms').select('name').eq('name', slug).single()
      .then(({ data }) => setRoomExists(!!data))
  }, [slug])

  if (!user || roomExists === null) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-8 h-8 border-4 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
    </div>
  )

  if (!roomExists) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--bg)]">
      <p className="font-display text-xl text-primary-700 dark:text-primary-300">Room not found 😕</p>
      <button onClick={() => router.push('/lobby')} className="font-display text-primary-500 hover:underline">← Back to lobby</button>
    </div>
  )

  const isSolo = slug.startsWith('solo-')

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/lobby')} className="text-primary-400 hover:text-primary-600 transition" aria-label="Back">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-display text-2xl font-bold text-primary-700 dark:text-primary-300 tracking-widest">hillsum</span>
          <span className="font-display text-xs text-primary-400 bg-primary-100 dark:bg-primary-900 px-2 py-0.5 rounded-full">
            {isSolo ? '🎧 solo' : `#${slug}`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <UserAvatar name={displayName} size="sm" />
          <span className="font-display text-sm text-primary-600 dark:text-primary-400 font-medium">{displayName}</span>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center p-4 pt-6">
        {phase === 'setup' ? (
          <PomodoroSetup onStart={(cfg) => { setConfig(cfg); setPhase('running') }} />
        ) : (
          <PomodoroRoom
            config={config!}
            user={user}
            displayName={displayName}
            roomSlug={slug}
            isSolo={isSolo}
            onDone={() => setPhase('setup')}
          />
        )}
      </main>
    </div>
  )
}
