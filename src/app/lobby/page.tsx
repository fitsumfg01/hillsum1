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

const rise = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } }),
}

function Card({ children, index }: { children: React.ReactNode; index: number }) {
  return (
    <motion.div custom={index} variants={rise} initial="hidden" animate="visible"
      className="glass rounded-card p-7 flex flex-col gap-5"
      style={{ boxShadow: 'var(--shadow-md)' }}
      whileHover={{ y: -2, boxShadow: 'var(--shadow-lg)' }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
      {children}
    </motion.div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--fg-2)' }}>{children}</p>
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
        ?? data.user.email?.split('@')[0] ?? 'User'
      )
    })
  }, [])

  function handleNameInput(raw: string) { setCreateName(sanitize(raw)); setCreateError('') }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setCreateError('')
    if (!VALID_NAME.test(createName)) { setCreateError('3–40 characters: lowercase letters, numbers, hyphens'); return }
    setCreating(true)
    const { error } = await supabase.from('rooms').insert({ name: createName, created_by: user!.id })
    setCreating(false)
    if (error) { setCreateError(error.code === '23505' ? 'That name is taken — try another' : error.message); return }
    router.push(`/room/${createName}`)
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault(); setJoinError('')
    const name = joinName.trim().toLowerCase().replace(/.*\/room\//, '')
    const { data } = await supabase.from('rooms').select('name').eq('name', name).single()
    if (!data) { setJoinError('Room not found'); return }
    router.push(`/room/${name}`)
  }

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  )

  const isValid = VALID_NAME.test(createName)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <header className="glass sticky top-0 z-10 flex items-center justify-between px-8 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <span className="text-[17px] font-semibold tracking-tight" style={{ color: 'var(--fg)', letterSpacing: '-0.02em' }}>hillsum</span>
        <div className="flex items-center gap-3">
          <UserAvatar name={displayName} size="sm" />
          <span className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>{displayName}</span>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[400px] flex flex-col gap-4">

          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="mb-2">
            <h2 className="text-[28px] font-semibold tracking-tight" style={{ color: 'var(--fg)', letterSpacing: '-0.03em' }}>
              Your session
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--fg-2)' }}>Create a room, join one, or focus solo.</p>
          </motion.div>

          {/* Create */}
          <Card index={0}>
            <Label>Create a room</Label>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="flex items-center rounded-xl overflow-hidden transition-all"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                onFocusCapture={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <span className="pl-3 text-xs whitespace-nowrap select-none" style={{ color: 'var(--fg-2)' }}>hillsum.app/room/</span>
                <input value={createName} onChange={e => handleNameInput(e.target.value)}
                  placeholder="my-focus-squad" maxLength={40} autoComplete="off" spellCheck={false}
                  className="flex-1 py-2.5 pr-3 bg-transparent outline-none text-sm"
                  style={{ color: 'var(--fg)' }} />
              </div>
              {createName && (
                <p className="text-xs" style={{ color: isValid ? 'var(--accent)' : '#FF9500' }}>
                  {isValid ? 'hillsum.app/room/' + createName : 'Min 3 characters, letters/numbers/hyphens only'}
                </p>
              )}
              {createError && <p className="text-xs text-red-500">{createError}</p>}
              <button type="submit" disabled={creating || !isValid}
                className="w-full py-2.5 rounded-pill text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ background: 'var(--accent)' }}>
                {creating ? 'Creating…' : 'Create Room'}
              </button>
            </form>
          </Card>

          {/* Join */}
          <Card index={1}>
            <Label>Join a room</Label>
            <form onSubmit={handleJoin} className="flex flex-col gap-3">
              <input value={joinName} onChange={e => { setJoinName(e.target.value); setJoinError('') }}
                placeholder="Room name or link"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
              {joinError && <p className="text-xs text-red-500">{joinError}</p>}
              <button type="submit" disabled={!joinName.trim()}
                className="w-full py-2.5 rounded-pill text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--fg)' }}>
                Join Room
              </button>
            </form>
          </Card>

          {/* Solo */}
          <Card index={2}>
            <Label>Solo session</Label>
            <p className="text-sm -mt-2" style={{ color: 'var(--fg-2)' }}>
              A private session just for you. No room, no distractions.
            </p>
            <button onClick={() => router.push(`/room/solo-${Date.now()}`)}
              className="w-full py-2.5 rounded-pill text-sm font-semibold text-white transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #0071E3, #34AADC)' }}>
              Begin Solo Session
            </button>
          </Card>

        </div>
      </main>
    </div>
  )
}
