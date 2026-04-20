'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageBubble } from '@/components/chat/MessageBubble'
import type { ChatMessage } from '@/components/chat/MessageBubble'

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Ref on the last assistant message; used to scroll it into view from the top
  const lastAssistantRef = useRef<HTMLDivElement>(null)
  const prevAssistantCountRef = useRef(0)

  useEffect(() => {
    const count = messages.filter((m) => m.role === 'assistant').length
    if (count > prevAssistantCountRef.current) {
      prevAssistantCountRef.current = count
      lastAssistantRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [messages])

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    // Build history from settled messages (max 20 turns)
    const history = messages
      .filter((m) => !m.streaming)
      .slice(-20)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    }

    const streamingId = `stream-${Date.now()}`
    const placeholder: ChatMessage = {
      id: streamingId,
      role: 'assistant',
      content: '',
      streaming: true,
    }

    setMessages((prev) => [...prev, userMsg, placeholder])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          sessionId: sessionId ?? undefined,
          language: 'en',
          history,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(errData.error ?? 'Server error')
      }
      if (!res.body) throw new Error('Server error')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      type DoneEvent = {
        sessionId: string
        messageId: string
        sources: Array<{ title: string; url: string | null; score: number }>
        shouldEscalate: boolean
        escalationReason: string | null
      }
      let doneEvent: DoneEvent | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          let event: { type: string; [k: string]: unknown }
          try {
            event = JSON.parse(line)
          } catch {
            continue
          }

          if (event.type === 'delta') {
            const content = event.content as string
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamingId ? { ...m, content: m.content + content } : m,
              ),
            )
          } else if (event.type === 'done') {
            doneEvent = event as unknown as DoneEvent
          }
        }
      }

      if (doneEvent) {
        if (!sessionId) setSessionId(doneEvent.sessionId)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingId
              ? {
                  ...m,
                  id: doneEvent!.messageId,
                  sources: doneEvent!.sources,
                  shouldEscalate: doneEvent!.shouldEscalate,
                  streaming: false,
                }
              : m,
          ),
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sorry, something went wrong.'
      const isRateLimit = msg.includes('limit of 20 questions')
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId
            ? {
                ...m,
                content: isRateLimit
                  ? msg
                  : 'Sorry, something went wrong. Please try again or contact the International Relations Office.',
                shouldEscalate: !isRateLimit,
                streaming: false,
              }
            : m,
        ),
      )
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Find the index of the last assistant message to attach the scroll ref
  let lastAssistantIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') { lastAssistantIdx = i; break }
  }

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 shadow-sm">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-lg font-semibold text-gray-900">Erasmus Incoming Assistant</h1>
          <p className="text-xs text-gray-500 mt-0.5">University of Maribor · International Relations Office</p>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 text-sm pt-12">
              <p className="text-2xl mb-3">👋</p>
              <p>Ask a question about your Erasmus exchange at the University of Maribor.</p>
              <p className="mt-1 text-xs">Examples: deadlines, housing, learning agreement, registration.</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={msg.id} ref={i === lastAssistantIdx ? lastAssistantRef : undefined}>
              <MessageBubble message={msg} />
            </div>
          ))}
        </div>
      </main>

      {/* Input */}
      <footer className="bg-white border-t border-gray-200 px-4 py-3">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  )
}
