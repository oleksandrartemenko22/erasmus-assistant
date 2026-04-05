// app/api/chat/route.ts
import { buildGroundedPrompt, buildSystemPrompt } from '@/lib/prompts/grounding'
import { classifyResponse } from '@/lib/rag/safety'
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

const HistoryItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(4000),
})

const RequestSchema = z.object({
  question: z.string().min(1).max(2000),
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
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid JSON', 400)
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(JSON.stringify(parsed.error.issues), 422)
  }

  const { question, sessionId: existingSessionId, language, history } = parsed.data
  const userAgent = request.headers.get('user-agent')

  const sessionId = existingSessionId ?? (await createSession(language, userAgent)).id
  await insertMessage({ session_id: sessionId, role: 'user', content: question })

  const retriever = getRetriever()
  const llm = getLLMProvider()

  // Retrieve relevant chunks (non-streaming, happens before we open the stream)
  const chunks = await retriever.retrieve(question, { topK: 8, minScore: 0.5 })
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
