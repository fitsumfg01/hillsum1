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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function playChime(f1: number, f2: number, dur: number) {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
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
  user: User
  displayName: string
  roomSlug: string
  isSolo?: boolean
  focusLocked: boolean
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [joinNotice, setJoinNotice] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const myId = user.id
  const isGuest = myId === 'guest'
  const roomIdRef = useRef<string | null>(null)
  const isFirstMount = useRef(true)

  useEffect(() => {
    if (isSolo) return

    const supabase = createClient()
    let historyLoaded = false

    // Use broadcast channel — works for guests too (no RLS restriction)
    const ch = supabase.channel(`chat:${roomSlug}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'message' }, ({ payload }: { payload: Message }) => {
        setMessages(prev => prev.some(m => m.id === payload.id) ? prev : [...prev, payload])
        // Notify if tab is not focused
        if (document.visibilityState !== 'visible' && Notification.permission === 'granted') {
          new Notification(payload.sender_name, { body: payload.content, silent: false })
        }
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED' || historyLoaded) return
        historyLoaded = true

        // Load history via rooms table (guests can read)
        const { data: room } = await supabase.from('rooms').select('id').eq('name', roomSlug).single()
        if (!room) return
        roomIdRef.current = room.id
        const { data } = await supabase.from('room_messages')
          .select('id, content, created_at, user_id, sender_name')
          .eq('room_id', room.id)
          .order('created_at', { ascending: true })
          .limit(200)
        if (data) setMessages(data as Message[])
      })

    return () => { supabase.removeChannel(ch) }
  }, [roomSlug, isSolo])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim()
    if (!content || focusLocked) return
    setText('')
    if (inputRef.current) { inputRef.current.style.height = 'auto' }

    if (isSolo) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), content,
        created_at: new Date().toISOString(),
        user_id: myId, sender_name: displayName,
      }])
      return
    }

    const msg: Message = {
      id: crypto.randomUUID(),
      content,
      created_at: new Date().toISOString(),
      user_id: myId,
      sender_name: displayName,
    }

    // Optimistic local add
    setMessages(prev => [...prev, msg])

    // Broadcast to all clients (works for guests — no auth required)
    const supabase = createClient()
    await supabase.channel(`chat:${roomSlug}`).send({
      type: 'broadcast', event: 'message', payload: msg,
    })

    // Persist to DB (skip for guests — no valid user_id for RLS)
    if (myId !== 'guest') {
      if (!roomIdRef.current) {
        const { data: room } = await supabase.from('rooms').select('id').eq('name', roomSlug).single()
        if (room) roomIdRef.current = room.id
      }
      if (roomIdRef.current) {
        await supabase.from('room_messages').insert({
          id: msg.id, content, user_id: myId,
          room_id: roomIdRef.current, sender_name: displayName,
        })
      }
    }

    inputRef.current?.focus()
  }

  const grouped = messages.map((m, i) => {
    const key = (id: string, name: string) => id === 'guest' ? `guest:${name}` : id
    return {
      ...m,
      isFirst: i === 0 || key(messages[i - 1].user_id, messages[i - 1].sender_name) !== key(m.user_id, m.sender_name),
      isLast:  i === messages.length - 1 || key(messages[i + 1].user_id, messages[i + 1].sender_name) !== key(m.user_id, m.sender_name),
      isMine:  m.user_id === myId && !(isGuest && m.sender_name !== displayName),
      isGuest: m.user_id === 'guest',
    }
  })

  return (
    <div className="h-full flex flex-col glass rounded-card overflow-hidden" style={{ boxShadow: 'var(--shadow-md)' }}>

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>
            {isSolo ? `${displayName}'s space` : `#${roomSlug}`}
          </span>
          {focusLocked && !isSolo && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: 'var(--bg)', color: 'var(--fg-2)' }}>
              Focus
            </span>
          )}
        </div>
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
          <p className="text-[12px] text-center mt-8" style={{ color: 'var(--fg-2)' }}>
            {isSolo ? 'Jot down thoughts while you focus.' : 'No messages yet.'}
          </p>
        )}
        {grouped.map((m) => (
          <div key={m.id}
            className={`flex items-end gap-1.5 ${m.isMine ? 'flex-row-reverse' : 'flex-row'} ${m.isFirst ? 'mt-4' : 'mt-[2px]'}`}>
            <div className="w-6 flex-shrink-0 mb-0.5">
              {!m.isMine && m.isLast && <UserAvatar name={m.sender_name} size="sm" />}
            </div>
            <div className={`flex flex-col gap-0.5 ${m.isMine ? 'items-end' : 'items-start'} max-w-[78%]`}>
              {!m.isMine && m.isFirst && (
                <span className="text-[10px] font-semibold ml-2 flex items-center gap-1" style={{ color: 'var(--fg-2)' }}>
                  {m.sender_name}
                  {m.isGuest && (
                    <span className="text-[9px] px-1 py-px rounded-full font-medium"
                      style={{ background: 'var(--bg)', color: 'var(--fg-2)', border: '1px solid var(--border)' }}>
                      guest
                    </span>
                  )}
                </span>
              )}
              <div className="px-3 py-[7px] text-[13px] leading-[1.45] break-words" style={{
                background: m.isMine ? 'var(--accent)' : 'var(--bg)',
                color: m.isMine ? '#fff' : 'var(--fg)',
                borderRadius: m.isMine
                  ? (m.isFirst ? '18px 18px 4px 18px' : m.isLast ? '4px 18px 18px 18px' : '4px 18px 18px 4px')
                  : (m.isFirst ? '4px 18px 18px 4px' : m.isLast ? '4px 18px 18px 18px' : '4px 18px 18px 4px'),
              }}>
                {m.content}
              </div>
              {m.isLast && (
                <span className="text-[9px] mx-2" style={{ color: 'var(--fg-2)' }}>
                  {formatTime(m.created_at)}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t relative" style={{ borderColor: 'var(--border)' }}>
        {focusLocked && !isSolo && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'var(--card)', backdropFilter: 'blur(8px)', borderRadius: '0 0 18px 18px' }}>
            <p className="text-[12px] font-medium" style={{ color: 'var(--fg-2)' }}>
              Chat available during break
            </p>
          </div>
        )}
        <form onSubmit={sendMessage} className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e as any) }
            }}
            placeholder="Message"
            maxLength={500}
            rows={1}
            disabled={focusLocked && !isSolo}
            autoComplete="off"
            className="flex-1 text-[13px] px-3 py-2 rounded-xl outline-none transition-all resize-none"
            style={{
              background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)',
              maxHeight: '96px', overflowY: 'auto',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 96) + 'px'
            }}
          />
          <button
            type="submit"
            disabled={!text.trim() || (focusLocked && !isSolo)}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 disabled:opacity-30 flex-shrink-0"
            style={{ background: 'var(--accent)' }}
            aria-label="Send"
          >
            <svg className="w-3.5 h-3.5 text-white translate-x-[1px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
