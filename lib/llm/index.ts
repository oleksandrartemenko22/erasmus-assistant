// lib/llm/index.ts
import type { LLMProvider } from './types'
import { OpenAIProvider } from './openai'

let _instance: LLMProvider | null = null

export function getLLMProvider(): LLMProvider {
  if (!_instance) {
    // Swap this line to use a different provider (e.g. AnthropicProvider)
    _instance = new OpenAIProvider()
  }
  return _instance
}

export type { LLMProvider, LLMCompletionOptions, LLMCompletionResult, LLMMessage } from './types'
