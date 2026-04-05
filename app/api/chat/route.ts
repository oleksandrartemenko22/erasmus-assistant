// app/api/chat/route.ts
import { runChatPipeline } from '@/lib/rag/pipeline'
import { getLLMProvider } from '@/lib/llm/index'
import { getRetriever } from '@/lib/rag/retriever'
import { createSession, insertMessage } from '@/lib/db/messages'
import { insertEscalation } from '@/lib/db/feedback'
import { z } from 'zod'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init.headers ?? {}) },
  })
}

const RequestSchema = z.object({
  question: z.string().min(1).max(2000),
  // Zod v4: uuid() moved to z.string().check(z.uuid())
  sessionId: z.string().check(z.uuid()).optional(),
  language: z.string().default('en'),
})

// Preflight handler for cross-origin widget requests
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return json({ error: parsed.error.issues }, { status: 422 })
  }

  const { question, sessionId: existingSessionId, language } = parsed.data
  const userAgent = request.headers.get('user-agent')

  const sessionId = existingSessionId ?? (await createSession(language, userAgent)).id
  await insertMessage({ session_id: sessionId, role: 'user', content: question })

  const result = await runChatPipeline({
    question,
    retriever: getRetriever(),
    llm: getLLMProvider(),
  })

  const assistantMsg = await insertMessage({
    session_id: sessionId,
    role: 'assistant',
    content: result.answer,
    retrieved_chunk_ids: result.retrievedChunkIds,
    confidence_flag: result.confidenceFlag,
    escalation_flag: result.shouldEscalate,
  })

  if (result.shouldEscalate && result.escalationReason) {
    await insertEscalation(assistantMsg.id, result.escalationReason)
  }

  return json({
    sessionId,
    messageId: assistantMsg.id,
    answer: result.answer,
    sources: result.chunks.map((c) => ({
      title: c.documentTitle,
      url: c.documentUrl,
      score: c.score,
    })),
    confidenceFlag: result.confidenceFlag,
    shouldEscalate: result.shouldEscalate,
    escalationReason: result.escalationReason,
  })
}
