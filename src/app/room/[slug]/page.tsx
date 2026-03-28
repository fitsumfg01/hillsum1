'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PomodoroSetup from '@/components/PomodoroSetup'
import PomodoroRoom from '@/components/PomodoroRoom'
import Chat from '@/components/Chat'
import ThemeToggle from '@/components/ThemeToggle'
import UserAvatar from '@/components/UserAvatar'
import type { User } from '@supabase/supabase-js'
import type { TimerConfig } from '@/lib/types'

export const dynamic = 'force-dynamic'
export type { TimerConfig }

export type RoomState = {
  phase: 'focus' | 'break' | 'idle'
  endTime: number
  focusMinutes: number
  breakMinutes: number
}

export default function RoomPage() {
  const { slug } = useParams<{ slug: string }>()
  const [user, setUser] = useState<User | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [roomExists, setRoomExists] = useState<boolean | null>(null)
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  // 'setup' = choosing time, 'running' = timer active
  const [timerPhase, setTimerPhase] = useState<'setup' | 'running'>('setup')
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
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
      if (!data.user) {
        if (!isSolo) sessionStorage.setItem('intended_room', slug)
        router.replace('/')
        return
      }
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

  // Broadcast channel — set up as soon as we know the room exists
  useEffect(() => {
    if (isSolo || roomExists !== true) return

    // Load persisted state for late joiners
    supabase.from('room_sessions').select('*').eq('room_name', slug).single()
      .then(({ data }) => {
        if (data && data.end_time && data.phase !== 'idle') {
          const state: RoomState = {
            phase: data.phase as 'focus' | 'break',
            endTime: new Date(data.end_time).getTime(),
            focusMinutes: data.focus_minutes,
            breakMinutes: data.break_minutes,
          }
          setRoomState(state)
          setTimerPhase('running')
        }
      })

    const channel = supabase.channel(`room:${slug}`, {
      config: { broadcast: { self: true } },
    })
    channel
      .on('broadcast', { event: 'timer' }, ({ payload }: { payload: RoomState | { phase: 'idle' } }) => {
        if (payload.phase === 'idle') {
          setRoomState(null)
          setTimerPhase('setup')
        } else {
          setRoomState(payload as RoomState)
          setTimerPhase('running')
        }
      })
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [slug, roomExists, isSolo])

  async function broadcastState(state: RoomState | { phase: 'idle' }) {
    await channelRef.current?.send({ type: 'broadcast', event: 'timer', payload: state })
    if (state.phase === 'idle') {
      await supabase.from('room_sessions').upsert(
        { room_name: slug, phase: 'idle', end_time: null, updated_at: new Date().toISOString() },
        { onConflict: 'room_name' }
      )
    } else {
      const s = state as RoomState
      await supabase.from('room_sessions').upsert({
        room_name: slug, phase: s.phase,
        focus_minutes: s.focusMinutes, break_minutes: s.breakMinutes,
        end_time: new Date(s.endTime).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'room_name' })
    }
  }

  if (!user || roomExists === null) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  )

  if (!roomExists) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--bg)' }}>
      <p className="text-[17px] font-semibold" style={{ color: 'var(--fg)' }}>Room not found</p>
      <button onClick={() => router.push('/lobby')} className="text-sm" style={{ color: 'var(--accent)' }}>Back to lobby</button>
    </div>
  )

  // Chat is locked only when timer is actively running in focus phase
  const chatLocked = !isSolo && timerPhase === 'running' && roomState?.phase === 'focus'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <header className="glass sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/lobby')} className="transition-colors" style={{ color: 'var(--fg-2)' }} aria-label="Back">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-[17px] font-semibold tracking-tight" style={{ color: 'var(--fg)', letterSpacing: '-0.02em' }}>hillsum</span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--bg)', color: 'var(--fg-2)' }}>
            {isSolo ? 'Solo' : `#${slug}`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <UserAvatar name={displayName} size="sm" />
          <span className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>{displayName}</span>
          <ThemeToggle />
        </div>
      </header>

      {/* Main layout: timer left, chat right — chat always present */}
      <div className="flex-1 flex gap-5 p-4 pt-6 max-w-5xl mx-auto w-full">

        {/* Left: timer area */}
        <div className="flex-1 min-w-0">
          {timerPhase === 'setup' && !isSolo ? (
            <PomodoroSetup onStart={(cfg) => {
              const state: RoomState = {
                phase: 'focus',
                endTime: Date.now() + cfg.focusMinutes * 60 * 1000,
                focusMinutes: cfg.focusMinutes,
                breakMinutes: cfg.breakMinutes,
              }
              broadcastState(state)
            }} />
          ) : (
            <PomodoroRoom
              roomState={isSolo ? null : roomState}
              config={roomState
                ? { focusMinutes: roomState.focusMinutes, breakMinutes: roomState.breakMinutes }
                : { focusMinutes: 25, breakMinutes: 5 }}
              user={user}
              displayName={displayName}
              roomSlug={slug}
              isSolo={isSolo}
              onBroadcast={isSolo ? undefined : broadcastState}
              onTimerPhaseChange={setTimerPhase}
              onDone={() => {
                if (!isSolo) broadcastState({ phase: 'idle' })
                setTimerPhase('setup')
              }}
            />
          )}
        </div>

        {/* Right: chat — always visible for logged-in users in a room */}
        <div className="w-[300px] flex-shrink-0 h-[calc(100vh-72px)]">
          <Chat
            user={user}
            displayName={displayName}
            roomSlug={slug}
            isSolo={isSolo}
            focusLocked={chatLocked}
          />
        </div>
      </div>
    </div>
  )
}
