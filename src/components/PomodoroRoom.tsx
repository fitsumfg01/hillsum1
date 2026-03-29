'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TimerConfig } from '@/lib/types'
import type { User } from '@supabase/supabase-js'
import type { RoomState } from '@/app/room/[slug]/page'
import { playFocusStart, playBreakStart, playSessionEnd } from './Chat'
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
}

export default function PomodoroRoom({
  config, user, displayName, roomSlug, isSolo = false,
  roomState, onBroadcast, onTimerPhaseChange, onDone,
}: {
  config: TimerConfig
  user: User
  displayName: string
  roomSlug: string
  isSolo?: boolean
  roomState: RoomState | null
  onBroadcast?: (state: RoomState | { phase: 'idle' }) => void
  onTimerPhaseChange?: (phase: 'setup' | 'running') => void
  onDone: () => void
}) {
  const [phase, setPhase] = useState<Phase>('focus')
  const [secondsLeft, setSecondsLeft] = useState(config.focusMinutes * 60)
  const [running, setRunning] = useState(true)
  // Session-only accumulators (reset each session)
  const [sessionFocusSecs, setSessionFocusSecs] = useState(0)
  const [sessionBreakSecs, setSessionBreakSecs] = useState(0)
  // All-time totals loaded from DB
  const [totalFocusSecs, setTotalFocusSecs] = useState(0)
  const [totalBreakSecs, setTotalBreakSecs] = useState(0)
  const [showDone, setShowDone] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const endTimeRef = useRef<number>(Date.now() + config.focusMinutes * 60 * 1000)
  const phaseRef = useRef<Phase>('focus')
  const pausedRef = useRef<number>(config.focusMinutes * 60)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Track when current phase started (for accurate bulk save)
  const phaseStartRef = useRef<number>(Date.now())
  const prevPhaseRef = useRef<Phase | null>(null)
  const supabase = createClient()
  const isGuest = user.id === 'guest'

  // Sync display from roomState (shared timer)
  useEffect(() => {
    if (isSolo || !roomState) return

    // Phase transition sounds
    if (prevPhaseRef.current !== null && prevPhaseRef.current !== roomState.phase) {
      if (roomState.phase === 'break') { playBreakStart(); notify('Break time', `Take a ${roomState.breakMinutes} min break.`) }
      if (roomState.phase === 'focus') { playFocusStart() }
    }
    prevPhaseRef.current = roomState.phase as Phase
    setPhase(roomState.phase as Phase)
    phaseRef.current = roomState.phase as Phase
    setShowDone(false)

    if (roomState.paused && roomState.pausedSecondsLeft !== undefined) {
      // Paused state — freeze the clock at the saved remaining time
      clearInterval(intervalRef.current!)
      setSecondsLeft(roomState.pausedSecondsLeft)
      pausedRef.current = roomState.pausedSecondsLeft
      setRunning(false)
    } else {
      // Running — sync endTime and start ticking
      endTimeRef.current = roomState.endTime
      setSecondsLeft(Math.max(0, Math.round((roomState.endTime - Date.now()) / 1000)))
      setRunning(true)
    }
  }, [roomState, isSolo])

  // Tab title
  useEffect(() => {
    const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
    const ss = String(secondsLeft % 60).padStart(2, '0')
    document.title = running ? `${mm}:${ss} — hillsum` : `${mm}:${ss} (paused) — hillsum`
    return () => { document.title = 'hillsum' }
  }, [secondsLeft, running])

  useEffect(() => {
    if (typeof window !== 'undefined' && Notification.permission === 'default') Notification.requestPermission()
    playFocusStart()
    // Load all-time totals from DB
    if (!isGuest) {
      supabase.from('profiles').select('total_focus_seconds, total_break_seconds').eq('id', user.id).single()
        .then(({ data }) => {
          if (data) {
            setTotalFocusSecs(data.total_focus_seconds ?? 0)
            setTotalBreakSecs(data.total_break_seconds ?? 0)
          }
        })
    }
  }, [])

  const saveStats = useCallback(async (focusSeconds: number, breakSeconds: number) => {
    if (isGuest) return
    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase.rpc('upsert_daily_stats', {
      p_user_id: user.id, p_date: today,
      p_focus: focusSeconds, p_break: breakSeconds,
    })
    if (error) console.error('saveStats failed:', error.message)
    else {
      if (focusSeconds > 0) setTotalFocusSecs(t => t + focusSeconds)
      if (breakSeconds > 0) setTotalBreakSecs(t => t + breakSeconds)
    }
  }, [user, isGuest])

  // Tick — drives both solo and shared
  useEffect(() => {
    if (!running || showDone) return
    function tick() {
      const rem = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000))
      setSecondsLeft(rem)

      // Update session accumulators every second
      if (phaseRef.current === 'focus') setSessionFocusSecs(s => s + 1)
      else setSessionBreakSecs(s => s + 1)

      if (rem <= 0) {
        clearInterval(intervalRef.current!)
        // Save actual elapsed seconds for this phase
        const elapsed = Math.round((Date.now() - phaseStartRef.current) / 1000)

        if (phaseRef.current === 'focus') {
          saveStats(elapsed, 0)
          phaseStartRef.current = Date.now()
          if (isSolo) {
            const dur = config.breakMinutes * 60
            endTimeRef.current = Date.now() + dur * 1000
            setPhase('break'); phaseRef.current = 'break'; setSecondsLeft(dur)
            playBreakStart(); notify('Break time', `Take a ${config.breakMinutes} min break.`)
            intervalRef.current = setInterval(tick, 500)
          } else {
            onBroadcast?.({
              phase: 'break',
              endTime: Date.now() + config.breakMinutes * 60 * 1000,
              focusMinutes: config.focusMinutes,
              breakMinutes: config.breakMinutes,
            })
          }
        } else {
          saveStats(0, elapsed)
          setShowDone(true); setRunning(false)
          playSessionEnd(); notify('Session complete', 'Your pomodoro is done.')
          if (!isSolo) onBroadcast?.({ phase: 'idle' })
          onTimerPhaseChange?.('setup')
        }
      }
    }
    intervalRef.current = setInterval(tick, 1000)
    return () => clearInterval(intervalRef.current!)
  }, [running, showDone, isSolo])

  function handlePauseResume() {
    if (running) {
      // Pause — broadcast frozen state to everyone
      const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000))
      pausedRef.current = remaining
      clearInterval(intervalRef.current!); setRunning(false)
      if (!isSolo) onBroadcast?.({
        phase, endTime: endTimeRef.current,
        focusMinutes: config.focusMinutes, breakMinutes: config.breakMinutes,
        paused: true, pausedSecondsLeft: remaining,
      })
    } else {
      // Resume — recalculate endTime from remaining, broadcast running state
      const newEnd = Date.now() + pausedRef.current * 1000
      endTimeRef.current = newEnd
      setRunning(true)
      if (!isSolo) onBroadcast?.({
        phase, endTime: newEnd,
        focusMinutes: config.focusMinutes, breakMinutes: config.breakMinutes,
        paused: false,
      })
    }
  }

  function handleEnd() {
    clearInterval(intervalRef.current!); setRunning(false)
    playSessionEnd(); setShowDone(true)
    if (!isSolo) onBroadcast?.({ phase: 'idle' })
  }

  function handleRepeat() {
    setShowDone(false); setRunning(true)
    setSessionFocusSecs(0); setSessionBreakSecs(0)
    phaseStartRef.current = Date.now()
    if (isSolo) {
      endTimeRef.current = Date.now() + config.focusMinutes * 60 * 1000
      setPhase('focus'); phaseRef.current = 'focus'
      setSecondsLeft(config.focusMinutes * 60)
      playFocusStart()
    } else {
      onBroadcast?.({
        phase: 'focus',
        endTime: Date.now() + config.focusMinutes * 60 * 1000,
        focusMinutes: config.focusMinutes,
        breakMinutes: config.breakMinutes,
      })
    }
  }

  const totalSecs = phase === 'focus' ? config.focusMinutes * 60 : config.breakMinutes * 60
  const progress = Math.min(100, ((totalSecs - secondsLeft) / totalSecs) * 100)
  const C = 2 * Math.PI * 45
  const isFocus = phase === 'focus'

  return (
    <div className="w-full flex flex-col gap-4 h-[calc(100vh-72px)]">

        {/* Timer card */}
        <div className="flex-1 glass rounded-card flex flex-col items-center justify-center gap-7 px-8"
          style={{ boxShadow: 'var(--shadow-md)' }}>

          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${running ? 'animate-pulse' : ''}`}
              style={{ background: isFocus ? 'var(--accent)' : '#30D158' }} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--fg-2)' }}>
              {isFocus ? 'Focus' : 'Break'}
            </span>
          </div>

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

          {!showDone ? (
            <div className="flex items-center gap-3">
              <button onClick={handlePauseResume}
                className="flex items-center gap-2 px-6 py-2.5 rounded-pill text-sm font-semibold text-white transition-all active:scale-[0.97]"
                style={{ background: 'var(--accent)' }}>
                {running
                  ? <><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>Pause</>
                  : <><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Resume</>
                }
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
              {[{ label: 'Focus', val: totalFocusSecs + sessionFocusSecs }, { label: 'Break', val: totalBreakSecs + sessionBreakSecs }].map(({ label, val }, i) => (
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
          <button onClick={() => setShowStats(s => !s)} className="text-[11px] font-medium flex-shrink-0"
            style={{ color: 'var(--accent)' }}>
            {showStats ? 'Hide' : 'Stats'}
          </button>
          {showStats && (
            <div className="absolute left-0 bottom-full mb-2 z-20">
              <StatsPopover
                focusSecs={totalFocusSecs + sessionFocusSecs}
                breakSecs={totalBreakSecs + sessionBreakSecs}
                userId={isGuest ? null : user.id}
                onClose={() => setShowStats(false)}
              />
            </div>
          )}
        </div>
    </div>
  )
}
