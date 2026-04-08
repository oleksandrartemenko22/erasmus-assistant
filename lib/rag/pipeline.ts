// lib/rag/pipeline.ts
// Orchestrates retrieval → prompt building → LLM generation → safety classification.

import { buildGroundedPrompt, buildSystemPrompt } from '@/lib/prompts/grounding'
import { classifyResponse } from '@/lib/rag/safety'
import type { RetrievedChunk, RetrieverProvider } from '@/lib/rag/retriever'
import type { LLMProvider } from '@/lib/llm/types'
import type { ConfidenceFlag, EscalationReason } from '@/types'

export interface PipelineInput {
  question: string
  /** Previous turns in the conversation, oldest first */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  retriever: RetrieverProvider
  llm: LLMProvider
  topK?: number
  minScore?: number
}

export interface PipelineResult {
  answer: string
  chunks: RetrievedChunk[]
  retrievedChunkIds: string[]
  confidenceFlag: ConfidenceFlag
  shouldEscalate: boolean
  escalationReason: EscalationReason | null
  isLegalTopic: boolean
}

/**
 * Produces a rich, standalone search query from the current question plus
 * up to the last 3 conversation turns.  Sending the conversation to the LLM
 * lets it expand short follow-ups like "Where to find application form" into
 * "Where to find Erasmus application form URL website incomingstudents.um.si".
 * Falls back to the raw question on any error.
 */
export async function buildSearchQuery(
  question: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> | undefined,
  llm: LLMProvider,
): Promise<string> {
  // With no history the question is already the full context; just clean it up.
  if (!history || history.length === 0) {
    try {
      const { content } = await llm.complete({
        messages: [
          {
            role: 'user',
            content:
              'Rewrite this question as a clear search query in standard English. ' +
              'Fix grammar and spelling. Return only the rewritten query.\n\n' +
              `Question: ${question}`,
          },
        ],
        temperature: 0,
        maxTokens: 150,
      })
      const out = content.trim()
      return out.length > 0 ? out : question
    } catch {
      return question
    }
  }

  // Build a short conversation snippet: last 3 turns (6 messages) + current question
  const recentTurns = history.slice(-6)
  const conversationText = recentTurns
    .map((m) => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`)
    .join('\n')

  try {
    const { content } = await llm.complete({
      messages: [
        {
          role: 'user',
          content:
            'Given this conversation, rewrite the last question as a complete, detailed ' +
            'search query that includes all relevant context (topic, country, type of exchange, ' +
            'specific documents or URLs mentioned). The query will be used to search a ' +
            'university knowledge base. Return only the search query, nothing else.\n\n' +
            `Conversation:\n${conversationText}\nStudent: ${question}`,
        },
      ],
      temperature: 0,
      maxTokens: 200,
    })
    const out = content.trim()
    return out.length > 0 ? out : question
  } catch {
    return question
  }
}

export async function runChatPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { question, history, retriever, llm, topK = 8, minScore = 0.45 } = input

  // 1. Build a rich, context-aware search query from the conversation history
  const searchQuery = await buildSearchQuery(question, history, llm)

  // 2. Retrieve relevant chunks using the context-enriched query
  const chunks = await retriever.retrieve(searchQuery, { topK, minScore })

  // 3. Build grounded prompt — use the ORIGINAL question so the answer feels natural
  const userMessage = buildGroundedPrompt({ question, chunks })

  // 4. Generate answer — inject conversation history between system prompt and current turn
  const { content: answer } = await llm.complete({
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      ...(history ?? []),
      { role: 'user', content: userMessage },
    ],
    temperature: 0.2,
    maxTokens: 2000,
  })

  // 5. Classify safety / confidence
  const classification = classifyResponse({
    chunks: chunks.map((c) => ({ score: c.score, content: c.content })),
    answer,
  })

  return {
    answer,
    chunks,
    retrievedChunkIds: chunks.map((c) => c.chunkId),
    confidenceFlag: classification.confidenceFlag,
    shouldEscalate: classification.shouldEscalate,
    escalationReason: classification.reason,
    isLegalTopic: classification.isLegalTopic,
  }
}
