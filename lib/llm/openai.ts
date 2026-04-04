// lib/llm/openai.ts
import OpenAI from 'openai'
import type { LLMProvider, LLMCompletionOptions, LLMCompletionResult } from './types'

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI
  private chatModel: string
  private embeddingModel: string

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
    this.chatModel = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o'
    this.embeddingModel = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small'
  }

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const response = await this.client.chat.completions.create({
      model: this.chatModel,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 1024,
    })
    const choice = response.choices[0]
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
    return response.data[0].embedding
  }
}
