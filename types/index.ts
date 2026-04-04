// types/index.ts

export type SourceType = 'pdf' | 'txt' | 'docx' | 'faq' | 'url'
export type MessageRole = 'user' | 'assistant'
export type FeedbackRating = 'helpful' | 'not_helpful'
export type ConfidenceFlag = 'high' | 'medium' | 'low' | 'none'
export type EscalationReason = 'no_sources' | 'legal_topic' | 'conflict' | 'manual'

export interface Document {
  id: string
  title: string
  source_type: SourceType
  original_url: string | null
  language: string
  topic: string | null
  faculty: string | null
  valid_from: string | null   // ISO date string
  valid_to: string | null
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
  token_count: number | null
  // embedding is not returned in API responses
  created_at: string
}

export interface RetrievedChunk {
  id: string
  document_id: string
  chunk_index: number
  content: string
  similarity: number
  doc_title: string
  doc_source_type: SourceType
  doc_language: string
  doc_topic: string | null
  doc_valid_from: string | null
  doc_valid_to: string | null
  doc_is_active: boolean
}

export interface ChatSession {
  id: string
  created_at: string
  language: string
  user_agent: string | null
}

export interface Message {
  id: string
  session_id: string
  role: MessageRole
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
  resolved: boolean
  created_at: string
}

export interface FaqItem {
  id: string
  question: string
  answer: string
  topic: string | null
  language: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── API request/response shapes ───────────────────────────────────────────

export interface ChatRequest {
  sessionId: string | null   // null = start new session
  question: string
  language?: string
}

export interface SourceCitation {
  chunkId: string
  documentTitle: string
  sourceType: SourceType
  topic: string | null
  chunkIndex: number
}

export interface ChatResponse {
  sessionId: string
  messageId: string
  answer: string
  sources: SourceCitation[]
  confidenceFlag: ConfidenceFlag
  escalationFlag: boolean
  escalationReason: EscalationReason | null
}

export interface FeedbackRequest {
  messageId: string
  rating: FeedbackRating
}
