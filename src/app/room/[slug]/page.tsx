'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import PomodoroRoom from '@/components/PomodoroRoom'
import Chat from '@/components/Chat'
import ThemeToggle from '@/components/ThemeToggle'
import type { TimerConfig } from '@/lib/types'

export type RoomState = {
  phase: 'focus' | 'break'
  secondsLeft: number
  running: boolean
  user_id: string
  displayName: string
  endTime: number
  paused?: boolean
  pausedSecondsLeft?: number
  focusMinutes?: number
  breakMinutes?: number
}

const PRESETS: { label: string; config: TimerConfig }[] = [
  { label: '25 min', config: { focusMinutes: 25, breakMinutes: 5 } },
  { label: '50 min', config: { focusMinutes: 50, breakMinutes: 10 } },
  { label: '55 min', config: { focusMinutes: 55, breakMinutes: 5 } },
  { label: '1 hour', config: { focusMinutes: 60, breakMinutes: 15 } },
]

export default function RoomPage({ params }: { params: { slug: string } }) {
  const slug = params?.slug ?? ''
  const [user, setUser] = useState<User | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [config, setConfig] = useState<TimerConfig | null>(null)
  const [showSetup, setShowSetup] = useState(true)
  const [customFocus, setCustomFocus] = useState(25)
  const [customBreak, setCustomBreak] = useState(5)
  const [showCustom, setShowCustom] = useState(false)
  const [roomState, setRoomState] = useState<RoomState | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user)
      if (user) {
        const { data } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
        setDisplayName(data?.display_name || user.email || 'User')
      } else {
        setDisplayName('Guest')
      }
    })
  }, [])

  const isSolo = slug.startsWith('solo-')
  const effectiveUser = user ?? { id: 'guest' } as any

  if (!displayName) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header className="glass sticky top-0 z-10 flex items-center justify-between px-8 py-4 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <span className="text-[17px] font-semibold tracking-tight" style={{ color: 'var(--fg)', letterSpacing: '-0.02em' }}>
            hillsum
          </span>
          <span className="text-[13px]" style={{ color: 'var(--fg-2)' }}>
            {isSolo ? '· Solo' : `· #${slug}`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: 'var(--fg-2)' }}>{displayName}</span>
          <ThemeToggle />
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Timer area */}
        <div className="flex-1 flex items-center justify-center p-8">
          {showSetup ? (
            <div className="w-full max-w-sm flex flex-col gap-4">
              <div className="mb-2">
                <h2 className="text-[28px] font-semibold tracking-tight"
                  style={{ color: 'var(--fg)', letterSpacing: '-0.03em' }}>
                  {isSolo ? 'Solo Session' : 'Group Session'}
                </h2>
                <p className="text-sm mt-1" style={{ color: 'var(--fg-2)' }}>
                  {isSolo ? 'A private session just for you.' : `Room: ${slug}`}
                </p>
              </div>

              <div className="glass rounded-card p-6 flex flex-col gap-3" style={{ boxShadow: 'var(--shadow-md)' }}>
                {showCustom ? (
                  <>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-widest block mb-2"
                        style={{ color: 'var(--fg-2)' }}>Focus (min)</label>
                      <input type="number" value={customFocus}
                        onChange={e => setCustomFocus(Math.max(1, Number(e.target.value)))}
                        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }} />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-widest block mb-2"
                        style={{ color: 'var(--fg-2)' }}>Break (min)</label>
                      <input type="number" value={customBreak}
                        onChange={e => setCustomBreak(Math.max(1, Number(e.target.value)))}
                        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }} />
                    </div>
                    <button onClick={() => { setConfig({ focusMinutes: customFocus, breakMinutes: customBreak }); setShowSetup(false) }}
                      className="w-full py-2.5 rounded-pill text-sm font-semibold text-white"
                      style={{ background: 'var(--accent)' }}>
                      Start Session
                    </button>
                    <button onClick={() => setShowCustom(false)}
                      className="text-xs text-center py-1" style={{ color: 'var(--fg-2)' }}>← Back</button>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {PRESETS.map(p => (
                        <button key={p.label}
                          onClick={() => { setConfig(p.config); setShowSetup(false) }}
                          className="py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.97]"
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setShowCustom(true)}
                      className="text-xs text-center py-1" style={{ color: 'var(--fg-2)' }}>
                      Custom time →
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : config ? (
            <PomodoroRoom
              config={config}
              user={effectiveUser}
              displayName={displayName}
              roomSlug={slug}
              isSolo={isSolo}
              roomState={roomState}
              onBroadcast={state => setRoomState(state as RoomState | null)}
              onDone={() => { setShowSetup(true); setConfig(null) }}
            />
          ) : null}
        </div>

        {/* Chat panel — group rooms only, after session starts */}
        {!isSolo && config && (
          <div className="w-[320px] border-l flex flex-col" style={{ borderColor: 'var(--border)' }}>
            <Chat
              user={effectiveUser}
              displayName={displayName}
              roomSlug={slug}
              isSolo={false}
              focusLocked={false}
            />
          </div>
        )}
      </div>
    </div>
  )
}
