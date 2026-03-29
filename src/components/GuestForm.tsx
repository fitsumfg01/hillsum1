'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function GuestForm({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState('')
  const router = useRouter()

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    sessionStorage.setItem('guest_name', name.trim())
    router.push('/lobby')
  }

  return (
    <form onSubmit={handleJoin} className="glass rounded-card p-8 w-[340px] flex flex-col gap-4" style={{ boxShadow: 'var(--shadow-lg)' }}>
      <div>
        <h2 className="text-[17px] font-semibold" style={{ color: 'var(--fg)' }}>Continue as Guest</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--fg-2)' }}>Enter a name to get started.</p>
      </div>
      <input
        type="text"
        placeholder="Your name"
        value={name}
        onChange={e => setName(e.target.value)}
        maxLength={30}
        required
        autoFocus
        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
      <button
        type="submit"
        className="w-full py-3 rounded-pill text-sm font-semibold text-white transition-all active:scale-[0.98]"
        style={{ background: 'var(--accent)' }}
      >
        Continue
      </button>
      <button type="button" onClick={onBack} className="text-sm text-center transition-all" style={{ color: 'var(--accent)' }}>
        Back
      </button>
    </form>
  )
}
