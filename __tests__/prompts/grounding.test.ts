// __tests__/prompts/grounding.test.ts
import { describe, it, expect } from 'vitest'
import { buildGroundedPrompt, buildSystemPrompt } from '@/lib/prompts/grounding'

const chunk = (content: string, title = 'Test Doc', url: string | null = null) => ({
  content,
  documentTitle: title,
  documentUrl: url,
  score: 0.9,
})

describe('buildSystemPrompt', () => {
  it('returns a non-empty string', () => {
    expect(buildSystemPrompt().length).toBeGreaterThan(100)
  })

  it('contains the escalation instruction', () => {
    expect(buildSystemPrompt()).toContain('International Relations Office')
  })

  it('contains the anti-hallucination instruction', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('only')
    expect(prompt.toLowerCase()).toContain('sources provided')
  })
})

describe('buildGroundedPrompt', () => {
  it('includes each chunk content in the output', () => {
    const chunks = [
      chunk('Application deadline is March 15.'),
      chunk('You need a valid passport.'),
    ]
    const result = buildGroundedPrompt({ question: 'When is the deadline?', chunks })
    expect(result).toContain('Application deadline is March 15.')
    expect(result).toContain('You need a valid passport.')
  })

  it('includes the student question', () => {
    const result = buildGroundedPrompt({
      question: 'What documents do I need?',
      chunks: [chunk('Bring your passport.')],
    })
    expect(result).toContain('What documents do I need?')
  })

  it('includes document titles as source labels', () => {
    const result = buildGroundedPrompt({
      question: 'Any question?',
      chunks: [chunk('Some content', 'Erasmus Guide 2025')],
    })
    expect(result).toContain('Erasmus Guide 2025')
  })

  it('includes URLs when present', () => {
    const result = buildGroundedPrompt({
      question: 'Any question?',
      chunks: [chunk('Some content', 'Web Page', 'https://um.si/erasmus')],
    })
    expect(result).toContain('https://um.si/erasmus')
  })

  it('returns no-sources message when chunk list is empty', () => {
    const result = buildGroundedPrompt({ question: 'Anything?', chunks: [] })
    expect(result.toLowerCase()).toContain('no relevant information')
  })

  it('numbers chunks sequentially', () => {
    const result = buildGroundedPrompt({
      question: 'Q',
      chunks: [chunk('A'), chunk('B'), chunk('C')],
    })
    expect(result).toContain('[1]')
    expect(result).toContain('[2]')
    expect(result).toContain('[3]')
  })
})
