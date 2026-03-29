'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PomodoroSetup from '@/components/PomodoroSetup'
import Chat from '@/components/Chat'
import ThemeToggle from '@/components/ThemeToggle'
import UserAvatar from '@/components/UserAvatar'
import type { User } from '@supabase/supabase-js'
import type { TimerConfig } from '@/lib/types'

export const dynamic = 'force-dynamic'
export type { TimerConfig }

export type RoomState = {
  phase: 'focus' | 'break'
  endTime: number       // UTC ms — the single source of truth
  focusMinutes: number
  breakMinutes: number
  paused?: boolean
  pausedSecondsLeft?: number
}

function fmt(s: number) {
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

function playChime(f1: number, f2: number, dur: number) {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(f1, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(f2, ctx.currentTime + dur * 0.4)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start(); osc.stop(ctx.currentTime + dur)
  } catch {}
}

// Guest name prompt shown inline when not authenticated
function GuestPrompt({ onJoin }: { onJoin: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <form onSubmit={e => { e.preventDefault(); if (name.trim()) onJoin(name.trim()) }}
        className="glass rounded-card p-8 w-[320px] flex flex-col gap-4" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div>
          <h2 className="text-[17px] font-semibold" style={{ color: 'var(--fg)' }}>Join Room</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--fg-2)' }}>Enter a name to join instantly.</p>
        </div>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Your name" maxLength={30}
          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
        <button type="submit" disabled={!name.trim()}
          className="w-full py-2.5 rounded-pill text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--accent)' }}>
          Join
        </button>
      </form>
    </div>
  )
}

export default function RoomPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [user, setUser] = useState<User | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [ready, setReady] = useState(false)           // auth resolved
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [timerPhase, setTimerPhase] = useState<'setup' | 'running'>('setup')
  const [onlineUsers, setOnlineUsers] = useState<{ name: string; user_id: string }[]>([])
  const [allTimeFocus, setAllTimeFocus] = useState(0)
  const [allTimeBreak, setAllTimeBreak] = useState(0)
  const [showProfile, setShowProfile] = useState(false)
  const [showOnline, setShowOnline] = useState(false)
  const [sessionFocus, setSessionFocus] = useState(0)
  const [sessionBreak, setSessionBreak] = useState(0)
  const phaseStartRef = useRef(Date.now())
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPhaseRef = useRef<string | null>(null)

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    const guestName = sessionStorage.getItem('guest_name')
    if (guestName) {
      setDisplayName(guestName)
      setUser({ id: 'guest' } as unknown as User)
      setReady(true)
      return
    }
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user)
        setDisplayName(
          data.user.user_metadata?.preferred_name
          ?? data.user.user_metadata?.full_name
          ?? data.user.email?.split('@')[0] ?? 'User'
        )
        setReady(true)
      } else {
        setReady(true) // show guest prompt
      }
    })
  }, [])

  // ── Load all-time stats ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user || user.id === 'guest') {
      const saved = JSON.parse(sessionStorage.getItem('guest_stats') ?? '{"focus":0,"break":0}')
      setAllTimeFocus(saved.focus); setAllTimeBreak(saved.break)
      return
    }
    supabase.from('profiles').select('total_focus_seconds, total_break_seconds').eq('id', user.id).single()
      .then(({ data }) => {
        if (data) { setAllTimeFocus(data.total_focus_seconds ?? 0); setAllTimeBreak(data.total_break_seconds ?? 0) }
      })
  }, [user])

  // ── Supabase Realtime channel ─────────────────────────────────────────────
  useEffect(() => {
    if (!user || !displayName) return

    const channel = supabase.channel(`room:${slug}`, {
      config: { broadcast: { self: true }, presence: { key: user.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ name: string; user_id: string }>()
        setOnlineUsers(Object.values(state).flat())
      })
      .on('broadcast', { event: 'timer' }, ({ payload }: { payload: RoomState | { phase: 'idle' } }) => {
        if (payload.phase === 'idle') {
          setRoomState(null); setTimerPhase('setup')
        } else {
          const rs = payload as RoomState
          // Phase transition sounds
          if (prevPhaseRef.current && prevPhaseRef.current !== rs.phase) {
            if (rs.phase === 'break') playChime(659, 523, 0.6)
            else playChime(523, 784, 0.5)
          }
          prevPhaseRef.current = rs.phase
          setRoomState(rs); setTimerPhase('running')
        }
      })
      .on('broadcast', { event: 'request-sync' }, () => {
        setRoomState(prev => {
          if (prev) channel.send({ type: 'broadcast', event: 'timer', payload: prev })
          return prev
        })
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        await channel.track({ user_id: user.id, name: displayName })
        await channel.send({ type: 'broadcast', event: 'request-sync', payload: {} })
        // DB fallback for late joiners
        const { data } = await supabase.from('room_sessions').select('*').eq('room_name', slug).single()
        if (data?.end_time && data.phase !== 'idle') {
          setRoomState(prev => {
            if (prev) return prev
            const rs: RoomState = {
              phase: data.phase,
              endTime: new Date(data.end_time).getTime(),
              focusMinutes: data.focus_minutes,
              breakMinutes: data.break_minutes,
              paused: data.paused ?? false,
              pausedSecondsLeft: data.paused_seconds_left ?? undefined,
            }
            prevPhaseRef.current = rs.phase
            setTimerPhase('running')
            return rs
          })
        }
      })

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [slug, user, displayName])

  // ── Wall-clock tick — single source of truth ──────────────────────────────
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    if (!roomState || roomState.paused) return

    function tick() {
      const rem = Math.max(0, Math.round((roomState!.endTime - Date.now()) / 1000))
      setSecondsLeft(rem)
      if (roomState!.phase === 'focus') setSessionFocus(s => s + 1)
      else setSessionBreak(s => s + 1)

      // Tab title
      const mm = String(Math.floor(rem / 60)).padStart(2, '0')
      const ss = String(rem % 60).padStart(2, '0')
      document.title = `${mm}:${ss} — hillsum`

      if (rem <= 0) {
        clearInterval(tickRef.current!)
        const elapsed = Math.round((Date.now() - phaseStartRef.current) / 1000)
        saveStats(roomState!.phase === 'focus' ? elapsed : 0, roomState!.phase === 'break' ? elapsed : 0)
        phaseStartRef.current = Date.now()

        if (roomState!.phase === 'focus') {
          // Auto-transition to break — only the "leader" (first in presence) broadcasts
          setOnlineUsers(users => {
            if (users[0]?.user_id === user?.id || users.length === 0) {
              const next: RoomState = {
                phase: 'break',
                endTime: Date.now() + roomState!.breakMinutes * 60 * 1000,
                focusMinutes: roomState!.focusMinutes,
                breakMinutes: roomState!.breakMinutes,
              }
              broadcast(next)
            }
            return users
          })
        } else {
          // Break over — back to setup
          broadcast({ phase: 'idle' })
          // Browser notification
          if (Notification.permission === 'granted') {
            new Notification('Session complete', { body: 'Great work! Ready for another round?', silent: true })
          }
        }
      }
    }

    phaseStartRef.current = Date.now()
    tickRef.current = setInterval(tick, 1000)
    // Set initial value immediately
    setSecondsLeft(Math.max(0, Math.round((roomState.endTime - Date.now()) / 1000)))
    return () => { clearInterval(tickRef.current!); document.title = 'hillsum' }
  }, [roomState])

  // ── Stats saving ──────────────────────────────────────────────────────────
  async function saveStats(focusSecs: number, breakSecs: number) {
    if (!focusSecs && !breakSecs) return
    if (!user || user.id === 'guest') {
      const prev = JSON.parse(sessionStorage.getItem('guest_stats') ?? '{"focus":0,"break":0}')
      sessionStorage.setItem('guest_stats', JSON.stringify({ focus: prev.focus + focusSecs, break: prev.break + breakSecs }))
      if (focusSecs) setAllTimeFocus(t => t + focusSecs)
      if (breakSecs) setAllTimeBreak(t => t + breakSecs)
      return
    }
    const today = new Date().toISOString().split('T')[0]
    await supabase.rpc('upsert_daily_stats', { p_user_id: user.id, p_date: today, p_focus: focusSecs, p_break: breakSecs })
    if (focusSecs) setAllTimeFocus(t => t + focusSecs)
    if (breakSecs) setAllTimeBreak(t => t + breakSecs)
  }

  // ── Broadcast + DB persist ────────────────────────────────────────────────
  async function broadcast(state: RoomState | { phase: 'idle' }) {
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
        paused: s.paused ?? false, paused_seconds_left: s.pausedSecondsLeft ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'room_name' })
    }
  }

  function handleStart(cfg: TimerConfig) {
    const state: RoomState = {
      phase: 'focus',
      endTime: Date.now() + cfg.focusMinutes * 60 * 1000,
      focusMinutes: cfg.focusMinutes,
      breakMinutes: cfg.breakMinutes,
    }
    playChime(523, 784, 0.5)
    broadcast(state)
  }

  function handlePauseResume() {
    if (!roomState) return
    if (roomState.paused) {
      const newEnd = Date.now() + (roomState.pausedSecondsLeft ?? 0) * 1000
      broadcast({ ...roomState, paused: false, endTime: newEnd, pausedSecondsLeft: undefined })
    } else {
      const rem = Math.max(0, Math.round((roomState.endTime - Date.now()) / 1000))
      broadcast({ ...roomState, paused: true, pausedSecondsLeft: rem })
    }
  }

  function handleEnd() {
    const elapsed = Math.round((Date.now() - phaseStartRef.current) / 1000)
    saveStats(roomState?.phase === 'focus' ? elapsed : 0, roomState?.phase === 'break' ? elapsed : 0)
    broadcast({ phase: 'idle' })
  }

  // ── Render guards ─────────────────────────────────────────────────────────
  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  )

  if (!user) return <GuestPrompt onJoin={name => {
    sessionStorage.setItem('guest_name', name)
    setDisplayName(name)
    setUser({ id: 'guest' } as unknown as User)
  }} />

  const totalSecs = roomState ? (roomState.phase === 'focus' ? roomState.focusMinutes : roomState.breakMinutes) * 60 : 0
  const progress = totalSecs > 0 ? Math.min(100, ((totalSecs - secondsLeft) / totalSecs) * 100) : 0
  const C = 2 * Math.PI * 45
  const isFocus = roomState?.phase === 'focus'
  const chatLocked = timerPhase === 'running' && isFocus && !roomState?.paused

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>

      {/* ── Header ── */}
      <header className="glass sticky top-0 z-20 flex items-center justify-between px-4 md:px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>

        {/* Left: avatar + stats */}
        <div className="relative">
          <button onClick={() => { setShowProfile(p => !p); setShowOnline(false) }}
            className="flex items-center gap-2.5 active:scale-95 transition-transform">
            <UserAvatar name={displayName} size="sm" />
            <span className="text-[13px] font-medium hidden sm:block" style={{ color: 'var(--fg)' }}>{displayName}</span>
          </button>
          {showProfile && (
            <div className="absolute top-full left-0 mt-2 w-64 glass rounded-[16px] p-5 z-30"
              style={{ boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)' }}>
              <div className="flex justify-between items-center mb-4">
                <span className="text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>Your Stats</span>
                <button onClick={() => setShowProfile(false)} style={{ color: 'var(--fg-2)' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="flex gap-3">
                {[{ label: 'Focus', val: allTimeFocus + sessionFocus }, { label: 'Break', val: allTimeBreak + sessionBreak }].map(({ label, val }) => (
                  <div key={label} className="flex flex-col flex-1 p-3 rounded-xl" style={{ background: 'var(--bg)' }}>
                    <span className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--fg-2)' }}>{label}</span>
                    <span className="text-[18px] font-semibold tabular-nums" style={{ color: 'var(--fg)', letterSpacing: '-0.02em' }}>{fmt(val)}</span>
                  </div>
                ))}
              </div>
              {user.id === 'guest' && (
                <p className="text-[11px] text-center mt-3" style={{ color: 'var(--fg-2)' }}>Sign in to save your stats permanently</p>
              )}
            </div>
          )}
        </div>

        {/* Center: room name */}
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/lobby')} style={{ color: 'var(--fg-2)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <span className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--fg)', letterSpacing: '-0.02em' }}>hillsum</span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--bg)', color: 'var(--fg-2)' }}>
            #{slug}
          </span>
        </div>

        {/* Right: presence + theme */}
        <div className="relative flex items-center gap-3">
          <button onClick={() => { setShowOnline(p => !p); setShowProfile(false) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[12px] font-medium" style={{ color: 'var(--fg-2)' }}>{onlineUsers.length} online</span>
          </button>
          {showOnline && (
            <div className="absolute top-full right-0 mt-2 w-52 glass rounded-[16px] p-4 z-30"
              style={{ boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)' }}>
              <div className="flex justify-between items-center mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-2)' }}>In this room</span>
                <button onClick={() => setShowOnline(false)} style={{ color: 'var(--fg-2)' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              {onlineUsers.length === 0
                ? <p className="text-[12px]" style={{ color: 'var(--fg-2)' }}>Just you so far</p>
                : onlineUsers.map((u, i) => (
                  <div key={i} className="flex items-center gap-2.5 mb-2">
                    <UserAvatar name={u.name} size="sm" />
                    <span className="text-[13px] font-medium flex-1 truncate" style={{ color: 'var(--fg)' }}>{u.name}</span>
                    {u.user_id === user.id && <span className="text-[10px]" style={{ color: 'var(--fg-2)' }}>you</span>}
                  </div>
                ))
              }
            </div>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col-reverse md:flex-row gap-4 p-4 pt-5 max-w-5xl mx-auto w-full">

        {/* Chat — bottom on mobile, right on desktop */}
        <div className="w-full md:w-[300px] md:flex-shrink-0 h-[40vh] md:h-[calc(100vh-72px)]">
          <Chat user={user} displayName={displayName} roomSlug={slug} isSolo={false} focusLocked={chatLocked} />
        </div>

        {/* Timer — top on mobile, left on desktop */}
        <div className="flex-1 min-w-0 flex items-start justify-center">
          {timerPhase === 'setup' ? (
            <PomodoroSetup onStart={handleStart} />
          ) : (
            <div className="glass rounded-card w-full max-w-sm flex flex-col items-center gap-7 py-10 px-8"
              style={{ boxShadow: 'var(--shadow-md)' }}>

              {/* Phase + status */}
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${!roomState?.paused ? 'animate-pulse' : ''}`}
                  style={{ background: isFocus ? 'var(--accent)' : '#30D158' }} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--fg-2)' }}>
                  {roomState?.paused ? 'Paused' : isFocus ? 'Focus' : 'Break'}
                </span>
              </div>

              {/* Ring */}
              <div className="relative w-44 h-44 md:w-52 md:h-52">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="3.5" />
                  <circle cx="50" cy="50" r="45" fill="none"
                    stroke={isFocus ? 'var(--accent)' : '#30D158'} strokeWidth="3.5"
                    strokeDasharray={C} strokeDashoffset={C * (1 - progress / 100)}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[44px] font-semibold tabular-nums" style={{ color: 'var(--fg)', letterSpacing: '-0.04em' }}>
                    {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3">
                <button onClick={handlePauseResume}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-pill text-sm font-semibold text-white"
                  style={{ background: 'var(--accent)' }}>
                  {roomState?.paused
                    ? <><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Resume</>
                    : <><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>Pause</>
                  }
                </button>
                <button onClick={handleEnd}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-pill text-sm font-semibold"
                  style={{ border: '1px solid var(--border)', color: 'var(--fg-2)' }}>
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
                  End
                </button>
              </div>

              {/* Presence avatars */}
              {onlineUsers.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {onlineUsers.slice(0, 6).map((u, i) => (
                    <div key={i} title={u.name} className="-ml-1 first:ml-0">
                      <UserAvatar name={u.name} size="sm" />
                    </div>
                  ))}
                  {onlineUsers.length > 6 && (
                    <span className="text-[11px] ml-1" style={{ color: 'var(--fg-2)' }}>+{onlineUsers.length - 6}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
