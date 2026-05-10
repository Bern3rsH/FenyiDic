import { ipcMain, dialog, BrowserWindow } from 'electron'
import { getDatabase, reinitDatabase } from '../database'
import {
  IPC_CHANNELS,
  DictionaryStatus,
  DictionaryParserType,
  DEFAULT_TAG_MODE_CONFIGS,
  TagModeConfig,
  SYSTEM_TAGS,
  isSystemTagName,
  EntityType,
  isEntityType,
  isTelemetryEventName,
  TelemetryEventProperties,
  CreateCustomEntryPayload,
  UpdateCustomEntryPayload,
  DeleteCustomEntryPayload,
  DeleteCustomWordPayload
} from '../../shared/types'
import { getAudio, initMdd, disposeMdd } from '../services/mdd-service'
import {
  loadDictionaryConfigs,
  getActiveDictionary,
  hasDictionary,
  importDictionary,
  deleteDictionary,
  setActiveDictionary
} from '../services/dictionary-importer'
import {
  getDueCards,
  getOrCreateCard,
  recordReview,
  getCardStats
} from '../services/fsrs-service'
import Store from 'electron-store'
import { captureTelemetryEvent } from '../telemetry'

// 用户设置存储
interface StoreSchema {
  displayMode: 'en' | 'cn' | 'both'
  reviewAutoPlay: boolean
  reviewAutoPlayAccent: 'uk' | 'us'
  reviewDebugNoFsrs: boolean
  searchAutoPlay: boolean
  searchAutoPlayAccent: 'uk' | 'us'
  readingDisplayMode: 'en' | 'cn' | 'both'
  tagModes: TagModeConfig[] | Record<string, string | string[]>
}

const store = new Store<StoreSchema>({
  defaults: {
    displayMode: 'both',
    reviewAutoPlay: false,
    reviewAutoPlayAccent: 'uk',
    reviewDebugNoFsrs: false,
    searchAutoPlay: false,
    searchAutoPlayAccent: 'uk',
    readingDisplayMode: 'both',
    tagModes: DEFAULT_TAG_MODE_CONFIGS.map((config) => ({ ...config }))
  }
})

import { ttsService } from '../services/TtsService'

const CUSTOM_SEARCH_SOURCE_LABEL = '手动'
const DICTIONARY_SEARCH_SOURCE_LABEL = '词典'
const DIRECT_REDIRECT_PREFIX = '@@@LINK='
const MAX_CUSTOM_HEADWORD_LENGTH = 500
const MAX_CUSTOM_NOTE_LENGTH = 2000
const MAX_CUSTOM_DEFINITION_CN_LENGTH = 4000
const MAX_CUSTOM_EXAMPLE_EN_LENGTH = 1000
const MAX_CUSTOM_EXAMPLE_CN_LENGTH = 2000

interface NormalizedCustomEntryInput {
  headword: string
  definitionCn: string
  note: string
  examples: Array<{ en: string; cn: string }>
}

function decodeHtmlEntities(rawText: string): string {
  return rawText
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function normalizeDisplayHeadword(rawHeadword: string): string {
  return decodeHtmlEntities(rawHeadword)
    .replace(/<[^>]+>/g, '')
    .replace(/[·‧•]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeRedirectLookupHeadword(rawHeadword: string): string {
  return decodeHtmlEntities(rawHeadword)
    .replace(/^entry:\/\//i, '')
    .split(/[\s<]/)[0]
    .trim()
}

function extractDirectRedirectLookupHeadword(rawHtml: string | null | undefined): string | null {
  const normalizedHtml = rawHtml?.trim()
  if (!normalizedHtml?.startsWith(DIRECT_REDIRECT_PREFIX)) {
    return null
  }

  const redirectLookupHeadword = normalizeRedirectLookupHeadword(
    normalizedHtml.slice(DIRECT_REDIRECT_PREFIX.length)
  )

  return redirectLookupHeadword || null
}

function extractDisplayHeadwordFromHtml(rawHtml: string | null | undefined, fallbackHeadword: string): string {
  if (!rawHtml) {
    return fallbackHeadword
  }

  const headwordMatch = rawHtml.match(
    /<h1[^>]*class="[^"]*headword[^"]*"[^>]*>([\s\S]*?)<\/h1>/i
  )
  if (!headwordMatch) {
    return fallbackHeadword
  }

  const normalizedHeadword = normalizeDisplayHeadword(headwordMatch[1])
  return normalizedHeadword || fallbackHeadword
}

interface DictionaryEntryVariant {
  displayHeadword: string
  lookupHeadword: string
  alternateLookupHeadwords: string[]
  phonUk?: string
  phonUs?: string
  rawHtml: string
  senseSignatures: Set<string>
}

function findClosingHtmlTag(html: string, startPos: number, tagName: string): number {
  let depth = 1
  let currentPosition = startPos
  const openPattern = new RegExp(`<${tagName}[^>]*>`, 'gi')
  const closePattern = new RegExp(`</${tagName}>`, 'gi')

  while (depth > 0 && currentPosition < html.length) {
    openPattern.lastIndex = currentPosition
    closePattern.lastIndex = currentPosition

    const openMatch = openPattern.exec(html)
    const closeMatch = closePattern.exec(html)

    if (!closeMatch) {
      break
    }

    if (openMatch && openMatch.index < closeMatch.index) {
      depth += 1
      currentPosition = openMatch.index + openMatch[0].length
      continue
    }

    depth -= 1
    if (depth === 0) {
      return closeMatch.index + closeMatch[0].length
    }
    currentPosition = closeMatch.index + closeMatch[0].length
  }

  return -1
}

function extractPlainText(rawHtmlFragment: string | null | undefined): string {
  if (!rawHtmlFragment) {
    return ''
  }

  return decodeHtmlEntities(rawHtmlFragment)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractNestedHtmlElementInnerHtmlByClass(
  rawHtml: string,
  tagName: string,
  className: string
): string | null {
  const elementStartPattern = new RegExp(
    `<${tagName}[^>]*class="[^"]*${className}[^"]*"[^>]*>`,
    'i'
  )
  const elementStartMatch = elementStartPattern.exec(rawHtml)
  if (!elementStartMatch) {
    return null
  }

  const innerStartPosition = elementStartMatch.index + elementStartMatch[0].length
  const elementEndPosition = findClosingHtmlTag(rawHtml, innerStartPosition, tagName)
  if (elementEndPosition === -1) {
    return null
  }

  return rawHtml.slice(innerStartPosition, elementEndPosition - `</${tagName}>`.length)
}

function extractLookupHeadwordFromEntryHtml(rawHtml: string, fallbackHeadword: string): string {
  const lookupHeadwordMatch = rawHtml.match(/\bwd="([^"]+)"/i)
  if (!lookupHeadwordMatch) {
    return fallbackHeadword
  }

  const normalizedLookupHeadword = decodeHtmlEntities(lookupHeadwordMatch[1]).trim()
  return normalizedLookupHeadword || fallbackHeadword
}

function extractPhoneticFromHtml(rawHtml: string, phoneticClassName: 'phons_br' | 'phons_n_am'): string | undefined {
  const phoneticMatch = rawHtml.match(
    new RegExp(
      `<div[^>]*class="[^"]*${phoneticClassName}[^"]*"[^>]*>[\\s\\S]*?<span[^>]*class="phon"[^>]*>([^<]+)</span>`,
      'i'
    )
  )

  return phoneticMatch?.[1]?.trim() || undefined
}

function buildSenseSignature(definition: string | null | undefined, definitionCn: string | null | undefined): string {
  return `${definition?.trim() || ''}\u0001${definitionCn?.trim() || ''}`
}

function extractChineseDefinitionFromSenseHtml(rawSenseHtml: string): string {
  const definitionBlockMatch = rawSenseHtml.match(/<deft[^>]*>([\s\S]*?)<\/deft>/i)
  if (!definitionBlockMatch) {
    return ''
  }

  const definitionCnMatch = definitionBlockMatch[1].match(
    /<chn[^>]*class="simple"[^>]*>([\s\S]*?)<\/chn>/i
  )

  return extractPlainText(definitionCnMatch?.[1])
}

function extractEnglishDefinitionFromSenseHtml(rawSenseHtml: string | null | undefined): string {
  if (!rawSenseHtml) {
    return ''
  }

  return extractPlainText(extractNestedHtmlElementInnerHtmlByClass(rawSenseHtml, 'span', 'def'))
}

function extractSenseSignaturesFromHtml(rawHtml: string): Set<string> {
  const senseSignatures = new Set<string>()
  const senseStartPattern = /<li[^>]*class="[^"]*sense[^"]*"[^>]*>/gi
  let senseStartMatch: RegExpExecArray | null

  while ((senseStartMatch = senseStartPattern.exec(rawHtml)) !== null) {
    const senseEndPosition = findClosingHtmlTag(rawHtml, senseStartMatch.index + senseStartMatch[0].length, 'li')
    if (senseEndPosition === -1) {
      continue
    }

    const senseHtml = rawHtml.slice(senseStartMatch.index, senseEndPosition)
    const definition = extractEnglishDefinitionFromSenseHtml(senseHtml)
    if (!definition) {
      continue
    }

    const definitionCn = extractChineseDefinitionFromSenseHtml(senseHtml)
    senseSignatures.add(buildSenseSignature(definition, definitionCn))
    senseStartPattern.lastIndex = senseEndPosition
  }

  return senseSignatures
}

function extractDictionaryEntryVariants(rawHtml: string | null | undefined, fallbackLookupHeadword: string): DictionaryEntryVariant[] {
  if (!rawHtml) {
    return [
      {
        displayHeadword: fallbackLookupHeadword,
        lookupHeadword: fallbackLookupHeadword,
        alternateLookupHeadwords: [],
        rawHtml: '',
        senseSignatures: new Set<string>()
      }
    ]
  }

  const entryStartPattern = /<div[^>]*class="[^"]*entry[^"]*"[^>]*>/gi
  const variants: DictionaryEntryVariant[] = []
  let entryStartMatch: RegExpExecArray | null

  while ((entryStartMatch = entryStartPattern.exec(rawHtml)) !== null) {
    const entryEndPosition = findClosingHtmlTag(rawHtml, entryStartMatch.index + entryStartMatch[0].length, 'div')
    if (entryEndPosition === -1) {
      continue
    }

    const entryHtml = rawHtml.slice(entryStartMatch.index, entryEndPosition)
    const displayHeadword = extractDisplayHeadwordFromHtml(entryHtml, fallbackLookupHeadword)
    const lookupHeadword = extractLookupHeadwordFromEntryHtml(entryHtml, fallbackLookupHeadword)

    variants.push({
      displayHeadword,
      lookupHeadword,
      alternateLookupHeadwords: [],
      phonUk: extractPhoneticFromHtml(entryHtml, 'phons_br'),
      phonUs: extractPhoneticFromHtml(entryHtml, 'phons_n_am'),
      rawHtml: entryHtml,
      senseSignatures: extractSenseSignaturesFromHtml(entryHtml)
    })

    entryStartPattern.lastIndex = entryEndPosition
  }

  if (variants.length === 0) {
    return [
      {
        displayHeadword: extractDisplayHeadwordFromHtml(rawHtml, fallbackLookupHeadword),
        lookupHeadword: fallbackLookupHeadword,
        alternateLookupHeadwords: [],
        phonUk: extractPhoneticFromHtml(rawHtml, 'phons_br'),
        phonUs: extractPhoneticFromHtml(rawHtml, 'phons_n_am'),
        rawHtml,
        senseSignatures: extractSenseSignaturesFromHtml(rawHtml)
      }
    ]
  }

  if (variants.length === 1 && variants[0].lookupHeadword !== fallbackLookupHeadword) {
    variants[0].alternateLookupHeadwords.push(fallbackLookupHeadword)
  }

  return variants
}

function variantMatchesSelectedHeadword(variant: DictionaryEntryVariant, selectedHeadword: string): boolean {
  return (
    variant.displayHeadword === selectedHeadword ||
    variant.lookupHeadword === selectedHeadword ||
    variant.alternateLookupHeadwords.includes(selectedHeadword)
  )
}

function matchesHeadwordPrefixIgnoreCase(headword: string, normalizedQuery: string): boolean {
  return headword.toLowerCase().startsWith(normalizedQuery)
}

function isExactHeadwordMatchIgnoreCase(headword: string, normalizedQuery: string): boolean {
  return headword.toLowerCase() === normalizedQuery
}

function isExactHeadwordMatch(headword: string, query: string): boolean {
  return headword === query
}

function variantMatchesQueryPrefix(variant: DictionaryEntryVariant, query: string): boolean {
  const normalizedQuery = query.toLowerCase()

  return (
    matchesHeadwordPrefixIgnoreCase(variant.displayHeadword, normalizedQuery) ||
    matchesHeadwordPrefixIgnoreCase(variant.lookupHeadword, normalizedQuery) ||
    variant.alternateLookupHeadwords.some((headword) =>
      matchesHeadwordPrefixIgnoreCase(headword, normalizedQuery)
    )
  )
}

function getPreferredVariantLookupHeadword(variant: DictionaryEntryVariant, query: string): string {
  const normalizedQuery = query.toLowerCase()
  const exactCaseMatchedHeadword = [
    variant.lookupHeadword,
    ...variant.alternateLookupHeadwords
  ].find((headword) => isExactHeadwordMatch(headword, query))

  if (exactCaseMatchedHeadword) {
    return exactCaseMatchedHeadword
  }

  if (matchesHeadwordPrefixIgnoreCase(variant.lookupHeadword, normalizedQuery)) {
    return variant.lookupHeadword
  }

  const matchedAlternateHeadword = variant.alternateLookupHeadwords.find((headword) =>
    matchesHeadwordPrefixIgnoreCase(headword, normalizedQuery)
  )
  if (matchedAlternateHeadword) {
    return matchedAlternateHeadword
  }

  return variant.lookupHeadword
}

function getVariantSearchRank(
  variant: DictionaryEntryVariant,
  query: string
): { exactMatchRank: number; matchLengthRank: number; displayHeadwordRank: string } {
  const normalizedQuery = query.toLowerCase()
  const matchedHeadwords = [
    variant.displayHeadword,
    variant.lookupHeadword,
    ...variant.alternateLookupHeadwords
  ].filter((headword) => matchesHeadwordPrefixIgnoreCase(headword, normalizedQuery))

  let exactMatchRank = 2
  if (matchedHeadwords.some((headword) => isExactHeadwordMatch(headword, query))) {
    exactMatchRank = 0
  } else if (
    matchedHeadwords.some((headword) => isExactHeadwordMatchIgnoreCase(headword, normalizedQuery))
  ) {
    exactMatchRank = 1
  }
  const matchLengthRank = matchedHeadwords.length > 0 ? Math.min(...matchedHeadwords.map((headword) => headword.length)) : Number.MAX_SAFE_INTEGER

  return {
    exactMatchRank,
    matchLengthRank,
    displayHeadwordRank: variant.displayHeadword
  }
}

function selectDictionaryEntryVariant(
  variants: DictionaryEntryVariant[],
  currentLookupHeadword: string,
  selectedHeadword?: string
): DictionaryEntryVariant | null {
  const normalizedSelectedHeadword = selectedHeadword?.trim()

  if (normalizedSelectedHeadword) {
    const selectedVariant = variants.find((variant) =>
      variantMatchesSelectedHeadword(variant, normalizedSelectedHeadword)
    )
    if (selectedVariant) {
      return selectedVariant
    }
  }

  return (
    variants.find((variant) => variantMatchesSelectedHeadword(variant, currentLookupHeadword)) ||
    variants[0] ||
    null
  )
}

function isCustomEntityId(entityId: number): boolean {
  return Number.isInteger(entityId) && entityId < 0
}

function toCustomInternalId(entityId: number): number {
  return Math.abs(entityId)
}

function toCustomWordExternalId(wordId: number): number {
  return -Math.abs(wordId)
}

function toCustomSenseExternalId(senseId: number): number {
  return -Math.abs(senseId)
}

function parseExamplesJson(examples: string | null | undefined): Array<{ en: string; cn?: string }> {
  if (!examples) {
    return []
  }

  try {
    return JSON.parse(examples) as Array<{ en: string; cn?: string }>
  } catch (error) {
    console.error('Parse examples failed:', error)
    return []
  }
}

function escapeHtmlPreservingLineBreaks(rawText: string): string {
  return rawText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br />')
}

function normalizeCustomExamples(rawExamples: unknown):
  | { success: true; examples: Array<{ en: string; cn: string }> }
  | { success: false; error: string } {
  if (rawExamples == null) {
    return { success: true, examples: [] }
  }

  if (!Array.isArray(rawExamples)) {
    return { success: false, error: '例句格式无效' }
  }

  const normalizedExamples: Array<{ en: string; cn: string }> = []

  for (const [index, rawExample] of rawExamples.entries()) {
    const exampleRecord =
      rawExample && typeof rawExample === 'object'
        ? (rawExample as { en?: unknown; cn?: unknown })
        : {}

    const normalizedEnglish = typeof exampleRecord.en === 'string' ? exampleRecord.en.trim() : ''
    const normalizedChinese = typeof exampleRecord.cn === 'string' ? exampleRecord.cn.trim() : ''
    const hasAnyContent = normalizedEnglish !== '' || normalizedChinese !== ''

    if (!hasAnyContent) {
      continue
    }

    if (normalizedEnglish.length > MAX_CUSTOM_EXAMPLE_EN_LENGTH) {
      return {
        success: false,
        error: `第 ${index + 1} 条例句英文不能超过 ${MAX_CUSTOM_EXAMPLE_EN_LENGTH} 个字符`
      }
    }

    if (normalizedChinese.length > MAX_CUSTOM_EXAMPLE_CN_LENGTH) {
      return {
        success: false,
        error: `第 ${index + 1} 条例句中文不能超过 ${MAX_CUSTOM_EXAMPLE_CN_LENGTH} 个字符`
      }
    }

    normalizedExamples.push({
      en: escapeHtmlPreservingLineBreaks(normalizedEnglish),
      cn: escapeHtmlPreservingLineBreaks(normalizedChinese)
    })
  }

  return { success: true, examples: normalizedExamples }
}

function normalizeCustomEntryInput(payload: {
  headword?: unknown
  definitionCn?: unknown
  note?: unknown
  examples?: unknown
}): { success: true; data: NormalizedCustomEntryInput } | { success: false; error: string } {
  const normalizedHeadword = typeof payload?.headword === 'string' ? payload.headword.trim() : ''
  const normalizedDefinitionCn = typeof payload?.definitionCn === 'string' ? payload.definitionCn.trim() : ''
  const normalizedNote = typeof payload?.note === 'string' ? payload.note.trim() : ''
  const normalizedExamplesResult = normalizeCustomExamples(payload?.examples)

  if (!normalizedHeadword) {
    return { success: false, error: '英文内容不能为空' }
  }
  if (!normalizedDefinitionCn) {
    return { success: false, error: '中文内容不能为空' }
  }
  if (normalizedHeadword.length > MAX_CUSTOM_HEADWORD_LENGTH) {
    return { success: false, error: `英文内容不能超过 ${MAX_CUSTOM_HEADWORD_LENGTH} 个字符` }
  }
  if (normalizedNote.length > MAX_CUSTOM_NOTE_LENGTH) {
    return { success: false, error: `笔记不能超过 ${MAX_CUSTOM_NOTE_LENGTH} 个字符` }
  }
  if (normalizedDefinitionCn.length > MAX_CUSTOM_DEFINITION_CN_LENGTH) {
    return { success: false, error: `中文内容不能超过 ${MAX_CUSTOM_DEFINITION_CN_LENGTH} 个字符` }
  }
  if (!normalizedExamplesResult.success) {
    return { success: false, error: normalizedExamplesResult.error }
  }

  return {
    success: true,
    data: {
      headword: normalizedHeadword,
      definitionCn: normalizedDefinitionCn,
      note: normalizedNote,
      examples: normalizedExamplesResult.examples
    }
  }
}

function saveCustomSenseNote(database: ReturnType<typeof getDatabase>, senseId: number, note: string): void {
  if (!note) {
    database.prepare('DELETE FROM user_db.sense_notes WHERE sense_id = ?').run(senseId)
    return
  }

  database.prepare(`
    INSERT INTO user_db.sense_notes (sense_id, note, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(sense_id) DO UPDATE SET
      note = excluded.note,
      updated_at = CURRENT_TIMESTAMP
  `).run(senseId, note)
}

function deleteFsrsDataForItem(
  database: ReturnType<typeof getDatabase>,
  itemType: 'sense' | 'word',
  itemId: number
): void {
  database.prepare(`
    DELETE FROM user_db.fsrs_review_logs
    WHERE card_id IN (
      SELECT id
      FROM user_db.fsrs_cards
      WHERE item_type = ? AND item_id = ?
    )
  `).run(itemType, itemId)

  database.prepare(`
    DELETE FROM user_db.fsrs_cards
    WHERE item_type = ? AND item_id = ?
  `).run(itemType, itemId)
}

function deleteCustomWordCascade(
  database: ReturnType<typeof getDatabase>,
  customInternalWordId: number
): { wordId: number } {
  const currentCustomWord = database.prepare(`
    SELECT id
    FROM user_db.custom_words
    WHERE id = ?
    LIMIT 1
  `).get(customInternalWordId) as { id: number } | undefined

  if (!currentCustomWord) {
    throw new Error('手动录入词条不存在')
  }

  const customSenses = database.prepare(`
    SELECT id
    FROM user_db.custom_senses
    WHERE word_id = ?
  `).all(customInternalWordId) as Array<{ id: number }>

  for (const customSense of customSenses) {
    const externalSenseId = toCustomSenseExternalId(customSense.id)
    database.prepare('DELETE FROM user_db.sense_tags WHERE sense_id = ?').run(externalSenseId)
    database.prepare('DELETE FROM user_db.sense_notes WHERE sense_id = ?').run(externalSenseId)
    deleteFsrsDataForItem(database, 'sense', externalSenseId)
  }

  const externalWordId = toCustomWordExternalId(customInternalWordId)
  database.prepare('DELETE FROM user_db.custom_senses WHERE word_id = ?').run(customInternalWordId)
  database.prepare('DELETE FROM user_db.word_tags WHERE word_id = ?').run(externalWordId)
  database.prepare('DELETE FROM user_db.word_notes WHERE word_id = ?').run(externalWordId)
  deleteFsrsDataForItem(database, 'word', externalWordId)
  database.prepare('DELETE FROM user_db.custom_words WHERE id = ?').run(customInternalWordId)

  return { wordId: externalWordId }
}

export function registerIpcHandlers(): void {
  ipcMain.on(IPC_CHANNELS.CAPTURE_TELEMETRY_EVENT, (_event, eventName: unknown, properties?: unknown) => {
    if (!isTelemetryEventName(eventName)) {
      console.warn('[Telemetry] Invalid event name:', eventName)
      return
    }

    if (properties !== undefined && (properties === null || typeof properties !== 'object' || Array.isArray(properties))) {
      console.warn('[Telemetry] Invalid event properties for:', eventName)
      return
    }

    captureTelemetryEvent(eventName, (properties || {}) as TelemetryEventProperties)
  })

  const ensureSystemTagId = (tagName: string): number => {
    const database = getDatabase()
    const systemTagColor = tagName === SYSTEM_TAGS.FAVORITE.name
      ? SYSTEM_TAGS.FAVORITE.color
      : SYSTEM_TAGS.ARCHIVED.color

    if (tagName === SYSTEM_TAGS.ARCHIVED.name) {
      const legacyArchivedTagName = '已归档'
      const archivedTag = database
        .prepare('SELECT id FROM user_db.tags WHERE name = ?')
        .get(SYSTEM_TAGS.ARCHIVED.name) as { id: number } | undefined
      const legacyArchivedTag = database
        .prepare('SELECT id FROM user_db.tags WHERE name = ?')
        .get(legacyArchivedTagName) as { id: number } | undefined

      if (!archivedTag && legacyArchivedTag) {
        database.prepare('UPDATE user_db.tags SET name = ?, color = ? WHERE id = ?').run(
          SYSTEM_TAGS.ARCHIVED.name,
          SYSTEM_TAGS.ARCHIVED.color,
          legacyArchivedTag.id
        )
        return legacyArchivedTag.id
      }

      if (archivedTag && legacyArchivedTag && archivedTag.id !== legacyArchivedTag.id) {
        const mergeLegacyArchivedTag = database.transaction(() => {
          database.prepare(
            `INSERT OR IGNORE INTO user_db.sense_tags (sense_id, tag_id)
             SELECT sense_id, ? FROM user_db.sense_tags WHERE tag_id = ?`
          ).run(archivedTag.id, legacyArchivedTag.id)

          database.prepare(
            `INSERT OR IGNORE INTO user_db.word_tags (word_id, tag_id)
             SELECT word_id, ? FROM user_db.word_tags WHERE tag_id = ?`
          ).run(archivedTag.id, legacyArchivedTag.id)

          database.prepare('DELETE FROM user_db.sense_tags WHERE tag_id = ?').run(legacyArchivedTag.id)
          database.prepare('DELETE FROM user_db.word_tags WHERE tag_id = ?').run(legacyArchivedTag.id)
          database.prepare('DELETE FROM user_db.tags WHERE id = ?').run(legacyArchivedTag.id)
        })

        mergeLegacyArchivedTag()
      }
    }

    let existingTag = database.prepare('SELECT id FROM user_db.tags WHERE name = ?').get(tagName) as { id: number } | undefined
    if (existingTag) {
      database.prepare('UPDATE user_db.tags SET color = ? WHERE id = ?').run(systemTagColor, existingTag.id)
      return existingTag.id
    }

    database.prepare('INSERT OR IGNORE INTO user_db.tags (name, color) VALUES (?, ?)').run(tagName, systemTagColor)

    existingTag = database.prepare('SELECT id FROM user_db.tags WHERE name = ?').get(tagName) as { id: number } | undefined
    if (!existingTag) {
      throw new Error(`Failed to initialize system tag: ${tagName}`)
    }

    return existingTag.id
  }

  const getSenseTags = (senseId: number) => {
    const database = getDatabase()
    return database.prepare(`
      SELECT t.*
      FROM user_db.tags t
      JOIN user_db.sense_tags st ON t.id = st.tag_id
      WHERE st.sense_id = ?
    `).all(senseId)
  }

  const getWordTags = (wordId: number) => {
    const database = getDatabase()
    return database.prepare(`
      SELECT t.*
      FROM user_db.tags t
      JOIN user_db.word_tags wt ON t.id = wt.tag_id
      WHERE wt.word_id = ?
    `).all(wordId)
  }

  ipcMain.handle('getTtsAudio', async (_event, text: string) => {
    try {
      return await ttsService.getAudio(text)
    } catch (error) {
      console.error('getTtsAudio error:', error)
      return { success: false, error: 'TTS request failed' }
    }
  })

  // 搜索词条
  ipcMain.handle(IPC_CHANNELS.SEARCH_WORD, (_event, query: string, limit = 20) => {
    const db = getDatabase()
    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      return []
    }
    const candidateLimit = Math.max(limit * 5, 50)

    const stmt = db.prepare(`
      SELECT id, lookup_headword, definition_html, dict_name
      FROM (
        SELECT
          id,
          headword AS lookup_headword,
          definition_html,
          '${DICTIONARY_SEARCH_SOURCE_LABEL}' AS dict_name,
          0 AS source_order
        FROM words
        WHERE headword LIKE ? || '%'

        UNION ALL

        SELECT
          -id AS id,
          headword AS lookup_headword,
          definition_html,
          '${CUSTOM_SEARCH_SOURCE_LABEL}' AS dict_name,
          1 AS source_order
        FROM user_db.custom_words
        WHERE headword LIKE ? || '%'
      )
      ORDER BY
        CASE WHEN lower(lookup_headword) = lower(?) THEN 0 ELSE 1 END,
        LENGTH(lookup_headword),
        source_order,
        lookup_headword COLLATE NOCASE
      LIMIT ?
    `)
    const searchResults = stmt.all(normalizedQuery, normalizedQuery, normalizedQuery, candidateLimit) as Array<{
      id: number
      lookup_headword: string
      definition_html: string
      dict_name: string
    }>
    const redirectTargetStmt = db.prepare(`
      SELECT
        id,
        headword AS lookup_headword,
        definition_html,
        '${DICTIONARY_SEARCH_SOURCE_LABEL}' AS dict_name
      FROM words
      WHERE headword = ?
      LIMIT 1
    `)

    const resolveDictionarySearchResult = (result: {
      id: number
      lookup_headword: string
      definition_html: string
      dict_name: string
    }) => {
      if (!isExactHeadwordMatchIgnoreCase(result.lookup_headword, normalizedQuery.toLowerCase())) {
        return { resolvedResult: result, redirectLookupHeadword: null }
      }

      const redirectLookupHeadword = extractDirectRedirectLookupHeadword(result.definition_html)
      if (!redirectLookupHeadword || redirectLookupHeadword === result.lookup_headword) {
        return { resolvedResult: result, redirectLookupHeadword: null }
      }

      const resolvedResult = (
        redirectTargetStmt.get(redirectLookupHeadword) as
          | {
              id: number
              lookup_headword: string
              definition_html: string
              dict_name: string
            }
          | undefined
      ) || result

      return { resolvedResult, redirectLookupHeadword }
    }

    const flattenedSearchResults = searchResults.flatMap((result) => {
      if (result.id < 0) {
        return [
          {
            id: result.id,
            headword: result.lookup_headword,
            lookupHeadword: result.lookup_headword,
            dict_name: result.dict_name
          }
        ]
      }

      const { resolvedResult, redirectLookupHeadword } = resolveDictionarySearchResult(result)
      const variantMatchQuery = redirectLookupHeadword || normalizedQuery

      return extractDictionaryEntryVariants(resolvedResult.definition_html, resolvedResult.lookup_headword)
        .filter((variant) => variantMatchesQueryPrefix(variant, variantMatchQuery))
        .map((variant) => ({
          id: resolvedResult.id,
          headword: variant.displayHeadword,
          lookupHeadword: getPreferredVariantLookupHeadword(variant, variantMatchQuery),
          matchedHeadword: redirectLookupHeadword ? result.lookup_headword : undefined,
          dict_name: resolvedResult.dict_name,
          ...getVariantSearchRank(variant, variantMatchQuery)
        }))
    })

    flattenedSearchResults.sort((left, right) => {
      if (left.exactMatchRank !== right.exactMatchRank) {
        return left.exactMatchRank - right.exactMatchRank
      }
      if (left.matchLengthRank !== right.matchLengthRank) {
        return left.matchLengthRank - right.matchLengthRank
      }
      if (left.dict_name !== right.dict_name) {
        return left.dict_name.localeCompare(right.dict_name)
      }
      if (left.displayHeadwordRank !== right.displayHeadwordRank) {
        return left.displayHeadwordRank.localeCompare(right.displayHeadwordRank)
      }
      if (left.lookupHeadword !== right.lookupHeadword) {
        return (left.lookupHeadword || '').localeCompare(right.lookupHeadword || '')
      }
      return left.id - right.id
    })

    const uniqueSearchResultMap = new Map<string, (typeof flattenedSearchResults)[number]>()
    for (const result of flattenedSearchResults) {
      const resultKey = `${result.id}:${result.headword}:${result.lookupHeadword || ''}:${result.dict_name}`
      if (!uniqueSearchResultMap.has(resultKey)) {
        uniqueSearchResultMap.set(resultKey, result)
      }
    }
    const uniqueSearchResults = Array.from(uniqueSearchResultMap.values())

    return uniqueSearchResults
      .slice(0, limit)
      .map(({ exactMatchRank: _exactMatchRank, matchLengthRank: _matchLengthRank, displayHeadwordRank: _displayHeadwordRank, ...result }) => result)
  })

  // 获取词条的所有义项（聚合所有同名 headword 的义项）
  ipcMain.handle(IPC_CHANNELS.GET_WORD_SENSES, (_event, wordId: number, selectedEntryHeadword?: string) => {
    const db = getDatabase()
    const favoriteTagId = ensureSystemTagId(SYSTEM_TAGS.FAVORITE.name)

    if (isCustomEntityId(wordId)) {
      const customInternalWordId = toCustomInternalId(wordId)
      const currentCustomWord = db.prepare(`
        SELECT *
        FROM user_db.custom_words
        WHERE id = ?
      `).get(customInternalWordId) as any

      if (!currentCustomWord) {
        throw new Error(`Custom word not found with id: ${wordId}`)
      }

      const customSenses = db.prepare(`
        SELECT
          s.*,
          CASE WHEN st.sense_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorited,
          n.note AS favorite_note
        FROM user_db.custom_senses s
        LEFT JOIN user_db.sense_tags st ON -s.id = st.sense_id AND st.tag_id = ?
        LEFT JOIN user_db.sense_notes n ON -s.id = n.sense_id
        WHERE s.word_id = ?
        ORDER BY s.sense_index
      `).all(favoriteTagId, customInternalWordId) as any[]

      const externalWordId = toCustomWordExternalId(currentCustomWord.id)
      const wordTags = db.prepare(`
        SELECT t.*
        FROM user_db.tags t
        JOIN user_db.word_tags wt ON t.id = wt.tag_id
        WHERE wt.word_id = ?
      `).all(externalWordId)

      const sensesWithTags = customSenses.map((sense) => {
        const externalSenseId = toCustomSenseExternalId(sense.id)
        const tags = db.prepare(`
          SELECT t.*
          FROM user_db.tags t
          JOIN user_db.sense_tags st ON t.id = st.tag_id
          WHERE st.sense_id = ?
        `).all(externalSenseId)

        return {
          ...sense,
          id: externalSenseId,
          word_id: externalWordId,
          tags
        }
      })

      return {
        word: {
          ...currentCustomWord,
          id: externalWordId,
          tags: wordTags
        },
        senses: sensesWithTags
      }
    }

    // 1. 先获取当前 ID 对应的 headword
    const currentWord = db.prepare('SELECT * FROM words WHERE id = ?').get(wordId) as any
    if (!currentWord) {
      throw new Error(`Word not found with id: ${wordId}`)
    }
    const currentLookupHeadword = currentWord.headword
    const currentWordVariants = extractDictionaryEntryVariants(currentWord.definition_html, currentLookupHeadword)
    const selectedVariant = selectDictionaryEntryVariant(
      currentWordVariants,
      currentLookupHeadword,
      selectedEntryHeadword
    )

    // 2. 查找所有具有相同 headword 的单词 ID
    const sameWords = db.prepare('SELECT id, headword, definition_html FROM words WHERE headword = ?').all(currentLookupHeadword) as any[]
    
    const wordIds = sameWords.map(w => w.id)

    // 3. 获取所有相关单词的义项
    // 使用 IN (?) 会有问题，better-sqlite3 需要展开参数
    const placeholders = wordIds.map(() => '?').join(',')
    
    // 使用 sense_tags 表判断是否收藏（通过收藏标签）
    const senses = db.prepare(`
      SELECT s.*,
        CASE WHEN st.sense_id IS NOT NULL THEN 1 ELSE 0 END as is_favorited,
        n.note as favorite_note
      FROM senses s
      LEFT JOIN user_db.sense_tags st ON s.id = st.sense_id AND st.tag_id = ?
      LEFT JOIN user_db.sense_notes n ON s.id = n.sense_id
      WHERE s.word_id IN (${placeholders})
      ORDER BY s.word_id, s.sense_index
    `).all(favoriteTagId, ...wordIds)

    // 4. 获取每个义项的标签
    const sensesWithTags = (senses as any[]).map((sense) => {
      const tags = db.prepare(`
        SELECT t.*
        FROM user_db.tags t
        JOIN user_db.sense_tags st ON t.id = st.tag_id
        WHERE st.sense_id = ?
      `).all(sense.id)
      const repairedDefinition = extractEnglishDefinitionFromSenseHtml(sense.raw_html)
      return {
        ...sense,
        definition: repairedDefinition || sense.definition,
        tags
      }
    })

    let filteredSensesWithTags = sensesWithTags
    if (selectedVariant && selectedVariant.senseSignatures.size > 0) {
      const matchingSenseSignatures = new Set<string>()

      for (const sameWord of sameWords) {
        const sameWordVariants = extractDictionaryEntryVariants(sameWord.definition_html, sameWord.headword)
        sameWordVariants
          .filter((variant) =>
            variantMatchesSelectedHeadword(variant, selectedVariant.displayHeadword) ||
            variantMatchesSelectedHeadword(variant, selectedVariant.lookupHeadword)
          )
          .forEach((variant) => {
            variant.senseSignatures.forEach((signature) => matchingSenseSignatures.add(signature))
          })
      }

      const narrowedSensesWithTags = sensesWithTags.filter((sense) =>
        matchingSenseSignatures.has(buildSenseSignature(sense.definition, sense.definition_cn))
      )

      if (narrowedSensesWithTags.length > 0) {
        filteredSensesWithTags = narrowedSensesWithTags
      }
    }

    // 4.1 获取当前单词的标签 (Word-level tags)
    const wordTags = db.prepare(`
      SELECT t.*
      FROM user_db.tags t
      JOIN user_db.word_tags wt ON t.id = wt.tag_id
      WHERE wt.word_id = ?
    `).all(currentWord.id)
    currentWord.tags = wordTags
    currentWord.headword = selectedVariant?.displayHeadword || extractDisplayHeadwordFromHtml(currentWord.definition_html, currentLookupHeadword)
    currentWord.phon_uk = selectedVariant?.phonUk || currentWord.phon_uk
    currentWord.phon_us = selectedVariant?.phonUs || currentWord.phon_us

    // 5. 合并 definition_html，如果需要显示完整原始 HTML
    // 这里我们只返回请求的 word 对象，但 senses 是全集
    // 前端展示时主要依赖 senses 列表
    
    return { word: currentWord, senses: filteredSensesWithTags }
  })

  ipcMain.handle(IPC_CHANNELS.CREATE_CUSTOM_ENTRY, (_event, payload: CreateCustomEntryPayload) => {
    try {
      const db = getDatabase()
      const normalizedInputResult = normalizeCustomEntryInput(payload)

      if (!normalizedInputResult.success) {
        return { success: false, error: normalizedInputResult.error }
      }

      const { headword, definitionCn, note, examples } = normalizedInputResult.data
      const serializedExamples = JSON.stringify(examples)

      const createCustomEntry = db.transaction(() => {
        const existingCustomWord = db.prepare(`
          SELECT id
          FROM user_db.custom_words
          WHERE headword = ?
          LIMIT 1
        `).get(headword) as { id: number } | undefined

        let customInternalWordId = existingCustomWord?.id
        if (!customInternalWordId) {
          const insertedWord = db.prepare(`
            INSERT INTO user_db.custom_words (headword, definition_html, updated_at)
            VALUES (?, '', CURRENT_TIMESTAMP)
          `).run(headword)
          customInternalWordId = Number(insertedWord.lastInsertRowid)
        } else {
          db.prepare(`
            UPDATE user_db.custom_words
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(customInternalWordId)
        }

        const nextSenseIndexRow = db.prepare(`
          SELECT COALESCE(MAX(sense_index), 0) + 1 AS next_sense_index
          FROM user_db.custom_senses
          WHERE word_id = ?
        `).get(customInternalWordId) as { next_sense_index: number }

        const insertedSense = db.prepare(`
          INSERT INTO user_db.custom_senses (
            word_id,
            sense_index,
            definition,
            definition_cn,
            examples,
            raw_html,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, '', CURRENT_TIMESTAMP)
        `).run(
          customInternalWordId,
          nextSenseIndexRow.next_sense_index,
          '',
          definitionCn,
          serializedExamples
        )

        const insertedSenseExternalId = toCustomSenseExternalId(Number(insertedSense.lastInsertRowid))

        saveCustomSenseNote(db, insertedSenseExternalId, note)

        return {
          wordId: toCustomWordExternalId(customInternalWordId),
          senseId: insertedSenseExternalId
        }
      })

      return {
        success: true,
        ...createCustomEntry()
      }
    } catch (error) {
      console.error('Create custom entry failed:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_CUSTOM_ENTRY, (_event, payload: UpdateCustomEntryPayload) => {
    try {
      const db = getDatabase()
      const normalizedInputResult = normalizeCustomEntryInput(payload)
      const externalSenseId = payload?.senseId

      if (!normalizedInputResult.success) {
        return { success: false, error: normalizedInputResult.error }
      }
      if (!isCustomEntityId(externalSenseId)) {
        return { success: false, error: '仅支持编辑手动录入的释义卡片' }
      }

      const { headword, definitionCn, note, examples } = normalizedInputResult.data
      const serializedExamples = JSON.stringify(examples)

      const updateCustomEntry = db.transaction(() => {
        const customSenseInternalId = toCustomInternalId(externalSenseId)
        const currentCustomSense = db.prepare(`
          SELECT
            s.id,
            s.word_id
          FROM user_db.custom_senses s
          WHERE s.id = ?
          LIMIT 1
        `).get(customSenseInternalId) as { id: number; word_id: number } | undefined

        if (!currentCustomSense) {
          throw new Error('手动录入释义不存在')
        }

        const conflictingCustomWord = db.prepare(`
          SELECT id
          FROM user_db.custom_words
          WHERE headword = ?
            AND id != ?
          LIMIT 1
        `).get(headword, currentCustomSense.word_id) as { id: number } | undefined

        if (conflictingCustomWord) {
          throw new Error('已有相同英文内容的手动录入词条，当前暂不支持直接合并，请修改为其他英文内容')
        }

        db.prepare(`
          UPDATE user_db.custom_words
          SET headword = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(headword, currentCustomSense.word_id)

        db.prepare(`
          UPDATE user_db.custom_senses
          SET definition_cn = ?, examples = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(definitionCn, serializedExamples, currentCustomSense.id)

        saveCustomSenseNote(db, externalSenseId, note)

        return {
          wordId: toCustomWordExternalId(currentCustomSense.word_id),
          senseId: externalSenseId
        }
      })

      return {
        success: true,
        ...updateCustomEntry()
      }
    } catch (error) {
      console.error('Update custom entry failed:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_CUSTOM_ENTRY, (_event, payload: DeleteCustomEntryPayload) => {
    try {
      const db = getDatabase()
      const externalSenseId = payload?.senseId

      if (!isCustomEntityId(externalSenseId)) {
        return { success: false, error: '仅支持删除手动录入的释义卡片' }
      }

      const deleteCustomEntry = db.transaction(() => {
        const customSenseInternalId = toCustomInternalId(externalSenseId)
        const currentCustomSense = db.prepare(`
          SELECT
            s.id,
            s.word_id
          FROM user_db.custom_senses s
          WHERE s.id = ?
          LIMIT 1
        `).get(customSenseInternalId) as { id: number; word_id: number } | undefined

        if (!currentCustomSense) {
          throw new Error('手动录入释义不存在')
        }

        const externalWordId = toCustomWordExternalId(currentCustomSense.word_id)

        db.prepare('DELETE FROM user_db.sense_tags WHERE sense_id = ?').run(externalSenseId)
        db.prepare('DELETE FROM user_db.sense_notes WHERE sense_id = ?').run(externalSenseId)
        deleteFsrsDataForItem(db, 'sense', externalSenseId)
        db.prepare('DELETE FROM user_db.custom_senses WHERE id = ?').run(currentCustomSense.id)

        const remainingSenseCount = (
          db.prepare(`
            SELECT COUNT(*) AS count
            FROM user_db.custom_senses
            WHERE word_id = ?
          `).get(currentCustomSense.word_id) as { count: number }
        ).count

        if (remainingSenseCount === 0) {
          deleteCustomWordCascade(db, currentCustomSense.word_id)
        } else {
          db.prepare(`
            UPDATE user_db.custom_words
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(currentCustomSense.word_id)
        }

        return {
          wordId: externalWordId,
          senseId: externalSenseId,
          deletedWord: remainingSenseCount === 0
        }
      })

      return {
        success: true,
        ...deleteCustomEntry()
      }
    } catch (error) {
      console.error('Delete custom entry failed:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_CUSTOM_WORD, (_event, payload: DeleteCustomWordPayload) => {
    try {
      const db = getDatabase()
      const externalWordId = payload?.wordId

      if (!isCustomEntityId(externalWordId)) {
        return { success: false, error: '仅支持删除手动录入词条' }
      }

      const deleteCustomWord = db.transaction(() => deleteCustomWordCascade(db, toCustomInternalId(externalWordId)))

      return {
        success: true,
        ...deleteCustomWord()
      }
    } catch (error) {
      console.error('Delete custom word failed:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.GET_ALL_CUSTOM_SENSES, () => {
    const db = getDatabase()
    const favoriteTagId = ensureSystemTagId(FAVORITE_TAG_NAME)
    const archivedTagId = ensureSystemTagId(ARCHIVED_TAG_NAME)

    const customSenses = db.prepare(`
      SELECT
        -s.id as id,
        -s.word_id as word_id,
        s.sense_index,
        s.sense_group,
        s.grammar,
        s.definition,
        s.definition_cn,
        s.examples,
        w.headword,
        n.note,
        COALESCE(n.updated_at, MAX(st_any.created_at), s.updated_at, w.updated_at) as sort_date,
        CASE WHEN EXISTS (
          SELECT 1
          FROM user_db.sense_tags st_fav
          WHERE st_fav.sense_id = -s.id AND st_fav.tag_id = ?
        ) THEN 1 ELSE 0 END as is_favorited,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM user_db.sense_tags st_arch
            WHERE st_arch.sense_id = -s.id AND st_arch.tag_id = ?
          ) THEN 1
          WHEN EXISTS (
            SELECT 1
            FROM user_db.word_tags wt_arch
            WHERE wt_arch.word_id = -s.word_id AND wt_arch.tag_id = ?
          ) THEN 1
          ELSE 0
        END as is_archived
      FROM user_db.custom_senses s
      JOIN user_db.custom_words w ON s.word_id = w.id
      LEFT JOIN user_db.sense_notes n ON -s.id = n.sense_id
      LEFT JOIN user_db.sense_tags st_any ON -s.id = st_any.sense_id
      GROUP BY
        s.id,
        s.word_id,
        s.sense_index,
        s.sense_group,
        s.grammar,
        s.definition,
        s.definition_cn,
        s.examples,
        w.headword,
        n.note,
        n.updated_at,
        s.updated_at,
        w.updated_at
      ORDER BY datetime(sort_date) DESC, s.id DESC
    `).all(favoriteTagId, archivedTagId, archivedTagId) as any[]

    return customSenses.map((customSense) => {
      const createdAt = customSense.sort_date || ''
      return {
        type: 'sense' as const,
        entityType: 'sense' as const,
        entityId: customSense.id,
        senseId: customSense.id,
        wordId: customSense.word_id,
        headword: customSense.headword,
        definition: customSense.definition,
        definitionCn: customSense.definition_cn,
        grammar: customSense.grammar,
        senseGroup: customSense.sense_group,
        senseIndex: customSense.sense_index,
        examples: customSense.examples,
        isFavorited: customSense.is_favorited === 1,
        note: customSense.note,
        tags: getSenseTags(customSense.id),
        isArchived: customSense.is_archived === 1,
        createdAt,
        id: customSense.id,
        word_id: customSense.word_id,
        sense_id: customSense.id,
        definition_cn: customSense.definition_cn,
        sense_group: customSense.sense_group,
        sense_index: customSense.sense_index,
        is_favorited: customSense.is_favorited,
        is_archived: customSense.is_archived,
        created_at: createdAt
      }
    })
  })

  ipcMain.handle(IPC_CHANNELS.GET_ALL_CUSTOM_WORDS, () => {
    const db = getDatabase()
    const archivedTagId = ensureSystemTagId(SYSTEM_TAGS.ARCHIVED.name)

    const customWords = db.prepare(`
      SELECT
        -w.id as id,
        -w.id as word_id,
        w.headword,
        w.definition_html,
        wn.note,
        COALESCE(wn.updated_at, MAX(wt.created_at), w.updated_at) as sort_date,
        CASE WHEN EXISTS (
          SELECT 1
          FROM user_db.word_tags wt_arch
          WHERE wt_arch.word_id = -w.id AND wt_arch.tag_id = ?
        ) THEN 1 ELSE 0 END as is_archived
      FROM user_db.custom_words w
      LEFT JOIN user_db.word_tags wt ON -w.id = wt.word_id
      LEFT JOIN user_db.word_notes wn ON -w.id = wn.word_id
      GROUP BY w.id, w.headword, w.definition_html, wn.note, wn.updated_at, w.updated_at
      ORDER BY datetime(sort_date) DESC, w.id DESC
    `).all(archivedTagId) as any[]

    return customWords.map((customWord) => {
      const createdAt = customWord.sort_date || ''

      return {
        type: 'word' as const,
        entityType: 'word' as const,
        entityId: customWord.word_id,
        wordId: customWord.word_id,
        headword: customWord.headword,
        definitionHtml: customWord.definition_html,
        note: customWord.note,
        tags: getWordTags(customWord.word_id),
        isArchived: customWord.is_archived === 1,
        createdAt,
        id: customWord.id,
        word_id: customWord.word_id,
        is_archived: customWord.is_archived,
        created_at: createdAt
      }
    })
  })

  // 获取音频
  ipcMain.handle(IPC_CHANNELS.GET_AUDIO, async (_event, filename: string) => {
    const audioData = await getAudio(filename)
    if (audioData) {
      // 返回 base64 编码的音频数据
      return {
        success: true,
        data: audioData.toString('base64'),
        mimeType: 'audio/mpeg'
      }
    }
    return { success: false }
  })

  // 收藏操作（通过标签系统实现）
  const FAVORITE_TAG_NAME = SYSTEM_TAGS.FAVORITE.name
  const ARCHIVED_TAG_NAME = SYSTEM_TAGS.ARCHIVED.name
  
  ipcMain.handle(IPC_CHANNELS.ADD_FAVORITE, (_event, senseId: number) => {
    const db = getDatabase()
    const favoriteTagId = ensureSystemTagId(FAVORITE_TAG_NAME)
    // 添加标签
    db.prepare("INSERT OR IGNORE INTO user_db.sense_tags (sense_id, tag_id, created_at) VALUES (?, ?, datetime('now'))").run(senseId, favoriteTagId)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.REMOVE_FAVORITE, (_event, senseId: number) => {
    const db = getDatabase()
    const favoriteTagId = ensureSystemTagId(FAVORITE_TAG_NAME)
    db.prepare('DELETE FROM user_db.sense_tags WHERE sense_id = ? AND tag_id = ?').run(senseId, favoriteTagId)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.QUICK_ARCHIVE_SENSE, (_event, senseId: number) => {
    try {
      const db = getDatabase()
      const archivedTagId = ensureSystemTagId(ARCHIVED_TAG_NAME)
      db.prepare(
        "INSERT OR IGNORE INTO user_db.sense_tags (sense_id, tag_id, created_at) VALUES (?, ?, datetime('now'))"
      ).run(senseId, archivedTagId)
      return { success: true }
    } catch (error) {
      console.error('Quick archive sense failed', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.QUICK_ARCHIVE_WORD, (_event, wordId: number) => {
    try {
      const db = getDatabase()
      const archivedTagId = ensureSystemTagId(ARCHIVED_TAG_NAME)
      db.prepare(
        "INSERT OR IGNORE INTO user_db.word_tags (word_id, tag_id, created_at) VALUES (?, ?, datetime('now'))"
      ).run(wordId, archivedTagId)
      return { success: true }
    } catch (error) {
      console.error('Quick archive word failed', error)
      return { success: false, error: String(error) }
    }
  })

  // 批量移除收藏标签
  ipcMain.handle(IPC_CHANNELS.REMOVE_FAVORITES_BATCH, (_event, senseIds: number[]) => {
    const db = getDatabase()
    const favoriteTagId = ensureSystemTagId(FAVORITE_TAG_NAME)
    
    const deleteStmt = db.prepare('DELETE FROM user_db.sense_tags WHERE sense_id = ? AND tag_id = ?')
    
    const transaction = db.transaction((ids: number[]) => {
      for (const id of ids) {
        deleteStmt.run(id, favoriteTagId)
      }
    })
    
    try {
      transaction(senseIds)
      return { success: true }
    } catch (error) {
      console.error('Batch remove failed', error)
      return { success: false, error: String(error) }
    }
  })

  // 批量更新笔记 (使用 sense_notes 表)
  ipcMain.handle(IPC_CHANNELS.UPDATE_FAVORITES_NOTE_BATCH, (_event, senseIds: number[], note: string | null) => {
    const db = getDatabase()
    
    // 如果笔记为空，删除；否则更新/插入
    const deleteStmt = db.prepare('DELETE FROM user_db.sense_notes WHERE sense_id = ?')
    const upsertStmt = db.prepare(`
      INSERT INTO user_db.sense_notes (sense_id, note, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(sense_id) DO UPDATE SET
        note = excluded.note,
        updated_at = CURRENT_TIMESTAMP
    `)
    
    const transaction = db.transaction((ids: number[]) => {
      for (const id of ids) {
        if (!note || note.trim() === '') {
          deleteStmt.run(id)
        } else {
          upsertStmt.run(id, note.trim())
        }
      }
    })
    
    try {
      transaction(senseIds)
      return { success: true }
    } catch (error) {
      console.error('Batch note update failed', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.GET_FAVORITES, () => {
    const db = getDatabase()
    
    // 获取系统标签 ID
    const favoriteTagId = ensureSystemTagId(FAVORITE_TAG_NAME)
    const archivedTagId = ensureSystemTagId(ARCHIVED_TAG_NAME)
    
    /*
     * 统一使用标签系统查询：
     * - 已收藏的义项 (通过 sense_tags 关联收藏标签)
     * - 有笔记的义项 (通过 sense_notes)
     * - 有其他标签的义项 (通过 sense_tags)
     */

    // 1. Fetch SENSES - 只使用 sense_tags 和 sense_notes
    const senses = db.prepare(`
      SELECT DISTINCT
        'sense' as type,
        s.id,
        s.word_id,
        s.sense_index,
        s.sense_group,
        s.grammar,
        s.definition,
        s.definition_cn,
        s.examples,
        w.headword,
        w.definition_html,
        n.note,
        COALESCE(n.updated_at, st_fav.created_at, st_any.created_at) as sort_date,
        CASE WHEN st_fav.sense_id IS NOT NULL THEN 1 ELSE 0 END as is_favorited,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM user_db.sense_tags st_arch
            WHERE st_arch.sense_id = s.id AND st_arch.tag_id = ?
          ) THEN 1
          WHEN EXISTS (
            SELECT 1
            FROM user_db.word_tags wt_arch
            WHERE wt_arch.word_id = s.word_id AND wt_arch.tag_id = ?
          ) THEN 1
          ELSE 0
        END as is_archived
      FROM senses s
      JOIN words w ON s.word_id = w.id
      LEFT JOIN user_db.sense_notes n ON s.id = n.sense_id
      LEFT JOIN user_db.sense_tags st_fav ON s.id = st_fav.sense_id AND st_fav.tag_id = ?
      LEFT JOIN user_db.sense_tags st_any ON s.id = st_any.sense_id
      WHERE (st_any.sense_id IS NOT NULL
         OR (n.note IS NOT NULL AND n.note != ''))
    `).all(archivedTagId, archivedTagId, favoriteTagId) as any[]

    const customSenses = db.prepare(`
      SELECT DISTINCT
        'sense' as type,
        -s.id as id,
        -s.word_id as word_id,
        s.sense_index,
        s.sense_group,
        s.grammar,
        s.definition,
        s.definition_cn,
        s.examples,
        w.headword,
        w.definition_html,
        n.note,
        COALESCE(n.updated_at, st_fav.created_at, st_any.created_at, s.updated_at, w.updated_at) as sort_date,
        CASE WHEN st_fav.sense_id IS NOT NULL THEN 1 ELSE 0 END as is_favorited,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM user_db.sense_tags st_arch
            WHERE st_arch.sense_id = -s.id AND st_arch.tag_id = ?
          ) THEN 1
          WHEN EXISTS (
            SELECT 1
            FROM user_db.word_tags wt_arch
            WHERE wt_arch.word_id = -s.word_id AND wt_arch.tag_id = ?
          ) THEN 1
          ELSE 0
        END as is_archived
      FROM user_db.custom_senses s
      JOIN user_db.custom_words w ON s.word_id = w.id
      LEFT JOIN user_db.sense_notes n ON -s.id = n.sense_id
      LEFT JOIN user_db.sense_tags st_fav ON -s.id = st_fav.sense_id AND st_fav.tag_id = ?
      LEFT JOIN user_db.sense_tags st_any ON -s.id = st_any.sense_id
      WHERE (st_any.sense_id IS NOT NULL
         OR (n.note IS NOT NULL AND n.note != ''))
    `).all(archivedTagId, archivedTagId, favoriteTagId) as any[]

    // 2. Fetch WORDS with tags
    const words = db.prepare(`
      SELECT
        'word' as type,
        w.id as word_id,
        w.id as id, -- For compatibility in list key
        w.headword,
        w.definition_html,
        wn.note,
        COALESCE(wn.updated_at, MAX(wt.created_at)) as sort_date,
        CASE WHEN EXISTS (
          SELECT 1
          FROM user_db.word_tags wt_arch
          WHERE wt_arch.word_id = w.id AND wt_arch.tag_id = ?
        ) THEN 1 ELSE 0 END as is_archived
      FROM words w
      LEFT JOIN user_db.word_tags wt ON w.id = wt.word_id
      LEFT JOIN user_db.word_notes wn ON w.id = wn.word_id
      WHERE wt.word_id IS NOT NULL
        OR (wn.note IS NOT NULL AND wn.note != '')
      GROUP BY w.id, w.headword, w.definition_html, wn.note, wn.updated_at
    `).all(archivedTagId) as any[]

    const customWords = db.prepare(`
      SELECT
        'word' as type,
        -w.id as word_id,
        -w.id as id,
        w.headword,
        w.definition_html,
        wn.note,
        COALESCE(wn.updated_at, MAX(wt.created_at), w.updated_at) as sort_date,
        CASE WHEN EXISTS (
          SELECT 1
          FROM user_db.word_tags wt_arch
          WHERE wt_arch.word_id = -w.id AND wt_arch.tag_id = ?
        ) THEN 1 ELSE 0 END as is_archived
      FROM user_db.custom_words w
      LEFT JOIN user_db.word_tags wt ON -w.id = wt.word_id
      LEFT JOIN user_db.word_notes wn ON -w.id = wn.word_id
      WHERE wt.word_id IS NOT NULL
        OR (wn.note IS NOT NULL AND wn.note != '')
      GROUP BY w.id, w.headword, w.definition_html, wn.note, wn.updated_at, w.updated_at
    `).all(archivedTagId) as any[]

    // 3. Combine and Sort
    const allItems = [...senses, ...customSenses, ...words, ...customWords].sort((a, b) => {
      const dateA = new Date(a.sort_date || 0).getTime()
      const dateB = new Date(b.sort_date || 0).getTime()
      return dateB - dateA
    })

    // 4. Attach tags for each item and normalize fields for renderer
    return allItems.map((item) => {
      let tags: any[] = []
      
      if (item.type === 'sense') {
        tags = getSenseTags(item.id)
      } else {
        tags = getWordTags(item.word_id)
      }

      if (item.type === 'sense') {
        const isArchived = item.is_archived === 1
        const isFavorited = item.is_favorited === 1
        const createdAt = item.sort_date || ''
        return {
          // normalized fields
          type: 'sense' as const,
          entityType: 'sense' as const,
          entityId: item.id,
          senseId: item.id,
          wordId: item.word_id,
          headword: extractDisplayHeadwordFromHtml(item.definition_html, item.headword),
          definition: item.definition,
          definitionCn: item.definition_cn,
          grammar: item.grammar,
          senseGroup: item.sense_group,
          senseIndex: item.sense_index,
          examples: item.examples,
          isFavorited,
          note: item.note,
          tags,
          isArchived,
          createdAt,
          // compatibility aliases
          id: item.id,
          word_id: item.word_id,
          sense_id: item.id,
          definition_cn: item.definition_cn,
          sense_group: item.sense_group,
          sense_index: item.sense_index,
          is_favorited: item.is_favorited,
          is_archived: item.is_archived,
          created_at: createdAt
        }
      }

      const isArchived = item.is_archived === 1
      const createdAt = item.sort_date || ''
      return {
        // normalized fields
        type: 'word' as const,
        entityType: 'word' as const,
        entityId: item.word_id,
        wordId: item.word_id,
        headword: extractDisplayHeadwordFromHtml(item.definition_html, item.headword),
        definitionHtml: item.definition_html,
        note: item.note,
        tags,
        isArchived,
        createdAt,
        // compatibility aliases
        id: item.id,
        word_id: item.word_id,
        is_archived: item.is_archived,
        created_at: createdAt
      }
    })
  })

  // 标签操作
  ipcMain.handle(IPC_CHANNELS.CREATE_TAG, (_event, name: string, color?: string) => {
    console.log('[CREATE_TAG] Creating tag:', name, color)
    try {
      const normalizedTagName = name.trim()
      if (!normalizedTagName) {
        throw new Error('Tag name cannot be empty')
      }
      if (isSystemTagName(normalizedTagName)) {
        throw new Error('System tag name is reserved')
      }

      const db = getDatabase()
      const stmt = db.prepare(
        'INSERT INTO user_db.tags (name, color) VALUES (?, ?)'
      )
      const result = stmt.run(normalizedTagName, color || '#3B82F6')
      console.log('[CREATE_TAG] Created tag with id:', result.lastInsertRowid)
      return { id: result.lastInsertRowid, name: normalizedTagName, color: color || '#3B82F6' }
    } catch (e) {
      console.error('[CREATE_TAG] Failed to create tag:', e)
      throw e
    }
  })

  ipcMain.handle(IPC_CHANNELS.GET_TAGS, () => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM user_db.tags ORDER BY id ASC').all()
  })

  const addEntityTag = (entityType: EntityType, entityId: number, tagId: number) => {
    if (!entityId || !tagId) {
      return { success: false, error: 'Invalid entity id or tag id' }
    }

    const db = getDatabase()
    try {
      if (entityType === 'sense') {
        db.prepare(
          "INSERT OR IGNORE INTO user_db.sense_tags (sense_id, tag_id, created_at) VALUES (?, ?, datetime('now'))"
        ).run(entityId, tagId)
      } else {
        db.prepare(
          "INSERT OR IGNORE INTO user_db.word_tags (word_id, tag_id, created_at) VALUES (?, ?, datetime('now'))"
        ).run(entityId, tagId)
      }
      return { success: true }
    } catch (error) {
      console.error(`Add ${entityType} tag failed`, error)
      return { success: false, error: String(error) }
    }
  }

  const removeEntityTag = (entityType: EntityType, entityId: number, tagId: number) => {
    if (!entityId || !tagId) {
      return { success: false, error: 'Invalid entity id or tag id' }
    }

    const db = getDatabase()
    try {
      if (entityType === 'sense') {
        db.prepare(
          'DELETE FROM user_db.sense_tags WHERE sense_id = ? AND tag_id = ?'
        ).run(entityId, tagId)
      } else {
        db.prepare(
          'DELETE FROM user_db.word_tags WHERE word_id = ? AND tag_id = ?'
        ).run(entityId, tagId)
      }
      return { success: true }
    } catch (error) {
      console.error(`Remove ${entityType} tag failed`, error)
      return { success: false, error: String(error) }
    }
  }

  const normalizeEntityIdsForBatch = (rawEntityIds: unknown): number[] => {
    if (!Array.isArray(rawEntityIds) || rawEntityIds.length === 0) {
      throw new Error('Entity ids must be a non-empty array')
    }

    const entityIds = rawEntityIds.map((rawEntityId) => {
      if (!Number.isInteger(rawEntityId) || rawEntityId === 0) {
        throw new Error(`Invalid entity id: ${String(rawEntityId)}`)
      }
      return rawEntityId as number
    })

    return Array.from(new Set(entityIds))
  }

  const normalizeTagIdsForBatch = (rawTagIds: unknown): number[] => {
    if (!Array.isArray(rawTagIds) || rawTagIds.length === 0) {
      throw new Error('Tag ids must be a non-empty array')
    }

    const tagIds = rawTagIds.map((rawTagId) => {
      if (!Number.isInteger(rawTagId) || rawTagId <= 0) {
        throw new Error(`Invalid tag id: ${String(rawTagId)}`)
      }
      return rawTagId as number
    })

    return Array.from(new Set(tagIds))
  }

  ipcMain.handle(
    IPC_CHANNELS.ADD_ENTITY_TAG,
    (_event, entityType: EntityType, entityId: number, tagId: number) => {
      if (!isEntityType(entityType)) {
        return { success: false, error: `Invalid entity type: ${entityType}` }
      }
      return addEntityTag(entityType, entityId, tagId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.REMOVE_ENTITY_TAG,
    (_event, entityType: EntityType, entityId: number, tagId: number) => {
      if (!isEntityType(entityType)) {
        return { success: false, error: `Invalid entity type: ${entityType}` }
      }
      return removeEntityTag(entityType, entityId, tagId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_ENTITY_TAGS_BATCH,
    (
      _event,
      entityType: EntityType,
      rawEntityIds: unknown,
      rawTagIds: unknown,
      operation: 'add' | 'remove'
    ) => {
      if (!isEntityType(entityType)) {
        return { success: false, error: `Invalid entity type: ${entityType}` }
      }

      if (operation !== 'add' && operation !== 'remove') {
        return { success: false, error: `Invalid batch tag operation: ${operation}` }
      }

      try {
        const entityIds = normalizeEntityIdsForBatch(rawEntityIds)
        const tagIds = normalizeTagIdsForBatch(rawTagIds)
        const db = getDatabase()
        const statement =
          entityType === 'sense'
            ? operation === 'add'
              ? db.prepare(
                  "INSERT OR IGNORE INTO user_db.sense_tags (sense_id, tag_id, created_at) VALUES (?, ?, datetime('now'))"
                )
              : db.prepare('DELETE FROM user_db.sense_tags WHERE sense_id = ? AND tag_id = ?')
            : operation === 'add'
              ? db.prepare(
                  "INSERT OR IGNORE INTO user_db.word_tags (word_id, tag_id, created_at) VALUES (?, ?, datetime('now'))"
                )
              : db.prepare('DELETE FROM user_db.word_tags WHERE word_id = ? AND tag_id = ?')

        const transaction = db.transaction((ids: number[], selectedTagIds: number[]) => {
          for (const entityId of ids) {
            for (const tagId of selectedTagIds) {
              statement.run(entityId, tagId)
            }
          }
        })

        transaction(entityIds, tagIds)
        return { success: true }
      } catch (error) {
        console.error('Batch entity tag update failed', error)
        return { success: false, error: String(error) }
      }
    }
  )

  /** @deprecated Prefer IPC_CHANNELS.ADD_ENTITY_TAG. */
  ipcMain.handle(IPC_CHANNELS.ADD_SENSE_TAG, (_event, senseId: number, tagId: number) => {
    return addEntityTag('sense', senseId, tagId)
  })

  /** @deprecated Prefer IPC_CHANNELS.REMOVE_ENTITY_TAG. */
  ipcMain.handle(IPC_CHANNELS.REMOVE_SENSE_TAG, (_event, senseId: number, tagId: number) => {
    return removeEntityTag('sense', senseId, tagId)
  })

  /** @deprecated Prefer IPC_CHANNELS.ADD_ENTITY_TAG. */
  ipcMain.handle(IPC_CHANNELS.ADD_WORD_TAG, (_event, wordId: number, tagId: number) => {
    return addEntityTag('word', wordId, tagId)
  })

  /** @deprecated Prefer IPC_CHANNELS.REMOVE_ENTITY_TAG. */
  ipcMain.handle(IPC_CHANNELS.REMOVE_WORD_TAG, (_event, wordId: number, tagId: number) => {
    return removeEntityTag('word', wordId, tagId)
  })

  // 获取某义项的所有标签
  ipcMain.handle(IPC_CHANNELS.GET_SENSE_TAGS, (_event, senseId: number) => {
    const db = getDatabase()
    return db.prepare(`
      SELECT t.*
      FROM user_db.tags t
      JOIN user_db.sense_tags st ON t.id = st.tag_id
      WHERE st.sense_id = ?
    `).all(senseId)
  })

  // 更新标签
  ipcMain.handle(IPC_CHANNELS.UPDATE_TAG, (_event, tagId: number, name: string, color: string) => {
    const db = getDatabase()
    const existingTag = db.prepare('SELECT id, name FROM user_db.tags WHERE id = ?').get(tagId) as { id: number; name: string } | undefined

    if (!existingTag) {
      return { success: false, error: 'Tag not found' }
    }

    if (isSystemTagName(existingTag.name)) {
      return { success: false, error: 'System tag cannot be renamed' }
    }

    const normalizedTagName = name.trim()
    if (!normalizedTagName) {
      return { success: false, error: 'Tag name cannot be empty' }
    }

    if (isSystemTagName(normalizedTagName)) {
      return { success: false, error: 'System tag name is reserved' }
    }

    db.prepare('UPDATE user_db.tags SET name = ?, color = ? WHERE id = ?').run(normalizedTagName, color, tagId)
    return { success: true }
  })

  // 删除标签
  ipcMain.handle(IPC_CHANNELS.DELETE_TAG, (_event, tagId: number) => {
    const db = getDatabase()
    const existingTag = db.prepare('SELECT id, name FROM user_db.tags WHERE id = ?').get(tagId) as { id: number; name: string } | undefined

    if (!existingTag) {
      return { success: false, error: 'Tag not found' }
    }

    if (isSystemTagName(existingTag.name)) {
      return { success: false, error: 'System tag cannot be deleted' }
    }
    
    // 使用事务确保原子性
    const transaction = db.transaction(() => {
        // 1. 删除 sense_tags 关联
        db.prepare('DELETE FROM user_db.sense_tags WHERE tag_id = ?').run(tagId)
        // 2. 删除 word_tags 关联 (新增修复)
        db.prepare('DELETE FROM user_db.word_tags WHERE tag_id = ?').run(tagId)
        // 3. 删除标签本身
        db.prepare('DELETE FROM user_db.tags WHERE id = ?').run(tagId)
    })

    try {
        transaction()
        return { success: true }
    } catch (e: any) {
        console.error('Failed to delete tag:', e)
        throw e
    }
  })

  // 批量导入收藏
  ipcMain.handle(IPC_CHANNELS.IMPORT_FAVORITES, (_event, items: Array<{ headword: string; note?: string }>) => {
    const db = getDatabase()
    
    // 获取或创建收藏标签
    const favoriteTagId = ensureSystemTagId(FAVORITE_TAG_NAME)
    
    // 使用事务来批量处理，提高性能
    const transaction = db.transaction((itemsToImport: Array<{ headword: string; note?: string }>) => {
      let importedCount = 0
      
      // 修改：同时获取 definition_html 以检测跳转
      const findWordStmt = db.prepare('SELECT id, definition_html FROM words WHERE headword = ?')
      const findSensesStmt = db.prepare('SELECT id FROM senses WHERE word_id = ?')
      
      // 通过标签系统添加收藏
      const insertFavStmt = db.prepare(`
        INSERT INTO user_db.sense_tags (sense_id, tag_id, created_at) 
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(sense_id, tag_id) DO NOTHING
      `)

      // 插入/更新独立笔记
      const upsertNoteStmt = db.prepare(`
        INSERT INTO user_db.sense_notes (sense_id, note, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(sense_id) DO UPDATE SET
          note = excluded.note,
          updated_at = CURRENT_TIMESTAMP
      `)
      
      for (const item of itemsToImport) {
        if (!item.headword || !item.headword.trim()) continue
        const cleanWord = item.headword.trim()
        
        
        let wordResult = findWordStmt.get(cleanWord) as { id: number; definition_html: string } | undefined
        // Debug Log
        if (wordResult) {
            console.log(`[Import Debug] Found word: ${cleanWord}, definition start: ${wordResult.definition_html?.substring(0, 20)}`)
        }
        
        // 处理 @@@LINK= 跳转 (例如 books -> book)
        if (wordResult && wordResult.definition_html && wordResult.definition_html.includes('@@@LINK=')) {
          const content = wordResult.definition_html
          // 提取链接目标，处理可能的换行或额外字符
          const match = content.match(/@@@LINK=([^\s\n\r]+)/)
          if (match && match[1]) {
             const targetWord = match[1].trim()
             console.log(`[Import Debug] Detected LINK from ${cleanWord} to ${targetWord}`)
             const redirectResult = findWordStmt.get(targetWord) as { id: number; definition_html: string } | undefined
             if (redirectResult) {
               console.log(`[Import Debug] Redirected successful to ID: ${redirectResult.id}`)
               wordResult = redirectResult
             } else {
               console.log(`[Import Debug] Redirect target ${targetWord} not found`)
             }
          }
        }
        
        if (wordResult) {
          const senses = findSensesStmt.all(wordResult.id) as { id: number }[]
          for (const sense of senses) {
            // 1. 添加收藏标签
            insertFavStmt.run(sense.id, favoriteTagId)
            // 2. 如果有笔记，保存到独立笔记表
            if (item.note && item.note.trim()) {
              upsertNoteStmt.run(sense.id, item.note.trim())
            }
          }
          if (senses.length > 0) importedCount++
        }
      }
      return importedCount
    })
    
    try {
      const count = transaction(items)
      return { success: true, count }
    } catch (error) {
      console.error('Import failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // 保存笔记（独立存储，与收藏解耦）
  ipcMain.handle(IPC_CHANNELS.SAVE_NOTE, (_event, senseId: number, note: string) => {
    const db = getDatabase()
    try {
      if (!note || note.trim() === '') {
        // 空笔记则删除
        db.prepare('DELETE FROM user_db.sense_notes WHERE sense_id = ?').run(senseId)
        return { success: true }
      }
      // 使用 UPSERT
      db.prepare(`
        INSERT INTO user_db.sense_notes (sense_id, note, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(sense_id) DO UPDATE SET
          note = excluded.note,
          updated_at = CURRENT_TIMESTAMP
      `).run(senseId, note.trim())
      return { success: true }
    } catch (error) {
      console.error('Save note failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // 获取笔记
  ipcMain.handle(IPC_CHANNELS.GET_NOTE, (_event, senseId: number) => {
    const db = getDatabase()
    try {
      // 只使用 sense_notes 表
      const row = db.prepare(`
        SELECT note FROM user_db.sense_notes WHERE sense_id = ?
      `).get(senseId) as { note: string } | undefined
      return { success: true, note: row?.note || null }
    } catch (error) {
      console.error('Get note failed:', error)
      return { success: false, note: null, error: String(error) }
    }
  })

  // 删除笔记
  ipcMain.handle(IPC_CHANNELS.DELETE_NOTE, (_event, senseId: number) => {
    const db = getDatabase()
    try {
      db.prepare('DELETE FROM user_db.sense_notes WHERE sense_id = ?').run(senseId)
      return { success: true }
    } catch (error) {
      console.error('Delete note failed:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_ENTITY_NOTES_BATCH, (_event, entityType: EntityType, rawEntityIds: unknown) => {
    if (!isEntityType(entityType)) {
      return { success: false, error: `Invalid entity type: ${entityType}` }
    }

    const db = getDatabase()
    try {
      const entityIds = normalizeEntityIdsForBatch(rawEntityIds)
      const statement =
        entityType === 'sense'
          ? db.prepare('DELETE FROM user_db.sense_notes WHERE sense_id = ?')
          : db.prepare('DELETE FROM user_db.word_notes WHERE word_id = ?')
      const transaction = db.transaction((ids: number[]) => {
        for (const entityId of ids) {
          statement.run(entityId)
        }
      })

      transaction(entityIds)
      return { success: true }
    } catch (error) {
      console.error('Batch delete entity notes failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // 保存单词笔记（独立存储）
  ipcMain.handle(IPC_CHANNELS.SAVE_WORD_NOTE, (_event, wordId: number, note: string) => {
    const db = getDatabase()
    try {
      if (!Number.isInteger(wordId) || wordId <= 0) {
        return { success: false, error: 'Invalid word id' }
      }

      if (!note || note.trim() === '') {
        db.prepare('DELETE FROM user_db.word_notes WHERE word_id = ?').run(wordId)
        return { success: true }
      }

      db.prepare(`
        INSERT INTO user_db.word_notes (word_id, note, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(word_id) DO UPDATE SET
          note = excluded.note,
          updated_at = CURRENT_TIMESTAMP
      `).run(wordId, note.trim())

      return { success: true }
    } catch (error) {
      console.error('Save word note failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // 获取单词笔记
  ipcMain.handle(IPC_CHANNELS.GET_WORD_NOTE, (_event, wordId: number) => {
    const db = getDatabase()
    try {
      if (!Number.isInteger(wordId) || wordId <= 0) {
        return { success: false, note: null, error: 'Invalid word id' }
      }

      const row = db.prepare(`
        SELECT note FROM user_db.word_notes WHERE word_id = ?
      `).get(wordId) as { note: string } | undefined

      return { success: true, note: row?.note || null }
    } catch (error) {
      console.error('Get word note failed:', error)
      return { success: false, note: null, error: String(error) }
    }
  })

  // 删除单词笔记
  ipcMain.handle(IPC_CHANNELS.DELETE_WORD_NOTE, (_event, wordId: number) => {
    const db = getDatabase()
    try {
      if (!Number.isInteger(wordId) || wordId <= 0) {
        return { success: false, error: 'Invalid word id' }
      }

      db.prepare('DELETE FROM user_db.word_notes WHERE word_id = ?').run(wordId)
      return { success: true }
    } catch (error) {
      console.error('Delete word note failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // 用户设置
  ipcMain.handle(IPC_CHANNELS.GET_SETTING, (_event, key: string) => {
    return store.get(key as keyof StoreSchema)
  })

  ipcMain.handle(IPC_CHANNELS.SET_SETTING, (_event, key: string, value: any) => {
    store.set(key as keyof StoreSchema, value)
    return { success: true }
  })

  // ============ 词典管理 ============

  // 检查词典状态
  ipcMain.handle(IPC_CHANNELS.DICTIONARY_CHECK, (): DictionaryStatus => {
    const configs = loadDictionaryConfigs()
    const active = getActiveDictionary()
    return {
      hasActiveDictionary: hasDictionary(),
      activeDictionary: active,
      dictionaries: configs
    }
  })

  // 选择词典文件
  ipcMain.handle(IPC_CHANNELS.DICTIONARY_SELECT_FILE, async (_event, type: 'mdx' | 'mdd') => {
    const filters = type === 'mdx'
      ? [{ name: 'MDX Dictionary', extensions: ['mdx'] }]
      : [{ name: 'MDD Resource', extensions: ['mdd'] }]

    const result = await dialog.showOpenDialog({
      properties: type === 'mdd' ? ['openFile', 'multiSelections'] : ['openFile'],
      filters
    })

    if (result.canceled) {
      return { success: false, canceled: true }
    }

    return {
      success: true,
      filePaths: result.filePaths
    }
  })

  // 导入词典
  ipcMain.handle(
    IPC_CHANNELS.DICTIONARY_IMPORT,
    async (
      _event,
      mdxPath: string,
      mddPaths: string[],
      parserType: DictionaryParserType
    ) => {
      try {
        const window = BrowserWindow.getFocusedWindow()
        const config = await importDictionary(mdxPath, mddPaths, parserType, window)

        // Reinitialize database and audio
        reinitDatabase()
        
        // Reinitialize MDD audio if paths provided
        if (config.mddPaths.length > 0) {
          disposeMdd()
          await initMdd()
        }

        return { success: true, config }
      } catch (error) {
        console.error('Dictionary import failed:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  // 列出所有词典
  ipcMain.handle(IPC_CHANNELS.DICTIONARY_LIST, () => {
    return loadDictionaryConfigs()
  })

  // 删除词典
  ipcMain.handle(IPC_CHANNELS.DICTIONARY_DELETE, (_event, dictId: string) => {
    const success = deleteDictionary(dictId)
    if (success) {
      reinitDatabase()
    }
    return { success }
  })

  // 设置活动词典
  ipcMain.handle(IPC_CHANNELS.DICTIONARY_SET_ACTIVE, (_event, dictId: string) => {
    const success = setActiveDictionary(dictId)
    if (success) {
      reinitDatabase()
      
      // Reinitialize MDD audio for new active dictionary
      const active = getActiveDictionary()
      if (active && active.mddPaths.length > 0) {
        disposeMdd()
        initMdd()
      }
    }
    return { success }
  })

  // 获取复习用的义项（按标签筛选）
  ipcMain.handle(IPC_CHANNELS.GET_REVIEW_SENSES, (_event, tagName: string) => {
    const db = getDatabase()
    const archivedTagId = ensureSystemTagId(ARCHIVED_TAG_NAME)
    
    // 获取标签 ID
    const tag = db.prepare('SELECT id FROM user_db.tags WHERE name = ?').get(tagName) as { id: number } | undefined
    if (!tag) {
      return []
    }
    
    // 获取该标签下的所有义项（包括笔记）
    const senses = db.prepare(`
      SELECT 
        s.id as sense_id,
        s.word_id,
        s.sense_index,
        s.sense_group,
        s.grammar,
        s.definition,
        s.definition_cn,
        s.examples,
        w.headword,
        w.definition_html,
        w.phon_uk,
        w.phon_us,
        sn.note as note
      FROM user_db.sense_tags st
      JOIN senses s ON st.sense_id = s.id
      JOIN words w ON s.word_id = w.id
      LEFT JOIN user_db.sense_notes sn ON s.id = sn.sense_id
      WHERE st.tag_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM user_db.sense_tags st_arch
          WHERE st_arch.sense_id = s.id AND st_arch.tag_id = ?
        )
        AND NOT EXISTS (
          SELECT 1
          FROM user_db.word_tags wt_arch
          WHERE wt_arch.word_id = s.word_id AND wt_arch.tag_id = ?
        )
      ORDER BY RANDOM()
    `).all(tag.id, archivedTagId, archivedTagId) as any[]
    
    // 解析 examples JSON
    return senses.map(sense => {
       const senseTags = db.prepare(`
        SELECT t.id, t.name, t.color 
        FROM user_db.tags t
        JOIN user_db.sense_tags st ON t.id = st.tag_id
        WHERE st.sense_id = ?
      `).all(sense.sense_id)

      return {
        ...sense,
        headword: extractDisplayHeadwordFromHtml(sense.definition_html, sense.headword),
        tags: senseTags,
        examples: sense.examples ? JSON.parse(sense.examples) : []
      }
    })
  })
  // 获取复习用的单词（按标签筛选）
  ipcMain.handle(IPC_CHANNELS.GET_REVIEW_WORDS, (_event, tagName: string) => {
    const db = getDatabase()
    const archivedTagId = ensureSystemTagId(ARCHIVED_TAG_NAME)
    
    // 获取标签 ID
    const tag = db.prepare('SELECT id FROM user_db.tags WHERE name = ?').get(tagName) as { id: number } | undefined
    if (!tag) return []
    
    // 获取带有该标签的 Words
    const words = db.prepare(`
      SELECT 
        w.id,
        w.headword,
        w.phon_uk,
        w.phon_us,
        w.definition_html
      FROM user_db.word_tags wt
      JOIN words w ON wt.word_id = w.id
      WHERE wt.tag_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM user_db.word_tags wt_arch
          WHERE wt_arch.word_id = w.id AND wt_arch.tag_id = ?
        )
      ORDER BY RANDOM()
    `).all(tag.id, archivedTagId) as any[]

    // 获取每个 Word 的详细信息（Senses, Tags）
    return words.map(word => {
      // 获取 Senses
      const senses = db.prepare(`
        SELECT 
          s.id,
          s.sense_index,
          s.sense_group,
          s.grammar,
          s.definition,
          s.definition_cn,
          s.examples
        FROM senses s
        WHERE s.word_id = ?
          AND NOT EXISTS (
            SELECT 1
            FROM user_db.sense_tags st_arch
            WHERE st_arch.sense_id = s.id AND st_arch.tag_id = ?
          )
        ORDER BY s.sense_index
      `).all(word.id, archivedTagId) as any[]

      // 获取 Word Tags
      const wordTags = db.prepare(`
        SELECT t.id, t.name, t.color 
        FROM user_db.tags t
        JOIN user_db.word_tags wt ON t.id = wt.tag_id
        WHERE wt.word_id = ?
      `).all(word.id)

      return {
        ...word,
        headword: extractDisplayHeadwordFromHtml(word.definition_html, word.headword),
        tags: wordTags,
        senses: senses.map(s => {
          // 获取 Sense Tags
          const senseTags = db.prepare(`
            SELECT t.id, t.name, t.color 
            FROM user_db.tags t
            JOIN user_db.sense_tags st ON t.id = st.tag_id
            WHERE st.sense_id = ?
          `).all(s.id)

          // 获取 Note
          const note = db.prepare('SELECT note FROM user_db.sense_notes WHERE sense_id = ?').get(s.id) as { note: string } | undefined

          return {
            ...s,
            tags: senseTags,
            note: note?.note,
            examples: s.examples ? JSON.parse(s.examples) : []
          }
        })
      }
    })
  })

  // 导航跳转 (Review Window -> Main Window)
  ipcMain.handle(IPC_CHANNELS.NAVIGATE_TO_WORD, (_event, identifier: number | string) => {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(win => {
        win.webContents.send('navigate-to-word', identifier)
    })
    return { success: true }
  })

  // ============ FSRS 复习调度 ============
  
  // 获取到期的复习项
  ipcMain.handle(IPC_CHANNELS.FSRS_GET_DUE_ITEMS, (_event, tagName: string) => {
    const db = getDatabase()
    const archivedTagId = ensureSystemTagId(ARCHIVED_TAG_NAME)
    
    // Get tag ID
    const tag = db.prepare('SELECT id FROM user_db.tags WHERE name = ?').get(tagName) as { id: number } | undefined
    if (!tag) return []
    
    // First, ensure all tagged items have FSRS cards
    // Get senses with this tag
    const senses = db.prepare(`
      SELECT s.id as sense_id, s.word_id
      FROM user_db.sense_tags st
      JOIN senses s ON st.sense_id = s.id
      WHERE st.tag_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM user_db.sense_tags st_arch
          WHERE st_arch.sense_id = s.id AND st_arch.tag_id = ?
        )
        AND NOT EXISTS (
          SELECT 1
          FROM user_db.word_tags wt_arch
          WHERE wt_arch.word_id = s.word_id AND wt_arch.tag_id = ?
        )
      UNION ALL
      SELECT -cs.id as sense_id, -cs.word_id as word_id
      FROM user_db.sense_tags st
      JOIN user_db.custom_senses cs ON st.sense_id = -cs.id
      WHERE st.tag_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM user_db.sense_tags st_arch
          WHERE st_arch.sense_id = -cs.id AND st_arch.tag_id = ?
        )
        AND NOT EXISTS (
          SELECT 1
          FROM user_db.word_tags wt_arch
          WHERE wt_arch.word_id = -cs.word_id AND wt_arch.tag_id = ?
        )
    `).all(tag.id, archivedTagId, archivedTagId, tag.id, archivedTagId, archivedTagId) as { sense_id: number; word_id: number }[]
    
    // Get words with this tag
    const words = db.prepare(`
      SELECT w.id as word_id
      FROM user_db.word_tags wt
      JOIN words w ON wt.word_id = w.id
      WHERE wt.tag_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM user_db.word_tags wt_arch
          WHERE wt_arch.word_id = w.id AND wt_arch.tag_id = ?
        )
      UNION ALL
      SELECT -cw.id as word_id
      FROM user_db.word_tags wt
      JOIN user_db.custom_words cw ON wt.word_id = -cw.id
      WHERE wt.tag_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM user_db.word_tags wt_arch
          WHERE wt_arch.word_id = -cw.id AND wt_arch.tag_id = ?
        )
    `).all(tag.id, archivedTagId, tag.id, archivedTagId) as { word_id: number }[]
    
    // Ensure FSRS cards exist for all tagged items
    for (const sense of senses) {
      getOrCreateCard('sense', sense.sense_id, tag.id)
    }
    for (const word of words) {
      getOrCreateCard('word', word.word_id, tag.id)
    }
    
    // Strict FSRS: only show cards that are due now
    const dueCards = getDueCards(tag.id, 100)
    
    // Fetch full item data for each due card
    return dueCards.map((card: any) => {
      if (card.item_type === 'sense') {
        if (isCustomEntityId(card.item_id)) {
          const customSenseInternalId = toCustomInternalId(card.item_id)
          const customSense = db.prepare(`
            SELECT
              -s.id as sense_id,
              -s.word_id as word_id,
              s.sense_index,
              s.sense_group,
              s.grammar,
              s.definition,
              s.definition_cn,
              s.examples,
              w.headword,
              w.definition_html,
              w.phon_uk,
              w.phon_us,
              sn.note
            FROM user_db.custom_senses s
            JOIN user_db.custom_words w ON s.word_id = w.id
            LEFT JOIN user_db.sense_notes sn ON sn.sense_id = -s.id
            WHERE s.id = ?
              AND NOT EXISTS (
                SELECT 1
                FROM user_db.sense_tags st_arch
                WHERE st_arch.sense_id = -s.id AND st_arch.tag_id = ?
              )
              AND NOT EXISTS (
                SELECT 1
                FROM user_db.word_tags wt_arch
                WHERE wt_arch.word_id = -s.word_id AND wt_arch.tag_id = ?
              )
          `).get(customSenseInternalId, archivedTagId, archivedTagId) as any

          if (!customSense) return null

          const customSenseTags = getSenseTags(customSense.sense_id)
          return {
            type: 'sense' as const,
            entityType: 'sense' as const,
            entityId: customSense.sense_id,
            senseId: customSense.sense_id,
            wordId: customSense.word_id,
            headword: customSense.headword,
            phonUk: customSense.phon_uk,
            phonUs: customSense.phon_us,
            definition: customSense.definition,
            definitionCn: customSense.definition_cn,
            examples: parseExamplesJson(customSense.examples),
            note: customSense.note,
            tags: customSenseTags,
            fsrsCardId: card.id,
            fsrsState: card.state,
            fsrsDue: card.due,
            sense_id: customSense.sense_id,
            word_id: customSense.word_id,
            phon_uk: customSense.phon_uk,
            phon_us: customSense.phon_us,
            definition_cn: customSense.definition_cn
          }
        }

        const sense = db.prepare(`
          SELECT 
            s.id as sense_id,
            s.word_id,
            s.sense_index,
            s.sense_group,
            s.grammar,
            s.definition,
            s.definition_cn,
            s.examples,
            w.headword,
            w.definition_html,
            w.phon_uk,
            w.phon_us,
            sn.note
          FROM senses s
          JOIN words w ON s.word_id = w.id
          LEFT JOIN user_db.sense_notes sn ON s.id = sn.sense_id
          WHERE s.id = ?
            AND NOT EXISTS (
              SELECT 1
              FROM user_db.sense_tags st_arch
              WHERE st_arch.sense_id = s.id AND st_arch.tag_id = ?
            )
            AND NOT EXISTS (
              SELECT 1
              FROM user_db.word_tags wt_arch
              WHERE wt_arch.word_id = s.word_id AND wt_arch.tag_id = ?
            )
        `).get(card.item_id, archivedTagId, archivedTagId) as any
        
        if (!sense) return null
        
        const senseTags = getSenseTags(sense.sense_id)
        
        const parsedExamples = parseExamplesJson(sense.examples)
        return {
          // normalized fields
          type: 'sense' as const,
          entityType: 'sense' as const,
          entityId: sense.sense_id,
          senseId: sense.sense_id,
          wordId: sense.word_id,
          headword: extractDisplayHeadwordFromHtml(sense.definition_html, sense.headword),
          phonUk: sense.phon_uk,
          phonUs: sense.phon_us,
          definition: sense.definition,
          definitionCn: sense.definition_cn,
          examples: parsedExamples,
          note: sense.note,
          tags: senseTags,
          fsrsCardId: card.id,
          fsrsState: card.state,
          fsrsDue: card.due,
          // compatibility aliases
          sense_id: sense.sense_id,
          word_id: sense.word_id,
          phon_uk: sense.phon_uk,
          phon_us: sense.phon_us,
          definition_cn: sense.definition_cn
        }
      } else {
        if (isCustomEntityId(card.item_id)) {
          const customWordInternalId = toCustomInternalId(card.item_id)
          const customWord = db.prepare(`
            SELECT
              -w.id as id,
              w.headword,
              w.phon_uk,
              w.phon_us,
              w.definition_html
            FROM user_db.custom_words w
            WHERE w.id = ?
              AND NOT EXISTS (
                SELECT 1
                FROM user_db.word_tags wt_arch
                WHERE wt_arch.word_id = -w.id AND wt_arch.tag_id = ?
              )
          `).get(customWordInternalId, archivedTagId) as any

          if (!customWord) return null

          const customSenses = db.prepare(`
            SELECT
              -s.id as id,
              s.sense_index,
              s.sense_group,
              s.grammar,
              s.definition,
              s.definition_cn,
              s.examples
            FROM user_db.custom_senses s
            WHERE s.word_id = ?
              AND NOT EXISTS (
                SELECT 1
                FROM user_db.sense_tags st_arch
                WHERE st_arch.sense_id = -s.id AND st_arch.tag_id = ?
              )
            ORDER BY s.sense_index
          `).all(customWordInternalId, archivedTagId) as any[]

          const customWordTags = getWordTags(customWord.id)
          const parsedCustomSenses = customSenses.map((sense) => ({
            ...sense,
            definitionCn: sense.definition_cn,
            examples: parseExamplesJson(sense.examples)
          }))

          return {
            type: 'word' as const,
            entityType: 'word' as const,
            entityId: customWord.id,
            wordId: customWord.id,
            headword: customWord.headword,
            phonUk: customWord.phon_uk,
            phonUs: customWord.phon_us,
            definitionHtml: customWord.definition_html,
            tags: customWordTags,
            senses: parsedCustomSenses,
            fsrsCardId: card.id,
            fsrsState: card.state,
            fsrsDue: card.due,
            id: customWord.id,
            phon_uk: customWord.phon_uk,
            phon_us: customWord.phon_us,
            definition_html: customWord.definition_html
          }
        }

        // word type
        const word = db.prepare(`
          SELECT 
            w.id,
            w.headword,
            w.phon_uk,
            w.phon_us,
            w.definition_html
          FROM words w
          WHERE w.id = ?
            AND NOT EXISTS (
              SELECT 1
              FROM user_db.word_tags wt_arch
              WHERE wt_arch.word_id = w.id AND wt_arch.tag_id = ?
            )
        `).get(card.item_id, archivedTagId) as any
        
        if (!word) return null
        
        const senses = db.prepare(`
          SELECT 
            s.id,
            s.sense_index,
            s.sense_group,
            s.grammar,
            s.definition,
            s.definition_cn,
            s.examples
          FROM senses s
          WHERE s.word_id = ?
            AND NOT EXISTS (
              SELECT 1
              FROM user_db.sense_tags st_arch
              WHERE st_arch.sense_id = s.id AND st_arch.tag_id = ?
            )
          ORDER BY s.sense_index
        `).all(word.id, archivedTagId) as any[]
        
        const wordTags = getWordTags(word.id)
        
        const parsedSenses = senses.map(s => ({
          ...s,
          definitionCn: s.definition_cn,
          examples: parseExamplesJson(s.examples)
        }))

        return {
          // normalized fields
          type: 'word' as const,
          entityType: 'word' as const,
          entityId: word.id,
          wordId: word.id,
          headword: extractDisplayHeadwordFromHtml(word.definition_html, word.headword),
          phonUk: word.phon_uk,
          phonUs: word.phon_us,
          definitionHtml: word.definition_html,
          tags: wordTags,
          senses: parsedSenses,
          fsrsCardId: card.id,
          fsrsState: card.state,
          fsrsDue: card.due,
          // compatibility aliases
          id: word.id,
          phon_uk: word.phon_uk,
          phon_us: word.phon_us,
          definition_html: word.definition_html
        }
      }
    }).filter(Boolean)
  })
  
  // 记录复习结果
  ipcMain.handle(IPC_CHANNELS.FSRS_RECORD_REVIEW, (_event, cardId: number, rating: 1 | 2 | 3 | 4) => {
    try {
      const newCard = recordReview(cardId, rating)
      return { 
        success: true, 
        nextDue: newCard.due.toISOString(),
        scheduledDays: newCard.scheduled_days,
        state: newCard.state
      }
    } catch (error) {
      console.error('FSRS record review failed:', error)
      return { success: false, error: String(error) }
    }
  })
  
  // 获取 FSRS 统计
  ipcMain.handle(IPC_CHANNELS.FSRS_GET_STATS, (_event, tagName: string) => {
    const db = getDatabase()
    const tag = db.prepare('SELECT id FROM user_db.tags WHERE name = ?').get(tagName) as { id: number } | undefined
    if (!tag) return { total: 0, due: 0, new: 0, learning: 0, review: 0, relearning: 0 }

    return getCardStats(tag.id)
  })
}
