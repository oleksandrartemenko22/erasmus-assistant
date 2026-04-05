// __tests__/rag/safety.test.ts
import { describe, it, expect } from 'vitest'
import { classifyResponse, LEGAL_KEYWORDS, HIGH_CONFIDENCE_THRESHOLD } from '@/lib/rag/safety'

const makeChunk = (score: number, content = 'Some info about application') => ({ score, content })

describe('classifyResponse', () => {
  it('escalates with no_sources when no chunks retrieved', () => {
    const result = classifyResponse({ chunks: [], answer: 'The deadline is March 15.' })
    expect(result.shouldEscalate).toBe(true)
    expect(result.reason).toBe('no_sources')
    expect(result.confidenceFlag).toBe('none')
  })

  it('returns high confidence when top chunk score meets threshold', () => {
    const result = classifyResponse({
      chunks: [makeChunk(HIGH_CONFIDENCE_THRESHOLD), makeChunk(0.6)],
      answer: 'The application deadline is March 15.',
    })
    expect(result.confidenceFlag).toBe('high')
    expect(result.shouldEscalate).toBe(false)
  })

  it('returns low confidence when best chunk score is below threshold', () => {
    const result = classifyResponse({
      chunks: [makeChunk(0.4), makeChunk(0.35)],
      answer: 'Perhaps the deadline is March 15.',
    })
    expect(result.confidenceFlag).toBe('low')
    expect(result.shouldEscalate).toBe(false)
  })

  it('escalates legal_visa_topic when topic is legal and confidence is low', () => {
    const result = classifyResponse({
      chunks: [makeChunk(0.45, 'You need a residence permit')],
      answer: 'You need a D-visa.',
      isLegalTopic: true,
    })
    expect(result.shouldEscalate).toBe(true)
    expect(result.reason).toBe('legal_visa_topic')
    expect(result.confidenceFlag).toBe('low')
  })

  it('does NOT escalate legal_visa_topic when confidence is high', () => {
    const result = classifyResponse({
      chunks: [makeChunk(0.9, 'A residence permit is required for stays over 90 days.')],
      answer: 'A residence permit is required for stays over 90 days.',
      isLegalTopic: true,
    })
    expect(result.shouldEscalate).toBe(false)
    expect(result.confidenceFlag).toBe('high')
  })

  it('detects legal topic from answer content when isLegalTopic is not set', () => {
    const result = classifyResponse({
      chunks: [makeChunk(0.45)],
      answer: 'You need a visa to enter Slovenia.',
    })
    expect(result.isLegalTopic).toBe(true)
    expect(result.shouldEscalate).toBe(true)
    expect(result.reason).toBe('legal_visa_topic')
  })

  it('detects conflicting sources when answer contains explicit uncertainty markers', () => {
    const result = classifyResponse({
      chunks: [makeChunk(0.8, 'Deadline is March 15'), makeChunk(0.75, 'Deadline is April 1')],
      answer: 'Sources conflict: some say March 15, others say April 1.',
      hasConflict: true,
    })
    expect(result.confidenceFlag).toBe('low')
    expect(result.shouldEscalate).toBe(true)
    expect(result.reason).toBe('conflicting_sources')
  })
})

describe('LEGAL_KEYWORDS', () => {
  it('includes visa, residence, permit, immigration', () => {
    expect(LEGAL_KEYWORDS).toContain('visa')
    expect(LEGAL_KEYWORDS).toContain('residence')
    expect(LEGAL_KEYWORDS).toContain('permit')
    expect(LEGAL_KEYWORDS).toContain('immigration')
  })
})
