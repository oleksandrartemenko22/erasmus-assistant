'use client'

import { useState, useRef } from 'react'
import type { Document } from '@/types'
import type { ConversationSession } from '@/app/api/admin/conversations/route'

interface Analytics {
  totalQuestions: number
  escalatedCount: number
  notHelpfulCount: number
  recentQuestions: Array<{ content: string; created_at: string; escalation_flag: boolean }>
}

export default function AdminPage() {
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [documents, setDocuments] = useState<Document[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [conversations, setConversations] = useState<ConversationSession[]>([])
  const [convsLoading, setConvsLoading] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [filterNegative, setFilterNegative] = useState(false)

  // File upload state
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  // URL ingest state
  const [urlStatus, setUrlStatus] = useState('')
  const [ingesting, setIngesting] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [urlTitle, setUrlTitle] = useState('')

  async function load(s: string) {
    const [docsRes, analyticsRes] = await Promise.all([
      fetch('/api/documents', { headers: { 'x-admin-secret': s } }),
      fetch('/api/analytics', { headers: { 'x-admin-secret': s } }),
    ])
    if (!docsRes.ok) {
      setUploadStatus('Invalid secret or server error.')
      return
    }
    const docs = await docsRes.json() as Document[]
    const anal = analyticsRes.ok ? await analyticsRes.json() as Analytics : null
    setDocuments(docs)
    setAnalytics(anal)
    setAuthed(true)
    setUploadStatus('')
    loadConversations(s)
  }

  async function loadConversations(s: string) {
    setConvsLoading(true)
    try {
      const res = await fetch('/api/admin/conversations', { headers: { 'x-admin-secret': s } })
      if (res.ok) setConversations(await res.json() as ConversationSession[])
    } finally {
      setConvsLoading(false)
    }
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleLogin(e: { preventDefault(): void }) {
    e.preventDefault()
    await load(secret)
  }

  async function toggleActive(doc: Document) {
    await fetch('/api/documents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify({ id: doc.id, is_active: !doc.is_active }),
    })
    setDocuments((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, is_active: !d.is_active } : d))
    )
  }

  async function handleUpload(e: { preventDefault(): void }) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    const title = titleRef.current?.value.trim()
    if (!file || !title) return

    setUploading(true)
    setUploadStatus('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('meta', JSON.stringify({ title, language: 'en' }))

      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'x-admin-secret': secret },
        body: formData,
      })
      const data = await res.json() as { documentId?: string; chunksCreated?: number; error?: string }
      if (!res.ok) {
        setUploadStatus(`Upload failed: ${data.error ?? 'Unknown error'}`)
      } else {
        setUploadStatus(`Done — ${data.chunksCreated} chunks created.`)
        await load(secret)
        if (fileRef.current) fileRef.current.value = ''
        if (titleRef.current) titleRef.current.value = ''
        setFileName(null)
      }
    } catch {
      setUploadStatus('Upload failed: network error.')
    } finally {
      setUploading(false)
    }
  }

  async function handleUrlIngest(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!urlValue.trim() || !urlTitle.trim()) return

    setIngesting(true)
    setUrlStatus('')
    try {
      const res = await fetch('/api/ingest/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ url: urlValue.trim(), title: urlTitle.trim(), language: 'en' }),
      })
      const data = await res.json() as { documentId?: string; chunksCreated?: number; error?: string }
      if (!res.ok) {
        setUrlStatus(data.error ?? 'Failed to ingest URL.')
      } else {
        setUrlStatus(`Done — ${data.chunksCreated} chunks created.`)
        await load(secret)
        setUrlValue('')
        setUrlTitle('')
      }
    } catch {
      setUrlStatus('Network error — could not reach the server.')
    } finally {
      setIngesting(false)
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-lg shadow border border-gray-200 w-80 space-y-4">
          <h1 className="text-lg font-semibold text-gray-900">Admin Login</h1>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Admin secret"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="w-full bg-blue-700 text-white rounded py-2 text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">Erasmus Assistant — Admin</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-10">

        {/* Analytics */}
        {analytics && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">Overview</h2>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Total questions" value={analytics.totalQuestions} />
              <Stat label="Escalated" value={analytics.escalatedCount} />
              <Stat label="Not helpful" value={analytics.notHelpfulCount} />
            </div>
          </section>
        )}

        {/* File upload */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">Upload document</h2>
          <form onSubmit={handleUpload} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <input
              ref={titleRef}
              type="text"
              placeholder="Document title"
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Styled file picker */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="shrink-0 rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Choose file
              </button>
              <span className="text-sm text-gray-500 truncate">
                {fileName ?? 'No file chosen — PDF, DOCX, or TXT'}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt,.docx"
                required
                className="hidden"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
            </div>

            {uploadStatus && (
              <p className={`text-xs ${uploadStatus.startsWith('Done') ? 'text-green-700' : 'text-red-600'}`}>
                {uploadStatus}
              </p>
            )}
            <button
              type="submit"
              disabled={uploading}
              className="bg-blue-700 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
            >
              {uploading ? 'Uploading…' : 'Upload and ingest'}
            </button>
          </form>
        </section>

        {/* URL ingest */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">Add from URL</h2>
          <form onSubmit={handleUrlIngest} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <input
              type="text"
              value={urlTitle}
              onChange={(e) => setUrlTitle(e.target.value)}
              placeholder="Document title"
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="url"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              placeholder="https://www.um.si/erasmus/..."
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {urlStatus && (
              <p className={`text-xs ${urlStatus.startsWith('Done') ? 'text-green-700' : 'text-red-600'}`}>
                {urlStatus}
              </p>
            )}
            <button
              type="submit"
              disabled={ingesting}
              className="bg-blue-700 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
            >
              {ingesting ? 'Fetching…' : 'Fetch and ingest'}
            </button>
          </form>
        </section>

        {/* Documents list */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Documents ({documents.length})
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {documents.length === 0 && (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">No documents uploaded yet.</p>
            )}
            {documents.map((doc) => (
              <div key={doc.id} className="px-4 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {doc.source_type.toUpperCase()} · {doc.language}
                    {doc.topic ? ` · ${doc.topic}` : ''}
                    {doc.valid_to ? ` · expires ${doc.valid_to}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => toggleActive(doc)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    doc.is_active
                      ? 'bg-green-50 border-green-300 text-green-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700'
                      : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-green-50 hover:border-green-300 hover:text-green-700'
                  }`}
                >
                  {doc.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Recent questions */}
        {analytics && analytics.recentQuestions.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">Recent questions</h2>
            <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
              {analytics.recentQuestions.map((q, i) => (
                <div key={i} className="px-4 py-3 flex items-start justify-between gap-4">
                  <p className="text-sm text-gray-700">{q.content}</p>
                  <span className="shrink-0 text-xs text-gray-400">
                    {q.escalation_flag && <span className="text-amber-600 font-medium mr-2">escalated</span>}
                    {new Date(q.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent conversations */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Recent conversations {convsLoading && <span className="normal-case font-normal text-gray-400">loading…</span>}
            </h2>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={filterNegative}
                onChange={(e) => setFilterNegative(e.target.checked)}
                className="rounded"
              />
              Show only negative feedback
            </label>
          </div>

          <div className="space-y-3">
            {conversations
              .filter((s) => !filterNegative || s.notHelpfulCount > 0)
              .map((session) => {
                const isOpen = expandedIds.has(session.id)
                const msgCount = session.messages.length
                const date = new Date(session.created_at)
                return (
                  <div key={session.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    {/* Collapsed header */}
                    <button
                      onClick={() => toggleExpanded(session.id)}
                      className="w-full px-4 py-3 flex items-center justify-between gap-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-gray-400 shrink-0">
                          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-xs text-gray-500 uppercase shrink-0">{session.language}</span>
                        <span className="text-xs text-gray-600">{msgCount} message{msgCount !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {session.helpfulCount > 0 && (
                          <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                            {session.helpfulCount} helpful
                          </span>
                        )}
                        {session.notHelpfulCount > 0 && (
                          <span className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                            {session.notHelpfulCount} not helpful
                          </span>
                        )}
                        <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {/* Expanded messages */}
                    {isOpen && (
                      <div className="border-t border-gray-100 divide-y divide-gray-50">
                        {session.messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`px-4 py-3 flex gap-3 ${msg.role === 'user' ? 'bg-gray-50' : 'bg-white'}`}
                          >
                            <span className={`shrink-0 text-xs font-medium w-16 pt-0.5 ${msg.role === 'user' ? 'text-blue-600' : 'text-gray-500'}`}>
                              {msg.role === 'user' ? 'Student' : 'Bot'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800 whitespace-pre-wrap">{msg.content}</p>
                              <div className="flex items-center gap-3 mt-1">
                                {msg.escalation_flag && (
                                  <span className="text-xs text-amber-600">escalated</span>
                                )}
                                {msg.feedback === 'helpful' && (
                                  <span className="text-xs text-green-600">👍 helpful</span>
                                )}
                                {msg.feedback === 'not_helpful' && (
                                  <span className="text-xs text-red-600">👎 not helpful</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            {!convsLoading && conversations.filter((s) => !filterNegative || s.notHelpfulCount > 0).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                {filterNegative ? 'No sessions with negative feedback.' : 'No conversations yet.'}
              </p>
            )}
          </div>
        </section>

      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
