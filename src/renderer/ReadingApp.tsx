import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { SYSTEM_TAGS } from '../shared/types'
import type { SearchResultItem } from '../shared/types'
import { useConfirmDialog } from './components/ConfirmDialog'
import SenseCard from './components/SenseCard'
import WordPronunciation from './components/WordPronunciation'
import { useSearchSuggestions } from './hooks/useSearchSuggestions'
import { useBodyScrollLock } from './utils/scrollLock'

declare global {
  interface Window {
    api: import('../preload/index').IpcApi
  }
}

type ReadingStage = 'input' | 'markWords' | 'reading' | 'shuffleCn' | 'wordStudy' | 'batch'
type ReadingFlowStepId = 'input' | 'markWords' | 'lookup' | 'shuffleCn' | 'wordStudy' | 'batch'
type DefinitionDisplayMode = 'en' | 'cn' | 'both'
type ReadingFlowStepMeta = {
  label: string
}
type ReadingGuideSectionId =
  | 'firstPass'
  | 'afterFirstPass'
  | 'secondPass'
  | 'thirdPass'
  | 'fourthPass'
  | 'fifthPass'
  | 'sixthPass'
  | 'seventhPass'
  | 'afterSeventhPass'
type ReadingTokenKind = 'word' | 'space' | 'symbol'

interface Tag {
  id: number
  name: string
  color: string
}

interface LookupWordData {
  id: number
  headword: string
  phon_uk?: string
  phon_us?: string
  definition_html: string
  tags?: Tag[]
}

interface LookupSenseData {
  id: number
  sense_index: number
  sense_group?: string
  sense_group_cn?: string
  grammar?: string
  definition: string
  definition_cn?: string
  examples: string
  raw_html: string
  is_favorited: number
  favorite_note?: string
  tags: Tag[]
}

interface ReadingTextToken {
  id: string
  text: string
  normalizedText: string
  kind: ReadingTokenKind
  occurrenceIndex: number
}

interface ReadingParagraph {
  id: string
  tokens: ReadingTextToken[]
}

interface RedirectTarget {
  displayHeadword: string
  lookupHeadword: string
}

interface LookupPanelState {
  tokenId: string
  queryText: string
  sourceLabel: string
  normalizedToken: string
  occurrenceIndex: number
  selectedEntryHeadword: string
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
  word: LookupWordData | null
  senses: LookupSenseData[]
  selectedSenseId: number | null
  errorMessage?: string
}

interface SelectedReadingSenseEntry {
  tokenId: string
  normalizedToken: string
  sourceLabel: string
  occurrenceIndex: number
  selectedEntryHeadword: string
  wordId: number
  headword: string
  senseId: number
  definition: string
  definitionCn?: string
  matchCount: number
  isFavorited: boolean
  tags: Tag[]
}

interface MarkedReadingTokenEntry {
  tokenId: string
  normalizedToken: string
  sourceLabel: string
  occurrenceIndex: number
}

interface ReadingHistoryRecord {
  id: string
  title: string
  articleText: string
  readingStage: Exclude<ReadingStage, 'input'>
  markedTokenEntries: MarkedReadingTokenEntry[]
  selectedSenseEntries: SelectedReadingSenseEntry[]
  shuffledSenseEntries: SelectedReadingSenseEntry[]
  selectedBatchEntryIds: string[]
  createdAt: string
  updatedAt: string
}

interface ReadingGuideSection {
  id: ReadingGuideSectionId
  title: string
  summary: ReactNode
  items: ReactNode[]
}

const READING_TEXTAREA_ROWS = 18
const READING_LOOKUP_SUGGESTION_LIMIT = 10
const READING_LOOKUP_SEARCH_DEBOUNCE_MS = 150
const READING_BATCH_TAG_COLOR = '#6B7280'
const LEGACY_READING_HISTORY_STORAGE_KEY = 'reading_history_records'
const READING_HISTORY_STORAGE_KEY = 'reading_history_records_v2'
const READING_HISTORY_LIMIT = 50
const READING_HISTORY_TITLE_LENGTH = 48
const SOFT_HYPHEN_PATTERN = /\u00AD/g
const WINDOWS_NEWLINE_PATTERN = /\r\n?/g
const HYPHENATED_LINE_BREAK_PATTERN = /([A-Za-z])-\n([a-z])/g
const EXCESSIVE_PARAGRAPH_BREAK_PATTERN = /\n{3,}/g
const PARAGRAPH_SEPARATOR_PATTERN = /\n{2,}/
const SINGLE_NEWLINE_PATTERN = /\n/g
const INLINE_WHITESPACE_PATTERN = /[ \t]+/g
const READING_TOKEN_PATTERN = /[A-Za-z]+(?:[-'][A-Za-z]+)*|\s+|[^A-Za-z\s]+/g
const WORD_TOKEN_TEST_PATTERN = /^[A-Za-z]+(?:[-'][A-Za-z]+)*$/
const READING_FLOW_STEP_META: Readonly<Record<ReadingFlowStepId, ReadingFlowStepMeta>> = {
  input: {
    label: '输入文本'
  },
  markWords: {
    label: '标记生词'
  },
  lookup: {
    label: '查词选义'
  },
  shuffleCn: {
    label: '乱序中文释义'
  },
  wordStudy: {
    label: '单词学习'
  },
  batch: {
    label: '批量处理'
  }
} as const

const READING_FLOW_STEPS: ReadonlyArray<{
  id: ReadingFlowStepId
  label: string
}> = (
  Object.entries(READING_FLOW_STEP_META) as Array<[ReadingFlowStepId, ReadingFlowStepMeta]>
).map(([id, meta]) => ({
  id,
  label: meta.label
}))

function isReadingFlowStepId(value: string | undefined): value is ReadingFlowStepId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(READING_FLOW_STEP_META, value)
}

function ReadingGuideStepLink({
  stepId,
  children
}: {
  stepId: ReadingFlowStepId
  children: ReactNode
}) {
  return (
    <button
      type="button"
      data-reading-step={stepId}
      className="font-semibold text-blue-600 underline-offset-2 transition hover:text-blue-700 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
    >
      {children}
    </button>
  )
}

const READING_GUIDE_INTRO: ReactNode = (
  <>
    在<ReadingGuideStepLink stepId="input">输入文本</ReadingGuideStepLink>环节输入英文原文，点击下一步
  </>
)

const READING_GUIDE_SECTIONS: ReadonlyArray<ReadingGuideSection> = [
  {
    id: 'firstPass',
    title: '第一遍',
    summary: '先通读全文，把握大意，只标记生词，不边读边查词。',
    items: [
      '把握文章大意，这一点和休闲阅读没有区别。',
      <>
        在<ReadingGuideStepLink stepId="markWords">标记生词</ReadingGuideStepLink>
        环节标记出所有不认识的单词，并尽量根据语境去猜测意思。
      </>,
      '第一遍阅读过程中不要查词典'
    ]
  },
  {
    id: 'afterFirstPass',
    title: '第一遍读完之后',
    summary: (
      <>
        来到<ReadingGuideStepLink stepId="lookup">查词选义</ReadingGuideStepLink>环节，统一查词
      </>
    ),
    items: [
      '一次性查出所有不认识单词的意思，不要在阅读过程中分散查词。',
      '如果一个单词有多个释义，只选择当前语境下最顺的那个意思。'
    ]
  },
  {
    id: 'secondPass',
    title: '第二遍',
    summary: (
      <>
        来到<ReadingGuideStepLink stepId="shuffleCn">乱序中文释义</ReadingGuideStepLink>
        环节，优先自己回想意思，想不起来再去乱序中文释义里找。
      </>
    ),
    items: [
      '如果发现第一遍查出的意思不太像当前语境，需要返回上一步及时修正。',
      '如果某个词刚查完又忘了，先努力回想；实在想不起来，再去那堆乱序中文释义里寻找。',
      '这种寻找过程本身，就是再次联结单词与释义的记忆训练。'
    ]
  },
  {
    id: 'thirdPass',
    title: '第三遍',
    summary: '继续重复第二遍的做法，让单词和释义的联结变得更稳。',
    items: [
      '第三遍要做的事情和第二遍一致。',
      '如果后面某一遍又对某个词不确定了，还是回到那堆释义里寻找，这本身就是在记忆单词。'
    ]
  },
  {
    id: 'fourthPass',
    title: '第四遍',
    summary: '第四遍开始，重点从生词转向句法问题。',
    items: [
      '如果这时还有读不懂的句子，说明主要问题已经不是单词，而是句法。',
      '针对读不懂的句子做句法分析，通常就能把句意理顺。',
      '如果暂时不会做句法分析，可以先通过语法书解决。'
    ]
  },
  {
    id: 'fifthPass',
    title: '第五遍',
    summary: '如果句子还是读不懂，就系统查语法书，把语法现象记录下来。',
    items: [
      '查阅语法书，彻底弄清楚当前句子的语法现象。',
      '把这种语法现象和对应句子一起记录下来。',
      '如果查完语法书仍然看不懂，再去请教英语更熟练的人帮你彻底讲清楚。'
    ]
  },
  {
    id: 'sixthPass',
    title: '第六遍',
    summary: (
      <>
        来到<ReadingGuideStepLink stepId="wordStudy">单词学习</ReadingGuideStepLink>
        环节，当单词和句子都已经打通后，再完整顺一遍全文。
      </>
    ),
    items: [
      '第六遍请从头到尾把文章再顺一遍。',
      '即使还有些磕绊，也说明你已经把这篇文章从头到尾读懂了。'
    ]
  },
  {
    id: 'seventhPass',
    title: '第七遍',
    summary: '继续整篇顺读，让理解越来越接近"直接读懂"的状态。',
    items: [
      '最后再读一遍，这一遍通常会比上一遍更加顺利。',
      '不断重复之后，大脑把英文转成可理解信息的过程会越来越短。',
      '练习量足够以后，这种"像是直接读懂"的感觉会逐渐变成真实能力。'
    ]
  },
  {
    id: 'afterSeventhPass',
    title: '第七遍读完之后',
    summary: (
      <>
        来到<ReadingGuideStepLink stepId="batch">批量处理</ReadingGuideStepLink>
        环节，把本篇文章产出的单词和语法问题统一纳入长期复习。
      </>
    ),
    items: [
      '将生单词的具体释义全部收藏为生词，纳入后续背词任务。',
      '将第五遍阅读时记录下来的语法现象也记到记忆软件中，后续和单词一起复习。'
    ]
  }
] as const

function normalizePastedArticleText(input: string): string {
  return input
    .replace(SOFT_HYPHEN_PATTERN, '')
    .replace(WINDOWS_NEWLINE_PATTERN, '\n')
    .replace(HYPHENATED_LINE_BREAK_PATTERN, '$1$2')
    .replace(EXCESSIVE_PARAGRAPH_BREAK_PATTERN, '\n\n')
    .split(PARAGRAPH_SEPARATOR_PATTERN)
    .map((paragraph) =>
      paragraph
        .replace(SINGLE_NEWLINE_PATTERN, ' ')
        .replace(INLINE_WHITESPACE_PATTERN, ' ')
        .trim()
    )
    .filter((paragraph) => paragraph.length > 0)
    .join('\n\n')
}

function buildReadingParagraphs(articleText: string): ReadingParagraph[] {
  const occurrenceCountsByToken = new Map<string, number>()

  return articleText
    .split(PARAGRAPH_SEPARATOR_PATTERN)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph, paragraphIndex) => ({
      id: `paragraph-${paragraphIndex}`,
      tokens: (paragraph.match(READING_TOKEN_PATTERN) || []).map((part, tokenIndex) => {
        const kind: ReadingTokenKind = WORD_TOKEN_TEST_PATTERN.test(part)
          ? 'word'
          : part.trim() === ''
            ? 'space'
            : 'symbol'
        const normalizedText = kind === 'word' ? part.toLowerCase() : ''
        const occurrenceIndex = normalizedText
          ? (occurrenceCountsByToken.get(normalizedText) || 0) + 1
          : 0

        if (normalizedText) {
          occurrenceCountsByToken.set(normalizedText, occurrenceIndex)
        }

        return {
          id: `paragraph-${paragraphIndex}-token-${tokenIndex}`,
          text: part,
          normalizedText,
          kind,
          occurrenceIndex
        }
      })
    }))
}

function createMarkedTokenEntryFromToken(token: ReadingTextToken): MarkedReadingTokenEntry {
  return {
    tokenId: token.id,
    normalizedToken: token.normalizedText,
    sourceLabel: token.text,
    occurrenceIndex: token.occurrenceIndex
  }
}

function getReadingEntryPositionLabel(entry: Pick<MarkedReadingTokenEntry, 'occurrenceIndex'>): string {
  return `第 ${entry.occurrenceIndex} 处`
}

function shuffleItems<T>(items: readonly T[]): T[] {
  const nextItems = [...items]

  for (let currentIndex = nextItems.length - 1; currentIndex > 0; currentIndex -= 1) {
    const randomIndex = Math.floor(Math.random() * (currentIndex + 1))
    ;[nextItems[currentIndex], nextItems[randomIndex]] = [nextItems[randomIndex], nextItems[currentIndex]]
  }

  return nextItems
}

function getShuffleCnDefinition(entry: SelectedReadingSenseEntry): string {
  const trimmedDefinitionCn = entry.definitionCn?.trim()
  if (trimmedDefinitionCn) {
    return trimmedDefinitionCn
  }

  return '该义项暂无中文释义'
}

function isDefinitionDisplayMode(value: unknown): value is DefinitionDisplayMode {
  return value === 'en' || value === 'cn' || value === 'both'
}

function shouldShowEnglishDefinition(displayMode: DefinitionDisplayMode): boolean {
  return displayMode === 'en' || displayMode === 'both'
}

function shouldShowChineseDefinition(displayMode: DefinitionDisplayMode): boolean {
  return displayMode === 'cn' || displayMode === 'both'
}

function getVisibleReadingTags(tags: Tag[]): Tag[] {
  return tags.filter(
    (tag) =>
      tag.name !== SYSTEM_TAGS.FAVORITE.name &&
      tag.name !== SYSTEM_TAGS.ARCHIVED.name
  )
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isReadingHistoryStage(value: unknown): value is Exclude<ReadingStage, 'input'> {
  return (
    value === 'markWords' ||
    value === 'reading' ||
    value === 'shuffleCn' ||
    value === 'wordStudy' ||
    value === 'batch'
  )
}

function normalizeHistoryTag(value: unknown): Tag | null {
  if (!isObjectRecord(value)) {
    return null
  }

  if (
    typeof value.id !== 'number' ||
    typeof value.name !== 'string' ||
    typeof value.color !== 'string'
  ) {
    return null
  }

  return {
    id: value.id,
    name: value.name,
    color: value.color
  }
}

function normalizeMarkedTokenEntry(value: unknown): MarkedReadingTokenEntry | null {
  if (!isObjectRecord(value)) {
    return null
  }

  if (
    typeof value.tokenId !== 'string' ||
    typeof value.normalizedToken !== 'string' ||
    typeof value.sourceLabel !== 'string' ||
    typeof value.occurrenceIndex !== 'number'
  ) {
    return null
  }

  return {
    tokenId: value.tokenId,
    normalizedToken: value.normalizedToken,
    sourceLabel: value.sourceLabel,
    occurrenceIndex: value.occurrenceIndex
  }
}

function normalizeSelectedSenseEntry(value: unknown): SelectedReadingSenseEntry | null {
  if (!isObjectRecord(value)) {
    return null
  }

  if (
    typeof value.tokenId !== 'string' ||
    typeof value.normalizedToken !== 'string' ||
    typeof value.sourceLabel !== 'string' ||
    typeof value.occurrenceIndex !== 'number' ||
    typeof value.selectedEntryHeadword !== 'string' ||
    typeof value.wordId !== 'number' ||
    typeof value.headword !== 'string' ||
    typeof value.senseId !== 'number' ||
    typeof value.definition !== 'string' ||
    typeof value.matchCount !== 'number' ||
    typeof value.isFavorited !== 'boolean'
  ) {
    return null
  }

  return {
    tokenId: value.tokenId,
    normalizedToken: value.normalizedToken,
    sourceLabel: value.sourceLabel,
    occurrenceIndex: value.occurrenceIndex,
    selectedEntryHeadword: value.selectedEntryHeadword,
    wordId: value.wordId,
    headword: value.headword,
    senseId: value.senseId,
    definition: value.definition,
    definitionCn: typeof value.definitionCn === 'string' ? value.definitionCn : undefined,
    matchCount: value.matchCount,
    isFavorited: value.isFavorited,
    tags: Array.isArray(value.tags)
      ? value.tags.map(normalizeHistoryTag).filter((tag): tag is Tag => tag !== null)
      : []
  }
}

function normalizeReadingHistoryRecord(value: unknown): ReadingHistoryRecord | null {
  if (!isObjectRecord(value)) {
    return null
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.articleText !== 'string' ||
    !isReadingHistoryStage(value.readingStage) ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return null
  }

  return {
    id: value.id,
    title: value.title,
    articleText: value.articleText,
    readingStage: value.readingStage,
    markedTokenEntries: Array.isArray(value.markedTokenEntries)
      ? value.markedTokenEntries
          .map(normalizeMarkedTokenEntry)
          .filter((entry): entry is MarkedReadingTokenEntry => entry !== null)
      : [],
    selectedSenseEntries: Array.isArray(value.selectedSenseEntries)
      ? value.selectedSenseEntries
          .map(normalizeSelectedSenseEntry)
          .filter((entry): entry is SelectedReadingSenseEntry => entry !== null)
      : [],
    shuffledSenseEntries: Array.isArray(value.shuffledSenseEntries)
      ? value.shuffledSenseEntries
          .map(normalizeSelectedSenseEntry)
          .filter((entry): entry is SelectedReadingSenseEntry => entry !== null)
      : [],
    selectedBatchEntryIds: Array.isArray(value.selectedBatchEntryIds)
      ? value.selectedBatchEntryIds.filter((entryId): entryId is string => typeof entryId === 'string')
      : [],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  }
}

function loadReadingHistoryRecords(): ReadingHistoryRecord[] {
  try {
    window.localStorage.removeItem(LEGACY_READING_HISTORY_STORAGE_KEY)

    const rawRecords = window.localStorage.getItem(READING_HISTORY_STORAGE_KEY)
    if (!rawRecords) {
      return []
    }

    const parsedRecords = JSON.parse(rawRecords)
    if (!Array.isArray(parsedRecords)) {
      return []
    }

    return parsedRecords
      .map(normalizeReadingHistoryRecord)
      .filter((record): record is ReadingHistoryRecord => record !== null)
      .sort((firstRecord, secondRecord) => secondRecord.updatedAt.localeCompare(firstRecord.updatedAt))
      .slice(0, READING_HISTORY_LIMIT)
  } catch (error) {
    console.error('Load reading history records failed:', error)
    return []
  }
}

function saveReadingHistoryRecords(records: ReadingHistoryRecord[]): void {
  try {
    window.localStorage.setItem(
      READING_HISTORY_STORAGE_KEY,
      JSON.stringify(records.slice(0, READING_HISTORY_LIMIT))
    )
  } catch (error) {
    console.error('Save reading history records failed:', error)
  }
}

function createReadingHistoryId(): string {
  return `reading-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createReadingHistoryTitle(articleText: string): string {
  const normalizedTitle = articleText.replace(/\s+/g, ' ').trim()
  if (!normalizedTitle) {
    return '未命名阅读'
  }

  return normalizedTitle.length > READING_HISTORY_TITLE_LENGTH
    ? `${normalizedTitle.slice(0, READING_HISTORY_TITLE_LENGTH)}...`
    : normalizedTitle
}

function formatReadingHistoryTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '时间未知'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

interface ReadingBatchTagDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (tags: Tag[]) => Promise<void>
}

function ReadingBatchTagDialog({ isOpen, onClose, onConfirm }: ReadingBatchTagDialogProps) {
  useBodyScrollLock(isOpen)

  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set())
  const [isCreating, setIsCreating] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setSelectedTagIds(new Set())
    setIsCreating(false)
    setNewTagName('')
    setIsLoading(true)

    void window.api
      .getTags()
      .then((tags) => setAllTags(tags))
      .catch((error) => {
        console.error('Failed to load reading batch tags:', error)
        setAllTags([])
      })
      .finally(() => setIsLoading(false))
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const visibleTags = allTags.filter(
    (tag) =>
      tag.name !== SYSTEM_TAGS.FAVORITE.name &&
      tag.name !== SYSTEM_TAGS.ARCHIVED.name
  )
  const canConfirm = selectedTagIds.size > 0 || (isCreating && newTagName.trim().length > 0)

  const handleToggleTag = (tagId: number) => {
    setSelectedTagIds((currentTagIds) => {
      const nextTagIds = new Set(currentTagIds)
      if (nextTagIds.has(tagId)) {
        nextTagIds.delete(tagId)
      } else {
        nextTagIds.add(tagId)
      }
      return nextTagIds
    })
  }

  const handleConfirm = async () => {
    setIsSaving(true)

    try {
      let nextTags = visibleTags.filter((tag) => selectedTagIds.has(tag.id))

      if (isCreating && newTagName.trim()) {
        const createdTag = await window.api.createTag(newTagName.trim(), READING_BATCH_TAG_COLOR)
        nextTags = [...nextTags, createdTag]
      }

      await onConfirm(nextTags)
      onClose()
    } catch (error) {
      console.error('Failed to confirm reading batch tags:', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-80 flex-col rounded-xl bg-white p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium text-gray-800">批量添加标签</h3>
          <button onClick={onClose} className="text-gray-400 transition hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-3 min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-4 text-center text-sm text-gray-400">加载中...</div>
          ) : (
            <>
              <div className="mb-3 space-y-1">
                {visibleTags.map((tag) => {
                  const isSelected = selectedTagIds.has(tag.id)

                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(tag.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                        isSelected
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="flex-1 text-left">{tag.name}</span>
                      {isSelected && (
                        <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>
                  )
                })}
                {visibleTags.length === 0 && (
                  <div className="py-2 text-center text-sm text-gray-400">暂无可选标签</div>
                )}
              </div>

              {isCreating ? (
                <div className="space-y-3 p-1">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(event) => setNewTagName(event.target.value)}
                    placeholder="输入名称，回车创建"
                    className="w-full rounded-lg border border-blue-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                    autoFocus
                    onBlur={() => {
                      if (!newTagName.trim()) {
                        setIsCreating(false)
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setIsCreating(false)
                      }
                      if (event.key === 'Enter') {
                        void handleConfirm()
                      }
                    }}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  新建标签
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex flex-shrink-0 gap-3 border-t border-gray-100 pt-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            取消
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={!canConfirm || isSaving}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

function normalizeRedirectLookupHeadword(rawHeadword: string): string {
  return rawHeadword
    .replace(/^entry:\/\//i, '')
    .split(/[\s<]/)[0]
    .trim()
}

function getRedirectDisplayHeadword(lookupHeadword: string): string {
  return lookupHeadword.replace(/_\d+$/, '').trim()
}

function extractRedirectTargetFromDefinitionHtml(
  definitionHtml: string | null | undefined
): RedirectTarget | null {
  if (!definitionHtml) {
    return null
  }

  const trimmedDefinitionHtml = definitionHtml.trim()
  if (!trimmedDefinitionHtml) {
    return null
  }

  const directRedirectMatch = trimmedDefinitionHtml.match(/^@@@LINK=([^\s<]+)/i)
  if (directRedirectMatch?.[1]) {
    const lookupHeadword = normalizeRedirectLookupHeadword(directRedirectMatch[1])
    if (!lookupHeadword) {
      return null
    }

    return {
      displayHeadword: getRedirectDisplayHeadword(lookupHeadword),
      lookupHeadword
    }
  }

  if (typeof DOMParser === 'undefined') {
    return null
  }

  const documentParser = new DOMParser()
  const parsedDocument = documentParser.parseFromString(trimmedDefinitionHtml, 'text/html')

  if (parsedDocument.querySelector('.def')) {
    return null
  }

  const redirectCandidates = Array.from(
    parsedDocument.querySelectorAll<HTMLAnchorElement>('a.Ref[href^="entry://"]')
  ).reduce<Map<string, string>>((candidates, link) => {
    const rawLookupHeadword = link.getAttribute('href')
    const lookupHeadword = rawLookupHeadword
      ? normalizeRedirectLookupHeadword(rawLookupHeadword)
      : ''

    if (!lookupHeadword) {
      return candidates
    }

    const displayHeadword =
      link.querySelector('.xh')?.textContent?.trim() ||
      link.textContent?.trim() ||
      getRedirectDisplayHeadword(lookupHeadword)

    candidates.set(lookupHeadword, displayHeadword)
    return candidates
  }, new Map<string, string>())

  if (redirectCandidates.size !== 1) {
    return null
  }

  const [[lookupHeadword, displayHeadword]] = Array.from(redirectCandidates.entries())
  return {
    displayHeadword: displayHeadword || getRedirectDisplayHeadword(lookupHeadword),
    lookupHeadword
  }
}

function resolveLookupRedirectTarget(
  word: LookupWordData | null,
  senses: LookupSenseData[]
): RedirectTarget | null {
  const redirectCandidates = new Map<string, RedirectTarget>()
  const redirectSources = [
    word?.definition_html,
    ...senses.flatMap((sense) => [sense.raw_html, sense.definition])
  ]

  redirectSources.forEach((source) => {
    const redirectTarget = extractRedirectTargetFromDefinitionHtml(source)
    if (!redirectTarget) {
      return
    }

    redirectCandidates.set(redirectTarget.lookupHeadword, redirectTarget)
  })

  if (redirectCandidates.size !== 1) {
    return redirectCandidates.size === 0 ? null : Array.from(redirectCandidates.values())[0]
  }

  return Array.from(redirectCandidates.values())[0]
}

function getCurrentFlowStepId(readingStage: ReadingStage): ReadingFlowStepId {
  if (readingStage === 'input') {
    return 'input'
  }

  if (readingStage === 'markWords') {
    return 'markWords'
  }

  if (readingStage === 'shuffleCn') {
    return 'shuffleCn'
  }

  if (readingStage === 'wordStudy') {
    return 'wordStudy'
  }

  if (readingStage === 'batch') {
    return 'batch'
  }

  return 'lookup'
}

function isIdiomGroup(senseGroup?: string): boolean {
  if (!senseGroup) return false
  const group = senseGroup.toLowerCase()
  return group.includes('idiom') || group.includes('phrase')
}

function inferPos(grammar?: string, senseGroup?: string): string {
  if (isIdiomGroup(senseGroup)) return 'idiom 习语'
  if (!grammar) return 'definitions 释义'

  const normalizedGrammar = grammar.toLowerCase()
  if (normalizedGrammar.includes('adv') || normalizedGrammar === 'adverb') return 'adverb 副词'
  if (normalizedGrammar.includes('adj') || normalizedGrammar === 'adjective') return 'adjective 形容词'
  if (
    normalizedGrammar.includes('[c]') ||
    normalizedGrammar.includes('[u]') ||
    normalizedGrammar.includes('noun') ||
    normalizedGrammar.includes('plural') ||
    normalizedGrammar.includes('sing') ||
    normalizedGrammar.includes('countable') ||
    normalizedGrammar.includes('uncountable')
  ) {
    return 'noun 名词'
  }
  if (
    normalizedGrammar.includes('[t]') ||
    normalizedGrammar.includes('[i]') ||
    normalizedGrammar.includes('verb') ||
    normalizedGrammar.includes('transitive') ||
    normalizedGrammar.includes('intransitive')
  ) {
    return 'verb 动词'
  }
  if (normalizedGrammar.includes('prep') || normalizedGrammar === 'preposition') return 'preposition 介词'
  if (normalizedGrammar.includes('pron') || normalizedGrammar === 'pronoun') return 'pronoun 代词'
  if (normalizedGrammar.includes('conj') || normalizedGrammar === 'conjunction') return 'conjunction 连词'
  if (normalizedGrammar.includes('interj') || normalizedGrammar === 'exclamation') return 'exclamation 感叹词'
  if (normalizedGrammar.includes('det') || normalizedGrammar === 'determiner') return 'determiner 限定词'
  if (normalizedGrammar.includes('num') || normalizedGrammar === 'number') return 'number 数词'
  if (normalizedGrammar.includes('modal')) return 'modal 情态动词'

  return 'definitions 释义'
}

function createIdleLookupPanelState(): LookupPanelState {
  return {
    tokenId: '',
    queryText: '',
    sourceLabel: '',
    normalizedToken: '',
    occurrenceIndex: 0,
    selectedEntryHeadword: '',
    status: 'idle',
    word: null,
    senses: [],
    selectedSenseId: null
  }
}

function resolvePreferredSearchResult(
  results: Awaited<ReturnType<typeof window.api.searchWord>>,
  queryText: string,
  normalizedToken: string
) {
  return (
    results.find((result) => result.headword === queryText) ||
    results.find((result) => result.headword.toLowerCase() === normalizedToken) ||
    results[0]
  )
}

function ReadingFlowHeader({
  currentStepId,
  onStepClick,
  canNavigateStep
}: {
  currentStepId: ReadingFlowStepId
  onStepClick: (stepId: ReadingFlowStepId) => void
  canNavigateStep: (stepId: ReadingFlowStepId) => boolean
}) {
  const currentStepIndex = READING_FLOW_STEPS.findIndex((step) => step.id === currentStepId)
  const progressPercentage =
    READING_FLOW_STEPS.length > 1
      ? (currentStepIndex / (READING_FLOW_STEPS.length - 1)) * 100
      : 0

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="relative min-w-[46rem] px-4">
          <div className="absolute left-8 right-8 top-3 h-px bg-slate-200/80" />
          <div
            className="absolute left-8 top-3 h-px bg-blue-400 transition-all duration-300"
            style={{ width: `calc((100% - 4rem) * ${progressPercentage / 100})` }}
          />

          <div
            className="relative grid gap-2"
            style={{ gridTemplateColumns: `repeat(${READING_FLOW_STEPS.length}, minmax(0, 1fr))` }}
          >
            {READING_FLOW_STEPS.map((step, index) => {
              const isCurrentStep = step.id === currentStepId
              const isReachedStep = index < currentStepIndex
              const isFutureStep = index > currentStepIndex
              const isNavigableStep = canNavigateStep(step.id)
              const isInteractiveStep = isNavigableStep && !isCurrentStep

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (isInteractiveStep) {
                      onStepClick(step.id)
                    }
                  }}
                  disabled={!isNavigableStep}
                  aria-current={isCurrentStep ? 'step' : undefined}
                  aria-label={`跳转到${step.label}`}
                  className={`group relative z-0 flex min-w-0 flex-col items-center text-center outline-none transition ${
                    isInteractiveStep
                      ? 'cursor-pointer'
                      : isNavigableStep
                        ? 'cursor-default'
                        : 'cursor-not-allowed'
                  }`}
                >
                  <div className="relative z-10">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors ${
                        isCurrentStep
                          ? 'border-blue-500 bg-blue-500 text-white shadow-[0_0_0_4px_rgba(59,130,246,0.08)]'
                          : isReachedStep
                            ? 'border-blue-200 bg-blue-50 text-blue-600'
                            : 'border-slate-300 bg-white text-slate-400'
                      } ${
                        isInteractiveStep
                          ? 'group-hover:border-blue-300 group-hover:bg-blue-50 group-hover:text-blue-600 group-focus-visible:ring-4 group-focus-visible:ring-blue-100'
                          : ''
                      }`}
                    >
                      {index + 1}
                    </div>
                  </div>

                  <div className="mt-1.5 min-h-[1.75rem]">
                    <div
                      className={`text-xs font-medium leading-4 ${
                        isCurrentStep
                          ? 'text-slate-900'
                          : isFutureStep
                            ? 'text-slate-400'
                            : 'text-slate-600'
                      } ${isInteractiveStep ? 'group-hover:text-blue-600' : ''}`}
                    >
                      {step.label}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReadingStageHeader({
  currentStepId,
  onStepClick,
  canNavigateStep,
  onOpenGuide,
  onOpenHistory
}: {
  currentStepId: ReadingFlowStepId
  onStepClick: (stepId: ReadingFlowStepId) => void
  canNavigateStep: (stepId: ReadingFlowStepId) => boolean
  onOpenGuide: () => void
  onOpenHistory: () => void
}) {
  const guideButtonClassName =
    'inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50'

  return (
    <>
      <div className="flex flex-col gap-3 md:hidden">
        <div className="min-w-0">
          <ReadingFlowHeader
            currentStepId={currentStepId}
            onStepClick={onStepClick}
            canNavigateStep={canNavigateStep}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onOpenGuide}
            className={guideButtonClassName}
          >
            辅助精读法说明
          </button>

          <button
            type="button"
            onClick={onOpenHistory}
            className={guideButtonClassName}
          >
            历史记录
          </button>
        </div>
      </div>

      <div className="hidden md:grid md:grid-cols-[12rem_minmax(0,64rem)_12rem] md:items-start md:gap-4">
        <div className="flex justify-start">
          <button
            type="button"
            onClick={onOpenGuide}
            className={guideButtonClassName}
          >
            辅助精读法说明
          </button>
        </div>

        <div className="min-w-0">
          <ReadingFlowHeader
            currentStepId={currentStepId}
            onStepClick={onStepClick}
            canNavigateStep={canNavigateStep}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onOpenHistory}
            className={guideButtonClassName}
          >
            历史记录
          </button>
        </div>
      </div>
    </>
  )
}

function ReadingHistoryDrawer({
  isOpen,
  records,
  onClose,
  onResume,
  onDelete
}: {
  isOpen: boolean
  records: ReadingHistoryRecord[]
  onClose: () => void
  onResume: (record: ReadingHistoryRecord) => void
  onDelete: (recordId: string) => Promise<void> | void
}) {
  useBodyScrollLock(isOpen)

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/20" onClick={onClose}>
      <aside
        className="absolute inset-y-0 right-0 flex w-full max-w-[32rem] flex-col border-l border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-slate-900">阅读历史</div>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                查看之前的辅助精读记录，可继续阅读或回顾已完成内容。
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {records.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm leading-6 text-slate-400">
              暂无阅读历史。开始一次阅读后，会自动保存到这里。
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((record) => {
                const stageLabel = READING_FLOW_STEP_META[getCurrentFlowStepId(record.readingStage)].label

                return (
                  <div key={record.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <div className="line-clamp-2 text-sm font-semibold leading-6 text-slate-900">
                      {record.title}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                        {stageLabel}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                        标记 {record.markedTokenEntries.length}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                        选义 {record.selectedSenseEntries.length}
                      </span>
                    </div>

                    <div className="mt-3 text-xs leading-5 text-slate-400">
                      最近阅读 {formatReadingHistoryTime(record.updatedAt)}
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onResume(record)}
                        className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-3 text-xs font-medium text-white transition hover:bg-blue-700"
                      >
                        继续阅读
                      </button>

                      <button
                        type="button"
                        onClick={() => void onDelete(record.id)}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function ReadingGuideDrawer({
  isOpen,
  onClose,
  onNavigateToStep,
  canNavigateStep
}: {
  isOpen: boolean
  onClose: () => void
  onNavigateToStep: (stepId: ReadingFlowStepId) => void
  canNavigateStep: (stepId: ReadingFlowStepId) => boolean
}) {
  useBodyScrollLock(isOpen)

  if (!isOpen) {
    return null
  }

  const handleGuideContentClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }

    const stepLinkElement = target.closest<HTMLElement>('[data-reading-step]')
    const rawStepId = stepLinkElement?.dataset.readingStep
    if (!isReadingFlowStepId(rawStepId)) {
      return
    }

    const stepId = rawStepId
    if (!canNavigateStep(stepId)) {
      return
    }

    onNavigateToStep(stepId)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/20" onClick={onClose}>
      <aside
        className="absolute inset-y-0 left-0 flex w-full max-w-[30rem] flex-col border-r border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="text-lg font-semibold text-slate-900">辅助精读法说明</div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-6" onClick={handleGuideContentClick}>
            <p className="text-sm leading-6 text-slate-600">{READING_GUIDE_INTRO}</p>

            {READING_GUIDE_SECTIONS.map((section) => {
              return (
                <section key={section.id} className="border-b border-slate-100 pb-6 last:border-b-0 last:pb-0">
                  <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{section.summary}</p>

                  <div className="mt-3 space-y-2">
                    {section.items.map((item, itemIndex) => (
                      <div
                        key={`${section.id}-item-${itemIndex}`}
                        className="flex items-start gap-3 text-sm leading-6 text-slate-600"
                      >
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      </aside>
    </div>
  )
}

export default function ReadingApp() {
  const { confirm, alert, DialogComponent } = useConfirmDialog()
  const [readingStage, setReadingStage] = useState<ReadingStage>('input')
  const [draftText, setDraftText] = useState('')
  const [committedText, setCommittedText] = useState('')
  const [readingDisplayMode, setReadingDisplayMode] = useState<DefinitionDisplayMode>('both')
  const [readingAutoPlay, setReadingAutoPlay] = useState(false)
  const [readingAutoPlayAccent, setReadingAutoPlayAccent] = useState<'uk' | 'us'>('uk')
  const [readingSessionId, setReadingSessionId] = useState<string | null>(null)
  const [readingHistoryRecords, setReadingHistoryRecords] = useState<ReadingHistoryRecord[]>(
    () => loadReadingHistoryRecords()
  )
  const [markedTokenEntries, setMarkedTokenEntries] = useState<MarkedReadingTokenEntry[]>([])
  const [lookupPanelState, setLookupPanelState] = useState<LookupPanelState>(() => createIdleLookupPanelState())
  const [selectedSenseEntries, setSelectedSenseEntries] = useState<SelectedReadingSenseEntry[]>([])
  const [shuffledSenseEntries, setShuffledSenseEntries] = useState<SelectedReadingSenseEntry[]>([])
  const [selectedBatchEntryIds, setSelectedBatchEntryIds] = useState<Set<string>>(new Set())
  const [isBatchTagDialogOpen, setIsBatchTagDialogOpen] = useState(false)
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)
  const [isLookupSearchDropdownOpen, setIsLookupSearchDropdownOpen] = useState(false)
  const [isGuideDrawerOpen, setIsGuideDrawerOpen] = useState(false)
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false)
  const lookupRequestIdRef = useRef(0)
  const lookupSearchSuggestionsEnabled =
    readingStage === 'reading' && lookupPanelState.normalizedToken !== ''
  const {
    query: lookupSearchInputValue,
    results: lookupSearchResults,
    loading: isLookupSearchLoading,
    setQuery: setLookupSearchInputValue,
    clearResults: clearLookupSearchResults
  } = useSearchSuggestions({
    initialQuery: lookupPanelState.queryText,
    enabled: lookupSearchSuggestionsEnabled,
    limit: READING_LOOKUP_SUGGESTION_LIMIT,
    debounceMs: READING_LOOKUP_SEARCH_DEBOUNCE_MS,
    errorLogMessage: 'Search reading lookup suggestions failed:'
  })

  const normalizedDraftText = draftText.trim()
  const canStartReading = normalizedDraftText.length > 0
  const currentFlowStepId = getCurrentFlowStepId(readingStage)
  const hasCommittedReadingText = committedText.trim().length > 0
  const readingParagraphs = useMemo(
    () => buildReadingParagraphs(committedText),
    [committedText]
  )
  const markedTokenSet = useMemo(
    () => new Set(markedTokenEntries.map((entry) => entry.tokenId)),
    [markedTokenEntries]
  )
  const selectedSenseEntryMap = useMemo(
    () => new Map(selectedSenseEntries.map((entry) => [entry.tokenId, entry])),
    [selectedSenseEntries]
  )
  const selectedBatchEntries = useMemo(
    () => selectedSenseEntries.filter((entry) => selectedBatchEntryIds.has(entry.tokenId)),
    [selectedBatchEntryIds, selectedSenseEntries]
  )
  const matchCountByToken = useMemo(() => {
    const counts = new Map<string, number>()

    readingParagraphs.forEach((paragraph) => {
      paragraph.tokens.forEach((token) => {
        if (token.kind !== 'word') {
          return
        }

        counts.set(token.normalizedText, (counts.get(token.normalizedText) || 0) + 1)
      })
    })

    return counts
  }, [readingParagraphs])
  const lookupRedirectTarget = useMemo(
    () => resolveLookupRedirectTarget(lookupPanelState.word, lookupPanelState.senses),
    [lookupPanelState.senses, lookupPanelState.word]
  )

  const resetLookupInteractionState = () => {
    lookupRequestIdRef.current += 1
    setLookupPanelState(createIdleLookupPanelState())
    setLookupSearchInputValue('')
    clearLookupSearchResults()
    setIsLookupSearchDropdownOpen(false)
  }

  useEffect(() => {
    let isEffectActive = true
    const loadReadingSettings = async () => {
      try {
        const [storedReadingDisplayMode, storedReadingAutoPlay, storedReadingAutoPlayAccent] = await Promise.all([
          window.api.getSetting<DefinitionDisplayMode>('readingDisplayMode'),
          window.api.getSetting<boolean>('readingAutoPlay'),
          window.api.getSetting<'uk' | 'us'>('readingAutoPlayAccent')
        ])

        if (!isEffectActive) {
          return
        }

        if (isDefinitionDisplayMode(storedReadingDisplayMode)) {
          setReadingDisplayMode(storedReadingDisplayMode)
        }

        if (storedReadingAutoPlay !== null && storedReadingAutoPlay !== undefined) {
          setReadingAutoPlay(storedReadingAutoPlay)
        }

        if (storedReadingAutoPlayAccent) {
          setReadingAutoPlayAccent(storedReadingAutoPlayAccent)
        }
      } catch (error) {
        console.error('Failed to load reading settings:', error)
      }
    }

    void loadReadingSettings()
    window.addEventListener('focus', loadReadingSettings)

    return () => {
      isEffectActive = false
      window.removeEventListener('focus', loadReadingSettings)
    }
  }, [])

  useEffect(() => {
    if (!readingSessionId || readingStage === 'input' || committedText.trim().length === 0) {
      return
    }

    const updatedAt = new Date().toISOString()

    setReadingHistoryRecords((currentRecords) => {
      const existingRecord = currentRecords.find((record) => record.id === readingSessionId)
      const nextRecord: ReadingHistoryRecord = {
        id: readingSessionId,
        title: createReadingHistoryTitle(committedText),
        articleText: committedText,
        readingStage,
        markedTokenEntries,
        selectedSenseEntries,
        shuffledSenseEntries,
        selectedBatchEntryIds: Array.from(selectedBatchEntryIds),
        createdAt: existingRecord?.createdAt || updatedAt,
        updatedAt
      }
      const nextRecords = [
        nextRecord,
        ...currentRecords.filter((record) => record.id !== readingSessionId)
      ].slice(0, READING_HISTORY_LIMIT)

      saveReadingHistoryRecords(nextRecords)
      return nextRecords
    })
  }, [
    committedText,
    markedTokenEntries,
    readingSessionId,
    readingStage,
    selectedBatchEntryIds,
    selectedSenseEntries,
    shuffledSenseEntries
  ])

  useEffect(() => {
    setSelectedBatchEntryIds((currentEntryIds) => {
      const validEntryIds = new Set(selectedSenseEntries.map((entry) => entry.tokenId))
      const nextEntryIds = new Set(
        Array.from(currentEntryIds).filter((entryId) => validEntryIds.has(entryId))
      )

      if (nextEntryIds.size === currentEntryIds.size) {
        return currentEntryIds
      }

      return nextEntryIds
    })
  }, [selectedSenseEntries])

  const loadLookupByWordId = async (
    wordId: number,
    queryText: string,
    sourceLabel: string,
    tokenId: string,
    normalizedToken: string,
    occurrenceIndex: number,
    selectedSenseId: number | null,
    selectedEntryHeadword: string
  ) => {
    const requestId = lookupRequestIdRef.current + 1
    lookupRequestIdRef.current = requestId

    setLookupPanelState({
      tokenId,
      queryText,
      sourceLabel,
      normalizedToken,
      occurrenceIndex,
      selectedEntryHeadword,
      status: 'loading',
      word: null,
      senses: [],
      selectedSenseId
    })

    try {
      const data = await window.api.getWordSenses(wordId, selectedEntryHeadword)
      if (lookupRequestIdRef.current !== requestId) {
        return
      }

      const lookupWord = data.word as LookupWordData
      const lookupSenses = (data.senses || []) as LookupSenseData[]

      setLookupPanelState({
        tokenId,
        queryText,
        sourceLabel,
        normalizedToken,
        occurrenceIndex,
        selectedEntryHeadword: lookupWord.headword || selectedEntryHeadword,
        status: lookupSenses.length > 0 ? 'ready' : 'empty',
        word: lookupWord,
        senses: lookupSenses,
        selectedSenseId
      })
    } catch (error) {
      console.error('Load lookup word senses failed:', error)
      if (lookupRequestIdRef.current !== requestId) {
        return
      }

      setLookupPanelState({
        tokenId,
        queryText,
        sourceLabel,
        normalizedToken,
        occurrenceIndex,
        selectedEntryHeadword,
        status: 'error',
        word: null,
        senses: [],
        selectedSenseId: null,
        errorMessage: '加载释义失败'
      })
    }
  }

  const handleLookupTokenSelection = async (entry: MarkedReadingTokenEntry) => {
    if (entry.tokenId === '' || entry.normalizedToken === '') {
      return
    }

    const existingEntry = selectedSenseEntryMap.get(entry.tokenId)
    if (existingEntry) {
      await loadLookupByWordId(
        existingEntry.wordId,
        existingEntry.selectedEntryHeadword,
        existingEntry.sourceLabel,
        existingEntry.tokenId,
        existingEntry.normalizedToken,
        existingEntry.occurrenceIndex,
        existingEntry.senseId,
        existingEntry.selectedEntryHeadword
      )
      return
    }

    const requestId = lookupRequestIdRef.current + 1
    lookupRequestIdRef.current = requestId
    setLookupPanelState({
      tokenId: entry.tokenId,
      queryText: entry.sourceLabel,
      sourceLabel: entry.sourceLabel,
      normalizedToken: entry.normalizedToken,
      occurrenceIndex: entry.occurrenceIndex,
      selectedEntryHeadword: entry.sourceLabel,
      status: 'loading',
      word: null,
      senses: [],
      selectedSenseId: null
    })

    try {
      const searchResults = await window.api.searchWord(entry.sourceLabel, 10)
      if (lookupRequestIdRef.current !== requestId) {
        return
      }

      if (searchResults.length === 0) {
        setLookupPanelState({
          tokenId: entry.tokenId,
          queryText: entry.sourceLabel,
          sourceLabel: entry.sourceLabel,
          normalizedToken: entry.normalizedToken,
          occurrenceIndex: entry.occurrenceIndex,
          selectedEntryHeadword: entry.sourceLabel,
          status: 'empty',
          word: null,
          senses: [],
          selectedSenseId: null
        })
        return
      }

      const preferredResult = resolvePreferredSearchResult(searchResults, entry.sourceLabel, entry.normalizedToken)
      await loadLookupByWordId(
        preferredResult.id,
        preferredResult.headword,
        entry.sourceLabel,
        entry.tokenId,
        entry.normalizedToken,
        entry.occurrenceIndex,
        null,
        preferredResult.headword
      )
    } catch (error) {
      console.error('Search reading token failed:', error)
      if (lookupRequestIdRef.current !== requestId) {
        return
      }

      setLookupPanelState({
        tokenId: entry.tokenId,
        queryText: entry.sourceLabel,
        sourceLabel: entry.sourceLabel,
        normalizedToken: entry.normalizedToken,
        occurrenceIndex: entry.occurrenceIndex,
        selectedEntryHeadword: entry.sourceLabel,
        status: 'error',
        word: null,
        senses: [],
        selectedSenseId: null,
        errorMessage: '查词失败'
      })
    }
  }

  const handleTextTokenClick = async (token: ReadingTextToken) => {
    if (token.kind !== 'word' || token.normalizedText === '') {
      return
    }

    await handleLookupTokenSelection(createMarkedTokenEntryFromToken(token))
  }

  const handleMarkedTokenLookup = async (entry: MarkedReadingTokenEntry) => {
    await handleLookupTokenSelection(entry)
  }

  const handleToggleMarkedToken = (token: ReadingTextToken) => {
    if (token.kind !== 'word' || token.normalizedText === '') {
      return
    }

    const isCurrentlyMarked = markedTokenSet.has(token.id)
    if (isCurrentlyMarked) {
      setMarkedTokenEntries((currentEntries) =>
        currentEntries.filter((entry) => entry.tokenId !== token.id)
      )
      setSelectedSenseEntries((currentEntries) =>
        currentEntries.filter((entry) => entry.tokenId !== token.id)
      )

      if (lookupPanelState.tokenId === token.id) {
        resetLookupInteractionState()
      }
      return
    }

    setMarkedTokenEntries((currentEntries) => [...currentEntries, createMarkedTokenEntryFromToken(token)])
  }

  const handleSelectReadingSense = (sense: LookupSenseData) => {
    const lookupWord = lookupPanelState.word
    if (!lookupWord || lookupPanelState.tokenId === '' || lookupPanelState.normalizedToken === '') {
      return
    }

    const matchCount = matchCountByToken.get(lookupPanelState.normalizedToken) || 1
    const nextEntry: SelectedReadingSenseEntry = {
      tokenId: lookupPanelState.tokenId,
      normalizedToken: lookupPanelState.normalizedToken,
      sourceLabel: lookupPanelState.sourceLabel,
      occurrenceIndex: lookupPanelState.occurrenceIndex,
      selectedEntryHeadword: lookupPanelState.selectedEntryHeadword || lookupWord.headword,
      wordId: lookupWord.id,
      headword: lookupWord.headword,
      senseId: sense.id,
      definition: sense.definition,
      definitionCn: sense.definition_cn,
      matchCount,
      isFavorited: sense.is_favorited === 1,
      tags: sense.tags || []
    }

    setSelectedSenseEntries((currentEntries) => {
      const existingEntryIndex = currentEntries.findIndex(
        (entry) => entry.tokenId === lookupPanelState.tokenId
      )

      if (existingEntryIndex === -1) {
        return [...currentEntries, nextEntry]
      }

      const nextEntries = [...currentEntries]
      nextEntries[existingEntryIndex] = nextEntry
      return nextEntries
    })

    setMarkedTokenEntries((currentEntries) => {
      if (currentEntries.some((entry) => entry.tokenId === nextEntry.tokenId)) {
        return currentEntries
      }

      return [
        ...currentEntries,
        {
          tokenId: nextEntry.tokenId,
          normalizedToken: nextEntry.normalizedToken,
          sourceLabel: nextEntry.sourceLabel,
          occurrenceIndex: nextEntry.occurrenceIndex
        }
      ]
    })

    setLookupPanelState((currentState) => ({
      ...currentState,
      selectedSenseId: sense.id
    }))
  }

  const handleClearReadingSenseSelection = () => {
    if (lookupPanelState.tokenId === '') {
      return
    }

    setSelectedSenseEntries((currentEntries) =>
      currentEntries.filter((entry) => entry.tokenId !== lookupPanelState.tokenId)
    )

    setLookupPanelState((currentState) => ({
      ...currentState,
      selectedSenseId: null
    }))
  }

  const handleLookupSenseFavoriteToggle = async (senseId: number, isFavorited: boolean) => {
    if (isFavorited) {
      await window.api.removeFavorite(senseId)
    } else {
      await window.api.addFavorite(senseId)
    }

    setLookupPanelState((currentState) => ({
      ...currentState,
      senses: currentState.senses.map((sense) =>
        sense.id === senseId
          ? {
              ...sense,
              is_favorited: isFavorited ? 0 : 1
            }
          : sense
      )
    }))

    setSelectedSenseEntries((currentEntries) =>
      currentEntries.map((entry) =>
        entry.senseId === senseId
          ? {
              ...entry,
              isFavorited: !isFavorited
            }
          : entry
      )
    )
  }

  const handleLookupSearchInputChange = (nextValue: string) => {
    setLookupSearchInputValue(nextValue)

    if (lookupPanelState.tokenId === '') {
      setIsLookupSearchDropdownOpen(false)
      return
    }

    setIsLookupSearchDropdownOpen(nextValue.trim().length > 0)
  }

  const handleLookupSearchInputFocus = () => {
    if (lookupPanelState.tokenId === '' || lookupSearchInputValue.trim().length === 0) {
      return
    }

    setIsLookupSearchDropdownOpen(true)
  }

  const handleLookupSearchInputBlur = () => {
    window.setTimeout(() => setIsLookupSearchDropdownOpen(false), 120)
  }

  const handleLookupSearchResultSelect = async (result: SearchResultItem) => {
    if (lookupPanelState.tokenId === '') {
      return
    }

    const nextSelectedSenseId =
      lookupPanelState.word?.id === result.id &&
      lookupPanelState.selectedEntryHeadword === result.headword
        ? lookupPanelState.selectedSenseId
        : null

    setLookupSearchInputValue(result.headword)
    clearLookupSearchResults()
    setIsLookupSearchDropdownOpen(false)

    await loadLookupByWordId(
      result.id,
      result.headword,
      lookupPanelState.sourceLabel || lookupPanelState.queryText,
      lookupPanelState.tokenId,
      lookupPanelState.normalizedToken,
      lookupPanelState.occurrenceIndex,
      nextSelectedSenseId,
      result.headword
    )
  }

  const handleLookupRedirect = async () => {
    if (!lookupRedirectTarget) {
      return
    }

    const currentWordId = lookupPanelState.word?.id
    const currentSourceLabel = lookupPanelState.sourceLabel || lookupPanelState.queryText
    const targetLookupHeadword = lookupRedirectTarget.lookupHeadword.trim()
    const targetDisplayHeadword = lookupRedirectTarget.displayHeadword.trim()

    if (!targetLookupHeadword || lookupPanelState.tokenId === '') {
      return
    }

    setLookupPanelState((currentState) => ({
      ...currentState,
      status: 'loading',
      senses: [],
      selectedSenseId: null,
      errorMessage: undefined
    }))

    try {
      let results = await window.api.searchWord(targetLookupHeadword)

      const findRedirectMatch = (searchResults: SearchResultItem[]) =>
        searchResults.find(
          (result) =>
            result.lookupHeadword === targetLookupHeadword ||
            result.headword === targetLookupHeadword ||
            result.headword === targetDisplayHeadword
        )

      let match = findRedirectMatch(results)

      if (!match && targetDisplayHeadword && targetDisplayHeadword !== targetLookupHeadword) {
        results = await window.api.searchWord(targetDisplayHeadword)
        match = findRedirectMatch(results)
      }

      if (match) {
        if (match.id === currentWordId) {
          const otherMatch = results.find(
            (result) =>
              result.id !== currentWordId &&
              (
                result.lookupHeadword === targetLookupHeadword ||
                result.headword === targetLookupHeadword ||
                result.headword === targetDisplayHeadword
              )
          )

          if (otherMatch) {
            await loadLookupByWordId(
              otherMatch.id,
              otherMatch.headword,
              currentSourceLabel,
              lookupPanelState.tokenId,
              lookupPanelState.normalizedToken,
              lookupPanelState.occurrenceIndex,
              null,
              otherMatch.headword
            )
            return
          }
        } else {
          await loadLookupByWordId(
            match.id,
            match.headword,
            currentSourceLabel,
            lookupPanelState.tokenId,
            lookupPanelState.normalizedToken,
            lookupPanelState.occurrenceIndex,
            null,
            match.headword
          )
          return
        }
      }

      setLookupPanelState({
        tokenId: lookupPanelState.tokenId,
        queryText: lookupPanelState.queryText,
        sourceLabel: currentSourceLabel,
        normalizedToken: lookupPanelState.normalizedToken,
        occurrenceIndex: lookupPanelState.occurrenceIndex,
        selectedEntryHeadword: lookupPanelState.selectedEntryHeadword,
        status: 'error',
        word: null,
        senses: [],
        selectedSenseId: null,
        errorMessage: `未找到目标词条: "${targetDisplayHeadword || targetLookupHeadword}"`
      })
    } catch (error) {
      console.error('Redirect reading lookup failed:', error)
      setLookupPanelState({
        tokenId: lookupPanelState.tokenId,
        queryText: lookupPanelState.queryText,
        sourceLabel: currentSourceLabel,
        normalizedToken: lookupPanelState.normalizedToken,
        occurrenceIndex: lookupPanelState.occurrenceIndex,
        selectedEntryHeadword: lookupPanelState.selectedEntryHeadword,
        status: 'error',
        word: null,
        senses: [],
        selectedSenseId: null,
        errorMessage: '重定向失败'
      })
    }
  }

  const handleStartReading = () => {
    if (!canStartReading) {
      return
    }

    const normalizedArticleText = normalizePastedArticleText(draftText)
    const nextReadingSessionId = createReadingHistoryId()
    setReadingSessionId(nextReadingSessionId)
    setCommittedText(normalizedArticleText)
    setMarkedTokenEntries([])
    resetLookupInteractionState()
    setSelectedSenseEntries([])
    setShuffledSenseEntries([])
    setSelectedBatchEntryIds(new Set())
    setIsBatchTagDialogOpen(false)
    setReadingStage('markWords')
  }

  const handleGoBackToInputStage = () => {
    setCommittedText('')
    setReadingSessionId(null)
    setMarkedTokenEntries([])
    resetLookupInteractionState()
    setSelectedSenseEntries([])
    setShuffledSenseEntries([])
    setSelectedBatchEntryIds(new Set())
    setIsBatchTagDialogOpen(false)
    setReadingStage('input')
  }

  const handleGoToLookupStage = () => {
    setReadingStage('reading')
  }

  const handleGoBackToMarkStage = () => {
    setReadingStage('markWords')
  }

  const handleGoToShuffleCnStage = () => {
    setShuffledSenseEntries(shuffleItems(selectedSenseEntries))
    setReadingStage('shuffleCn')
  }

  const handleGoBackToLookupStage = () => {
    setReadingStage('reading')
  }

  const handleGoToWordStudyStage = () => {
    setReadingStage('wordStudy')
  }

  const handleGoBackToShuffleCnStage = () => {
    setReadingStage('shuffleCn')
  }

  const handleGoToBatchStage = () => {
    setSelectedBatchEntryIds(new Set())
    setReadingStage('batch')
  }

  const handleGoBackToWordStudyStage = () => {
    setIsBatchTagDialogOpen(false)
    setReadingStage('wordStudy')
  }

  const handleCompleteReading = () => {
    setIsBatchTagDialogOpen(false)
    window.close()
  }

  const canNavigateToFlowStep = (stepId: ReadingFlowStepId) => {
    return stepId === 'input' || hasCommittedReadingText
  }

  const handleNavigateToFlowStep = (stepId: ReadingFlowStepId) => {
    if (!canNavigateToFlowStep(stepId) || stepId === currentFlowStepId) {
      return
    }

    if (stepId !== 'batch') {
      setIsBatchTagDialogOpen(false)
    }

    if (stepId === 'input') {
      setReadingStage('input')
      return
    }

    if (stepId === 'markWords') {
      setReadingStage('markWords')
      return
    }

    if (stepId === 'lookup') {
      setReadingStage('reading')
      return
    }

    if (stepId === 'shuffleCn') {
      setShuffledSenseEntries(shuffleItems(selectedSenseEntries))
      setReadingStage('shuffleCn')
      return
    }

    if (stepId === 'wordStudy') {
      setReadingStage('wordStudy')
      return
    }

    setSelectedBatchEntryIds(new Set())
    setReadingStage('batch')
  }

  const handleOpenGuideDrawer = () => {
    setIsHistoryDrawerOpen(false)
    setIsGuideDrawerOpen(true)
  }

  const handleOpenHistoryDrawer = () => {
    setReadingHistoryRecords(loadReadingHistoryRecords())
    setIsGuideDrawerOpen(false)
    setIsHistoryDrawerOpen(true)
  }

  const handleResumeReadingHistoryRecord = (record: ReadingHistoryRecord) => {
    const validSelectedEntryIds = new Set(record.selectedSenseEntries.map((entry) => entry.tokenId))
    setReadingSessionId(record.id)
    setDraftText(record.articleText)
    setCommittedText(record.articleText)
    setMarkedTokenEntries(record.markedTokenEntries)
    setSelectedSenseEntries(record.selectedSenseEntries)
    setShuffledSenseEntries(
      record.shuffledSenseEntries.length > 0
        ? record.shuffledSenseEntries
        : shuffleItems(record.selectedSenseEntries)
    )
    setSelectedBatchEntryIds(
      new Set(record.selectedBatchEntryIds.filter((entryId) => validSelectedEntryIds.has(entryId)))
    )
    setIsBatchTagDialogOpen(false)
    resetLookupInteractionState()
    setReadingStage(record.readingStage)
    setIsHistoryDrawerOpen(false)
  }

  const handleDeleteReadingHistoryRecord = async (recordId: string) => {
    const shouldDelete = await confirm({
      title: '删除阅读历史',
      message: '确认删除这条阅读历史记录？删除后无法恢复。',
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger'
    })

    if (!shouldDelete) {
      return
    }

    setReadingHistoryRecords((currentRecords) => {
      const nextRecords = currentRecords.filter((record) => record.id !== recordId)
      saveReadingHistoryRecords(nextRecords)
      return nextRecords
    })

    if (recordId === readingSessionId) {
      setReadingSessionId(null)
    }
  }

  const guideDrawerElement = (
    <ReadingGuideDrawer
      isOpen={isGuideDrawerOpen}
      onClose={() => setIsGuideDrawerOpen(false)}
      onNavigateToStep={handleNavigateToFlowStep}
      canNavigateStep={canNavigateToFlowStep}
    />
  )

  const historyDrawerElement = (
    <ReadingHistoryDrawer
      isOpen={isHistoryDrawerOpen}
      records={readingHistoryRecords}
      onClose={() => setIsHistoryDrawerOpen(false)}
      onResume={handleResumeReadingHistoryRecord}
      onDelete={handleDeleteReadingHistoryRecord}
    />
  )

  const handleToggleBatchEntrySelection = (entryId: string) => {
    setSelectedBatchEntryIds((currentEntryIds) => {
      const nextEntryIds = new Set(currentEntryIds)
      if (nextEntryIds.has(entryId)) {
        nextEntryIds.delete(entryId)
      } else {
        nextEntryIds.add(entryId)
      }
      return nextEntryIds
    })
  }

  const handleToggleBatchSelectAll = () => {
    if (selectedBatchEntryIds.size === selectedSenseEntries.length) {
      setSelectedBatchEntryIds(new Set())
      return
    }

    setSelectedBatchEntryIds(new Set(selectedSenseEntries.map((entry) => entry.tokenId)))
  }

  const handleBatchFavoriteSenses = async () => {
    if (selectedBatchEntries.length === 0 || isBatchProcessing) {
      return
    }

    setIsBatchProcessing(true)

    try {
      const selectedSenseIds = Array.from(
        new Set(selectedBatchEntries.filter((entry) => !entry.isFavorited).map((entry) => entry.senseId))
      )

      await Promise.all(
        selectedSenseIds.map((senseId) => window.api.addFavorite(senseId))
      )
      const updatedSenseIds = new Set(selectedSenseIds)

      setSelectedSenseEntries((currentEntries) =>
        currentEntries.map((entry) =>
          updatedSenseIds.has(entry.senseId)
            ? {
                ...entry,
                isFavorited: true
              }
            : entry
        )
      )
    } catch (error) {
      console.error('Batch favorite reading senses failed:', error)
      await alert({ title: '操作失败', message: '批量收藏失败，请重试', type: 'danger' })
    } finally {
      setIsBatchProcessing(false)
    }
  }

  const handleBatchAddTagsToSenses = async (tags: Tag[]) => {
    if (selectedBatchEntries.length === 0 || tags.length === 0 || isBatchProcessing) {
      return
    }

    setIsBatchProcessing(true)

    try {
      const selectedSenseIds = Array.from(new Set(selectedBatchEntries.map((entry) => entry.senseId)))

      await Promise.all(
        selectedSenseIds.flatMap((senseId) =>
          tags.map((tag) => window.api.addEntityTag('sense', senseId, tag.id))
        )
      )
      const updatedSenseIds = new Set(selectedSenseIds)

      setSelectedSenseEntries((currentEntries) =>
        currentEntries.map((entry) => {
          if (!updatedSenseIds.has(entry.senseId)) {
            return entry
          }

          const nextTags = [...entry.tags]
          tags.forEach((tag) => {
            if (!nextTags.some((existingTag) => existingTag.id === tag.id)) {
              nextTags.push(tag)
            }
          })

          return {
            ...entry,
            tags: nextTags
          }
        })
      )
    } catch (error) {
      console.error('Batch add tags to reading senses failed:', error)
      await alert({ title: '操作失败', message: '批量添加标签失败，请重试', type: 'danger' })
    } finally {
      setIsBatchProcessing(false)
    }
  }

  if (readingStage === 'markWords') {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-5 text-slate-900">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-3 lg:h-[calc(100vh-2.5rem)]">
          <ReadingStageHeader
            currentStepId={currentFlowStepId}
            onStepClick={handleNavigateToFlowStep}
            canNavigateStep={canNavigateToFlowStep}
            onOpenGuide={handleOpenGuideDrawer}
            onOpenHistory={handleOpenHistoryDrawer}
          />

          <div className="grid min-h-[36rem] gap-4 lg:flex-1 lg:min-h-0 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-full lg:overflow-hidden">
              <div className="px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">本次已标记</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  共 {markedTokenEntries.length} 项
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {markedTokenEntries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-400">
                    点击正文中不认识的单词进行标记。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {markedTokenEntries.map((entry, index) => (
                      <div
                        key={entry.tokenId}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <div className="text-xs font-medium text-slate-400">单词 {index + 1}</div>
                        <div className="mt-2 text-base font-semibold text-slate-900">{entry.sourceLabel}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <div className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                            {getReadingEntryPositionLabel(entry)}
                          </div>
                          <div className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                            全文 {matchCountByToken.get(entry.normalizedToken) || 1} 处
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>

            <section className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-full lg:overflow-hidden">
              <div className="px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">阅读原文</h2>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4 xl:px-8">
                <div className="space-y-6 text-lg leading-9 text-slate-700">
                  {readingParagraphs.map((paragraph) => (
                    <p key={paragraph.id} className="whitespace-pre-wrap">
                      {paragraph.tokens.map((token) => {
                        if (token.kind !== 'word') {
                          return <span key={token.id}>{token.text}</span>
                        }

                        const isMarkedToken = markedTokenSet.has(token.id)

                        return (
                          <button
                            key={token.id}
                            type="button"
                            onClick={() => handleToggleMarkedToken(token)}
                            className={`inline rounded px-0.5 transition ${
                              isMarkedToken
                                ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {token.text}
                          </button>
                        )
                      })}
                    </p>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleGoBackToInputStage}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              上一步
            </button>

            <button
              type="button"
              onClick={handleGoToLookupStage}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 active:translate-y-px"
            >
              下一步
            </button>
          </div>

          {DialogComponent}
          {guideDrawerElement}
          {historyDrawerElement}
        </div>
      </div>
    )
  }

  if (readingStage === 'reading') {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-5 text-slate-900">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-3 lg:h-[calc(100vh-2.5rem)]">
          <ReadingStageHeader
            currentStepId={currentFlowStepId}
            onStepClick={handleNavigateToFlowStep}
            canNavigateStep={canNavigateToFlowStep}
            onOpenGuide={handleOpenGuideDrawer}
            onOpenHistory={handleOpenHistoryDrawer}
          />

          <div className="grid min-h-[36rem] gap-4 lg:flex-1 lg:min-h-0 lg:grid-cols-[15rem_minmax(0,1fr)_18rem]">
            <aside className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-full lg:overflow-hidden">
              <div className="px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">本次已标记</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  共 {markedTokenEntries.length} 项
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {markedTokenEntries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-400">
                    第二步标记或第三步选义的单词会出现在这里。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {markedTokenEntries.map((entry) => {
                      const selectedEntry = selectedSenseEntryMap.get(entry.tokenId)
                      const isActiveEntry = lookupPanelState.tokenId === entry.tokenId

                      return (
                        <button
                          key={entry.tokenId}
                          type="button"
                          onClick={() => void handleMarkedTokenLookup(entry)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                            isActiveEntry
                              ? 'border-blue-200 bg-blue-50'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-base font-semibold text-slate-900">
                            {selectedEntry?.headword || entry.sourceLabel}
                          </div>
                          {selectedEntry && shouldShowChineseDefinition(readingDisplayMode) && selectedEntry.definitionCn ? (
                            <div className="mt-2 text-sm leading-6 text-slate-700">
                              {selectedEntry.definitionCn}
                            </div>
                          ) : !selectedEntry ? (
                            <div className="mt-2 text-sm leading-6 text-slate-400">尚未选择语境义项</div>
                          ) : null}
                          {selectedEntry && shouldShowEnglishDefinition(readingDisplayMode) && (
                            <div className="mt-1 text-sm leading-6 text-slate-500">
                              {selectedEntry.definition}
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <div className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                              {getReadingEntryPositionLabel(entry)}
                            </div>
                            <div className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                              全文 {matchCountByToken.get(entry.normalizedToken) || 1} 处
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </aside>

            <section className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-full lg:overflow-hidden">
              <div className="px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">阅读原文</h2>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4 xl:px-8">
                <div className="space-y-6 text-lg leading-9 text-slate-700">
                  {readingParagraphs.map((paragraph) => (
                    <p key={paragraph.id} className="whitespace-pre-wrap">
                      {paragraph.tokens.map((token) => {
                        if (token.kind !== 'word') {
                          return <span key={token.id}>{token.text}</span>
                        }

                        const isLookupToken = lookupPanelState.tokenId === token.id
                        const isSelectedToken = selectedSenseEntryMap.has(token.id)
                        const isMarkedToken = markedTokenSet.has(token.id)

                        return (
                          <button
                            key={token.id}
                            type="button"
                            onClick={() => void handleTextTokenClick(token)}
                            className={`inline rounded px-0.5 transition ${
                              isLookupToken
                                ? 'bg-blue-500 text-white'
                                : isSelectedToken
                                  ? 'bg-blue-50 text-blue-700'
                                  : isMarkedToken
                                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                    : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {token.text}
                          </button>
                        )
                      })}
                    </p>
                  ))}
                </div>
              </div>
            </section>

            <aside className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-full lg:overflow-hidden">
              <div className="px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">释义选择</h2>
                <div className="mt-2 flex items-center gap-2">
                  <span className="shrink-0 text-xs leading-5 text-slate-500">当前词：</span>
                  <div className="relative min-w-0 flex-1">
                    <input
                      type="text"
                      value={lookupSearchInputValue}
                      onChange={(event) => handleLookupSearchInputChange(event.target.value)}
                      onFocus={handleLookupSearchInputFocus}
                      onBlur={handleLookupSearchInputBlur}
                      disabled={lookupPanelState.tokenId === ''}
                      placeholder={
                        lookupPanelState.tokenId === ''
                          ? '点击正文单词后可改搜词条'
                          : '输入新的词形或原形'
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                    />

                    {isLookupSearchDropdownOpen && lookupPanelState.tokenId !== '' && (
                      <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                        {isLookupSearchLoading ? (
                          <div className="px-3 py-3 text-xs text-slate-500">搜索中...</div>
                        ) : lookupSearchResults.length > 0 ? (
                          <div className="max-h-60 overflow-y-auto">
                            {lookupSearchResults.map((result) => (
                              <button
                                key={`${result.id}:${result.lookupHeadword || result.headword}:${result.headword}`}
                                type="button"
                                onClick={() => void handleLookupSearchResultSelect(result)}
                                className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-blue-50"
                              >
                                <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                                  {result.headword}
                                </span>
                                <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-400">
                                  {result.dict_name}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="px-3 py-3 text-xs leading-5 text-slate-500">
                            未找到可替换的词条。
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {lookupPanelState.word && (
                  <WordPronunciation
                    headword={lookupPanelState.word.headword}
                    phonUk={lookupPanelState.word.phon_uk}
                    phonUs={lookupPanelState.word.phon_us}
                    autoPlay={readingAutoPlay}
                    autoPlayAccent={readingAutoPlayAccent}
                    size="compact"
                    className="mt-3"
                  />
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
                {lookupPanelState.status === 'idle' && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-400">
                    点击已标记的单词后，将在这里显示可选释义。
                  </div>
                )}

                {lookupPanelState.status === 'loading' && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    正在加载释义...
                  </div>
                )}

                {lookupPanelState.status !== 'idle' &&
                  lookupPanelState.status !== 'loading' &&
                  lookupPanelState.status !== 'error' &&
                  lookupRedirectTarget && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-500">
                    <div>你是不是要找：</div>
                    <button
                      type="button"
                      onClick={() => void handleLookupRedirect()}
                      className="mt-2 text-base font-semibold text-blue-600 transition hover:text-blue-700 hover:underline"
                    >
                      {lookupRedirectTarget.displayHeadword}
                    </button>
                  </div>
                )}

                {lookupPanelState.status === 'empty' && !lookupRedirectTarget && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-500">
                    未找到 “{lookupPanelState.queryText || '当前词'}” 的可用词条。
                  </div>
                )}

                {lookupPanelState.status === 'error' && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-sm leading-6 text-red-600">
                    {lookupPanelState.errorMessage || '加载释义失败'}
                  </div>
                )}

                {lookupPanelState.status === 'ready' &&
                  lookupPanelState.word &&
                  !lookupRedirectTarget && (
                    <div className="space-y-4">
                      {lookupPanelState.senses.map((sense) => {
                        const isSelectedSense = lookupPanelState.selectedSenseId === sense.id
                        const selectionLabel =
                          lookupPanelState.selectedSenseId === null
                            ? '选为本文义项'
                            : isSelectedSense
                              ? '取消本文义项'
                              : '改选为本文义项'

                        return (
                          <div
                            key={sense.id}
                            className={`rounded-[1.75rem] border p-2 transition ${
                              isSelectedSense ? 'border-blue-300 bg-blue-50/50' : 'border-transparent'
                            }`}
                          >
                            <SenseCard
                              sense={sense}
                              headword={lookupPanelState.word!.headword}
                              pos={inferPos(sense.grammar, sense.sense_group)}
                              onFavoriteToggle={() =>
                                void handleLookupSenseFavoriteToggle(sense.id, sense.is_favorited === 1)
                              }
                              displayMode={readingDisplayMode}
                              size="compact"
                            />

                            <div className="px-3 pb-2 pt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  isSelectedSense
                                    ? handleClearReadingSenseSelection()
                                    : handleSelectReadingSense(sense)
                                }
                                className={`w-full rounded-xl px-4 py-2 text-xs font-medium transition ${
                                  isSelectedSense
                                    ? 'bg-blue-600 text-white'
                                    : 'border border-blue-200 bg-white text-blue-700 hover:bg-blue-50'
                                }`}
                              >
                                {selectionLabel}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
              </div>
            </aside>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleGoBackToMarkStage}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              上一步
            </button>

            <button
              type="button"
              onClick={handleGoToShuffleCnStage}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 active:translate-y-px"
            >
              下一步
            </button>
          </div>

          {DialogComponent}
          {guideDrawerElement}
          {historyDrawerElement}
        </div>
      </div>
    )
  }

  if (readingStage === 'shuffleCn') {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-5 text-slate-900">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-3 lg:h-[calc(100vh-2.5rem)]">
          <ReadingStageHeader
            currentStepId={currentFlowStepId}
            onStepClick={handleNavigateToFlowStep}
            canNavigateStep={canNavigateToFlowStep}
            onOpenGuide={handleOpenGuideDrawer}
            onOpenHistory={handleOpenHistoryDrawer}
          />

          <div className="grid min-h-[36rem] gap-4 lg:flex-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-full lg:overflow-hidden">
              <div className="px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">阅读原文</h2>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4 xl:px-8">
                <div className="space-y-6 text-lg leading-9 text-slate-700">
                  {readingParagraphs.map((paragraph) => (
                    <p key={paragraph.id} className="whitespace-pre-wrap">
                      {paragraph.tokens.map((token) => {
                        if (token.kind !== 'word') {
                          return <span key={token.id}>{token.text}</span>
                        }

                        const isSelectedToken = selectedSenseEntryMap.has(token.id)

                        return (
                          <span
                            key={token.id}
                            className={isSelectedToken ? 'rounded bg-blue-50 px-0.5 text-blue-700' : undefined}
                          >
                            {token.text}
                          </span>
                        )
                      })}
                    </p>
                  ))}
                </div>
              </div>
            </section>

            <aside className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-full lg:overflow-hidden">
              <div className="px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">乱序中文释义</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  共 {shuffledSenseEntries.length} 项
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
                {shuffledSenseEntries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-400">
                    第三步标记的中文释义会在这里乱序显示。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {shuffledSenseEntries.map((entry, index) => (
                      <div
                        key={entry.tokenId}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <div className="text-xs font-medium text-slate-400">释义 {index + 1}</div>
                        <div className="mt-2 text-sm leading-7 text-slate-700">
                          {getShuffleCnDefinition(entry)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleGoBackToLookupStage}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              上一步
            </button>

            <button
              type="button"
              onClick={handleGoToWordStudyStage}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 active:translate-y-px"
            >
              下一步
            </button>
          </div>

          {DialogComponent}
          {guideDrawerElement}
          {historyDrawerElement}
        </div>
      </div>
    )
  }

  if (readingStage === 'wordStudy') {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-5 text-slate-900">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-3 lg:h-[calc(100vh-2.5rem)]">
          <ReadingStageHeader
            currentStepId={currentFlowStepId}
            onStepClick={handleNavigateToFlowStep}
            canNavigateStep={canNavigateToFlowStep}
            onOpenGuide={handleOpenGuideDrawer}
            onOpenHistory={handleOpenHistoryDrawer}
          />

          <div className="grid min-h-[36rem] gap-4 lg:flex-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-full lg:overflow-hidden">
              <div className="px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">阅读原文</h2>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4 xl:px-8">
                <div className="space-y-6 text-lg leading-9 text-slate-700">
                  {readingParagraphs.map((paragraph) => (
                    <p key={paragraph.id} className="whitespace-pre-wrap">
                      {paragraph.tokens.map((token) => {
                        if (token.kind !== 'word') {
                          return <span key={token.id}>{token.text}</span>
                        }

                        const isSelectedToken = selectedSenseEntryMap.has(token.id)

                        return (
                          <span
                            key={token.id}
                            className={isSelectedToken ? 'rounded bg-blue-50 px-0.5 text-blue-700' : undefined}
                          >
                            {token.text}
                          </span>
                        )
                      })}
                    </p>
                  ))}
                </div>
              </div>
            </section>

            <aside className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-full lg:overflow-hidden">
              <div className="px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">标记过的单词</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  共 {selectedSenseEntries.length} 项
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
                {selectedSenseEntries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-400">
                    第三步标记过的单词会在这里集中显示。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedSenseEntries.map((entry, index) => (
                      <div
                        key={entry.tokenId}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <div className="text-xs font-medium text-slate-400">单词 {index + 1}</div>
                        <div className="mt-2 text-base font-semibold text-slate-900">{entry.headword}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <div className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                            {entry.sourceLabel} · {getReadingEntryPositionLabel(entry)}
                          </div>
                          <div className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                            全文 {entry.matchCount} 处
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleGoBackToShuffleCnStage}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              上一步
            </button>

            <button
              type="button"
              onClick={() => void handleGoToBatchStage()}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 active:translate-y-px"
            >
              下一步
            </button>
          </div>

          {DialogComponent}
          {guideDrawerElement}
          {historyDrawerElement}
        </div>
      </div>
    )
  }

  if (readingStage === 'batch') {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-5 text-slate-900">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-3 lg:h-[calc(100vh-2.5rem)]">
          <ReadingStageHeader
            currentStepId={currentFlowStepId}
            onStepClick={handleNavigateToFlowStep}
            canNavigateStep={canNavigateToFlowStep}
            onOpenGuide={handleOpenGuideDrawer}
            onOpenHistory={handleOpenHistoryDrawer}
          />

          <div className="grid min-h-[36rem] gap-4 lg:flex-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <section className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-full lg:overflow-hidden">
              <div className="px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">阅读原文</h2>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4 xl:px-8">
                <div className="space-y-6 text-lg leading-9 text-slate-700">
                  {readingParagraphs.map((paragraph) => (
                    <p key={paragraph.id} className="whitespace-pre-wrap">
                      {paragraph.tokens.map((token) => {
                        if (token.kind !== 'word') {
                          return <span key={token.id}>{token.text}</span>
                        }

                        const isSelectedToken = selectedSenseEntryMap.has(token.id)

                        return (
                          <span
                            key={token.id}
                            className={isSelectedToken ? 'rounded bg-blue-50 px-0.5 text-blue-700' : undefined}
                          >
                            {token.text}
                          </span>
                        )
                      })}
                    </p>
                  ))}
                </div>
              </div>
            </section>

            <aside className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-full lg:overflow-hidden">
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">本次标记释义</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      已选 {selectedBatchEntryIds.size} / 共 {selectedSenseEntries.length} 项
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleBatchSelectAll}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                  >
                    {selectedBatchEntryIds.size === selectedSenseEntries.length && selectedSenseEntries.length > 0
                      ? '取消'
                      : '全选'}
                  </button>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleBatchFavoriteSenses()}
                    disabled={selectedBatchEntryIds.size === 0 || isBatchProcessing}
                    className="inline-flex flex-1 items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    批量收藏
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsBatchTagDialogOpen(true)}
                    disabled={selectedBatchEntryIds.size === 0 || isBatchProcessing}
                    className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300"
                  >
                    批量加标签
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
                {selectedSenseEntries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-400">
                    第三步标记过的释义会在这里集中显示。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedSenseEntries.map((entry, index) => (
                      <button
                        key={entry.tokenId}
                        type="button"
                        onClick={() => handleToggleBatchEntrySelection(entry.tokenId)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                          selectedBatchEntryIds.has(entry.tokenId)
                            ? 'border-blue-300 bg-blue-50/50'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="pt-0.5">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded border text-[11px] ${
                                selectedBatchEntryIds.has(entry.tokenId)
                                  ? 'border-blue-500 bg-blue-500 text-white'
                                  : 'border-slate-300 bg-white text-transparent'
                              }`}
                            >
                              ✓
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="text-xs font-medium text-slate-400">释义 {index + 1}</div>
                              {entry.isFavorited && (
                                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-500">
                                  已收藏
                                </span>
                              )}
                            </div>

                            <div className="mt-2 text-base font-semibold text-slate-900">{entry.headword}</div>
                            <div className="mt-2 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                              {entry.sourceLabel} · {getReadingEntryPositionLabel(entry)}
                            </div>
                            {shouldShowChineseDefinition(readingDisplayMode) && entry.definitionCn && (
                              <div className="mt-2 text-sm leading-6 text-slate-700">{entry.definitionCn}</div>
                            )}
                            {shouldShowEnglishDefinition(readingDisplayMode) && (
                              <div className="mt-1 text-sm leading-6 text-slate-500">{entry.definition}</div>
                            )}

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <div className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                                全文 {entry.matchCount} 处
                              </div>

                              {getVisibleReadingTags(entry.tags).map((tag) => (
                                <div
                                  key={tag.id}
                                  className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500"
                                >
                                  {tag.name}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleGoBackToWordStudyStage}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              上一步
            </button>
            <button
              type="button"
              onClick={handleCompleteReading}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 active:translate-y-px"
            >
              完成
            </button>
          </div>

          {DialogComponent}
          <ReadingBatchTagDialog
            isOpen={isBatchTagDialogOpen}
            onClose={() => setIsBatchTagDialogOpen(false)}
            onConfirm={handleBatchAddTagsToSenses}
          />
          {guideDrawerElement}
          {historyDrawerElement}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-5 text-slate-900">
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-3 lg:h-[calc(100vh-2.5rem)]">
        <ReadingStageHeader
          currentStepId={currentFlowStepId}
          onStepClick={handleNavigateToFlowStep}
          canNavigateStep={canNavigateToFlowStep}
          onOpenGuide={handleOpenGuideDrawer}
          onOpenHistory={handleOpenHistoryDrawer}
        />

        <div className="mx-auto w-full max-w-5xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <textarea
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            rows={READING_TEXTAREA_ROWS}
            placeholder="请输入或粘贴要阅读的英文原文"
            className="min-h-[28rem] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-base leading-7 text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
          />

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={handleStartReading}
              disabled={!canStartReading}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-100"
            >
              开始阅读
            </button>
          </div>
        </div>

        {DialogComponent}
        {guideDrawerElement}
        {historyDrawerElement}
      </div>
    </div>
  )
}
