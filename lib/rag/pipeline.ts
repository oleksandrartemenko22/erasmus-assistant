// lib/rag/pipeline.ts
// Orchestrates retrieval → prompt building → LLM generation → safety classification.

import { buildGroundedPrompt, buildSystemPrompt } from '@/lib/prompts/grounding'
import { classifyResponse } from '@/lib/rag/safety'
import type { RetrievedChunk, RetrieverProvider } from '@/lib/rag/retriever'
import type { LLMProvider } from '@/lib/llm/types'
import type { ConfidenceFlag, EscalationReason } from '@/types'

export interface PipelineInput {
  question: string
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

export async function runChatPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { question, retriever, llm, topK = 8, minScore = 0.5 } = input

  // 1. Retrieve relevant chunks
  const chunks = await retriever.retrieve(question, { topK, minScore })

  // 2. Build grounded prompt
  const userMessage = buildGroundedPrompt({ question, chunks })

  // 3. Generate answer
  const { content: answer } = await llm.complete({
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.2,
    maxTokens: 2000,
  })

  // 4. Classify safety / confidence
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
