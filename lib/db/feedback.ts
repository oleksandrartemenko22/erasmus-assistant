// lib/db/feedback.ts
import { db } from './client'
import type { Feedback, FeedbackRating, EscalationReason } from '@/types'

export async function insertFeedback(
  messageId: string,
  rating: FeedbackRating
): Promise<Feedback> {
  const { data, error } = await db
    .from('feedback')
    .insert({ message_id: messageId, rating })
    .select()
    .single()
  if (error) throw error
  return data as Feedback
}

export async function insertEscalation(
  messageId: string | null,
  reason: EscalationReason | null
): Promise<void> {
  const { error } = await db
    .from('escalation_requests')
    .insert({ message_id: messageId, reason })
  if (error) throw error
}

export async function getAnalytics(): Promise<{
  totalQuestions: number
  escalatedCount: number
  notHelpfulCount: number
  recentQuestions: Array<{ content: string; created_at: string; escalation_flag: boolean }>
}> {
  const [totalRes, escalatedRes, notHelpfulRes, recentRes] = await Promise.all([
    db.from('messages').select('id', { count: 'exact' }).eq('role', 'user'),
    db.from('messages').select('id', { count: 'exact' }).eq('escalation_flag', true),
    db.from('feedback').select('id', { count: 'exact' }).eq('rating', 'not_helpful'),
    db
      .from('messages')
      .select('content, created_at, escalation_flag')
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const firstError = [totalRes.error, escalatedRes.error, notHelpfulRes.error, recentRes.error].find(Boolean)
  if (firstError) throw firstError

  return {
    totalQuestions: totalRes.count ?? 0,
    escalatedCount: escalatedRes.count ?? 0,
    notHelpfulCount: notHelpfulRes.count ?? 0,
    recentQuestions: (recentRes.data ?? []) as Array<{
      content: string
      created_at: string
      escalation_flag: boolean
    }>,
  }
}
