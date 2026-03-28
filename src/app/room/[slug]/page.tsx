'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PomodoroSetup from '@/components/PomodoroSetup'
import PomodoroRoom from '@/components/PomodoroRoom'
import ThemeToggle from '@/components/ThemeToggle'
import UserAvatar from '@/components/UserAvatar'
import type { User } from '@supabase/supabase-js'
import type { TimerConfig } from '@/lib/types'

export const dynamic = 'force-dynamic'
export type { TimerConfig }

export default function RoomPage() {
  const { slug } = useParams<{ slug: string }>()
  const [user, setUser] = useState<User | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [roomExists, setRoomExists] = useState<boolean | null>(null)
  const [activeConfig, setActiveConfig] = useState<TimerConfig | null>(null)
  const [phase, setPhase] = useState<'setup' | 'running'>('setup')
  const router = useRouter()
  const supabase = createClient()
  const isSolo = slug.startsWith('solo-')

  useEffect(() => {
    const guestName = sessionStorage.getItem('guest_name')
    if (guestName) {
      setDisplayName(guestName)
      setUser({ id: 'guest', user_metadata: {} } as unknown as User)
      setRoomExists(true)
      return
    }
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/'); return }
      setUser(data.user)
      setDisplayName(
        data.user.user_metadata?.preferred_name
        ?? data.user.user_metadata?.full_name
        ?? data.user.email?.split('@')[0] ?? 'User'
      )
    })
    if (isSolo) { setRoomExists(true); return }
    supabase.from('rooms').select('name').eq('name', slug).single()
      .then(({ data }) => setRoomExists(!!data))
  }, [slug])

  // Subscribe to shared room session — auto-join if one is active
  useEffect(() => {
    if (isSolo || !roomExists) return

    // Load current session
    supabase.from('room_sessions').select('*').eq('room_name', slug).single()
      .then(({ data }) => {
        if (data && data.phase !== 'idle' && data.phase !== 'done' && data.end_time) {
          setActiveConfig({ focusMinutes: data.focus_minutes, breakMinutes: data.break_minutes })
          setPhase('running')
        }
      })

    // Realtime: someone started or ended a session
    const channel = supabase
      .channel(`room-session-${slug}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'room_sessions', filter: `room_name=eq.${slug}` },
        ({ new: row }) => {
          const s = row as { phase: string; focus_minutes: number; break_minutes: number; end_time: string | null }
          if (s.phase === 'idle' || s.phase === 'done') {
            setPhase('setup')
            setActiveConfig(null)
          } else if (s.end_time) {
            setActiveConfig({ focusMinutes: s.focus_minutes, breakMinutes: s.break_minutes })
            setPhase('running')
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [slug, roomExists, isSolo])

  async function handleStart(cfg: TimerConfig) {
    setActiveConfig(cfg)
    if (!isSolo) {
      // Write shared session to DB — all room members will sync via Realtime
      await supabase.from('room_sessions').upsert({
        room_name: slug,
        phase: 'focus',
        focus_minutes: cfg.focusMinutes,
        break_minutes: cfg.breakMinutes,
        end_time: new Date(Date.now() + cfg.focusMinutes * 60 * 1000).toISOString(),
        started_by: user?.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'room_name' })
    }
    setPhase('running')
  }

  async function handleDone() {
    if (!isSolo) {
      await supabase.from('room_sessions').upsert({
        room_name: slug,
        phase: 'idle',
        end_time: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'room_name' })
    }
    setPhase('setup')
    setActiveConfig(null)
  }

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
          <PomodoroSetup onStart={handleStart} />
        ) : (
          <PomodoroRoom
            config={activeConfig!}
            user={user}
            displayName={displayName}
            roomSlug={slug}
            isSolo={isSolo}
            onDone={handleDone}
          />
        )}
      </main>
    </div>
  )
}
