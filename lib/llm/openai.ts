// lib/llm/openai.ts
import OpenAI from 'openai'
import type { LLMProvider, LLMCompletionOptions, LLMCompletionResult } from './types'

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI
  private chatModel: string
  private embeddingModel: string

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('Missing required environment variable: OPENAI_API_KEY')
    }
    this.client = new OpenAI({ apiKey })
    this.chatModel = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o'
    this.embeddingModel = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small'
  }

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const response = await this.client.chat.completions.create({
      model: this.chatModel,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      // Note: max_tokens is deprecated in favour of max_completion_tokens for gpt-4o+
      max_tokens: options.maxTokens ?? 1024,
    })
    const choice = response.choices[0]
    if (!choice) {
      throw new Error(`OpenAI returned no choices (model: ${this.chatModel})`)
    }
    return {
      content: choice.message.content ?? '',
      totalTokens: response.usage?.total_tokens,
    }
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: text,
    })
    const embedding = response.data[0]
    if (!embedding) {
      throw new Error('OpenAI returned no embedding data')
    }
    return embedding.embedding
  }
}
