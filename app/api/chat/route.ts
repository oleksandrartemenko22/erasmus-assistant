// app/api/chat/route.ts
import { buildGroundedPrompt, buildSystemPrompt } from '@/lib/prompts/grounding'
import { classifyResponse } from '@/lib/rag/safety'
import { buildSearchQuery } from '@/lib/rag/pipeline'
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

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, {
    status,
    headers: CORS_HEADERS,
  })
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60 * 60 * 1000  // 1 hour

interface RateEntry { count: number; resetTime: number }
const rateLimitStore = new Map<string, RateEntry>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(ip)

  if (!entry || now >= entry.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_WINDOW_MS })
    return true
  }

  if (entry.count >= RATE_LIMIT) return false

  entry.count++
  return true
}

const HistoryItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(4000),
})

const RequestSchema = z.object({
  question: z.string().min(1).max(500),
  // Zod v4: uuid() moved to z.string().check(z.uuid())
  sessionId: z.string().check(z.uuid()).optional(),
  language: z.string().default('en'),
  history: z.array(HistoryItemSchema).max(20).default([]),
})

// Preflight handler for cross-origin widget requests
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  if (!checkRateLimit(ip)) {
    return errorResponse(
      'You have reached the limit of 20 questions per hour. Please try again in an hour.',
      429,
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid JSON', 400)
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    // Surface the message-length violation with a friendlier message
    const tooLong = parsed.error.issues.some(
      (i) => i.path[0] === 'question' && i.code === 'too_big',
    )
    if (tooLong) {
      return errorResponse(
        'Message too long. Please keep your question under 500 characters.',
        400,
      )
    }
    return errorResponse(JSON.stringify(parsed.error.issues), 422)
  }

  const { question, sessionId: existingSessionId, language, history } = parsed.data
  const userAgent = request.headers.get('user-agent')

  const sessionId = existingSessionId ?? (await createSession(language, userAgent)).id
  await insertMessage({ session_id: sessionId, role: 'user', content: question })

  const retriever = getRetriever()
  const llm = getLLMProvider()

  // Build a context-aware search query from the conversation history, then retrieve
  const searchQuery = await buildSearchQuery(question, history, llm)
  console.log('[chat] search query:', searchQuery)
  const chunks = await retriever.retrieve(searchQuery, { topK: 8, minScore: 0.45 })
  const userMessage = buildGroundedPrompt({ question, chunks })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))

      let fullAnswer = ''

      try {
        const gen = llm.completeStream({
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            ...history,
            { role: 'user', content: userMessage },
          ],
          temperature: 0.2,
          maxTokens: 2000,
        })

        for await (const delta of gen) {
          fullAnswer += delta
          send({ type: 'delta', content: delta })
        }

        // Classify safety / confidence after full answer is received
        const classification = classifyResponse({
          chunks: chunks.map((c) => ({ score: c.score, content: c.content })),
          answer: fullAnswer,
        })

        // Persist assistant message
        const assistantMsg = await insertMessage({
          session_id: sessionId,
          role: 'assistant',
          content: fullAnswer,
          retrieved_chunk_ids: chunks.map((c) => c.chunkId),
          confidence_flag: classification.confidenceFlag,
          escalation_flag: classification.shouldEscalate,
        })

        if (classification.shouldEscalate && classification.reason) {
          await insertEscalation(assistantMsg.id, classification.reason)
        }

        send({
          type: 'done',
          sessionId,
          messageId: assistantMsg.id,
          sources: chunks.map((c) => ({
            title: c.documentTitle,
            url: c.documentUrl,
            score: c.score,
          })),
          shouldEscalate: classification.shouldEscalate,
          escalationReason: classification.reason,
        })
      } catch {
        send({ type: 'error', message: 'Stream failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
    },
  })
}
