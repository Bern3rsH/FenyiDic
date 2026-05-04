import type { UpdateInfo } from 'electron-updater'

const GITHUB_EMPTY_RELEASE_NOTES_TEXT = 'No content.'
const HTML_TAG_DETECTION_PATTERN = /<\/?[a-z][\s\S]*>/i
const HTML_SCRIPT_STYLE_PATTERN = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi
const HTML_LINE_BREAK_PATTERN = /<br\s*\/?>/gi
const HTML_LIST_ITEM_OPEN_PATTERN = /<li\b[^>]*>/gi
const HTML_LIST_ITEM_CLOSE_PATTERN = /<\/li>/gi
const HTML_BLOCK_TAG_PATTERN =
  /<\/?(p|div|section|article|header|footer|blockquote|pre|table|thead|tbody|tr|td|th|h[1-6])\b[^>]*>/gi
const HTML_TAG_PATTERN = /<[^>]+>/g
const HTML_ENTITY_PATTERN = /&(#\d+|#x[\da-f]+|[a-z][a-z\d]+);/gi
const WHITESPACE_AROUND_NEWLINES_PATTERN = /[ \t]*\n[ \t]*/g
const REPEATED_NEWLINES_PATTERN = /\n{3,}/g

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  hellip: '...',
  laquo: '<<',
  ldquo: '"',
  lsquo: "'",
  lt: '<',
  mdash: '-',
  nbsp: ' ',
  ndash: '-',
  quot: '"',
  raquo: '>>',
  rdquo: '"',
  rsquo: "'"
}

function decodeHtmlEntities(text: string): string {
  return text.replace(HTML_ENTITY_PATTERN, (entity, entityBody: string) => {
    const normalizedEntityBody = entityBody.toLowerCase()

    if (normalizedEntityBody.startsWith('#x')) {
      const codePoint = Number.parseInt(normalizedEntityBody.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity
    }

    if (normalizedEntityBody.startsWith('#')) {
      const codePoint = Number.parseInt(normalizedEntityBody.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity
    }

    return HTML_ENTITY_MAP[normalizedEntityBody] ?? entity
  })
}

function compactReleaseNotesText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(WHITESPACE_AROUND_NEWLINES_PATTERN, '\n')
    .replace(REPEATED_NEWLINES_PATTERN, '\n\n')
    .trim()
}

function htmlToPlainReleaseNotes(html: string): string {
  const textWithStructuralBreaks = html
    .replace(HTML_SCRIPT_STYLE_PATTERN, '')
    .replace(HTML_LIST_ITEM_OPEN_PATTERN, '\n- ')
    .replace(HTML_LIST_ITEM_CLOSE_PATTERN, '\n')
    .replace(HTML_LINE_BREAK_PATTERN, '\n')
    .replace(HTML_BLOCK_TAG_PATTERN, '\n')
    .replace(HTML_TAG_PATTERN, '')

  return compactReleaseNotesText(decodeHtmlEntities(textWithStructuralBreaks))
}

function normalizeReleaseNoteText(releaseNoteText: string): string | null {
  const trimmedReleaseNotes = releaseNoteText.trim()

  if (!trimmedReleaseNotes || trimmedReleaseNotes === GITHUB_EMPTY_RELEASE_NOTES_TEXT) {
    return null
  }

  const normalizedReleaseNotes = HTML_TAG_DETECTION_PATTERN.test(trimmedReleaseNotes)
    ? htmlToPlainReleaseNotes(trimmedReleaseNotes)
    : compactReleaseNotesText(decodeHtmlEntities(trimmedReleaseNotes))

  return normalizedReleaseNotes && normalizedReleaseNotes !== GITHUB_EMPTY_RELEASE_NOTES_TEXT
    ? normalizedReleaseNotes
    : null
}

export function normalizeReleaseNotes(releaseNotes: UpdateInfo['releaseNotes']): string | null {
  if (typeof releaseNotes === 'string') {
    return normalizeReleaseNoteText(releaseNotes)
  }

  if (Array.isArray(releaseNotes)) {
    const normalizedNotes = releaseNotes
      .map(({ version, note }) => {
        const normalizedNote = typeof note === 'string' ? normalizeReleaseNoteText(note) : null
        return [version, normalizedNote].filter(Boolean).join('\n').trim()
      })
      .filter((note) => note.length > 0)

    return normalizedNotes.length > 0 ? normalizedNotes.join('\n\n') : null
  }

  return null
}
