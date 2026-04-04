// lib/llm/types.ts

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMCompletionOptions {
  messages: LLMMessage[]
  temperature?: number
  maxTokens?: number
}

export interface LLMCompletionResult {
  content: string
  /** approximate token count if available */
  totalTokens?: number
}

export interface LLMProvider {
  /** Generate a chat completion */
  complete(options: LLMCompletionOptions): Promise<LLMCompletionResult>
  /** Generate an embedding vector for a text string */
  embed(text: string): Promise<number[]>
}
