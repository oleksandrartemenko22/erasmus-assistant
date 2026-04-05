'use client'

import { useState, useRef, useEffect, FormEvent } from 'react'
import { MessageBubble } from '@/components/chat/MessageBubble'
import type { ChatMessage } from '@/components/chat/MessageBubble'

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, sessionId: sessionId ?? undefined, language: 'en' }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Server error')
      }

      const data = await res.json() as {
        sessionId: string
        messageId: string
        answer: string
        sources: Array<{ title: string; url: string | null; score: number }>
        shouldEscalate: boolean
      }

      if (!sessionId) setSessionId(data.sessionId)

      const assistantMsg: ChatMessage = {
        id: data.messageId,
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        shouldEscalate: data.shouldEscalate,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      const assistantMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again or contact the International Relations Office.',
        shouldEscalate: true,
      }
      setMessages((prev) => [...prev, assistantMsg])
      console.error(err)
    } finally {
      setLoading(false)
    }
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

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm text-sm text-gray-400">
                Thinking…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
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
