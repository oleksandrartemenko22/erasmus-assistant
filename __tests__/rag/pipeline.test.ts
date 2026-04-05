// __tests__/rag/pipeline.test.ts
import { describe, it, expect } from 'vitest'
import { runChatPipeline } from '@/lib/rag/pipeline'
import type { RetrieverProvider, RetrievedChunk } from '@/lib/rag/retriever'
import type { LLMProvider, LLMMessage } from '@/lib/llm/types'

// ---------------------------------------------------------------------------
// Minimal fakes — test real pipeline logic, not mock behaviour
// ---------------------------------------------------------------------------

function makeChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    chunkId: 'chunk-1',
    documentId: 'doc-1',
    content: 'Application deadline is March 15.',
    score: 0.9,
    documentTitle: 'Erasmus Guide 2025',
    documentUrl: 'https://um.si/erasmus',
    ...overrides,
  }
}

function fakeRetriever(chunks: RetrievedChunk[]): RetrieverProvider {
  return { retrieve: async () => chunks }
}

function fakeLLM(response: string): LLMProvider {
  return {
    complete: async () => ({ content: response }),
    async *completeStream() { yield response },
    embed: async () => [],
  }
}

// A fake LLM that captures the messages it receives for inspection
function capturingLLM(response: string): { llm: LLMProvider; getMessages(): LLMMessage[] } {
  let captured: LLMMessage[] = []
  const llm: LLMProvider = {
    complete: async ({ messages }) => { captured = messages; return { content: response } },
    async *completeStream({ messages }) { captured = messages; yield response },
    embed: async () => [],
  }
  return { llm, getMessages: () => captured }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runChatPipeline', () => {
  it('returns the LLM answer and source chunks', async () => {
    const result = await runChatPipeline({
      question: 'When is the deadline?',
      retriever: fakeRetriever([makeChunk()]),
      llm: fakeLLM('The deadline is March 15 [1].'),
    })

    expect(result.answer).toBe('The deadline is March 15 [1].')
    expect(result.chunks).toHaveLength(1)
    expect(result.chunks[0].documentTitle).toBe('Erasmus Guide 2025')
  })

  it('escalates and sets reason when no sources are found', async () => {
    const result = await runChatPipeline({
      question: 'Random question?',
      retriever: fakeRetriever([]),
      llm: fakeLLM('I do not know.'),
    })

    expect(result.shouldEscalate).toBe(true)
    expect(result.escalationReason).toBe('no_sources')
    expect(result.confidenceFlag).toBe('none')
  })

  it('sets high confidence when chunk score meets threshold', async () => {
    const result = await runChatPipeline({
      question: 'What is the deadline?',
      retriever: fakeRetriever([makeChunk({ score: 0.85 })]),
      llm: fakeLLM('March 15.'),
    })

    expect(result.confidenceFlag).toBe('high')
    expect(result.shouldEscalate).toBe(false)
  })

  it('escalates legal topic with low confidence', async () => {
    const result = await runChatPipeline({
      question: 'Do I need a visa?',
      retriever: fakeRetriever([makeChunk({ score: 0.45 })]),
      llm: fakeLLM('You might need a visa.'),
    })

    expect(result.shouldEscalate).toBe(true)
    expect(result.escalationReason).toBe('legal_visa_topic')
  })

  it('includes retrieved chunk IDs in the result', async () => {
    const result = await runChatPipeline({
      question: 'Any question?',
      retriever: fakeRetriever([makeChunk({ chunkId: 'abc-123' })]),
      llm: fakeLLM('Some answer.'),
    })

    expect(result.retrievedChunkIds).toContain('abc-123')
  })

  it('passes conversation history to the LLM as earlier turns', async () => {
    const { llm, getMessages } = capturingLLM('Because of rule X.')

    await runChatPipeline({
      question: 'Why?',
      history: [
        { role: 'user', content: 'What is the application deadline?' },
        { role: 'assistant', content: 'The deadline is March 15.' },
      ],
      retriever: fakeRetriever([makeChunk()]),
      llm,
    })

    const msgs = getMessages()
    // system + 2 history turns + current user turn
    expect(msgs).toHaveLength(4)
    expect(msgs[1]).toMatchObject({ role: 'user', content: 'What is the application deadline?' })
    expect(msgs[2]).toMatchObject({ role: 'assistant', content: 'The deadline is March 15.' })
  })

  it('works correctly with no history provided', async () => {
    const { llm, getMessages } = capturingLLM('March 15.')

    await runChatPipeline({
      question: 'When is the deadline?',
      retriever: fakeRetriever([makeChunk()]),
      llm,
    })

    const msgs = getMessages()
    // system + current user turn only
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[1].role).toBe('user')
  })
})
