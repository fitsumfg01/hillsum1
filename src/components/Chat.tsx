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
  sender_name: string
}

type PresenceState = {
  [key: string]: { user_id: string; name: string }[]
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function playChime(freq1: number, freq2: number, duration: number) {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(freq1, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(freq2, ctx.currentTime + duration * 0.4)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
  } catch {}
}

export function playFocusStart() { playChime(523, 784, 0.5) }   // C5 → G5
export function playBreakStart() { playChime(659, 523, 0.6) }   // E5 → C5
export function playSessionEnd()  { playChime(392, 262, 0.8) }  // G4 → C4 (lower, final)

function playJoinChime() { playChime(880, 1046, 0.3) }

export default function Chat({
  user,
  displayName,
  roomSlug,
  isSolo = false,
  focusLocked,
}: {
  user: User
  displayName: string
  roomSlug: string
  isSolo?: boolean
  focusLocked: boolean
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
  const roomIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (isSolo) return // solo: no DB, no presence

    supabase.from('rooms').select('id').eq('name', roomSlug).single()
      .then(({ data: room }) => {
        if (!room) return
        roomIdRef.current = room.id
        const roomId = room.id

        supabase
          .from('room_messages')
          .select('id, content, created_at, user_id, profiles(preferred_name)')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true })
          .limit(100)
          .then(({ data }) => {
            if (data) setMessages(data.map(m => {
              const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles as { preferred_name: string } | null
              return { id: m.id, content: m.content, created_at: m.created_at, user_id: m.user_id, sender_name: p?.preferred_name ?? 'Unknown' }
            }))
          })

        const msgChannel = supabase
          .channel(`room-msg-${roomId}`)
          .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` },
            async (payload) => {
              const { data: profile } = await supabase.from('profiles').select('preferred_name').eq('id', payload.new.user_id).single()
              const msg: Message = {
                id: payload.new.id,
                content: payload.new.content,
                created_at: payload.new.created_at,
                user_id: payload.new.user_id,
                sender_name: (profile as { preferred_name: string } | null)?.preferred_name ?? 'Unknown',
              }
              setMessages(prev => [...prev, msg])
            }
          )
          .subscribe()

        const presenceChannel = supabase.channel(`room-presence-${roomId}`, {
          config: { presence: { key: myId } },
        })
        presenceChannel
          .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState() as PresenceState
            setOnlineUsers(Object.values(state).flat().map(p => p.name))
          })
          .on('presence', { event: 'join' }, ({ newPresences }) => {
            if (isFirstMount.current) return
            const name = (newPresences as unknown as { name: string }[])[0]?.name
            if (name && name !== displayName) {
              playJoinChime()
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
  }, [roomSlug, isSolo])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim()
    if (!content) return
    setText('')

    if (isSolo) {
      // Local-only message for solo mode
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        content,
        created_at: new Date().toISOString(),
        user_id: myId,
        sender_name: displayName,
      }])
      return
    }

    if (!roomIdRef.current) {
      const { data: room } = await supabase.from('rooms').select('id').eq('name', roomSlug).single()
      if (!room) return
      roomIdRef.current = room.id
    }
    await supabase.from('room_messages').insert({ content, user_id: myId, room_id: roomIdRef.current })
    inputRef.current?.focus()
  }

  // Group consecutive messages from same sender
  const grouped = messages.map((m, i) => ({
    ...m,
    isFirst: i === 0 || messages[i - 1].user_id !== m.user_id,
    isLast:  i === messages.length - 1 || messages[i + 1].user_id !== m.user_id,
    isMine:  m.user_id === myId,
  }))

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{
      background: 'var(--card)',
      borderRadius: '20px',
      border: '1px solid var(--border)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
    }}>

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-display font-semibold text-[13px] text-primary-700 dark:text-primary-300 tracking-tight">
            {isSolo ? '🎧 Solo notes' : `#${roomSlug}`}
          </span>
          {focusLocked && !isSolo && (
            <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full font-display font-medium">
              Focus mode
            </span>
          )}
        </div>
        {!isSolo && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            <span className="text-[10px] text-primary-400 font-display">
              {onlineUsers.length} online
            </span>
            {onlineUsers.slice(0, 4).map((name, i) => (
              <span key={i} className="text-[10px] text-primary-500 dark:text-primary-400 font-display bg-primary-50 dark:bg-primary-900/40 px-1.5 py-0.5 rounded-full">
                {name.split(' ')[0]}
              </span>
            ))}
            {onlineUsers.length > 4 && <span className="text-[10px] text-primary-400">+{onlineUsers.length - 4}</span>}
          </div>
        )}
      </div>

      {/* Join toast */}
      {joinNotice && (
        <div className="mx-3 mt-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[11px] rounded-xl font-display text-center">
          🎉 {joinNotice}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-0.5 scroll-smooth">
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[12px] text-primary-300 font-display text-center leading-relaxed">
              {isSolo ? 'Jot down thoughts\nwhile you focus ✍️' : 'No messages yet\nSay hi! 👋'}
            </p>
          </div>
        )}

        {grouped.map((m) => (
          <div key={m.id} className={`flex items-end gap-1.5 ${m.isMine ? 'flex-row-reverse' : 'flex-row'} ${m.isFirst ? 'mt-4' : 'mt-[2px]'}`}>
            {/* Avatar slot */}
            <div className="w-6 flex-shrink-0 mb-0.5">
              {!m.isMine && m.isLast && <UserAvatar name={m.sender_name} size="sm" />}
            </div>

            <div className={`flex flex-col gap-0.5 ${m.isMine ? 'items-end' : 'items-start'} max-w-[78%]`}>
              {!m.isMine && m.isFirst && (
                <span className="text-[10px] font-semibold text-primary-500 dark:text-primary-400 ml-2 font-display">
                  {m.sender_name}
                </span>
              )}

              <div className={`px-3 py-[7px] text-[13px] leading-[1.45] break-words ${
                m.isMine
                  ? 'bg-primary-600 text-white'
                  : 'bg-primary-50 dark:bg-white/8 text-gray-800 dark:text-gray-100'
              } ${
                // Telegram-style bubble shaping
                m.isMine
                  ? m.isFirst && m.isLast ? 'rounded-[18px] rounded-br-[4px]'
                  : m.isFirst ? 'rounded-[18px] rounded-br-[4px] rounded-bl-[18px]'
                  : m.isLast  ? 'rounded-[4px] rounded-br-[18px] rounded-bl-[18px]'
                  : 'rounded-[4px]'
                  : m.isFirst && m.isLast ? 'rounded-[18px] rounded-bl-[4px]'
                  : m.isFirst ? 'rounded-[18px] rounded-bl-[4px]'
                  : m.isLast  ? 'rounded-[4px] rounded-br-[18px] rounded-bl-[18px]'
                  : 'rounded-[4px]'
              }`}>
                {m.content}
              </div>

              {m.isLast && (
                <span className="text-[9px] text-primary-300 mx-2 font-display">
                  {formatTime(m.created_at)}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input — always enabled */}
      <div className="px-3 py-3 border-t border-[var(--border)]">
        <form onSubmit={sendMessage} className="flex gap-2 items-center">
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e) } }}
            placeholder={focusLocked && !isSolo ? 'Chatting during focus…' : 'Message…'}
            maxLength={500}
            className="flex-1 text-[13px] bg-primary-50 dark:bg-white/6 border border-[var(--border)] rounded-[14px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:text-white placeholder-primary-300 transition"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="w-8 h-8 rounded-full bg-primary-600 hover:bg-primary-700 active:scale-90 disabled:opacity-30 text-white flex items-center justify-center transition-all flex-shrink-0"
            aria-label="Send"
          >
            <svg className="w-3.5 h-3.5 translate-x-[1px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
