'use client'
import { useState } from 'react'
import type { TimerConfig } from '@/lib/types'

const PRESETS: (TimerConfig & { label: string; sublabel: string })[] = [
  { focusMinutes: 25, breakMinutes: 5,  label: '25 min', sublabel: '5 min break' },
  { focusMinutes: 50, breakMinutes: 10, label: '50 min', sublabel: '10 min break' },
  { focusMinutes: 52, breakMinutes: 17, label: '52 min', sublabel: '17 min break' },
  { focusMinutes: 60, breakMinutes: 15, label: '60 min', sublabel: '15 min break' },
]

export default function PomodoroSetup({ onStart }: { onStart: (c: TimerConfig) => void }) {
  const [custom, setCustom] = useState(false)
  const [focus, setFocus] = useState(25)
  const [brk, setBrk] = useState(5)

  return (
    <div className="glass rounded-card p-8 w-full max-w-sm flex flex-col gap-6" style={{ boxShadow: 'var(--shadow-lg)' }}>
      <div>
        <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: 'var(--fg)', letterSpacing: '-0.02em' }}>
          Set your focus time
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--fg-2)' }}>Choose a preset or set a custom duration.</p>
      </div>

      {!custom ? (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => onStart(p)}
                className="flex flex-col items-start p-4 rounded-[14px] transition-all active:scale-[0.97] text-left"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-2)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg)' }}>
                <span className="text-[22px] font-semibold tracking-tight" style={{ color: 'var(--fg)', letterSpacing: '-0.02em' }}>{p.label}</span>
                <span className="text-xs mt-0.5" style={{ color: 'var(--fg-2)' }}>{p.sublabel}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setCustom(true)} className="text-sm font-medium text-center" style={{ color: 'var(--accent)' }}>
            Custom duration
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-5">
          {[
            { label: 'Focus', value: focus, set: setFocus, min: 10, max: 90, unit: 'min' },
            { label: 'Break', value: brk,   set: setBrk,   min: 5,  max: 30, unit: 'min' },
          ].map(({ label, value, set, min, max }) => (
            <div key={label} className="flex flex-col gap-2">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-medium" style={{ color: 'var(--fg)' }}>{label}</span>
                <span className="text-[22px] font-semibold tabular-nums" style={{ color: 'var(--fg)', letterSpacing: '-0.02em' }}>{value}<span className="text-sm font-normal ml-0.5" style={{ color: 'var(--fg-2)' }}>min</span></span>
              </div>
              <input type="range" min={min} max={max} value={value} onChange={e => set(+e.target.value)}
                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: 'var(--accent)' }} />
              <div className="flex justify-between text-xs" style={{ color: 'var(--fg-2)' }}>
                <span>{min} min</span><span>{max} min</span>
              </div>
            </div>
          ))}
          <button onClick={() => onStart({ focusMinutes: focus, breakMinutes: brk })}
            className="w-full py-3 rounded-pill text-sm font-semibold text-white transition-all active:scale-[0.98]"
            style={{ background: 'var(--accent)' }}>
            Begin Session
          </button>
          <button onClick={() => setCustom(false)} className="text-sm text-center" style={{ color: 'var(--fg-2)' }}>
            Back to presets
          </button>
        </div>
      )}
    </div>
  )
}
