// lib/rag/safety.ts
// Classifies a generated response to determine confidence level and escalation need.
// All logic is pure and unit-testable — no I/O or external dependencies.

import type { ConfidenceFlag, EscalationReason } from '@/types'

export const HIGH_CONFIDENCE_THRESHOLD = 0.75

export const LEGAL_KEYWORDS = [
  'visa',
  'residence',
  'permit',
  'immigration',
  'passport',
  'biometric',
  'border',
  'legal status',
  'temporary stay',
  'work permit',
  'residence card',
  'registration certificate',
]

export interface ClassifyInput {
  /** Retrieved chunks with similarity scores (0–1). Empty = no sources found. */
  chunks: Array<{ score: number; content: string }>
  /** Generated answer text */
  answer: string
  /** Caller-set flag when retrieval already detected conflicting sources */
  hasConflict?: boolean
  /** Caller-set flag when the question was detected as legal/visa topic */
  isLegalTopic?: boolean
}

export interface ClassifyResult {
  confidenceFlag: ConfidenceFlag
  shouldEscalate: boolean
  reason: EscalationReason | null
  /** Whether a legal/visa topic was detected (may be auto-detected from answer) */
  isLegalTopic: boolean
}

function detectLegalTopic(answer: string): boolean {
  const lower = answer.toLowerCase()
  return LEGAL_KEYWORDS.some((kw) => lower.includes(kw))
}

export function classifyResponse(input: ClassifyInput): ClassifyResult {
  const { chunks, answer, hasConflict = false } = input

  // 1. No sources — never answer as if certain
  if (chunks.length === 0) {
    return {
      confidenceFlag: 'none',
      shouldEscalate: true,
      reason: 'no_sources',
      isLegalTopic: input.isLegalTopic ?? detectLegalTopic(answer),
    }
  }

  // 2. Conflicting sources detected by caller
  if (hasConflict) {
    return {
      confidenceFlag: 'low',
      shouldEscalate: true,
      reason: 'conflicting_sources',
      isLegalTopic: input.isLegalTopic ?? detectLegalTopic(answer),
    }
  }

  // 3. Confidence based on best-matching chunk score
  const bestScore = Math.max(...chunks.map((c) => c.score))
  const confidenceFlag: ConfidenceFlag = bestScore >= HIGH_CONFIDENCE_THRESHOLD ? 'high' : 'low'

  // 4. Legal/visa topic detection
  const isLegalTopic = input.isLegalTopic ?? detectLegalTopic(answer)

  // 5. Escalate low-confidence answers on sensitive legal topics
  if (isLegalTopic && confidenceFlag === 'low') {
    return { confidenceFlag, shouldEscalate: true, reason: 'legal_visa_topic', isLegalTopic }
  }

  return { confidenceFlag, shouldEscalate: false, reason: null, isLegalTopic }
}
