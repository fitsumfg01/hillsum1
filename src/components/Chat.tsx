'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import UserAvatar from './UserAvatar'

type Message = {
  id: string
  content: string
  created_at: string
  user_id: string
  profiles: { preferred_name: string } | null
}

type PresenceState = {
  [key: string]: { user_id: string; name: string }[]
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Tiny beep using Web Audio API — no external file needed
function playJoinSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch {}
}

export default function Chat({
  user,
  displayName,
  roomSlug,
  locked,
}: {
  user: User
  displayName: string
  roomSlug: string
  locked: boolean
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [onlineUsers, setOnlineUsers] = useState<string[]>([displayName])
  const [joinNotice, setJoinNotice] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const myId = user.id
  const isFirstMount = useRef(true)

  useEffect(() => {
    // Load room ID then messages
    let roomId: string

    supabase.from('rooms').select('id').eq('name', roomSlug).single()
      .then(({ data: room }) => {
        if (!room) return
        roomId = room.id

        // Load recent messages
        supabase
          .from('room_messages')
          .select('id, content, created_at, user_id, profiles(preferred_name)')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true })
          .limit(100)
          .then(({ data }) => { if (data) setMessages(data as Message[]) })

        // Realtime: new messages
        const msgChannel = supabase
          .channel(`room-messages-${roomId}`)
          .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` },
            async (payload) => {
              const { data: profile } = await supabase
                .from('profiles')
                .select('preferred_name')
                .eq('id', payload.new.user_id)
                .single()
              setMessages(prev => [...prev, { ...payload.new, profiles: profile } as Message])
            }
          )
          .subscribe()

        // Presence: who's in the room
        const presenceChannel = supabase.channel(`room-presence-${roomId}`, {
          config: { presence: { key: myId } },
        })

        presenceChannel
          .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState() as PresenceState
            const names = Object.values(state).flat().map(p => p.name)
            setOnlineUsers(names)
          })
          .on('presence', { event: 'join' }, ({ newPresences }) => {
            if (isFirstMount.current) return // don't notify on own join
            const name = (newPresences as { name: string }[])[0]?.name
            if (name && name !== displayName) {
              playJoinSound()
              setJoinNotice(`${name} joined`)
              setTimeout(() => setJoinNotice(null), 3000)
            }
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await presenceChannel.track({ user_id: myId, name: displayName })
              isFirstMount.current = false
            }
          })

        return () => {
          supabase.removeChannel(msgChannel)
          supabase.removeChannel(presenceChannel)
        }
      })
  }, [roomSlug])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || locked) return
    const content = text.trim()
    setText('')

    // Get room id
    const { data: room } = await supabase.from('rooms').select('id').eq('name', roomSlug).single()
    if (!room) return
    await supabase.from('room_messages').insert({ content, user_id: myId, room_id: room.id })
    inputRef.current?.focus()
  }

  const grouped = messages.map((m, i) => ({
    ...m,
    isFirst: i === 0 || messages[i - 1].user_id !== m.user_id,
    isLast:  i === messages.length - 1 || messages[i + 1].user_id !== m.user_id,
    isMine:  m.user_id === myId,
  }))

  return (
    <div className="h-full flex flex-col bg-[var(--card)] rounded-2xl shadow-lg border border-[var(--border)] overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <span className="font-display font-semibold text-primary-700 dark:text-primary-300 text-sm">
            #{roomSlug}
          </span>
          {locked && (
            <span className="text-[10px] bg-primary-100 dark:bg-primary-900 text-primary-500 px-2 py-0.5 rounded-full font-display">
              🔒 Focus
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {onlineUsers.slice(0, 5).map((name, i) => (
            <span key={i} className="text-[10px] text-primary-400 font-display bg-primary-50 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
              {name}
            </span>
          ))}
          {onlineUsers.length > 5 && (
            <span className="text-[10px] text-primary-400 font-display">+{onlineUsers.length - 5}</span>
          )}
        </div>
      </div>

      {/* Join notice toast */}
      {joinNotice && (
        <div className="mx-3 mt-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs rounded-xl font-display text-center animate-pulse">
          🎉 {joinNotice}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-0.5">
        {messages.length === 0 && (
          <p className="text-xs text-primary-300 text-center mt-8 font-display">
            No messages yet. Say hi! 👋
          </p>
        )}

        {grouped.map((m) => (
          <div
            key={m.id}
            className={`flex items-end gap-2 ${m.isMine ? 'flex-row-reverse' : 'flex-row'} ${m.isFirst ? 'mt-3' : 'mt-0.5'}`}
          >
            <div className="w-7 flex-shrink-0">
              {!m.isMine && m.isLast && (
                <UserAvatar name={m.profiles?.preferred_name ?? '?'} size="sm" />
              )}
            </div>

            <div className={`flex flex-col ${m.isMine ? 'items-end' : 'items-start'} max-w-[75%]`}>
              {!m.isMine && m.isFirst && (
                <span className="text-[10px] font-semibold text-primary-500 dark:text-primary-400 mb-0.5 ml-1 font-display">
                  {m.profiles?.preferred_name ?? 'Unknown'}
                </span>
              )}
              <div className={`px-3 py-2 text-sm leading-relaxed ${
                m.isMine
                  ? 'bg-primary-600 text-white rounded-2xl rounded-br-sm'
                  : 'bg-primary-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-2xl rounded-bl-sm'
              } ${m.isFirst && !m.isMine ? 'rounded-tl-sm' : ''} ${m.isFirst && m.isMine ? 'rounded-tr-sm' : ''}`}>
                {m.content}
              </div>
              {m.isLast && (
                <span className="text-[9px] text-primary-300 mt-0.5 mx-1 font-display">
                  {formatTime(m.created_at)}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] px-3 py-3">
        {locked ? (
          <p className="text-xs text-primary-300 text-center font-display">Chat resumes on break ☕</p>
        ) : (
          <form onSubmit={sendMessage} className="flex gap-2 items-center">
            <input
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Message…"
              maxLength={500}
              className="flex-1 text-sm bg-primary-50 dark:bg-gray-700 border border-[var(--border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 dark:text-white placeholder-primary-300"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              className="w-9 h-9 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white flex items-center justify-center transition flex-shrink-0"
              aria-label="Send"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
