'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import UserAvatar from './UserAvatar'

type Message = {
  id: string; content: string; created_at: string; user_id: string; sender_name: string
}
type PresenceState = { [key: string]: { user_id: string; name: string }[] }

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function playChime(f1: number, f2: number, dur: number) {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(f1, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(f2, ctx.currentTime + dur * 0.4)
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur)
  } catch {}
}

export function playFocusStart() { playChime(523, 784, 0.5) }
export function playBreakStart() { playChime(659, 523, 0.6) }
export function playSessionEnd()  { playChime(392, 262, 0.8) }

export default function Chat({
  user, displayName, roomSlug, isSolo = false, focusLocked,
}: {
  user: User; displayName: string; roomSlug: string; isSolo?: boolean; focusLocked: boolean
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
    if (isSolo) return
    supabase.from('rooms').select('id').eq('name', roomSlug).single().then(({ data: room }) => {
      if (!room) return
      roomIdRef.current = room.id
      const rid = room.id

      supabase.from('room_messages')
        .select('id, content, created_at, user_id, profiles(preferred_name)')
        .eq('room_id', rid).order('created_at', { ascending: true }).limit(100)
        .then(({ data }) => {
          if (data) setMessages(data.map(m => {
            const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles as { preferred_name: string } | null
            return { id: m.id, content: m.content, created_at: m.created_at, user_id: m.user_id, sender_name: p?.preferred_name ?? 'Unknown' }
          }))
        })

      const msgCh = supabase.channel(`msg-${rid}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${rid}` },
          async (payload) => {
            const { data: profile } = await supabase.from('profiles').select('preferred_name').eq('id', payload.new.user_id).single()
            setMessages(prev => [...prev, {
              id: payload.new.id, content: payload.new.content, created_at: payload.new.created_at,
              user_id: payload.new.user_id,
              sender_name: (profile as { preferred_name: string } | null)?.preferred_name ?? 'Unknown',
            }])
          }).subscribe()

      const presCh = supabase.channel(`pres-${rid}`, { config: { presence: { key: myId } } })
        .on('presence', { event: 'sync' }, () => {
          const state = presCh.presenceState() as PresenceState
          setOnlineUsers(Object.values(state).flat().map(p => p.name))
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
          if (isFirstMount.current) return
          const name = (newPresences as unknown as { name: string }[])[0]?.name
          if (name && name !== displayName) {
            playChime(880, 1046, 0.3)
            setJoinNotice(`${name} joined`)
            setTimeout(() => setJoinNotice(null), 3000)
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') { await presCh.track({ user_id: myId, name: displayName }); isFirstMount.current = false }
        })

      return () => { supabase.removeChannel(msgCh); supabase.removeChannel(presCh) }
    })
  }, [roomSlug, isSolo])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim()
    if (!content || focusLocked) return
    setText('')
    if (isSolo) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), content, created_at: new Date().toISOString(), user_id: myId, sender_name: displayName }])
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

  const grouped = messages.map((m, i) => ({
    ...m,
    isFirst: i === 0 || messages[i - 1].user_id !== m.user_id,
    isLast:  i === messages.length - 1 || messages[i + 1].user_id !== m.user_id,
    isMine:  m.user_id === myId,
  }))

  return (
    <div className="h-full flex flex-col glass rounded-card overflow-hidden" style={{ boxShadow: 'var(--shadow-md)' }}>

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>
            {isSolo ? 'Notes' : `#${roomSlug}`}
          </span>
          {focusLocked && !isSolo && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: 'var(--bg)', color: 'var(--fg-2)' }}>
              Focus
            </span>
          )}
        </div>
        {!isSolo && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="text-[11px]" style={{ color: 'var(--fg-2)' }}>{onlineUsers.length} online</span>
          </div>
        )}
      </div>

      {/* Join notice */}
      {joinNotice && (
        <div className="mx-3 mt-2 px-3 py-1.5 rounded-xl text-[11px] text-center font-medium"
          style={{ background: 'var(--bg)', color: 'var(--fg-2)' }}>
          {joinNotice}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-0.5">
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center mt-8">
            <p className="text-[12px] text-center" style={{ color: 'var(--fg-2)' }}>
              {isSolo ? 'Jot down thoughts while you focus.' : 'No messages yet.'}
            </p>
          </div>
        )}
        {grouped.map((m) => (
          <div key={m.id} className={`flex items-end gap-1.5 ${m.isMine ? 'flex-row-reverse' : 'flex-row'} ${m.isFirst ? 'mt-4' : 'mt-[2px]'}`}>
            <div className="w-6 flex-shrink-0 mb-0.5">
              {!m.isMine && m.isLast && <UserAvatar name={m.sender_name} size="sm" />}
            </div>
            <div className={`flex flex-col gap-0.5 ${m.isMine ? 'items-end' : 'items-start'} max-w-[78%]`}>
              {!m.isMine && m.isFirst && (
                <span className="text-[10px] font-semibold ml-2" style={{ color: 'var(--fg-2)' }}>{m.sender_name}</span>
              )}
              <div className={`px-3 py-[7px] text-[13px] leading-[1.45] break-words ${
                m.isMine
                  ? 'text-white'
                  : ''
              }`} style={{
                background: m.isMine ? 'var(--accent)' : 'var(--bg)',
                color: m.isMine ? '#fff' : 'var(--fg)',
                borderRadius: m.isMine
                  ? (m.isFirst && m.isLast ? '18px 18px 4px 18px' : m.isFirst ? '18px 18px 4px 18px' : m.isLast ? '4px 18px 18px 18px' : '4px 18px 18px 4px')
                  : (m.isFirst && m.isLast ? '18px 18px 18px 4px' : m.isFirst ? '4px 18px 18px 4px' : m.isLast ? '4px 18px 18px 18px' : '4px 18px 18px 4px'),
              }}>
                {m.content}
              </div>
              {m.isLast && (
                <span className="text-[9px] mx-2" style={{ color: 'var(--fg-2)' }}>{formatTime(m.created_at)}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t relative" style={{ borderColor: 'var(--border)' }}>
        {/* Focus lock overlay */}
        {focusLocked && !isSolo && (
          <div className="absolute inset-0 flex items-center justify-center rounded-b-card"
            style={{ background: 'var(--card)', backdropFilter: 'blur(8px)' }}>
            <p className="text-[12px] font-medium" style={{ color: 'var(--fg-2)' }}>
              Chat available during break
            </p>
          </div>
        )}
        <form onSubmit={sendMessage} className="flex gap-2 items-center">
          <input ref={inputRef} value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !focusLocked) { e.preventDefault(); sendMessage(e) } }}
            placeholder="Message" maxLength={500} disabled={focusLocked && !isSolo}
            className="flex-1 text-[13px] px-3 py-2 rounded-xl outline-none transition-all"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <button type="submit" disabled={!text.trim() || (focusLocked && !isSolo)}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 disabled:opacity-30 flex-shrink-0"
            style={{ background: 'var(--accent)' }} aria-label="Send">
            <svg className="w-3.5 h-3.5 text-white translate-x-[1px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
