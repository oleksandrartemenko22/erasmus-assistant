// lib/db/messages.ts
import { db } from './client'
import type { ChatSession, Message, ConfidenceFlag } from '@/types'

export async function createSession(language: string, userAgent: string | null): Promise<ChatSession> {
  const { data, error } = await db
    .from('chat_sessions')
    .insert({ language, user_agent: userAgent })
    .select()
    .single()
  if (error) throw error
  return data as ChatSession
}

export async function getSession(id: string): Promise<ChatSession | null> {
  const { data, error } = await db
    .from('chat_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as ChatSession | null
}

export async function insertMessage(msg: {
  session_id: string
  role: 'user' | 'assistant'
  content: string
  retrieved_chunk_ids?: string[]
  confidence_flag?: ConfidenceFlag
  escalation_flag?: boolean
}): Promise<Message> {
  const { data, error } = await db
    .from('messages')
    .insert({
      ...msg,
      escalation_flag: msg.escalation_flag ?? false,
    })
    .select()
    .single()
  if (error) throw error
  return data as Message
}

export async function getSessionMessages(sessionId: string): Promise<Message[]> {
  const { data, error } = await db
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as Message[]
}
