// app/api/ingest/url/route.ts
// Admin-only: fetch a public URL, extract text, chunk, embed, and store.

import { extractTextFromHtml } from '@/lib/ingest/extract'
import { chunkText } from '@/lib/rag/chunker'
import { getLLMProvider } from '@/lib/llm/index'
import { insertDocument, insertChunks } from '@/lib/db/documents'
import { z } from 'zod'

const CHUNK_SIZE = 512
const CHUNK_OVERLAP = 64
const MAX_CHARS = 50_000

function isAuthorized(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  return request.headers.get('x-admin-secret') === secret
}

const RequestSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  language: z.string().default('en'),
  topic: z.string().optional(),
  faculty: z.string().optional(),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
})

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { url, title, language, topic, faculty, valid_from, valid_to } = parsed.data

  // Fetch the page
  let html: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ErasmusAssistantBot/1.0' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      return Response.json(
        { error: 'Could not fetch URL. Check that the page is publicly accessible.' },
        { status: 422 }
      )
    }
    html = await res.text()
  } catch {
    return Response.json(
      { error: 'Could not fetch URL. Check that the page is publicly accessible.' },
      { status: 422 }
    )
  }

  const rawText = extractTextFromHtml(html, MAX_CHARS)
  if (!rawText.trim()) {
    return Response.json({ error: 'No readable text found at the given URL.' }, { status: 422 })
  }

  // Create document record
  const doc = await insertDocument({
    title,
    source_type: 'webpage',
    original_url: url,
    language,
    topic: topic ?? null,
    faculty: faculty ?? null,
    valid_from: valid_from ?? null,
    valid_to: valid_to ?? null,
    is_active: true,
    version: 1,
    storage_path: null,
  })

  // Chunk → embed → store
  const textChunks = chunkText(rawText, { chunkSize: CHUNK_SIZE, overlap: CHUNK_OVERLAP })
  const llm = getLLMProvider()
  const chunkRows = await Promise.all(
    textChunks.map(async (chunk) => ({
      document_id: doc.id,
      chunk_index: chunk.index,
      content: chunk.content,
      token_count: chunk.tokenCount,
      embedding: await llm.embed(chunk.content),
    }))
  )

  await insertChunks(chunkRows)

  return Response.json({ documentId: doc.id, chunksCreated: chunkRows.length }, { status: 201 })
}
