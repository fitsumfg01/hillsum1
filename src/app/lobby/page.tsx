'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import ThemeToggle from '@/components/ThemeToggle'
import UserAvatar from '@/components/UserAvatar'
import type { User } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const VALID_NAME = /^[a-z0-9-]{3,40}$/

function sanitize(raw: string) {
  return raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

const cardVariants = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.12, duration: 0.4, ease: 'easeOut' },
  }),
}

export default function LobbyPage() {
  const [user, setUser] = useState<User | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [createName, setCreateName] = useState('')
  const [joinName, setJoinName] = useState('')
  const [createError, setCreateError] = useState('')
  const [joinError, setJoinError] = useState('')
  const [creating, setCreating] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/'); return }
      setUser(data.user)
      setDisplayName(
        data.user.user_metadata?.preferred_name
        ?? data.user.user_metadata?.full_name
        ?? data.user.email?.split('@')[0]
        ?? 'User'
      )
    })
  }, [])

  function handleNameInput(raw: string) {
    setCreateName(sanitize(raw))
    setCreateError('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError('')
    if (!VALID_NAME.test(createName)) {
      setCreateError('3–40 chars: lowercase letters, numbers, hyphens only')
      return
    }
    setCreating(true)
    const { error } = await supabase.from('rooms').insert({ name: createName, created_by: user!.id })
    setCreating(false)
    if (error) {
      setCreateError(error.code === '23505' ? 'That name is already taken — try another' : error.message)
      return
    }
    router.push(`/room/${createName}`)
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setJoinError('')
    // Accept full URL or just the name
    const name = joinName.trim().toLowerCase().replace(/.*\/room\//, '')
    const { data } = await supabase.from('rooms').select('name').eq('name', name).single()
    if (!data) { setJoinError('Room not found — check the name and try again'); return }
    router.push(`/room/${name}`)
  }

  function handleSolo() {
    router.push(`/room/solo-${Date.now()}`)
  }

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-8 h-8 border-4 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
    </div>
  )

  const previewUrl = createName ? `hillsum.app/room/${createName}` : null
  const isValidName = VALID_NAME.test(createName)

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--card)]">
        <span className="font-display text-2xl font-bold text-primary-700 dark:text-primary-300 tracking-widest">hillsum</span>
        <div className="flex items-center gap-3">
          <UserAvatar name={displayName} size="sm" />
          <span className="font-display text-sm text-primary-600 dark:text-primary-400 font-medium">{displayName}</span>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md flex flex-col gap-5">

          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h2 className="font-display text-3xl font-bold text-primary-700 dark:text-primary-300">
              Your Focus Party
            </h2>
            <p className="text-primary-400 text-sm mt-1 font-display">
              Create a private room, join one, or go solo
            </p>
          </motion.div>

          {/* ── Card 1: Create ── */}
          <motion.form
            onSubmit={handleCreate}
            custom={0} variants={cardVariants} initial="hidden" animate="visible"
            className="bg-[var(--card)] rounded-2xl p-6 border border-[var(--border)] flex flex-col gap-4"
            style={{ boxShadow: '0 4px 24px 0 rgba(37,99,235,0.07)' }}
            whileHover={{ scale: 1.01 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">✨</span>
              <h3 className="font-display font-semibold text-primary-700 dark:text-primary-300">Create a room</h3>
            </div>

            <div className="flex flex-col gap-1.5">
              {/* Inline prefix input */}
              <div className={`flex items-center border rounded-xl overflow-hidden transition-all ${
                createError ? 'border-red-400 ring-1 ring-red-300' : 'border-[var(--border)] focus-within:ring-2 focus-within:ring-primary-400'
              }`}>
                <span className="pl-3 pr-1 text-primary-400 text-xs font-display whitespace-nowrap select-none">
                  hillsum.app/room/
                </span>
                <input
                  value={createName}
                  onChange={e => handleNameInput(e.target.value)}
                  placeholder="my-focus-squad"
                  maxLength={40}
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 py-2.5 pr-3 bg-transparent focus:outline-none text-sm text-primary-700 dark:text-primary-200 font-display"
                />
              </div>

              {/* Live URL preview */}
              {previewUrl && (
                <p className={`text-[11px] font-display px-1 transition-colors ${
                  isValidName ? 'text-primary-500' : 'text-amber-500'
                }`}>
                  {isValidName ? '✓' : '⚠'} {previewUrl}
                </p>
              )}
              {!previewUrl && (
                <p className="text-[10px] text-primary-300 font-display px-1">
                  lowercase letters, numbers, hyphens · 3–40 chars
                </p>
              )}
              {createError && <p className="text-red-500 text-xs font-display px-1">{createError}</p>}
            </div>

            <button
              type="submit"
              disabled={creating || !isValidName}
              className="w-full py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 active:scale-95 transition font-display font-semibold text-sm disabled:opacity-40"
            >
              {creating ? 'Creating…' : 'Create & Enter Room'}
            </button>
          </motion.form>

          {/* ── Card 2: Join ── */}
          <motion.form
            onSubmit={handleJoin}
            custom={1} variants={cardVariants} initial="hidden" animate="visible"
            className="bg-[var(--card)] rounded-2xl p-6 border border-[var(--border)] flex flex-col gap-4"
            style={{ boxShadow: '0 4px 24px 0 rgba(37,99,235,0.07)' }}
            whileHover={{ scale: 1.01 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">🔗</span>
              <h3 className="font-display font-semibold text-primary-700 dark:text-primary-300">Join a room</h3>
            </div>
            <input
              value={joinName}
              onChange={e => { setJoinName(e.target.value); setJoinError('') }}
              placeholder="Paste room name or full link"
              className="border border-[var(--border)] rounded-xl px-4 py-2.5 bg-transparent focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm text-primary-700 dark:text-primary-200 font-display"
            />
            {joinError && <p className="text-red-500 text-xs font-display">{joinError}</p>}
            <button
              type="submit"
              disabled={!joinName.trim()}
              className="w-full py-2.5 rounded-xl border-2 border-primary-300 text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-gray-800 active:scale-95 transition font-display font-semibold text-sm disabled:opacity-40"
            >
              Join Room
            </button>
          </motion.form>

          {/* ── Card 3: Go Solo ── */}
          <motion.div
            custom={2} variants={cardVariants} initial="hidden" animate="visible"
            className="bg-[var(--card)] rounded-2xl p-6 border border-[var(--border)] flex flex-col gap-4"
            style={{ boxShadow: '0 4px 24px 0 rgba(37,99,235,0.07)' }}
            whileHover={{ scale: 1.01 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">🎧</span>
              <h3 className="font-display font-semibold text-primary-700 dark:text-primary-300">Go Solo</h3>
            </div>
            <p className="text-sm text-primary-400 font-display -mt-1">
              Jump straight into a private focus session — no room, no distractions.
            </p>
            <button
              onClick={handleSolo}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 text-white hover:from-primary-600 hover:to-primary-800 active:scale-95 transition font-display font-semibold text-sm"
            >
              Start Solo Session
            </button>
          </motion.div>

        </div>
      </main>
    </div>
  )
}
