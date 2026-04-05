// app/api/ingest/route.ts
// Admin-only: upload a file, extract text, chunk it, embed chunks, store in DB.

import { extractText } from '@/lib/ingest/extract'
import { chunkText } from '@/lib/rag/chunker'
import { getLLMProvider } from '@/lib/llm/index'
import { insertDocument, insertChunks } from '@/lib/db/documents'
import { db } from '@/lib/db/client'
import { z } from 'zod'

const CHUNK_SIZE = 512
const CHUNK_OVERLAP = 64

function isAuthorized(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  return request.headers.get('x-admin-secret') === secret
}

const MetaSchema = z.object({
  title: z.string().min(1),
  language: z.string().default('en'),
  topic: z.string().optional(),
  faculty: z.string().optional(),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
  original_url: z.string().url().optional(),
})

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return Response.json({ error: 'Expected multipart/form-data' }, { status: 415 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const metaRaw = formData.get('meta')

  if (!(file instanceof File)) {
    return Response.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const metaParsed = MetaSchema.safeParse(
    metaRaw ? JSON.parse(metaRaw as string) : {}
  )
  if (!metaParsed.success) {
    return Response.json({ error: metaParsed.error.flatten() }, { status: 422 })
  }
  const meta = metaParsed.data

  // Determine source type from MIME
  const mimeToType: Record<string, 'pdf' | 'txt' | 'docx'> = {
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  }
  const sourceType = mimeToType[file.type]
  if (!sourceType) {
    return Response.json({ error: `Unsupported file type: ${file.type}` }, { status: 415 })
  }

  // Upload raw file to Supabase Storage
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const storagePath = `documents/${Date.now()}-${file.name}`
  const { error: uploadError } = await db.storage
    .from('documents')
    .upload(storagePath, buffer, { contentType: file.type })
  if (uploadError) {
    return Response.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })
  }

  // Extract text
  const rawText = await extractText(buffer, file.type)

  // Create document record
  const doc = await insertDocument({
    title: meta.title,
    source_type: sourceType,
    original_url: meta.original_url ?? null,
    language: meta.language,
    topic: meta.topic ?? null,
    faculty: meta.faculty ?? null,
    valid_from: meta.valid_from ?? null,
    valid_to: meta.valid_to ?? null,
    is_active: true,
    version: 1,
    storage_path: storagePath,
  })

  // Chunk text
  const textChunks = chunkText(rawText, { chunkSize: CHUNK_SIZE, overlap: CHUNK_OVERLAP })

  // Embed and collect chunks
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

  return Response.json(
    { documentId: doc.id, chunksCreated: chunkRows.length },
    { status: 201 }
  )
}
