// __tests__/rag/retriever.test.ts
import { describe, it, expect } from 'vitest'
import { filterExpiredChunks } from '@/lib/rag/retriever'

// filterExpiredChunks is pure — no DB call needed
describe('filterExpiredChunks', () => {
  const today = '2025-06-01'

  it('keeps chunks whose document has no validity window', () => {
    const chunks = [{ validFrom: null, validTo: null, content: 'Always valid' }]
    expect(filterExpiredChunks(chunks, today)).toHaveLength(1)
  })

  it('keeps chunks whose document is within validity window', () => {
    const chunks = [{ validFrom: '2025-01-01', validTo: '2025-12-31', content: 'Valid this year' }]
    expect(filterExpiredChunks(chunks, today)).toHaveLength(1)
  })

  it('removes chunks whose document has expired', () => {
    const chunks = [{ validFrom: '2024-01-01', validTo: '2024-12-31', content: 'Last year' }]
    expect(filterExpiredChunks(chunks, today)).toHaveLength(0)
  })

  it('removes chunks whose document is not yet valid', () => {
    const chunks = [{ validFrom: '2026-01-01', validTo: null, content: 'Future' }]
    expect(filterExpiredChunks(chunks, today)).toHaveLength(0)
  })

  it('keeps chunks with only validFrom set and date is after it', () => {
    const chunks = [{ validFrom: '2025-01-01', validTo: null, content: 'Open ended' }]
    expect(filterExpiredChunks(chunks, today)).toHaveLength(1)
  })

  it('keeps chunks with only validTo set and date is before it', () => {
    const chunks = [{ validFrom: null, validTo: '2025-12-31', content: 'Not expired' }]
    expect(filterExpiredChunks(chunks, today)).toHaveLength(1)
  })

  it('filters a mixed list correctly', () => {
    const chunks = [
      { validFrom: null, validTo: null, content: 'Always valid' },
      { validFrom: '2024-01-01', validTo: '2024-12-31', content: 'Expired' },
      { validFrom: '2025-01-01', validTo: '2025-12-31', content: 'Current' },
    ]
    const result = filterExpiredChunks(chunks, today)
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.content)).toEqual(['Always valid', 'Current'])
  })
})
