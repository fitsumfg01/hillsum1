'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { Plus } from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [displayName, setDisplayName] = useState('')

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

  const generateSoloRoomId = () => {
    return `solo-${Math.random().toString(36).substring(2, 11)}`
  }

  const handleCreateSoloRoom = () => {
    const roomId = generateSoloRoomId()
    router.push(`/room/${roomId}`)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-12 space-y-8 bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 text-white">
      <div className="text-center">
        <h1 className="text-4xl font-black mb-2">Welcome, {displayName}</h1>
        <p className="text-sm opacity-60">Choose how you want to focus today</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl px-4">
        {/* Solo Room Card */}
        <button
          onClick={handleCreateSoloRoom}
          className="group p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-white/30 hover:bg-white/10 transition-all space-y-4 text-left"
        >
          <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
            <Plus size={24} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-black mb-1">Solo Room</h2>
            <p className="text-xs opacity-60">Focus alone with a unique room URL</p>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 group-hover:opacity-60 transition-opacity">
            Create Room →
          </div>
        </button>

        {/* Group Room Card */}
        <button
          onClick={() => router.push('/lobby')}
          className="group p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-white/30 hover:bg-white/10 transition-all space-y-4 text-left"
        >
          <div className="w-12 h-12 rounded-2xl bg-green-500/20 flex items-center justify-center group-hover:bg-green-500/30 transition-colors">
            <Plus size={24} className="text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-black mb-1">Group Room</h2>
            <p className="text-xs opacity-60">Focus with others in a shared room</p>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 group-hover:opacity-60 transition-opacity">
            Join Room →
          </div>
        </button>
      </div>
    </div>
  )
}
