// components/chat/MessageBubble.tsx
import { SourceList } from './SourceList'
import { FeedbackButtons } from './FeedbackButtons'
import { EscalationNotice } from './EscalationNotice'

interface Source {
  title: string
  url: string | null
  score: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  shouldEscalate?: boolean
  /** True while the assistant response is still streaming in */
  streaming?: boolean
}

interface Props {
  message: ChatMessage
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-700 text-white'
            : 'bg-white border border-gray-200 text-gray-800 shadow-sm'
        }`}
      >
        {message.streaming && !message.content ? (
          <p className="text-gray-400">Thinking…</p>
        ) : (
          <p className="whitespace-pre-wrap">
            {message.content}
            {message.streaming && (
              <span className="inline-block w-1.5 h-3.5 bg-current ml-0.5 opacity-75 animate-pulse" />
            )}
          </p>
        )}

        {!isUser && !message.streaming && message.sources && message.sources.length > 0 && (
          <SourceList sources={message.sources} />
        )}

        {!isUser && !message.streaming && message.shouldEscalate && <EscalationNotice />}

        {!isUser && !message.streaming && (
          <FeedbackButtons messageId={message.id} />
        )}
      </div>
    </div>
  )
}
