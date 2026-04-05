// __tests__/ingest/extract.test.ts
import { describe, it, expect } from 'vitest'
import { extractTextFromHtml } from '@/lib/ingest/extract'

describe('extractTextFromHtml', () => {
  it('strips HTML tags and returns plain text', () => {
    const html = '<p>Hello <strong>world</strong>!</p>'
    expect(extractTextFromHtml(html)).toBe('Hello world!')
  })

  it('removes <script> blocks entirely including their content', () => {
    const html = '<p>Keep this</p><script>alert("drop this")</script>'
    const result = extractTextFromHtml(html)
    expect(result).toContain('Keep this')
    expect(result).not.toContain('alert')
    expect(result).not.toContain('drop this')
  })

  it('removes <style> blocks entirely including their content', () => {
    const html = '<style>body { color: red }</style><p>Visible text</p>'
    const result = extractTextFromHtml(html)
    expect(result).toContain('Visible text')
    expect(result).not.toContain('color')
  })

  it('collapses multiple whitespace and newlines into single spaces', () => {
    const html = '<p>  Too   many   spaces  </p>\n\n<p>And newlines</p>'
    const result = extractTextFromHtml(html)
    expect(result).toBe('Too many spaces And newlines')
  })

  it('decodes common HTML entities', () => {
    const html = '<p>University &amp; College &mdash; it&apos;s great</p>'
    const result = extractTextFromHtml(html)
    expect(result).toContain('University & College')
    expect(result).toContain("it's great")
  })

  it('returns empty string for empty input', () => {
    expect(extractTextFromHtml('')).toBe('')
  })

  it('truncates to 50 000 characters when the limit parameter is provided', () => {
    const big = '<p>' + 'x'.repeat(60_000) + '</p>'
    const result = extractTextFromHtml(big, 50_000)
    expect(result.length).toBeLessThanOrEqual(50_000)
  })

  it('does not truncate when output is under the limit', () => {
    const html = '<p>Short text</p>'
    const result = extractTextFromHtml(html, 50_000)
    expect(result).toBe('Short text')
  })
})
