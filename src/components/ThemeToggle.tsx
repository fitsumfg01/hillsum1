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

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="relative w-11 h-6 rounded-full transition-colors duration-300"
      style={{ background: dark ? '#3A3A3C' : '#E8E8ED' }}
    >
      <span
        className="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform duration-300 flex items-center justify-center"
        style={{ transform: dark ? 'translateX(23px)' : 'translateX(3px)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
      >
        {dark
          ? <svg className="w-2.5 h-2.5 text-[#3A3A3C]" fill="currentColor" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z"/></svg>
          : <svg className="w-2.5 h-2.5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a1 1 0 011 1v1a1 1 0 01-2 0V3a1 1 0 011-1zm0 15a5 5 0 100-10 5 5 0 000 10zm7-5a1 1 0 011-1h1a1 1 0 010 2h-1a1 1 0 01-1-1zM4 12a1 1 0 01-1 1H2a1 1 0 010-2h1a1 1 0 011 1zm13.66-6.34a1 1 0 010 1.41l-.71.71a1 1 0 01-1.41-1.41l.71-.71a1 1 0 011.41 0zM7.05 17.66a1 1 0 010 1.41l-.71.71a1 1 0 01-1.41-1.41l.71-.71a1 1 0 011.41 0zm10.61 0l.71.71a1 1 0 01-1.41 1.41l-.71-.71a1 1 0 011.41-1.41zM7.05 6.34L6.34 5.63a1 1 0 00-1.41 1.41l.71.71a1 1 0 001.41-1.41zM12 20a1 1 0 011 1v1a1 1 0 01-2 0v-1a1 1 0 011-1z"/></svg>
        }
      </span>
    </button>
  )
}
