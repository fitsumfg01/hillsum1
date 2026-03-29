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
  endTime: number       // wall-clock ms when phase expires (adjusted on resume)
  focusMinutes: number
  breakMinutes: number
  paused?: boolean
  pausedSecondsLeft?: number  // remaining seconds at time of pause
}

export default function RoomPage() {
  const { slug } = useParams<{ slug: string }>()
  const [user, setUser] = useState<User | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [roomExists, setRoomExists] = useState<boolean | null>(null)
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  // 'setup' = choosing time, 'running' = timer active
  const [timerPhase, setTimerPhase] = useState<'setup' | 'running'>('setup')
  const [onlineUsers, setOnlineUsers] = useState<{ name: string; user_id: string }[]>([])
  const [showProfilePanel, setShowProfilePanel] = useState(false)
  const [showOnlinePanel, setShowOnlinePanel] = useState(false)
  const [allTimeFocus, setAllTimeFocus] = useState(0)
  const [allTimeBreak, setAllTimeBreak] = useState(0)
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

  // Load all-time stats for profile panel
  useEffect(() => {
    if (!user || user.id === 'guest') return
    supabase.from('profiles').select('total_focus_seconds, total_break_seconds').eq('id', user.id).single()
      .then(({ data }) => {
        if (data) { setAllTimeFocus(data.total_focus_seconds ?? 0); setAllTimeBreak(data.total_break_seconds ?? 0) }
      })
  }, [user])

  // Broadcast channel — set up as soon as we know the room exists
  useEffect(() => {
    if (isSolo || roomExists !== true) return

    const channel = supabase.channel(`room:${slug}`, {
      config: {
        broadcast: { self: true },
        presence: { key: user?.id ?? 'anon' },
      },
    })

    channel
      // Presence: who's in the room
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ name: string; user_id: string }>()
        const users = Object.values(state).flat()
        setOnlineUsers(users)
      })
      // Timer state pushed by any member
      .on('broadcast', { event: 'timer' }, ({ payload }: { payload: RoomState | { phase: 'idle' } }) => {
        if (payload.phase === 'idle') {
          setRoomState(null)
          setTimerPhase('setup')
        } else {
          setRoomState(payload as RoomState)
          setTimerPhase('running')
        }
      })
      // New joiner requests current state — existing members respond
      .on('broadcast', { event: 'request-sync' }, () => {
        // Only respond if we have state (avoid everyone responding)
        setRoomState(prev => {
          if (prev) {
            channel.send({ type: 'broadcast', event: 'timer', payload: prev })
          }
          return prev
        })
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track presence
          await channel.track({
            user_id: user?.id ?? 'guest',
            name: displayName,
            online_at: new Date().toISOString(),
          })

          // Ask existing members for current state (faster than DB)
          await channel.send({ type: 'broadcast', event: 'request-sync', payload: {} })

          // Also fall back to DB for late joiners (in case room is empty)
          supabase.from('room_sessions').select('*').eq('room_name', slug).single()
            .then(({ data }) => {
              if (data && data.end_time && data.phase !== 'idle') {
                setRoomState(prev => {
                  if (prev) return prev
                  const state: RoomState = {
                    phase: data.phase as 'focus' | 'break',
                    endTime: new Date(data.end_time).getTime(),
                    focusMinutes: data.focus_minutes,
                    breakMinutes: data.break_minutes,
                    paused: data.paused ?? false,
                    pausedSecondsLeft: data.paused_seconds_left ?? undefined,
                  }
                  setTimerPhase('running')
                  return state
                })
              }
            })
        }
      })

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [slug, roomExists, isSolo, user, displayName])

  async function broadcastState(state: RoomState | { phase: 'idle' }) {
    await channelRef.current?.send({ type: 'broadcast', event: 'timer', payload: state })
    if (state.phase === 'idle') {
      await supabase.from('room_sessions').upsert(
        { room_name: slug, phase: 'idle', end_time: null, paused: false, updated_at: new Date().toISOString() },
        { onConflict: 'room_name' }
      )
    } else {
      const s = state as RoomState
      await supabase.from('room_sessions').upsert({
        room_name: slug, phase: s.phase,
        focus_minutes: s.focusMinutes, break_minutes: s.breakMinutes,
        end_time: new Date(s.endTime).toISOString(),
        paused: s.paused ?? false,
        paused_seconds_left: s.pausedSecondsLeft ?? null,
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

  // Chat locked only when actively running in focus (not paused, not break, not setup)
  const chatLocked = !isSolo
    && timerPhase === 'running'
    && roomState?.phase === 'focus'
    && !roomState?.paused

  function fmtSecs(s: number) {
    if (s < 60) return `${s}s`
    if (s < 3600) return `${Math.floor(s / 60)}m`
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
    return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
  }
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <header className="glass sticky top-0 z-20 flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>

        {/* Left: profile avatar → stats panel */}
        <div className="flex items-center gap-3 relative">
          <button
            onClick={() => { setShowProfilePanel(p => !p); setShowOnlinePanel(false) }}
            className="flex items-center gap-2.5 active:scale-95 transition-transform"
          >
            <UserAvatar name={displayName} size="sm" />
            <span className="text-[13px] font-medium" style={{ color: 'var(--fg)' }}>{displayName}</span>
          </button>

          {showProfilePanel && (
            <div className="absolute top-full left-0 mt-2 w-64 glass rounded-[16px] p-5 z-30"
              style={{ boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>Your Stats</span>
                <button onClick={() => setShowProfilePanel(false)} style={{ color: 'var(--fg-2)' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="flex gap-3 mb-2">
                {[{ label: 'Focus', val: allTimeFocus }, { label: 'Break', val: allTimeBreak }].map(({ label, val }) => (
                  <div key={label} className="flex flex-col flex-1 p-3 rounded-xl" style={{ background: 'var(--bg)' }}>
                    <span className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--fg-2)' }}>{label}</span>
                    <span className="text-[18px] font-semibold tabular-nums" style={{ color: 'var(--fg)', letterSpacing: '-0.02em' }}>{fmtSecs(val)}</span>
                  </div>
                ))}
              </div>
              {user?.id === 'guest' && (
                <p className="text-[11px] text-center mt-2" style={{ color: 'var(--fg-2)' }}>Sign in to save your stats</p>
              )}
            </div>
          )}
        </div>

        {/* Center: room name */}
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/lobby')} style={{ color: 'var(--fg-2)' }} aria-label="Back">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--fg)', letterSpacing: '-0.02em' }}>hillsum</span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--bg)', color: 'var(--fg-2)' }}>
            {isSolo ? 'Solo' : `#${slug}`}
          </span>
        </div>

        {/* Right: online count → user list, theme toggle */}
        <div className="flex items-center gap-3 relative">
          {!isSolo && (
            <button
              onClick={() => { setShowOnlinePanel(p => !p); setShowProfilePanel(false) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[12px] font-medium" style={{ color: 'var(--fg-2)' }}>
                {onlineUsers.length} online
              </span>
            </button>
          )}

          {showOnlinePanel && (
            <div className="absolute top-full right-0 mt-2 w-56 glass rounded-[16px] p-4 z-30"
              style={{ boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-2)' }}>In this room</span>
                <button onClick={() => setShowOnlinePanel(false)} style={{ color: 'var(--fg-2)' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="flex flex-col gap-2.5">
                {onlineUsers.length === 0
                  ? <p className="text-[12px]" style={{ color: 'var(--fg-2)' }}>Just you so far</p>
                  : onlineUsers.map((u, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <UserAvatar name={u.name} size="sm" />
                      <span className="text-[13px] font-medium truncate flex-1" style={{ color: 'var(--fg)' }}>{u.name}</span>
                      {u.name === displayName && <span className="text-[10px]" style={{ color: 'var(--fg-2)' }}>you</span>}
                    </div>
                  ))
                }
              </div>
            </div>
          )}

          <ThemeToggle />
        </div>
      </header>

      {/* Main layout: timer left, chat right — chat always present */}
      <div className="flex-1 flex gap-5 p-4 pt-6 max-w-5xl mx-auto w-full">

        {/* Left: timer area */}
        <div className="flex-1 min-w-0">
          {timerPhase === 'setup' ? (
            <PomodoroSetup onStart={(cfg) => {
              if (isSolo) {
                setRoomState({
                  phase: 'focus',
                  endTime: Date.now() + cfg.focusMinutes * 60 * 1000,
                  focusMinutes: cfg.focusMinutes,
                  breakMinutes: cfg.breakMinutes,
                })
                setTimerPhase('running')
              } else {
                const state: RoomState = {
                  phase: 'focus',
                  endTime: Date.now() + cfg.focusMinutes * 60 * 1000,
                  focusMinutes: cfg.focusMinutes,
                  breakMinutes: cfg.breakMinutes,
                }
                broadcastState(state)
              }
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
