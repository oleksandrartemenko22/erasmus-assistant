// app/api/feedback/route.ts
import { insertFeedback } from '@/lib/db/feedback'
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
  messageId: z.string().check(z.uuid()),
  rating: z.enum(['helpful', 'not_helpful']),
})

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

  const feedback = await insertFeedback(parsed.data.messageId, parsed.data.rating)
  return json({ id: feedback.id }, { status: 201 })
}
