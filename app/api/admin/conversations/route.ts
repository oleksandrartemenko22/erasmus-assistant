// app/api/admin/conversations/route.ts
import { db } from '@/lib/db/client'

function isAuthorized(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  return request.headers.get('x-admin-secret') === secret
}

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  escalation_flag: boolean
  created_at: string
  feedback: 'helpful' | 'not_helpful' | null
}

export interface ConversationSession {
  id: string
  language: string
  created_at: string
  messages: ConversationMessage[]
  helpfulCount: number
  notHelpfulCount: number
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch last 20 sessions
  const { data: sessions, error: sessionsError } = await db
    .from('chat_sessions')
    .select('id, language, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (sessionsError) return Response.json({ error: sessionsError.message }, { status: 500 })
  if (!sessions || sessions.length === 0) return Response.json([])

  const sessionIds = sessions.map((s: { id: string }) => s.id)

  // Fetch all messages for those sessions in one query
  const { data: messages, error: messagesError } = await db
    .from('messages')
    .select('id, session_id, role, content, escalation_flag, created_at')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: true })

  if (messagesError) return Response.json({ error: messagesError.message }, { status: 500 })

  const messageIds = (messages ?? [])
    .filter((m: { role: string }) => m.role === 'assistant')
    .map((m: { id: string }) => m.id)

  // Fetch feedback for all assistant messages
  const { data: feedbackRows } = messageIds.length > 0
    ? await db.from('feedback').select('message_id, rating').in('message_id', messageIds)
    : { data: [] }

  const feedbackByMessageId = new Map<string, 'helpful' | 'not_helpful'>()
  for (const row of feedbackRows ?? []) {
    feedbackByMessageId.set(row.message_id, row.rating)
  }

  // Group messages by session and attach feedback
  const messagesBySession = new Map<string, ConversationMessage[]>()
  for (const m of messages ?? []) {
    if (!messagesBySession.has(m.session_id)) messagesBySession.set(m.session_id, [])
    messagesBySession.get(m.session_id)!.push({
      id: m.id,
      role: m.role,
      content: m.content,
      escalation_flag: m.escalation_flag,
      created_at: m.created_at,
      feedback: feedbackByMessageId.get(m.id) ?? null,
    })
  }

  const result: ConversationSession[] = sessions.map((s: { id: string; language: string; created_at: string }) => {
    const msgs = messagesBySession.get(s.id) ?? []
    const helpfulCount = msgs.filter((m) => m.feedback === 'helpful').length
    const notHelpfulCount = msgs.filter((m) => m.feedback === 'not_helpful').length
    return {
      id: s.id,
      language: s.language,
      created_at: s.created_at,
      messages: msgs,
      helpfulCount,
      notHelpfulCount,
    }
  })

  return Response.json(result)
}
