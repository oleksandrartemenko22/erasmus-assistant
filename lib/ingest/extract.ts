// lib/ingest/extract.ts
// Text extraction from file buffers and raw HTML.
// pdf-parse and mammoth are lazy-imported inside extractText so this module
// is safe to import in test environments that only use extractTextFromHtml.

export type SupportedMimeType =
  | 'application/pdf'
  | 'text/plain'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case 'application/pdf': {
      // pdf-parse v2 exports a class-based API: new PDFParse({ data }) → .getText() → .text
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: buffer })
      try {
        const result = await parser.getText()
        return result.text
      } finally {
        await parser.destroy()
      }
    }
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      // Same CJS/ESM interop issue as pdf-parse.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import('mammoth')
      const mammoth: { extractRawText(o: { buffer: Buffer }): Promise<{ value: string }> } = mod.default ?? mod
      const result = await mammoth.extractRawText({ buffer })
      return result.value
    }
    case 'text/plain':
      return buffer.toString('utf-8')
    default:
      throw new Error(`Unsupported file type: ${mimeType}`)
  }
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&mdash;': '—',
  '&ndash;': '–',
  '&nbsp;': ' ',
  '&hellip;': '…',
  '&lsquo;': '\u2018',
  '&rsquo;': '\u2019',
  '&ldquo;': '\u201C',
  '&rdquo;': '\u201D',
}

/**
 * Strips HTML and returns clean plain text suitable for chunking.
 * @param html     Raw HTML string
 * @param maxChars Optional character limit applied after extraction (default: no limit)
 */
export function extractTextFromHtml(html: string, maxChars?: number): string {
  if (!html) return ''

  let text = html
    // Remove <script>…</script> and <style>…</style> blocks entirely
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Replace block-level tags with a space to preserve word boundaries,
    // and remove all other tags (inline elements already have surrounding whitespace)
    .replace(/<\/?(p|div|li|td|th|h[1-6]|br|hr|blockquote|section|article|header|footer|nav|main|aside)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    // Decode named HTML entities
    .replace(/&[a-z#0-9]+;/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()

  if (maxChars !== undefined && text.length > maxChars) {
    text = text.slice(0, maxChars)
  }

  return text
}
