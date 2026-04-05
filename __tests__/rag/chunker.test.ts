// __tests__/rag/chunker.test.ts
import { describe, it, expect } from 'vitest'
import { chunkText } from '@/lib/rag/chunker'

describe('chunkText', () => {
  it('returns a single chunk when text is shorter than chunk size', () => {
    const chunks = chunkText('Hello world', { chunkSize: 100, overlap: 20 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('Hello world')
    expect(chunks[0].index).toBe(0)
  })

  it('splits text into overlapping chunks', () => {
    const text = 'a '.repeat(60) // 120 chars
    const chunks = chunkText(text, { chunkSize: 50, overlap: 10 })
    expect(chunks.length).toBeGreaterThan(1)
    // Each chunk should not exceed chunkSize characters
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(50)
    }
    // Second chunk should start before end of first chunk (overlap)
    const firstEnd = chunks[0].content.length
    expect(chunks[1].startChar).toBeLessThan(firstEnd)
  })

  it('strips excessive whitespace', () => {
    const chunks = chunkText('  hello   world  \n\n  foo  ', { chunkSize: 100, overlap: 0 })
    expect(chunks[0].content).toBe('hello world foo')
  })

  it('returns empty array for empty input', () => {
    expect(chunkText('', { chunkSize: 100, overlap: 20 })).toHaveLength(0)
  })
})
