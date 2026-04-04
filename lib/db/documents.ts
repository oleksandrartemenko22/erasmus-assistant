// lib/db/documents.ts
import { db } from './client'
import type { Document, DocumentChunk } from '@/types'

export async function listDocuments(): Promise<Document[]> {
  const { data, error } = await db
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Document[]
}

export async function getDocument(id: string): Promise<Document | null> {
  const { data, error } = await db
    .from('documents')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as Document | null
}

export async function insertDocument(
  doc: Omit<Document, 'id' | 'created_at' | 'updated_at'>
): Promise<Document> {
  const { data, error } = await db
    .from('documents')
    .insert(doc)
    .select()
    .single()
  if (error) throw error
  return data as Document
}

export async function setDocumentActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await db
    .from('documents')
    .update({ is_active: isActive })
    .eq('id', id)
  if (error) throw error
}

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await db.from('documents').delete().eq('id', id)
  if (error) throw error
}

// Returns chunk metadata and content for admin preview — does NOT include embedding vectors
// (embeddings are large float arrays, only needed during retrieval via match_chunks RPC)
export async function getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
  const { data, error } = await db
    .from('document_chunks')
    .select('id, document_id, chunk_index, content, token_count, created_at')
    .eq('document_id', documentId)
    .order('chunk_index')
  if (error) throw error
  return data as DocumentChunk[]
}

export async function insertChunks(
  chunks: Array<{
    document_id: string
    chunk_index: number
    content: string
    token_count: number
    embedding: number[]
  }>
): Promise<void> {
  const { error } = await db.from('document_chunks').insert(chunks)
  if (error) throw error
}
