'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function GuestForm({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState('')
  const router = useRouter()

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    // Store guest name in sessionStorage (cleared on tab close)
    sessionStorage.setItem('guest_name', name.trim())
    router.push('/room')
  }

  return (
    <form onSubmit={handleJoin} className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 w-80 flex flex-col gap-4">
      <h2 className="text-primary-700 dark:text-primary-300 font-semibold text-lg text-center">
        What should we call you?
      </h2>
      <input
        type="text"
        placeholder="Your name"
        value={name}
        onChange={e => setName(e.target.value)}
        maxLength={30}
        required
        className="border border-primary-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
      />
      <button
        type="submit"
        className="w-full py-3 rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition font-medium"
      >
        Join as Guest
      </button>
      <button type="button" onClick={onBack} className="text-sm text-primary-400 hover:underline text-center">
        ← Back
      </button>
    </form>
  )
}
