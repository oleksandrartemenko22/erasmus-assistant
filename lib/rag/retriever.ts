// lib/rag/retriever.ts
// Retrieval interface + Supabase pgvector implementation.

import type { GroundingChunk } from '@/lib/prompts/grounding'

// ---------------------------------------------------------------------------
// Public interface — swap this implementation to use a different vector store
// ---------------------------------------------------------------------------

export interface RetrievedChunk extends GroundingChunk {
  chunkId: string
  documentId: string
}

export interface RetrieverOptions {
  /** Maximum number of chunks to return */
  topK?: number
  /** Minimum similarity score (0–1) to include a chunk */
  minScore?: number
}

export interface RetrieverProvider {
  retrieve(query: string, options?: RetrieverOptions): Promise<RetrievedChunk[]>
}

// ---------------------------------------------------------------------------
// Pure utility — exported so it can be unit-tested without a DB connection
// ---------------------------------------------------------------------------

export interface ChunkWithValidity {
  validFrom: string | null
  validTo: string | null
  content: string
}

/**
 * Removes chunks whose parent document is outside its validity window.
 * @param chunks   Chunks with optional validity metadata
 * @param today    ISO date string to compare against (e.g. '2025-06-01')
 */
export function filterExpiredChunks<T extends ChunkWithValidity>(
  chunks: T[],
  today: string
): T[] {
  return chunks.filter((c) => {
    if (c.validFrom && today < c.validFrom) return false
    if (c.validTo && today > c.validTo) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// Supabase pgvector implementation
// ---------------------------------------------------------------------------

export class SupabaseRetriever implements RetrieverProvider {
  async retrieve(query: string, options: RetrieverOptions = {}): Promise<RetrievedChunk[]> {
    const { topK = 5, minScore = 0.45 } = options

    // 1. Get embedding for the query via the LLM provider
    const { getLLMProvider } = await import('@/lib/llm/index')
    const embedding = await getLLMProvider().embed(query)

    // 2. Call Supabase match_chunks RPC (pgvector cosine similarity)
    // The function is defined in the DB migration — returns rows ordered by similarity desc
    const { db } = await import('@/lib/db/client')
    const { data, error } = await db.rpc('match_chunks', {
      query_embedding: embedding,
      match_count: topK,
      min_score: minScore,
    })

    if (error) throw error

    const rows = (data ?? []) as Array<{
      id: string
      document_id: string
      content: string
      similarity: number
      document_title: string
      document_url: string | null
      valid_from: string | null
      valid_to: string | null
    }>

    // 3. Filter out expired documents
    const today = new Date().toISOString().slice(0, 10)
    const live = filterExpiredChunks(
      rows.map((r) => ({ ...r, validFrom: r.valid_from, validTo: r.valid_to })),
      today
    )

    return live.map((r) => ({
      chunkId: r.id,
      documentId: r.document_id,
      content: r.content,
      score: r.similarity,
      documentTitle: r.document_title,
      documentUrl: r.document_url,
    }))
  }
}

// Process-scoped singleton
let _retriever: RetrieverProvider | null = null
export function getRetriever(): RetrieverProvider {
  if (!_retriever) _retriever = new SupabaseRetriever()
  return _retriever
}
