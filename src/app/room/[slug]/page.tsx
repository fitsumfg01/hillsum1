'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import PomodoroRoom from '@/components/PomodoroRoom'
import Chat from '@/components/Chat'
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
}

const PRESETS: { label: string; config: TimerConfig }[] = [
  { label: '25 min', config: { focusMinutes: 25, breakMinutes: 5 } },
  { label: '50 min', config: { focusMinutes: 50, breakMinutes: 10 } },
  { label: '55 min', config: { focusMinutes: 55, breakMinutes: 5 } },
  { label: '1 hour', config: { focusMinutes: 60, breakMinutes: 15 } },
]

export default function RoomPage({ params }: { params: { slug: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [config, setConfig] = useState<TimerConfig | null>(null)
  const [showSetup, setShowSetup] = useState(true)
  const [customFocus, setCustomFocus] = useState(25)
  const [customBreak, setCustomBreak] = useState(5)
  const [showCustom, setShowCustom] = useState(false)
  const [roomState, setRoomState] = useState<RoomState | null>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .single()
        setDisplayName(data?.display_name || user.email || 'User')
      } else {
        setDisplayName('Guest')
      }
    }
    getUser()
  }, [supabase])

  const handleStartSession = (timerConfig: TimerConfig) => {
    setConfig(timerConfig)
    setShowSetup(false)
  }

  const handleDone = () => {
    setShowSetup(true)
    setConfig(null)
  }

  const isSolo = params.slug.startsWith('solo-')

  if (!user && !displayName) return <div>Loading...</div>

  return (
    <div className="flex h-screen gap-4 p-4 bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 text-white">
      {/* Left: Timer & Setup */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center mb-8">
          <p className="text-xs font-bold uppercase tracking-widest opacity-50 mb-2">
            Room: {params.slug}
          </p>
          <p className="text-sm font-bold opacity-60">
            {isSolo ? 'Solo Focus' : 'Group Focus'} • {displayName}
          </p>
        </div>

        {showSetup ? (
          <div className="w-full max-w-md bg-white/5 backdrop-blur-md rounded-3xl p-8 border border-white/10 space-y-6">
            <h2 className="text-2xl font-black text-center">Start a Session</h2>

            {showCustom ? (
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase opacity-50 block mb-2">
                    Focus (min)
                  </label>
                  <input
                    type="number"
                    value={customFocus}
                    onChange={(e) => setCustomFocus(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-white/10 border-b-2 border-white/30 p-2 outline-none focus:border-white text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase opacity-50 block mb-2">
                    Break (min)
                  </label>
                  <input
                    type="number"
                    value={customBreak}
                    onChange={(e) => setCustomBreak(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-white/10 border-b-2 border-white/30 p-2 outline-none focus:border-white text-white"
                  />
                </div>
                <button
                  onClick={() =>
                    handleStartSession({ focusMinutes: customFocus, breakMinutes: customBreak })
                  }
                  className="w-full bg-white text-blue-600 font-black rounded-xl py-3 hover:bg-blue-50 transition-colors"
                >
                  Start Session
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handleStartSession(preset.config)}
                    className="p-3 rounded-xl bg-white/10 border border-transparent hover:border-white/20 hover:bg-white/20 transition-all text-sm font-bold"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowCustom(!showCustom)}
              className="w-full text-xs font-bold uppercase tracking-wider opacity-60 hover:opacity-100 transition-opacity py-2"
            >
              {showCustom ? '← Back' : 'Custom Time →'}
            </button>
          </div>
        ) : config ? (
          <PomodoroRoom
            config={config}
            user={user!}
            displayName={displayName}
            roomSlug={params.slug}
            isSolo={isSolo}
            roomState={roomState}
            onBroadcast={(state) => setRoomState(state as RoomState | null)}
            onDone={handleDone}
          />
        ) : null}
      </div>

      {/* Right: Chat */}
      {user && config && (
        <div className="w-80 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 flex flex-col overflow-hidden">
          <Chat
            user={user}
            displayName={displayName}
            roomSlug={params.slug}
            isSolo={isSolo}
            focusLocked={false}
          />
        </div>
      )}
    </div>
  )
}
