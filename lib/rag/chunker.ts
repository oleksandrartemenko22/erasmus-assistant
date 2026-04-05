// lib/rag/chunker.ts

export interface ChunkOptions {
  /** Maximum character count per chunk */
  chunkSize: number
  /** Character overlap between consecutive chunks */
  overlap: number
}

export interface TextChunk {
  index: number
  content: string
  startChar: number
  endChar: number
  tokenCount: number
}

/** Rough token estimator: ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function chunkText(raw: string, options: ChunkOptions): TextChunk[] {
  const text = normalise(raw)
  if (!text) return []

  const { chunkSize, overlap } = options
  const step = chunkSize - overlap
  const chunks: TextChunk[] = []
  let i = 0

  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length)
    const content = text.slice(i, end)
    chunks.push({
      index: chunks.length,
      content,
      startChar: i,
      endChar: end,
      tokenCount: estimateTokens(content),
    })
    if (end === text.length) break
    i += step
  }

  return chunks
}
