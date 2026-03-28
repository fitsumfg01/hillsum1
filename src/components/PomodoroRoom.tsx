'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TimerConfig } from '@/lib/types'
import type { User } from '@supabase/supabase-js'
import Chat, { playFocusStart, playBreakStart, playSessionEnd } from './Chat'
import UserAvatar from './UserAvatar'
import StatsPopover from './StatsPopover'

type Phase = 'focus' | 'break'

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

function sendNotification(title: string, body: string) {
  if (typeof window === 'undefined') return
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico', silent: true })
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') new Notification(title, { body, icon: '/favicon.ico', silent: true })
    })
  }
}

export default function PomodoroRoom({
  config,
  user,
  displayName,
  roomSlug,
  isSolo = false,
  onDone,
}: {
  config: TimerConfig
  user: User
  displayName: string
  roomSlug: string
  isSolo?: boolean
  onDone: () => void
}) {
  const [phase, setPhase] = useState<Phase>('focus')
  const [secondsLeft, setSecondsLeft] = useState(config.focusMinutes * 60)
  const [running, setRunning] = useState(true)
  const [focusSecs, setFocusSecs] = useState(0)
  const [breakSecs, setBreakSecs] = useState(0)
  const [showDonePrompt, setShowDonePrompt] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // endTime: the wall-clock ms when the current phase expires
  const endTimeRef = useRef<number>(Date.now() + config.focusMinutes * 60 * 1000)
  const phaseRef = useRef<Phase>('focus')
  const supabase = createClient()

  // Keep phaseRef in sync
  useEffect(() => { phaseRef.current = phase }, [phase])

  // Update document title with timer
  useEffect(() => {
    const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
    const ss = String(secondsLeft % 60).padStart(2, '0')
    const label = phase === 'focus' ? '🎯' : '☕'
    document.title = running ? `${label} ${mm}:${ss} — hillsum` : `⏸ ${mm}:${ss} — hillsum`
    return () => { document.title = 'hillsum' }
  }, [secondsLeft, running, phase])

  // Request notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    // Play focus start sound on mount
    playFocusStart()
  }, [])

  const saveStats = useCallback(async (addFocus: number, addBreak: number) => {
    if (user.id === 'guest') return
    const today = new Date().toISOString().split('T')[0]
    await supabase.rpc('upsert_daily_stats', {
      p_user_id: user.id,
      p_date: today,
      p_focus: addFocus,
      p_break: addBreak,
    })
  }, [user])

  useEffect(() => {
    if (!running || showDonePrompt) return

    function tick() {
      const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000))
      setSecondsLeft(remaining)

      if (remaining <= 0) {
        clearInterval(intervalRef.current!)
        if (phaseRef.current === 'focus') {
          setFocusSecs(f => f + 1)
          saveStats(1, 0)
          const breakEnd = Date.now() + config.breakMinutes * 60 * 1000
          endTimeRef.current = breakEnd
          setPhase('break')
          setSecondsLeft(config.breakMinutes * 60)
          playBreakStart()
          sendNotification('Break time! ☕', `Great work! Take a ${config.breakMinutes}min break.`)
          // restart interval for break phase
          intervalRef.current = setInterval(tick, 500)
        } else {
          setBreakSecs(b => b + 1)
          saveStats(0, 1)
          setShowDonePrompt(true)
          setRunning(false)
          playSessionEnd()
          sendNotification('Session complete! 🎉', 'Your pomodoro is done. Go again?')
        }
      }
    }

    intervalRef.current = setInterval(tick, 500) // 500ms for snappy updates
    return () => clearInterval(intervalRef.current!)
  }, [running, showDonePrompt])

  // Track remaining seconds when paused so resume is accurate
  const pausedSecondsRef = useRef<number>(config.focusMinutes * 60)

  function handlePauseResume() {
    if (running) {
      // Pausing — snapshot remaining time
      pausedSecondsRef.current = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000))
      clearInterval(intervalRef.current!)
      setRunning(false)
    } else {
      // Resuming — recalculate endTime from remaining
      endTimeRef.current = Date.now() + pausedSecondsRef.current * 1000
      setRunning(true)
    }
  }

  function handleEnd() {
    clearInterval(intervalRef.current!)
    setRunning(false)
    playSessionEnd()
    setShowDonePrompt(true)
  }

  function handleRepeat() {
    setShowDonePrompt(false)
    endTimeRef.current = Date.now() + config.focusMinutes * 60 * 1000
    setPhase('focus')
    setSecondsLeft(config.focusMinutes * 60)
    setRunning(true)
    playFocusStart()
  }

  const totalSecs = phase === 'focus' ? config.focusMinutes * 60 : config.breakMinutes * 60
  const progress = ((totalSecs - secondsLeft) / totalSecs) * 100
  const circumference = 2 * Math.PI * 45
  const isFocus = phase === 'focus'

  return (
    <div className="w-full max-w-5xl flex gap-5 h-[calc(100vh-72px)]">

      {/* ── Left column ── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">

        {/* Timer card */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 rounded-[24px] border border-[var(--border)] px-8 py-8"
          style={{ background: 'var(--card)', boxShadow: '0 2px 24px rgba(0,0,0,0.05)' }}>

          {/* Phase pill */}
          <div className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-display font-semibold tracking-[0.12em] uppercase transition-all duration-500 ${
            isFocus
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/60 dark:text-primary-300'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isFocus ? 'bg-primary-500' : 'bg-emerald-500'} ${running ? 'animate-pulse' : ''}`} />
            {isFocus ? 'Focus' : 'Break'}
          </div>

          {/* Circular timer */}
          <div className="relative w-52 h-52">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              {/* Track */}
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="4" />
              {/* Progress */}
              <circle
                cx="50" cy="50" r="45" fill="none"
                stroke={isFocus ? '#2563eb' : '#10b981'}
                strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress / 100)}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
              <span className="font-display text-[42px] font-bold tabular-nums leading-none text-primary-800 dark:text-primary-200"
                style={{ letterSpacing: '-0.02em' }}>
                {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}
              </span>
              {!running && !showDonePrompt && (
                <span className="text-[10px] font-display tracking-[0.2em] text-primary-400 uppercase">Paused</span>
              )}
            </div>
          </div>

          {/* Controls */}
          {!showDonePrompt ? (
            <div className="flex items-center gap-3">
              <button
                onClick={handlePauseResume}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary-600 hover:bg-primary-700 active:scale-95 text-white font-display font-semibold text-[13px] transition-all shadow-sm shadow-primary-200 dark:shadow-none"
              >
                {running ? (
                  <><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>Pause</>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Resume</>
                )}
              </button>
              <button
                onClick={handleEnd}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-95 font-display font-semibold text-[13px] transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
                End
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <p className="font-display font-semibold text-primary-700 dark:text-primary-300 text-[15px]">
                Session complete — go again?
              </p>
              <div className="flex gap-3">
                <button onClick={handleRepeat}
                  className="px-7 py-2.5 rounded-full bg-primary-600 hover:bg-primary-700 active:scale-95 text-white font-display font-semibold text-[13px] transition-all shadow-sm shadow-primary-200 dark:shadow-none">
                  Yes ✓
                </button>
                <button onClick={onDone}
                  className="px-7 py-2.5 rounded-full border border-[var(--border)] text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-white/5 active:scale-95 font-display font-semibold text-[13px] transition-all">
                  No, stop
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Profile + Stats card */}
        <div className="rounded-[20px] border border-[var(--border)] px-5 py-4 flex items-center gap-4 relative"
          style={{ background: 'var(--card)', boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
          <button onClick={() => setShowStats(s => !s)} className="flex-shrink-0 active:scale-95 transition-transform">
            <UserAvatar name={displayName} size="lg" />
          </button>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="font-display font-bold text-[15px] text-primary-800 dark:text-primary-200 truncate" style={{ letterSpacing: '-0.01em' }}>
              {displayName}
            </span>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-[0.15em] text-primary-400 font-display">Focus</span>
                <span className="font-display font-semibold text-primary-700 dark:text-primary-300 text-[13px]">{formatSeconds(focusSecs)}</span>
              </div>
              <div className="w-px h-6 bg-[var(--border)]" />
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-[0.15em] text-primary-400 font-display">Break</span>
                <span className="font-display font-semibold text-primary-700 dark:text-primary-300 text-[13px]">{formatSeconds(breakSecs)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowStats(s => !s)}
            className="text-[11px] text-primary-400 hover:text-primary-600 font-display transition-colors flex-shrink-0"
          >
            {showStats ? '↑ Hide' : 'Stats →'}
          </button>

          {showStats && (
            <div className="absolute left-0 bottom-full mb-2 z-20">
              <StatsPopover focusSecs={focusSecs} breakSecs={breakSecs} userId={user.id} onClose={() => setShowStats(false)} />
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Chat — always visible ── */}
      <div className="w-[300px] flex-shrink-0">
        <Chat
          user={user}
          displayName={displayName}
          roomSlug={roomSlug}
          isSolo={isSolo}
          focusLocked={isFocus}
        />
      </div>
    </div>
  )
}
