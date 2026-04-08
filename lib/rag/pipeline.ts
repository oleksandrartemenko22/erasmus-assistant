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
 * Builds a context-enriched search query by combining the last few user
 * turns with the current question.  This ensures that answers given in
 * earlier turns (e.g. "I'm from Spain, applying for studies") are taken
 * into account when searching the vector database.
 */
function buildContextualQuery(
  question: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> | undefined,
): string {
  if (!history || history.length === 0) return question

  // Take up to the last 3 turns (user + assistant pairs count as 1 turn each)
  const recentTurns = history.slice(-6)  // up to 3 pairs = 6 messages

  const userContext = recentTurns
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ')

  return `${userContext} ${question}`.trim()
}

/**
 * Rewrites a context-enriched query into clean English for better
 * vector-search recall.  Falls back to the raw query on any error.
 */
async function rewriteQuery(query: string, llm: LLMProvider): Promise<string> {
  try {
    const { content } = await llm.complete({
      messages: [
        {
          role: 'user',
          content:
            'Rewrite this as a single clear search query in standard English. ' +
            'Preserve all context (country, type of exchange, topic). ' +
            'Fix grammar and spelling. Return only the rewritten query, nothing else.\n\n' +
            `Query: ${query}`,
        },
      ],
      temperature: 0,
      maxTokens: 200,
    })
    const rewritten = content.trim()
    return rewritten.length > 0 ? rewritten : query
  } catch {
    return query
  }
}

export async function runChatPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { question, history, retriever, llm, topK = 8, minScore = 0.45 } = input

  // 1. Build a context-enriched query from recent history + current question,
  //    then rewrite it for better spelling/grammar before hitting the vector DB
  const contextualQuery = buildContextualQuery(question, history)
  const searchQuery = await rewriteQuery(contextualQuery, llm)

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
