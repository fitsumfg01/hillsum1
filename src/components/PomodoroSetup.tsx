'use client'
import { useState } from 'react'
import type { TimerConfig } from '@/app/room/page'

// Scientific limits: focus 10–90 min, break 5–30 min
const PRESETS: TimerConfig[] = [
  { focusMinutes: 25, breakMinutes: 5 },
  { focusMinutes: 50, breakMinutes: 10 },
  { focusMinutes: 52, breakMinutes: 17 },
  { focusMinutes: 60, breakMinutes: 15 },
]

export default function PomodoroSetup({ onStart }: { onStart: (c: TimerConfig) => void }) {
  const [custom, setCustom] = useState(false)
  const [focus, setFocus] = useState(25)
  const [brk, setBrk] = useState(5)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 w-full max-w-md flex flex-col gap-6">
      <h2 className="text-primary-700 dark:text-primary-300 font-semibold text-xl text-center">
        Choose your focus time
      </h2>

      {!custom ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {PRESETS.map((p) => (
              <button
                key={`${p.focusMinutes}-${p.breakMinutes}`}
                onClick={() => onStart(p)}
                className="flex flex-col items-center py-4 rounded-xl border-2 border-primary-200 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-gray-700 transition"
              >
                <span className="text-2xl font-bold text-primary-700 dark:text-primary-300">
                  {p.focusMinutes}m
                </span>
                <span className="text-xs text-primary-400">
                  {p.breakMinutes}m break
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setCustom(true)}
            className="text-sm text-primary-500 hover:underline text-center"
          >
            Set custom time →
          </button>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-primary-600 dark:text-primary-400">
                Focus time: <strong>{focus} min</strong>
              </span>
              <input
                type="range" min={10} max={90} value={focus}
                onChange={e => setFocus(+e.target.value)}
                className="accent-primary-600"
              />
              <span className="text-xs text-primary-300">10 – 90 minutes</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-primary-600 dark:text-primary-400">
                Break time: <strong>{brk} min</strong>
              </span>
              <input
                type="range" min={5} max={30} value={brk}
                onChange={e => setBrk(+e.target.value)}
                className="accent-primary-600"
              />
              <span className="text-xs text-primary-300">5 – 30 minutes</span>
            </label>
          </div>
          <button
            onClick={() => onStart({ focusMinutes: focus, breakMinutes: brk })}
            className="w-full py-3 rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition font-medium"
          >
            Start
          </button>
          <button onClick={() => setCustom(false)} className="text-sm text-primary-400 hover:underline text-center">
            ← Back to presets
          </button>
        </>
      )}
    </div>
  )
}
