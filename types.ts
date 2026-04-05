// types.ts — shared domain types used across lib/ and app/

export type ConfidenceFlag = 'high' | 'low' | 'none'
export type FeedbackRating = 'helpful' | 'not_helpful'
export type EscalationReason =
  | 'no_sources'
  | 'low_confidence'
  | 'conflicting_sources'
  | 'legal_visa_topic'
  | 'user_request'

export type DocumentSourceType = 'pdf' | 'txt' | 'docx' | 'faq' | 'webpage'

export interface Document {
  id: string
  title: string
  source_type: DocumentSourceType
  original_url: string | null
  language: string
  topic: string | null
  faculty: string | null
  valid_from: string | null  // ISO date string
  valid_to: string | null    // ISO date string
  is_active: boolean
  version: number
  storage_path: string | null
  created_at: string
  updated_at: string
}

export interface DocumentChunk {
  id: string
  document_id: string
  chunk_index: number
  content: string
  token_count: number
  created_at: string
}

export interface ChatSession {
  id: string
  language: string
  user_agent: string | null
  created_at: string
}

export interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  retrieved_chunk_ids: string[] | null
  confidence_flag: ConfidenceFlag | null
  escalation_flag: boolean
  created_at: string
}

export interface Feedback {
  id: string
  message_id: string
  rating: FeedbackRating
  created_at: string
}

export interface EscalationRequest {
  id: string
  message_id: string | null
  reason: EscalationReason | null
  created_at: string
}

export interface FaqItem {
  id: string
  question: string
  answer: string
  language: string
  topic: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
