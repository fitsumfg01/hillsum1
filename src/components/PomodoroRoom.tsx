'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TimerConfig } from '@/app/room/[slug]/page'
import type { User } from '@supabase/supabase-js'
import Chat from './Chat'
import UserAvatar from './UserAvatar'
import StatsPopover from './StatsPopover'

type Phase = 'focus' | 'break'

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
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
  const supabase = createClient()

  const saveStats = useCallback(async (addFocus: number, addBreak: number) => {
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
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          if (phase === 'focus') {
            setFocusSecs(f => f + 1)
            saveStats(1, 0)
            setPhase('break')
            return config.breakMinutes * 60
          } else {
            setBreakSecs(b => b + 1)
            saveStats(0, 1)
            setShowDonePrompt(true)
            setRunning(false)
            return 0
          }
        }
        if (phase === 'focus') setFocusSecs(f => f + 1)
        else setBreakSecs(b => b + 1)
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current!)
  }, [running, phase, config, showDonePrompt])

  function handleEnd() {
    clearInterval(intervalRef.current!)
    setRunning(false)
    setShowDonePrompt(true)
  }

  function handleRepeat() {
    setShowDonePrompt(false)
    setPhase('focus')
    setSecondsLeft(config.focusMinutes * 60)
    setRunning(true)
  }

  const totalSecs = phase === 'focus' ? config.focusMinutes * 60 : config.breakMinutes * 60
  const progress = ((totalSecs - secondsLeft) / totalSecs) * 100
  const circumference = 2 * Math.PI * 45

  return (
    <div className="w-full max-w-5xl flex gap-4 h-[calc(100vh-80px)]">

      {/* ── Left: Timer + Profile ── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">

        {/* Timer card */}
        <div className="bg-[var(--card)] rounded-2xl shadow-lg p-8 flex flex-col items-center gap-5 border border-[var(--border)]">
          <span className={`font-display text-xs font-semibold uppercase tracking-[0.2em] px-3 py-1 rounded-full ${
            phase === 'focus'
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
              : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
          }`}>
            {phase === 'focus' ? '🎯 Focus' : '☕ Break'}
          </span>

          <div className="relative w-48 h-48">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="6" />
              <circle
                cx="50" cy="50" r="45" fill="none"
                stroke={phase === 'focus' ? '#2563eb' : '#22c55e'}
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress / 100)}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
              <span className="font-display text-4xl font-bold text-primary-700 dark:text-primary-300 tabular-nums">
                {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:
                {String(secondsLeft % 60).padStart(2, '0')}
              </span>
              {!running && !showDonePrompt && (
                <span className="text-xs text-primary-400 font-display tracking-widest">PAUSED</span>
              )}
            </div>
          </div>

          {!showDonePrompt && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setRunning(r => !r)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-display font-semibold text-sm transition"
              >
                {running ? (
                  <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>Pause</>
                ) : (
                  <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Resume</>
                )}
              </button>
              <button
                onClick={handleEnd}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 font-display font-semibold text-sm transition"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                End
              </button>
            </div>
          )}

          {showDonePrompt && (
            <div className="flex flex-col items-center gap-3">
              <p className="font-display text-primary-700 dark:text-primary-300 font-semibold">
                Pomodoro complete! Go again?
              </p>
              <div className="flex gap-3">
                <button onClick={handleRepeat} className="px-6 py-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition font-display font-semibold text-sm">Yes ✓</button>
                <button onClick={onDone} className="px-6 py-2 rounded-xl border-2 border-[var(--border)] text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-gray-700 transition font-display font-semibold text-sm">No, stop</button>
              </div>
            </div>
          )}
        </div>

        {/* Profile + Stats card */}
        <div className="bg-[var(--card)] rounded-2xl shadow-lg p-6 border border-[var(--border)] flex items-center gap-5 relative">
          <button onClick={() => setShowStats(s => !s)} className="flex-shrink-0">
            <UserAvatar name={displayName} size="xl" />
          </button>
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <span className="font-display font-bold text-lg text-primary-700 dark:text-primary-300 truncate">
              {displayName}
            </span>
            <div className="flex gap-4 mt-1">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-primary-400 font-display">Focus</span>
                <span className="font-display font-bold text-primary-700 dark:text-primary-300 text-sm">{formatSeconds(focusSecs)}</span>
              </div>
              <div className="w-px bg-[var(--border)]" />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-primary-400 font-display">Break</span>
                <span className="font-display font-bold text-primary-700 dark:text-primary-300 text-sm">{formatSeconds(breakSecs)}</span>
              </div>
            </div>
            <button onClick={() => setShowStats(s => !s)} className="text-xs text-primary-400 hover:text-primary-600 hover:underline text-left mt-1 font-display">
              {showStats ? 'Hide stats ↑' : 'View monthly stats →'}
            </button>
          </div>

          {showStats && (
            <div className="absolute left-0 bottom-full mb-2 z-20">
              <StatsPopover
                focusSecs={focusSecs}
                breakSecs={breakSecs}
                userId={user.id}
                onClose={() => setShowStats(false)}
              />
            </div>
          )}
        </div>

        {phase === 'focus' && (
          <div className="text-center text-primary-300 text-sm font-display tracking-wide">
            💬 Chat unlocks on break
          </div>
        )}
      </div>

      {/* ── Right: Chat (hidden in solo mode) ── */}
      {!isSolo && (
        <div className="w-80 flex-shrink-0">
          <Chat user={user} displayName={displayName} roomSlug={roomSlug} locked={phase === 'focus'} />
        </div>
      )}
    </div>
  )
}
