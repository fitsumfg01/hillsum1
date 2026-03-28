'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

type DailyStat = { stat_date: string; focus_seconds: number }

export default function StatsPopover({
  focusSecs,
  breakSecs,
  userId,
  onClose,
}: {
  focusSecs: number
  breakSecs: number
  userId: string | null
  onClose: () => void
}) {
  const [daily, setDaily] = useState<DailyStat[]>([])
  const supabase = createClient()

  useEffect(() => {
    if (!userId) return
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    supabase
      .from('daily_stats')
      .select('stat_date, focus_seconds')
      .eq('user_id', userId)
      .gte('stat_date', firstDay)
      .then(({ data }) => { if (data) setDaily(data) })
  }, [userId])

  // Build calendar grid for current month
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow = new Date(year, month, 1).getDay()
  const statMap = Object.fromEntries(daily.map(d => [d.stat_date, d.focus_seconds]))

  return (
    <div className="absolute z-10 bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-5 w-72 border border-primary-100 dark:border-gray-700">
      <div className="flex justify-between items-center mb-3">
        <span className="font-semibold text-primary-700 dark:text-primary-300">Your Stats</span>
        <button onClick={onClose} className="text-primary-300 hover:text-primary-500 text-lg leading-none">×</button>
      </div>

      <div className="flex gap-4 mb-4 text-sm">
        <div className="flex flex-col">
          <span className="text-primary-400">Focus</span>
          <span className="font-bold text-primary-700 dark:text-primary-300">{formatSeconds(focusSecs)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-primary-400">Break</span>
          <span className="font-bold text-primary-700 dark:text-primary-300">{formatSeconds(breakSecs)}</span>
        </div>
      </div>

      {/* Monthly calendar */}
      <div className="text-xs text-primary-400 mb-1 text-center">
        {now.toLocaleString('default', { month: 'long', year: 'numeric' })}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <span key={i} className="text-primary-300 font-medium">{d}</span>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const secs = statMap[dateStr] ?? 0
          const isToday = day === now.getDate()
          return (
            <span
              key={day}
              title={secs ? formatSeconds(secs) : undefined}
              className={`rounded py-0.5 ${
                secs > 0 ? 'bg-primary-200 dark:bg-primary-800 text-primary-700 dark:text-primary-300' : 'text-primary-300'
              } ${isToday ? 'ring-1 ring-primary-500' : ''}`}
            >
              {day}
            </span>
          )
        })}
      </div>
    </div>
  )
}
