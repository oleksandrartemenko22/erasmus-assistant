// app/api/documents/route.ts
// Admin-only: list documents and upload new ones.
// Auth is checked via ADMIN_SECRET header — replace with proper session auth later.

import { listDocuments, insertDocument, setDocumentActive } from '@/lib/db/documents'
import { z } from 'zod'

function isAuthorized(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  return request.headers.get('x-admin-secret') === secret
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const documents = await listDocuments()
  return Response.json(documents)
}

const InsertSchema = z.object({
  title: z.string().min(1),
  source_type: z.enum(['pdf', 'txt', 'docx', 'faq', 'webpage']),
  original_url: z.string().url().nullable().optional(),
  language: z.string().default('en'),
  topic: z.string().nullable().optional(),
  faculty: z.string().nullable().optional(),
  valid_from: z.string().nullable().optional(),
  valid_to: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  version: z.number().int().default(1),
  storage_path: z.string().nullable().optional(),
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

  const parsed = InsertSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const doc = await insertDocument({
    title: parsed.data.title,
    source_type: parsed.data.source_type,
    original_url: parsed.data.original_url ?? null,
    language: parsed.data.language,
    topic: parsed.data.topic ?? null,
    faculty: parsed.data.faculty ?? null,
    valid_from: parsed.data.valid_from ?? null,
    valid_to: parsed.data.valid_to ?? null,
    is_active: parsed.data.is_active,
    version: parsed.data.version,
    storage_path: parsed.data.storage_path ?? null,
  })

  return Response.json(doc, { status: 201 })
}

const PatchSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean(),
})

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  await setDocumentActive(parsed.data.id, parsed.data.is_active)
  return new Response(null, { status: 204 })
}
