// components/chat/FeedbackButtons.tsx
'use client'

import { useState } from 'react'

interface Props {
  messageId: string
}

export function FeedbackButtons({ messageId }: Props) {
  const [submitted, setSubmitted] = useState<'helpful' | 'not_helpful' | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(rating: 'helpful' | 'not_helpful') {
    if (submitted || loading) return
    setLoading(true)
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, rating }),
      })
      setSubmitted(rating)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <p className="mt-2 text-xs text-gray-400">
        {submitted === 'helpful' ? 'Thank you for your feedback.' : 'Thanks — we\'ll use this to improve.'}
      </p>
    )
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-xs text-gray-400">Was this helpful?</span>
      <button
        onClick={() => submit('helpful')}
        disabled={loading}
        className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-green-50 hover:border-green-400 disabled:opacity-50 transition-colors"
      >
        Yes
      </button>
      <button
        onClick={() => submit('not_helpful')}
        disabled={loading}
        className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-red-50 hover:border-red-400 disabled:opacity-50 transition-colors"
      >
        No
      </button>
    </div>
  )
}
