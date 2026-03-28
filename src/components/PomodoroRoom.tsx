'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TimerConfig } from '@/lib/types'
import type { User } from '@supabase/supabase-js'
import Chat, { playFocusStart, playBreakStart, playSessionEnd } from './Chat'
import UserAvatar from './UserAvatar'
import StatsPopover from './StatsPopover'

type Phase = 'focus' | 'break'

function fmt(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

function notify(title: string, body: string) {
  if (typeof window === 'undefined') return
  if (Notification.permission === 'granted') new Notification(title, { body, silent: true })
  else if (Notification.permission !== 'denied') Notification.requestPermission().then(p => { if (p === 'granted') new Notification(title, { body, silent: true }) })
}

export default function PomodoroRoom({
  config, user, displayName, roomSlug, isSolo = false, onDone,
}: {
  config: TimerConfig; user: User; displayName: string; roomSlug: string; isSolo?: boolean; onDone: () => void
}) {
  const [phase, setPhase] = useState<Phase>('focus')
  const [secondsLeft, setSecondsLeft] = useState(config.focusMinutes * 60)
  const [running, setRunning] = useState(true)
  const [focusSecs, setFocusSecs] = useState(0)
  const [breakSecs, setBreakSecs] = useState(0)
  const [showDone, setShowDone] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const endTimeRef = useRef<number>(Date.now() + config.focusMinutes * 60 * 1000)
  const phaseRef = useRef<Phase>('focus')
  const pausedRef = useRef<number>(config.focusMinutes * 60)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const supabase = createClient()
  const isGuest = user.id === 'guest'

  useEffect(() => { phaseRef.current = phase }, [phase])

  useEffect(() => {
    const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
    const ss = String(secondsLeft % 60).padStart(2, '0')
    document.title = running ? `${mm}:${ss} — hillsum` : `${mm}:${ss} (paused) — hillsum`
    return () => { document.title = 'hillsum' }
  }, [secondsLeft, running])

  useEffect(() => {
    if (typeof window !== 'undefined' && Notification.permission === 'default') Notification.requestPermission()
    playFocusStart()
  }, [])

  const saveStats = useCallback(async (f: number, b: number) => {
    if (isGuest) return
    await supabase.rpc('upsert_daily_stats', { p_user_id: user.id, p_date: new Date().toISOString().split('T')[0], p_focus: f, p_break: b })
  }, [user])

  const pushPhase = useCallback(async (p: string, durSecs: number) => {
    if (isSolo) return
    await supabase.from('room_sessions').upsert({
      room_name: roomSlug, phase: p,
      end_time: p === 'done' ? null : new Date(Date.now() + durSecs * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'room_name' })
  }, [roomSlug, isSolo])

  // Sync from DB on join
  useEffect(() => {
    if (isSolo) return
    supabase.from('room_sessions').select('phase, end_time').eq('room_name', roomSlug).single()
      .then(({ data }) => {
        if (!data?.end_time) return
        const serverEnd = new Date(data.end_time).getTime()
        endTimeRef.current = serverEnd
        setSecondsLeft(Math.max(0, Math.round((serverEnd - Date.now()) / 1000)))
        setPhase(data.phase as Phase); phaseRef.current = data.phase as Phase
      })

    const ch = supabase.channel(`sess-sync-${roomSlug}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'room_sessions', filter: `room_name=eq.${roomSlug}` },
        ({ new: row }) => {
          const s = row as { phase: string; end_time: string | null }
          if (!s.end_time) return
          const serverEnd = new Date(s.end_time).getTime()
          endTimeRef.current = serverEnd
          setSecondsLeft(Math.max(0, Math.round((serverEnd - Date.now()) / 1000)))
          if (s.phase === 'focus' || s.phase === 'break') {
            setPhase(s.phase as Phase); phaseRef.current = s.phase as Phase
            if (s.phase === 'break') { playBreakStart(); notify('Break time', `Take a ${config.breakMinutes} min break.`) }
          }
        }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [roomSlug, isSolo])

  useEffect(() => {
    if (!running || showDone) return
    function tick() {
      const rem = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000))
      setSecondsLeft(rem)
      if (rem <= 0) {
        clearInterval(intervalRef.current!)
        if (phaseRef.current === 'focus') {
          setFocusSecs(f => f + 1); saveStats(1, 0)
          const dur = config.breakMinutes * 60
          endTimeRef.current = Date.now() + dur * 1000
          setPhase('break'); phaseRef.current = 'break'; setSecondsLeft(dur)
          playBreakStart(); notify('Break time', `Take a ${config.breakMinutes} min break.`)
          pushPhase('break', dur)
          intervalRef.current = setInterval(tick, 500)
        } else {
          setBreakSecs(b => b + 1); saveStats(0, 1)
          setShowDone(true); setRunning(false)
          playSessionEnd(); notify('Session complete', 'Your pomodoro is done.')
          pushPhase('done', 0)
        }
      }
    }
    intervalRef.current = setInterval(tick, 500)
    return () => clearInterval(intervalRef.current!)
  }, [running, showDone])

  function handlePauseResume() {
    if (running) {
      pausedRef.current = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000))
      clearInterval(intervalRef.current!); setRunning(false)
    } else {
      endTimeRef.current = Date.now() + pausedRef.current * 1000; setRunning(true)
    }
  }

  function handleEnd() {
    clearInterval(intervalRef.current!); setRunning(false)
    playSessionEnd(); setShowDone(true); pushPhase('done', 0)
  }

  function handleRepeat() {
    setShowDone(false)
    endTimeRef.current = Date.now() + config.focusMinutes * 60 * 1000
    setPhase('focus'); phaseRef.current = 'focus'
    setSecondsLeft(config.focusMinutes * 60); setRunning(true)
    playFocusStart(); pushPhase('focus', config.focusMinutes * 60)
  }

  const totalSecs = phase === 'focus' ? config.focusMinutes * 60 : config.breakMinutes * 60
  const progress = ((totalSecs - secondsLeft) / totalSecs) * 100
  const C = 2 * Math.PI * 45
  const isFocus = phase === 'focus'

  return (
    <div className="w-full max-w-5xl flex gap-5 h-[calc(100vh-72px)]">

      {/* Left */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">

        {/* Timer */}
        <div className="flex-1 glass rounded-card flex flex-col items-center justify-center gap-7 px-8"
          style={{ boxShadow: 'var(--shadow-md)' }}>

          {/* Phase indicator */}
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${running ? 'animate-pulse' : ''}`}
              style={{ background: isFocus ? 'var(--accent)' : '#30D158' }} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--fg-2)' }}>
              {isFocus ? 'Focus' : 'Break'}
            </span>
          </div>

          {/* Ring */}
          <div className="relative w-52 h-52">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="3.5" />
              <circle cx="50" cy="50" r="45" fill="none"
                stroke={isFocus ? 'var(--accent)' : '#30D158'} strokeWidth="3.5"
                strokeDasharray={C} strokeDashoffset={C * (1 - progress / 100)}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
              <span className="text-[44px] font-semibold tabular-nums leading-none"
                style={{ color: 'var(--fg)', letterSpacing: '-0.04em' }}>
                {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}
              </span>
              {!running && !showDone && (
                <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: 'var(--fg-2)' }}>Paused</span>
              )}
            </div>
          </div>

          {/* Controls */}
          {!showDone ? (
            <div className="flex items-center gap-3">
              <button onClick={handlePauseResume}
                className="flex items-center gap-2 px-6 py-2.5 rounded-pill text-sm font-semibold text-white transition-all active:scale-[0.97]"
                style={{ background: 'var(--accent)' }}>
                {running ? (
                  <><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>Pause</>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Resume</>
                )}
              </button>
              <button onClick={handleEnd}
                className="flex items-center gap-2 px-5 py-2.5 rounded-pill text-sm font-semibold transition-all active:scale-[0.97]"
                style={{ border: '1px solid var(--border)', color: 'var(--fg-2)' }}>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
                End
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <p className="text-[15px] font-semibold" style={{ color: 'var(--fg)' }}>Session complete. Go again?</p>
              <div className="flex gap-3">
                <button onClick={handleRepeat}
                  className="px-7 py-2.5 rounded-pill text-sm font-semibold text-white transition-all active:scale-[0.97]"
                  style={{ background: 'var(--accent)' }}>Begin Again</button>
                <button onClick={onDone}
                  className="px-7 py-2.5 rounded-pill text-sm font-semibold transition-all active:scale-[0.97]"
                  style={{ border: '1px solid var(--border)', color: 'var(--fg-2)' }}>Done</button>
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="glass rounded-card px-5 py-4 flex items-center gap-4 relative"
          style={{ boxShadow: 'var(--shadow-sm)' }}>
          <button onClick={() => setShowStats(s => !s)} className="flex-shrink-0 active:scale-95 transition-transform">
            <UserAvatar name={displayName} size="lg" />
          </button>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-[15px] font-semibold truncate" style={{ color: 'var(--fg)', letterSpacing: '-0.01em' }}>
              {displayName}
            </span>
            <div className="flex items-center gap-3 mt-1">
              {[{ label: 'Focus', val: focusSecs }, { label: 'Break', val: breakSecs }].map(({ label, val }, i) => (
                <div key={label} className="flex items-center gap-3">
                  {i > 0 && <div className="w-px h-5" style={{ background: 'var(--border)' }} />}
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase tracking-[0.15em]" style={{ color: 'var(--fg-2)' }}>{label}</span>
                    <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--fg)' }}>{fmt(val)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => setShowStats(s => !s)} className="text-[11px] font-medium flex-shrink-0 transition-colors"
            style={{ color: 'var(--accent)' }}>
            {showStats ? 'Hide' : 'Stats'}
          </button>
          {showStats && (
            <div className="absolute left-0 bottom-full mb-2 z-20">
              <StatsPopover focusSecs={focusSecs} breakSecs={breakSecs} userId={isGuest ? null : user.id} onClose={() => setShowStats(false)} />
            </div>
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="w-[300px] flex-shrink-0">
        <Chat user={user} displayName={displayName} roomSlug={roomSlug} isSolo={isSolo} focusLocked={isFocus} />
      </div>
    </div>
  )
}
