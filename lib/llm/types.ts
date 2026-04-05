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
  /** Generate a chat completion (full response) */
  complete(options: LLMCompletionOptions): Promise<LLMCompletionResult>
  /** Stream a chat completion — yields text deltas as they arrive */
  completeStream(options: LLMCompletionOptions): AsyncGenerator<string>
  /** Generate an embedding vector for a text string */
  embed(text: string): Promise<number[]>
}
