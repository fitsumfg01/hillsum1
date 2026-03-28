'use client'
import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = stored === 'dark' || (!stored && prefersDark)
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  // Light = circle LEFT (☀️), Dark = circle RIGHT (🌙)
  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="relative w-12 h-6 rounded-full transition-colors duration-300 bg-primary-200 dark:bg-primary-700 flex items-center"
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 flex items-center justify-center text-[10px] ${
          dark ? 'translate-x-6' : 'translate-x-0.5'
        }`}
      >
        {dark ? '🌙' : '☀️'}
      </span>
    </button>
  )
}
