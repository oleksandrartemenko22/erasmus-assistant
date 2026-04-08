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
 * Rewrites a poorly-worded or misspelled question into clean English
 * for better vector-search recall.  Falls back to the original question
 * if the LLM call fails for any reason.
 */
async function rewriteQuery(question: string, llm: LLMProvider): Promise<string> {
  try {
    const { content } = await llm.complete({
      messages: [
        {
          role: 'user',
          content:
            'Rewrite this question in clear, standard English to improve search results. ' +
            'Keep the same meaning but fix grammar, spelling, and word order. ' +
            'Return only the rewritten question, nothing else.\n\n' +
            `Question: ${question}`,
        },
      ],
      temperature: 0,
      maxTokens: 200,
    })
    const rewritten = content.trim()
    return rewritten.length > 0 ? rewritten : question
  } catch {
    return question
  }
}

export async function runChatPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { question, history, retriever, llm, topK = 8, minScore = 0.45 } = input

  // 1. Rewrite the query to fix spelling / grammar before vector search
  const searchQuery = await rewriteQuery(question, llm)

  // 2. Retrieve relevant chunks using the rewritten query
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
