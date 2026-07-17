import { useState, useEffect, useMemo, useRef, type MouseEvent } from 'react'
import { Check, Heart, Pencil, Tag as TagIcon } from 'lucide-react'
import SenseCard from './SenseCard'
import Sidebar from './Sidebar'
import TagSelector from './TagSelector'
import ArchiveIcon from './ArchiveIcon'
import { useConfirmDialog } from './ConfirmDialog'
import TagManagerDialog from './TagManagerDialog'
import BatchTagDialog, { type BatchTagDialogMode } from './BatchTagDialog'
import { SYSTEM_TAGS } from '../../shared/types'
import type { EntityType, FavoriteListItem, FavoriteSenseItem, FavoriteWordItem, ImportItem, Tag } from '../../shared/types'
import { entityCapabilities } from '../constants/entityCapabilities'
import { useLocalization } from '../localization'

function isIdiomGroup(senseGroup?: string): boolean {
  if (!senseGroup) return false
  const normalizedGroup = senseGroup.toLowerCase()
  return normalizedGroup.includes('idiom') || normalizedGroup.includes('phrase')
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
    normalizedGrammar === 'noun' ||
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
    normalizedGrammar === 'verb' ||
    normalizedGrammar.includes('transitive') ||
    normalizedGrammar.includes('intransitive')
  ) {
    return 'verb 动词'
  }
  if (normalizedGrammar.includes('prep') || normalizedGrammar === 'preposition') return 'preposition 介词'
  if (normalizedGrammar.includes('abbr') || normalizedGrammar === 'abbreviation') return 'abbreviation 缩写'
  if (normalizedGrammar.includes('pron') || normalizedGrammar === 'pronoun') return 'pronoun 代词'
  if (normalizedGrammar.includes('conj') || normalizedGrammar === 'conjunction') return 'conjunction 连词'
  if (normalizedGrammar.includes('interj') || normalizedGrammar.includes('exclamation')) return 'exclamation 感叹词'
  if (normalizedGrammar.includes('det') || normalizedGrammar === 'determiner') return 'determiner 限定词'
  if (normalizedGrammar.includes('num') || normalizedGrammar === 'number') return 'number 数词'
  if (normalizedGrammar.includes('modal')) return 'modal 情态动词'
  return 'definitions 释义'
}

interface FavoriteListProps {
  displayMode?: 'en' | 'cn' | 'both'
  onWordSelect: (wordId: number, entryHeadword?: string) => void
}

interface FilterState {
  showFavorited: boolean
  showWithNote: boolean
  showManualEntry: boolean
  selectedTagIds: Set<number>
}

interface WordTagSelectorState {
  wordId: number
  tags: Array<{ id: number; name: string; color: string }>
}

type FavoriteRecord = FavoriteListItem & {
  id?: number
  word_id?: number
  sense_id?: number
  created_at?: string
}

const FAVORITE_LIST_PAGE_SIZE = 24
const CSV_EXPORT_MIME_TYPE = 'text/csv;charset=utf-8'
const CSV_EXPORT_HEADERS = [
  'word',
  'front',
  'back',
  'definition',
  'definition_cn',
  'grammar',
  'sense_index',
  'examples',
  'note',
  'tags',
  'favorite',
  'archived',
  'note_type',
  'item_id',
  'word_id',
  'sense_id',
  'manual_entry',
  'created_at'
] as const
const BATCH_ACTION_BUTTON_BASE_CLASS = 'text-xs px-2.5 py-1 rounded border transition-colors'
const BATCH_ACTION_BUTTON_ENABLED_CLASS = 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
const BATCH_ACTION_BUTTON_DISABLED_CLASS = 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'

const createDefaultFilterState = (): FilterState => ({
  showFavorited: false,
  showWithNote: false,
  showManualEntry: false,
  selectedTagIds: new Set<number>()
})

const createFilterStateByTab = (): Record<EntityType, FilterState> => ({
  sense: createDefaultFilterState(),
  word: createDefaultFilterState()
})

const hasNumericSenseId = (favoriteItem: FavoriteListItem): favoriteItem is FavoriteSenseItem =>
  typeof (favoriteItem as Partial<FavoriteSenseItem>).senseId === 'number'

const getFavoriteItemEntityType = (favoriteItem: FavoriteListItem): EntityType =>
  favoriteItem.entityType === 'sense' || favoriteItem.entityType === 'word'
    ? favoriteItem.entityType
    : favoriteItem.type === 'sense' || favoriteItem.type === 'word'
      ? favoriteItem.type
      : hasNumericSenseId(favoriteItem as FavoriteListItem)
        ? 'sense'
        : 'word'

const getNumericField = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsedValue = Number(value)
    if (Number.isFinite(parsedValue)) return parsedValue
  }
  return null
}

const resolveSenseId = (favoriteRecord: FavoriteRecord): number | null =>
  getNumericField(favoriteRecord.senseId) ??
  getNumericField(favoriteRecord.sense_id) ??
  getNumericField(favoriteRecord.entityId) ??
  getNumericField(favoriteRecord.id)

const resolveWordId = (favoriteRecord: FavoriteRecord): number | null =>
  getNumericField(favoriteRecord.wordId) ??
  getNumericField(favoriteRecord.word_id) ??
  getNumericField(favoriteRecord.entityId) ??
  getNumericField(favoriteRecord.id)

const isSenseItem = (favoriteItem: FavoriteListItem): favoriteItem is FavoriteSenseItem =>
  getFavoriteItemEntityType(favoriteItem) === 'sense'

const isWordItem = (favoriteItem: FavoriteListItem): favoriteItem is FavoriteWordItem =>
  getFavoriteItemEntityType(favoriteItem) === 'word'

const getFavoriteItemEntityId = (favoriteItem: FavoriteListItem): number => {
  if (typeof favoriteItem.entityId === 'number') {
    return favoriteItem.entityId
  }
  if (isSenseItem(favoriteItem)) {
    return favoriteItem.senseId
  }
  return favoriteItem.wordId
}

const isManualEntryItem = (favoriteItem: FavoriteListItem): boolean =>
  getFavoriteItemEntityId(favoriteItem) < 0

const escapeCsvCell = (rawValue: string | number | boolean | null | undefined): string => {
  const stringValue = rawValue === null || rawValue === undefined ? '' : String(rawValue)
  if (!/[",\n\r]/.test(stringValue)) {
    return stringValue
  }
  return `"${stringValue.replace(/"/g, '""')}"`
}

const isCsvExportSystemTag = (tag: Tag): boolean =>
  tag.name === SYSTEM_TAGS.FAVORITE.name || tag.name === SYSTEM_TAGS.ARCHIVED.name

const isFavoriteItemCsvFavorited = (favoriteItem: FavoriteListItem): boolean =>
  isSenseItem(favoriteItem)
    ? favoriteItem.isFavorited
    : (favoriteItem.tags || []).some((tag) => tag.name === SYSTEM_TAGS.FAVORITE.name)

const buildCsvExportBack = (favoriteItem: FavoriteListItem): string => {
  if (!isSenseItem(favoriteItem)) {
    return favoriteItem.note || ''
  }

  return [
    favoriteItem.definitionCn,
    favoriteItem.definition,
    favoriteItem.grammar,
    favoriteItem.examples,
    favoriteItem.note ? `笔记: ${favoriteItem.note}` : ''
  ].filter(Boolean).join('\n\n')
}

const buildCsvExportFront = (favoriteItem: FavoriteListItem): string => {
  if (!isSenseItem(favoriteItem) || !favoriteItem.examples) {
    return favoriteItem.headword
  }

  return [favoriteItem.headword, favoriteItem.examples].join('\n\n')
}

const buildFavoriteCsv = (favoriteItems: FavoriteListItem[]): string => {
  const csvRows = favoriteItems.map((favoriteItem) => {
    const senseItem = isSenseItem(favoriteItem) ? favoriteItem : null
    const noteType = getFavoriteItemEntityType(favoriteItem)
    const rowValues = [
      favoriteItem.headword,
      buildCsvExportFront(favoriteItem),
      buildCsvExportBack(favoriteItem),
      senseItem?.definition ?? '',
      senseItem?.definitionCn ?? '',
      senseItem?.grammar ?? '',
      senseItem?.senseIndex ?? '',
      senseItem?.examples ?? '',
      favoriteItem.note || '',
      (favoriteItem.tags || []).filter((tag) => !isCsvExportSystemTag(tag)).map((tag) => tag.name).join(' '),
      isFavoriteItemCsvFavorited(favoriteItem),
      favoriteItem.isArchived,
      noteType,
      getFavoriteItemEntityId(favoriteItem),
      favoriteItem.wordId,
      senseItem?.senseId ?? '',
      isManualEntryItem(favoriteItem),
      favoriteItem.createdAt
    ]
    return rowValues.map(escapeCsvCell).join(',')
  })

  return [
    CSV_EXPORT_HEADERS.join(','),
    ...csvRows
  ].join('\n')
}

const downloadCsv = (fileName: string, csvContent: string): void => {
  const csvBlob = new Blob([`\uFEFF${csvContent}`], { type: CSV_EXPORT_MIME_TYPE })
  const objectUrl = URL.createObjectURL(csvBlob)
  const downloadLink = document.createElement('a')
  downloadLink.href = objectUrl
  downloadLink.download = fileName
  downloadLink.click()
  URL.revokeObjectURL(objectUrl)
}

const formatCsvExportTimestamp = (date: Date): string => {
  const padTwoDigits = (value: number): string => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    padTwoDigits(date.getMonth() + 1),
    padTwoDigits(date.getDate())
  ].join('') + '-' + [
    padTwoDigits(date.getHours()),
    padTwoDigits(date.getMinutes()),
    padTwoDigits(date.getSeconds())
  ].join('')
}

const normalizeFavoriteItems = (favoriteItems: FavoriteRecord[]): FavoriteListItem[] => {
  const dedupedItemsByEntity = new Map<string, FavoriteListItem>()

  favoriteItems.forEach((favoriteRecord) => {
    const resolvedEntityType = getFavoriteItemEntityType(favoriteRecord)
    if (resolvedEntityType === 'sense') {
      const resolvedSenseId = resolveSenseId(favoriteRecord)
      const resolvedWordId = resolveWordId(favoriteRecord)
      if (resolvedSenseId === null || resolvedWordId === null) {
        return
      }
      const normalizedSenseItem: FavoriteSenseItem = {
        ...favoriteRecord,
        type: 'sense',
        entityType: 'sense',
        entityId: resolvedSenseId,
        senseId: resolvedSenseId,
        wordId: resolvedWordId,
        headword: favoriteRecord.headword || '',
        tags: favoriteRecord.tags || [],
        isArchived: Boolean(favoriteRecord.isArchived),
        createdAt: favoriteRecord.createdAt || favoriteRecord.created_at || '',
        senseIndex: favoriteRecord.senseIndex ?? 0,
        isFavorited: Boolean(favoriteRecord.isFavorited)
      }
      const dedupeKey = `sense:${resolvedSenseId}`
      const existingSenseItem = dedupedItemsByEntity.get(dedupeKey)
      if (!existingSenseItem) {
        dedupedItemsByEntity.set(dedupeKey, normalizedSenseItem)
        return
      }
      const existingSenseCreatedAt = new Date(existingSenseItem.createdAt || 0).getTime()
      const candidateSenseCreatedAt = new Date(normalizedSenseItem.createdAt || 0).getTime()
      if (candidateSenseCreatedAt >= existingSenseCreatedAt) {
        dedupedItemsByEntity.set(dedupeKey, normalizedSenseItem)
      }
      return
    }

    const resolvedWordId = resolveWordId(favoriteRecord)
    if (resolvedWordId === null) {
      return
    }
    const normalizedWordItem: FavoriteWordItem = {
      ...favoriteRecord,
      type: 'word',
      entityType: 'word',
      entityId: resolvedWordId,
      wordId: resolvedWordId,
      headword: favoriteRecord.headword || '',
      tags: favoriteRecord.tags || [],
      isArchived: Boolean(favoriteRecord.isArchived),
      createdAt: favoriteRecord.createdAt || favoriteRecord.created_at || ''
    }
    const dedupeKey = `word:${resolvedWordId}`
    const existingWordItem = dedupedItemsByEntity.get(dedupeKey)
    if (!existingWordItem) {
      dedupedItemsByEntity.set(dedupeKey, normalizedWordItem)
      return
    }
    const existingWordCreatedAt = new Date(existingWordItem.createdAt || 0).getTime()
    const candidateWordCreatedAt = new Date(normalizedWordItem.createdAt || 0).getTime()
    if (candidateWordCreatedAt >= existingWordCreatedAt) {
      dedupedItemsByEntity.set(dedupeKey, normalizedWordItem)
    }
  })

  return Array.from(dedupedItemsByEntity.values())
}

const mergeFavoriteItemsByEntity = <T extends FavoriteListItem>(favoriteItems: T[]): T[] => {
  const mergedItemsByEntity = new Map<string, T>()

  favoriteItems.forEach((favoriteItem) => {
    const dedupeKey = `${getFavoriteItemEntityType(favoriteItem)}:${getFavoriteItemEntityId(favoriteItem)}`
    const existingItem = mergedItemsByEntity.get(dedupeKey)

    if (!existingItem) {
      mergedItemsByEntity.set(dedupeKey, favoriteItem)
      return
    }

    const existingCreatedAt = new Date(existingItem.createdAt || 0).getTime()
    const candidateCreatedAt = new Date(favoriteItem.createdAt || 0).getTime()
    if (candidateCreatedAt >= existingCreatedAt) {
      mergedItemsByEntity.set(dedupeKey, favoriteItem)
    }
  })

  return Array.from(mergedItemsByEntity.values())
}

function FavoriteList({ displayMode = 'both', onWordSelect }: FavoriteListProps) {
  const { translate } = useLocalization()
  const [favorites, setFavorites] = useState<FavoriteListItem[]>([])
  const [allCustomSenseItems, setAllCustomSenseItems] = useState<FavoriteSenseItem[]>([])
  const [allCustomWordItems, setAllCustomWordItems] = useState<FavoriteWordItem[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [activeTab, setActiveTab] = useState<EntityType>('sense')
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<number>>(new Set())
  const [allTags, setAllTags] = useState<Array<{ id: number; name: string; color: string }>>([])
  const [wordFavoriteUpdatingIds, setWordFavoriteUpdatingIds] = useState<Set<number>>(new Set())
  const [wordArchiveUpdatingIds, setWordArchiveUpdatingIds] = useState<Set<number>>(new Set())
  const [wordNoteUpdatingIds, setWordNoteUpdatingIds] = useState<Set<number>>(new Set())
  const [editingWordNoteId, setEditingWordNoteId] = useState<number | null>(null)
  const [wordNoteDraft, setWordNoteDraft] = useState('')
  const [filterStateByTab, setFilterStateByTab] = useState<Record<EntityType, FilterState>>(
    createFilterStateByTab
  )
  const [currentPage, setCurrentPage] = useState(1)
  const [showTagManager, setShowTagManager] = useState(false)
  const [wordTagSelectorState, setWordTagSelectorState] = useState<WordTagSelectorState | null>(null)
  const [batchTagDialogMode, setBatchTagDialogMode] = useState<BatchTagDialogMode | null>(null)
  const { confirm, alert, DialogComponent } = useConfirmDialog()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const favoriteListRootRef = useRef<HTMLDivElement>(null)
  const favoriteListScrollRef = useRef<HTMLDivElement>(null)
  const activeCapabilities = entityCapabilities[activeTab]
  const canUseSelectionMode =
    activeCapabilities.canFavorite ||
    activeCapabilities.canNote ||
    activeCapabilities.canTag ||
    activeCapabilities.canArchive
  const filters = filterStateByTab[activeTab]

  const triggerImport = () => {
    fileInputRef.current?.click()
  }

  const showImportMappingInfo = async () => {
    const importConfig = await import('./../import-config.json').then((module) => module.default)
    await alert({
      title: 'CSV 导入字段说明',
      message: [
        '普通 CSV：',
        `会读取 ${importConfig.fields.word.join(', ')} 作为单词列，并把匹配到的词导入为单词级收藏卡片。`,
        `如果包含 ${importConfig.fields.note.join(', ')}，会同时导入为单词笔记。`,
        '',
        'FenyiDic 导出的 CSV：',
        '会读取 note_type、word_id、sense_id、sense_index、tags、favorite、archived、note，用于还原条目类型、标签、收藏、归档和笔记。',
        '',
        'front、back、definition、definition_cn、grammar、examples 等内容列主要用于 Anki 或人工查看，导入时不覆盖词典释义。',
        '如果找不到单词列，会询问是否使用第一列作为单词列。'
      ].join('\n'),
      type: 'info'
    })
  }

  const scrollBatchToolbarIntoView = () => {
    requestAnimationFrame(() => {
      favoriteListRootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      favoriteListScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  const toggleSelectionMode = () => {
    if (!canUseSelectionMode) return
    if (isSelectionMode) {
      setIsSelectionMode(false)
      setSelectedEntityIds(new Set())
      return
    }

    setIsSelectionMode(true)
    scrollBatchToolbarIntoView()
  }

  const getBatchActionButtonClass = (isEnabled: boolean): string =>
    `${BATCH_ACTION_BUTTON_BASE_CLASS} ${
      isEnabled ? BATCH_ACTION_BUTTON_ENABLED_CLASS : BATCH_ACTION_BUTTON_DISABLED_CLASS
    }`

  const handleExportSelected = async () => {
    const selectedFavoriteItems = visibleFavorites.filter((favoriteItem) =>
      selectedEntityIds.has(getFavoriteItemEntityId(favoriteItem))
    )

    if (selectedFavoriteItems.length === 0) {
      await alert({ title: '导出失败', message: '请先选择要导出的项目', type: 'warning' })
      return
    }

    const exportTimestamp = formatCsvExportTimestamp(new Date())
    const csvContent = buildFavoriteCsv(selectedFavoriteItems)
    downloadCsv(`fenyidic-${activeTab}-selected-${exportTimestamp}.csv`, csvContent)
  }

  useEffect(() => {
    if (canUseSelectionMode) {
      return
    }
    setIsSelectionMode(false)
    setSelectedEntityIds(new Set())
    setBatchTagDialogMode(null)
  }, [canUseSelectionMode])

  const hasActiveFilters =
    filters.showFavorited || filters.showWithNote || filters.showManualEntry || filters.selectedTagIds.size > 0

  const favoriteTagId = allTags.find((tag) => tag.name === SYSTEM_TAGS.FAVORITE.name)?.id
  const archivedTagId = allTags.find((tag) => tag.name === SYSTEM_TAGS.ARCHIVED.name)?.id

  const isFavoriteItemFavorited = (favoriteItem: FavoriteListItem): boolean => {
    if (isSenseItem(favoriteItem)) {
      return favoriteItem.isFavorited
    }
    if (isWordItem(favoriteItem)) {
      return (favoriteItem.tags || []).some((tag) => tag.name === SYSTEM_TAGS.FAVORITE.name)
    }
    return false
  }

  const hasFavoriteItemNote = (favoriteItem: FavoriteListItem): boolean => {
    if (isSenseItem(favoriteItem)) {
      return !!favoriteItem.note?.trim()
    }
    if (isWordItem(favoriteItem)) {
      return !!favoriteItem.note?.trim()
    }
    return false
  }

  const allSenseItems = useMemo(
    () => mergeFavoriteItemsByEntity([...favorites.filter(isSenseItem), ...allCustomSenseItems]),
    [favorites, allCustomSenseItems]
  )

  const allWordItems = useMemo(
    () => mergeFavoriteItemsByEntity([...favorites.filter(isWordItem), ...allCustomWordItems]),
    [favorites, allCustomWordItems]
  )

  const entityCounts = useMemo(
    () => ({
      sense: allSenseItems.length,
      word: allWordItems.length
    }),
    [allSenseItems.length, allWordItems.length]
  )

  const entityScopedFavorites = useMemo(() => {
    return activeTab === 'word'
      ? allWordItems
      : allSenseItems
  }, [activeTab, allSenseItems, allWordItems])

  const stats = useMemo(() => {
    const favoriteCount = entityScopedFavorites.filter((favoriteItem) => isFavoriteItemFavorited(favoriteItem)).length
    const noteCount = entityScopedFavorites.filter((favoriteItem) => hasFavoriteItemNote(favoriteItem)).length
    const manualEntryCount =
      activeTab === 'word'
        ? allCustomWordItems.length
        : allCustomSenseItems.length
    const tagCounts: Record<number, number> = {}
    allTags.forEach((tag) => {
      tagCounts[tag.id] = entityScopedFavorites.filter((favoriteItem) =>
        favoriteItem.tags?.some((favoriteTag) => favoriteTag.id === tag.id)
      ).length
    })

    return {
      total: entityScopedFavorites.length,
      favCount: favoriteCount,
      noteCount,
      manualEntryCount,
      tagCounts
    }
  }, [activeTab, allCustomSenseItems.length, allCustomWordItems.length, entityScopedFavorites, allTags, hasFavoriteItemNote, isFavoriteItemFavorited])

  const filteredFavorites = useMemo(() => {
    if (activeTab === 'sense' && filters.showManualEntry) {
      return allCustomSenseItems
    }

    if (activeTab === 'word' && filters.showManualEntry) {
      return allCustomWordItems
    }

    if (!hasActiveFilters) {
      return entityScopedFavorites
    }

    return entityScopedFavorites.filter((favoriteItem) => {
      if (filters.showFavorited) {
        if (!isFavoriteItemFavorited(favoriteItem)) {
          return false
        }
      }

      if (filters.showWithNote) {
        if (!hasFavoriteItemNote(favoriteItem)) {
          return false
        }
      }

      if (filters.showManualEntry) {
        if (!isManualEntryItem(favoriteItem)) {
          return false
        }
      }

      if (filters.selectedTagIds.size > 0) {
        const hasAllSelectedTags = Array.from(filters.selectedTagIds).every((tagId) => {
          return favoriteItem.tags?.some((tag) => tag.id === tagId)
        })
        if (!hasAllSelectedTags) {
          return false
        }
      }

      return true
    })
  }, [activeTab, allCustomSenseItems, allCustomWordItems, entityScopedFavorites, filters, hasActiveFilters, hasFavoriteItemNote, isFavoriteItemFavorited])

  const visibleFavorites = useMemo(() => {
    const scopedFavorites = filteredFavorites.filter(
      (favoriteItem) => getFavoriteItemEntityType(favoriteItem) === activeTab
    )
    const dedupedVisibleFavoritesByEntity = new Map<string, FavoriteListItem>()

    scopedFavorites.forEach((favoriteItem) => {
      const dedupeKey = `${getFavoriteItemEntityType(favoriteItem)}:${getFavoriteItemEntityId(favoriteItem)}`
      dedupedVisibleFavoritesByEntity.set(dedupeKey, favoriteItem)
    })

    return Array.from(dedupedVisibleFavoritesByEntity.values())
  }, [activeTab, filteredFavorites])

  const totalPages = Math.max(1, Math.ceil(visibleFavorites.length / FAVORITE_LIST_PAGE_SIZE))
  const paginatedFavorites = useMemo(() => {
    const startIndex = (currentPage - 1) * FAVORITE_LIST_PAGE_SIZE
    return visibleFavorites.slice(startIndex, startIndex + FAVORITE_LIST_PAGE_SIZE)
  }, [currentPage, visibleFavorites])
  const selectedCurrentPageCount = paginatedFavorites.filter((favoriteItem) =>
    selectedEntityIds.has(getFavoriteItemEntityId(favoriteItem))
  ).length
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const handleFilterChange = (newFilters: FilterState) => {
    setFilterStateByTab((previousFilterStateByTab) => ({
      ...previousFilterStateByTab,
      [activeTab]: newFilters
    }))
    setCurrentPage(1)
    setIsSelectionMode(false)
    setSelectedEntityIds(new Set())
    setEditingWordNoteId(null)
    setWordNoteDraft('')
    setBatchTagDialogMode(null)
  }

  const switchActiveTab = (nextTab: EntityType) => {
    if (nextTab === activeTab) {
      return
    }
    setActiveTab(nextTab)
    setCurrentPage(1)
    setIsSelectionMode(false)
    setSelectedEntityIds(new Set())
    setEditingWordNoteId(null)
    setWordNoteDraft('')
    setWordTagSelectorState(null)
    setBatchTagDialogMode(null)
  }

  const toggleSelection = (entityId: number) => {
    const nextSelectedEntityIds = new Set(selectedEntityIds)
    if (nextSelectedEntityIds.has(entityId)) {
      nextSelectedEntityIds.delete(entityId)
    } else {
      nextSelectedEntityIds.add(entityId)
    }
    setSelectedEntityIds(nextSelectedEntityIds)
  }

  const handleSelectionCardClickCapture = (event: MouseEvent<HTMLDivElement>, entityId: number) => {
    if (!isSelectionMode || !canUseSelectionMode) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    toggleSelection(entityId)
  }

  const handleSelectAll = () => {
    if (paginatedFavorites.length === 0) {
      return
    }

    const currentPageEntityIds = paginatedFavorites.map((favoriteItem) => getFavoriteItemEntityId(favoriteItem))
    const hasSelectedEveryCurrentPageItem = currentPageEntityIds.every((entityId) => selectedEntityIds.has(entityId))
    const nextSelectedEntityIds = new Set(selectedEntityIds)

    if (hasSelectedEveryCurrentPageItem) {
      currentPageEntityIds.forEach((entityId) => nextSelectedEntityIds.delete(entityId))
    } else {
      currentPageEntityIds.forEach((entityId) => nextSelectedEntityIds.add(entityId))
    }

    setSelectedEntityIds(nextSelectedEntityIds)
  }

  const goToPreviousPage = () => {
    setCurrentPage((previousPage) => Math.max(1, previousPage - 1))
  }

  const goToNextPage = () => {
    setCurrentPage((previousPage) => Math.min(totalPages, previousPage + 1))
  }

  const resetBatchSelection = (options: { keepTagDialogOpen?: boolean } = {}) => {
    setSelectedEntityIds(new Set())
    setIsSelectionMode(false)
    if (!options.keepTagDialogOpen) {
      setBatchTagDialogMode(null)
    }
  }

  const updateSelectedEntityTags = async (
    tagIds: number[],
    operation: 'add' | 'remove',
    options: { keepTagDialogOpen?: boolean } = {}
  ) => {
    const entityIds = Array.from(selectedEntityIds)
    if (entityIds.length === 0) {
      throw new Error('Missing selected entities for batch tag update')
    }

    const result = await window.api.updateEntityTagsBatch(activeTab, entityIds, tagIds, operation)
    if (!result.success) {
      throw new Error(result.error || 'Batch tag update failed')
    }

    resetBatchSelection({ keepTagDialogOpen: options.keepTagDialogOpen })
    await loadFavorites(true)
  }

  const handleBatchTagConfirm = async (selectedTags: Tag[]) => {
    if (!batchTagDialogMode) {
      throw new Error('Missing batch tag mode')
    }

    await updateSelectedEntityTags(
      selectedTags.map((tag) => tag.id),
      batchTagDialogMode,
      { keepTagDialogOpen: true }
    )
  }

  const handleBatchFavoriteUpdate = async (operation: 'add' | 'remove') => {
    if (!activeCapabilities.canFavorite || selectedEntityIds.size === 0) return
    if (!favoriteTagId) {
      await alert({ title: '操作失败', message: '收藏标签不存在，请重启应用后重试', type: 'danger' })
      return
    }

    const isAdding = operation === 'add'
    const confirmed = await confirm({
      title: isAdding ? '批量收藏' : '取消收藏',
      message: `确定要${isAdding ? '收藏' : '取消收藏'}选中的 ${selectedEntityIds.size} 项吗？`,
      type: isAdding ? 'info' : 'danger',
      confirmText: isAdding ? '收藏' : '取消收藏'
    })
    if (!confirmed) return

    setLoading(true)
    try {
      await updateSelectedEntityTags([favoriteTagId], operation)
    } catch (error) {
      console.error('Batch favorite update failed:', error)
      await alert({ title: '操作失败', message: '请重试', type: 'danger' })
      await loadFavorites(true)
    } finally {
      setLoading(false)
    }
  }

  const handleBatchArchiveUpdate = async (operation: 'add' | 'remove') => {
    if (!activeCapabilities.canArchive || selectedEntityIds.size === 0) return
    if (!archivedTagId) {
      await alert({ title: '操作失败', message: '归档标签不存在，请重启应用后重试', type: 'danger' })
      return
    }

    const isAdding = operation === 'add'
    const confirmed = await confirm({
      title: isAdding ? '批量归档' : '取消归档',
      message: `确定要${isAdding ? '归档' : '取消归档'}选中的 ${selectedEntityIds.size} 项吗？`,
      type: isAdding ? 'warning' : 'info',
      confirmText: isAdding ? '归档' : '取消归档'
    })
    if (!confirmed) return

    setLoading(true)
    try {
      await updateSelectedEntityTags([archivedTagId], operation)
    } catch (error) {
      console.error('Batch archive update failed:', error)
      await alert({ title: '操作失败', message: '请重试', type: 'danger' })
      await loadFavorites(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFavorites()
  }, [])

  const loadFavorites = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [favoriteItems, tags, customSenseItems, customWordItems] = await Promise.all([
        window.api.getFavorites(),
        window.api.getTags(),
        window.api.getAllCustomSenses(),
        window.api.getAllCustomWords()
      ])
      const normalizedFavoriteItems = normalizeFavoriteItems(favoriteItems as FavoriteRecord[])
      const normalizedCustomSenseItems = normalizeFavoriteItems(customSenseItems as FavoriteRecord[]).filter(isSenseItem)
      const normalizedCustomWordItems = normalizeFavoriteItems(customWordItems as FavoriteRecord[]).filter(isWordItem)
      setFavorites(normalizedFavoriteItems)
      setAllCustomSenseItems(normalizedCustomSenseItems)
      setAllCustomWordItems(normalizedCustomWordItems)
      setAllTags(tags)
    } catch (error) {
      console.error('Failed to load favorites:', error)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const handleFavoriteToggle = async (senseId: number) => {
    const targetSenseItem = favorites.find(
      (favoriteItem) => isSenseItem(favoriteItem) && favoriteItem.senseId === senseId
    )
    if (!targetSenseItem) {
      console.warn('[FavoriteList] Sense item not found for favorite toggle:', senseId)
      return
    }

    try {
      if (targetSenseItem.isFavorited) {
        await window.api.removeFavorite(senseId)
      } else {
        await window.api.addFavorite(senseId)
      }
      await loadFavorites(true)
    } catch (error) {
      console.error('Toggle favorite failed:', error)
    }
  }

  const handleWordFavoriteToggle = async (wordId: number, isFavorited: boolean) => {
    if (!favoriteTagId) {
      console.warn('[FavoriteList] Favorite tag not found')
      return
    }

    if (wordFavoriteUpdatingIds.has(wordId)) {
      return
    }

    setWordFavoriteUpdatingIds((previousIds) => {
      const nextIds = new Set(previousIds)
      nextIds.add(wordId)
      return nextIds
    })

    try {
      if (isFavorited) {
        await window.api.removeEntityTag('word', wordId, favoriteTagId)
      } else {
        await window.api.addEntityTag('word', wordId, favoriteTagId)
      }
      await loadFavorites(true)
    } catch (error) {
      console.error('Toggle word favorite failed:', error)
    } finally {
      setWordFavoriteUpdatingIds((previousIds) => {
        const nextIds = new Set(previousIds)
        nextIds.delete(wordId)
        return nextIds
      })
    }
  }

  const handleWordArchiveToggle = async (wordId: number, isArchived: boolean) => {
    if (!archivedTagId) {
      console.warn('[FavoriteList] Archived tag not found')
      return
    }

    if (wordArchiveUpdatingIds.has(wordId)) {
      return
    }

    setWordArchiveUpdatingIds((previousIds) => {
      const nextIds = new Set(previousIds)
      nextIds.add(wordId)
      return nextIds
    })

    try {
      if (isArchived) {
        await window.api.removeEntityTag('word', wordId, archivedTagId)
      } else {
        await window.api.addEntityTag('word', wordId, archivedTagId)
      }
      await loadFavorites(true)
    } catch (error) {
      console.error('Toggle word archive failed:', error)
    } finally {
      setWordArchiveUpdatingIds((previousIds) => {
        const nextIds = new Set(previousIds)
        nextIds.delete(wordId)
        return nextIds
      })
    }
  }

  const startWordNoteEditing = (wordId: number, note?: string) => {
    setEditingWordNoteId(wordId)
    setWordNoteDraft(note || '')
  }

  const cancelWordNoteEditing = () => {
    setEditingWordNoteId(null)
    setWordNoteDraft('')
  }

  const saveWordNote = async (wordId: number) => {
    if (wordNoteUpdatingIds.has(wordId)) return

    setWordNoteUpdatingIds((previousIds) => {
      const nextIds = new Set(previousIds)
      nextIds.add(wordId)
      return nextIds
    })

    try {
      const normalizedNote = wordNoteDraft.trim()
      await window.api.saveWordNote(wordId, normalizedNote)
      await loadFavorites(true)
      setEditingWordNoteId(null)
      setWordNoteDraft('')
    } catch (error) {
      console.error('Save word note failed:', error)
      await alert({ title: '操作失败', message: '保存笔记失败，请重试', type: 'danger' })
    } finally {
      setWordNoteUpdatingIds((previousIds) => {
        const nextIds = new Set(previousIds)
        nextIds.delete(wordId)
        return nextIds
      })
    }
  }

  const handleNoteChange = () => {
    loadFavorites(true)
  }

  const parseCsvLine = (lineText: string, delimiter: string) => {
    const parsedColumns: string[] = []
    let currentColumn = ''
    let isQuoted = false

    for (let index = 0; index < lineText.length; index += 1) {
      const currentChar = lineText[index]
      if (currentChar === '"') {
        if (isQuoted && lineText[index + 1] === '"') {
          currentColumn += '"'
          index += 1
        } else {
          isQuoted = !isQuoted
        }
      } else if (currentChar === delimiter && !isQuoted) {
        parsedColumns.push(currentColumn)
        currentColumn = ''
      } else {
        currentColumn += currentChar
      }
    }
    parsedColumns.push(currentColumn)
    return parsedColumns
  }

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      const fileBuffer = await file.arrayBuffer()
      let textDecoder = new TextDecoder('utf-8')
      let fileText = textDecoder.decode(fileBuffer)

      const utf8Preview = fileText.slice(0, 500).toLowerCase()
      const hasUtf8Keywords =
        utf8Preview.includes('word') ||
        utf8Preview.includes('单词') ||
        utf8Preview.includes('笔记') ||
        utf8Preview.includes('note')

      if (!hasUtf8Keywords) {
        try {
          textDecoder = new TextDecoder('gbk')
          const gbkText = textDecoder.decode(fileBuffer)
          const gbkPreview = gbkText.slice(0, 500).toLowerCase()
          const hasGbkKeywords =
            gbkPreview.includes('word') ||
            gbkPreview.includes('单词') ||
            gbkPreview.includes('笔记') ||
            gbkPreview.includes('note')
          if (hasGbkKeywords) {
            fileText = gbkText
            console.log('Detected GBK encoding, switched decoder.')
          }
        } catch (error) {
          console.warn('GBK decode failed, fallback to UTF-8', error)
        }
      }

      const normalizedText = fileText
        .replace(/^\uFEFF/, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')

      const parseCsvLines = (csvText: string): string[] => {
        const parsedLines: string[] = []
        let currentLine = ''
        let isQuoted = false

        for (let index = 0; index < csvText.length; index += 1) {
          const currentChar = csvText[index]
          if (currentChar === '"') {
            if (isQuoted && csvText[index + 1] === '"') {
              currentLine += currentChar + csvText[index + 1]
              index += 1
            } else {
              isQuoted = !isQuoted
              currentLine += currentChar
            }
          } else if (currentChar === '\n' && !isQuoted) {
            if (currentLine.trim()) {
              parsedLines.push(currentLine)
            }
            currentLine = ''
          } else {
            currentLine += currentChar
          }
        }

        if (currentLine.trim()) {
          parsedLines.push(currentLine)
        }
        return parsedLines
      }

      const parsedLines = parseCsvLines(normalizedText)
      if (parsedLines.length < 2) {
        await alert({ title: '导入失败', message: '文件内容太少', type: 'warning' })
        return
      }

      const headerLine = parsedLines[0]
      const commaCount = (headerLine.match(/,/g) || []).length
      const tabCount = (headerLine.match(/\t/g) || []).length
      const delimiter = tabCount > commaCount ? '\t' : ','

      const headerColumns = parseCsvLine(headerLine, delimiter)
      const normalizedHeaders = headerColumns.map((headerColumn) =>
        headerColumn.trim().toLowerCase()
      )

      const importConfig = await import('./../import-config.json').then((module) => module.default)
      const findColumnIndex = (possibleColumnNames: string[]) => {
        for (const possibleColumnName of possibleColumnNames) {
          const foundIndex = normalizedHeaders.indexOf(possibleColumnName.toLowerCase())
          if (foundIndex !== -1) {
            return foundIndex
          }
        }
        return -1
      }
      const getColumnValue = (columns: string[], columnIndex: number): string | undefined => {
        if (columnIndex === -1) return undefined
        const columnValue = columns[columnIndex]?.trim()
        return columnValue || undefined
      }
      const parseOptionalNumber = (value: string | undefined): number | undefined => {
        if (!value) return undefined
        const parsedValue = Number(value)
        return Number.isFinite(parsedValue) ? parsedValue : undefined
      }
      const parseOptionalBoolean = (value: string | undefined): boolean | undefined => {
        if (!value) return undefined
        const normalizedValue = value.trim().toLowerCase()
        if (['true', '1', 'yes', 'y'].includes(normalizedValue)) return true
        if (['false', '0', 'no', 'n'].includes(normalizedValue)) return false
        return undefined
      }

      let wordColumnIndex = findColumnIndex(importConfig.fields.word)

      if (wordColumnIndex === -1) {
        const useFirstColumn = await confirm({
          title: '列匹配',
          message: `未自动找到"单词"列 (支持: ${importConfig.fields.word.join(', ')}).\n\n检测到的表头: ${normalizedHeaders.join(', ')}\n\n是否使用第一列作为单词列?`,
          confirmText: '使用第一列'
        })
        if (!useFirstColumn) return
        wordColumnIndex = 0
      }

      const noteColumnIndex = findColumnIndex(importConfig.fields.note)
      const exportedColumnIndexes = {
        noteType: findColumnIndex(['note_type', 'type']),
        tags: findColumnIndex(['tags']),
        favorite: findColumnIndex(['favorite', 'is_favorited']),
        archived: findColumnIndex(['archived', 'is_archived']),
        wordId: findColumnIndex(['word_id']),
        senseId: findColumnIndex(['sense_id']),
        senseIndex: findColumnIndex(['sense_index']),
        manualEntry: findColumnIndex(['manual_entry']),
        definition: findColumnIndex(['definition']),
        definitionCn: findColumnIndex(['definition_cn']),
        grammar: findColumnIndex(['grammar']),
        examples: findColumnIndex(['examples'])
      }
      const hasExportRestoreColumns = Object.values(exportedColumnIndexes).some((columnIndex) => columnIndex !== -1)

      const importItems = parsedLines
        .slice(1)
        .map((line) => {
          const columns = parseCsvLine(line, delimiter)
          const headword = getColumnValue(columns, wordColumnIndex)
          const note = getColumnValue(columns, noteColumnIndex)
          const rawNoteType = getColumnValue(columns, exportedColumnIndexes.noteType)
          const noteType = rawNoteType === 'sense' || rawNoteType === 'word' ? rawNoteType : undefined
          const item: ImportItem = {
            headword: headword || '',
            note,
            noteType,
            tags: getColumnValue(columns, exportedColumnIndexes.tags),
            favorite: parseOptionalBoolean(getColumnValue(columns, exportedColumnIndexes.favorite)),
            archived: parseOptionalBoolean(getColumnValue(columns, exportedColumnIndexes.archived)),
            wordId: parseOptionalNumber(getColumnValue(columns, exportedColumnIndexes.wordId)),
            senseId: parseOptionalNumber(getColumnValue(columns, exportedColumnIndexes.senseId)),
            senseIndex: parseOptionalNumber(getColumnValue(columns, exportedColumnIndexes.senseIndex)),
            manualEntry: parseOptionalBoolean(getColumnValue(columns, exportedColumnIndexes.manualEntry)),
            definition: getColumnValue(columns, exportedColumnIndexes.definition),
            definitionCn: getColumnValue(columns, exportedColumnIndexes.definitionCn),
            grammar: getColumnValue(columns, exportedColumnIndexes.grammar),
            examples: getColumnValue(columns, exportedColumnIndexes.examples)
          }

          return item
        })
        .filter((item) => item.headword && item.headword.length > 0)

      if (importItems.length === 0) {
        await alert({ title: '导入失败', message: '未找到有效数据', type: 'warning' })
        return
      }

      const importResult = await window.api.importFavorites(importItems)
      if (importResult.success) {
        await loadFavorites()
        await alert({
          title: '导入完成',
          message: hasExportRestoreColumns
            ? `成功还原了 ${importResult.count} 个项目`
            : `成功添加了 ${importResult.count} 个单词级卡片`,
          type: 'success'
        })
      } else {
        await alert({ title: '导入失败', message: importResult.error || '未知错误', type: 'danger' })
      }
    } catch (error: any) {
      console.error('Import error:', error)
      await alert({ title: '导入出错', message: error.message || String(error), type: 'danger' })
    } finally {
      setImporting(false)
      if (event.target) event.target.value = ''
    }
  }

  const handleBatchClearNotes = async () => {
    if (!activeCapabilities.canNote || selectedEntityIds.size === 0) return

    const confirmed = await confirm({
      title: '删除笔记',
      message: `确定要删除选中的 ${selectedEntityIds.size} 项的笔记吗？`,
      type: 'warning',
      confirmText: '删除笔记'
    })
    if (!confirmed) return

    setLoading(true)
    try {
      const result = await window.api.deleteEntityNotesBatch(activeTab, Array.from(selectedEntityIds))
      if (!result.success) {
        throw new Error(result.error || 'Batch delete notes failed')
      }
      resetBatchSelection()
      await loadFavorites(true)
    } catch (error) {
      console.error('Batch clear notes failed:', error)
      await alert({ title: '操作出错', message: '请重试', type: 'danger' })
      await loadFavorites(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full bg-white">
      <Sidebar
        activeTab={activeTab}
        entityCounts={entityCounts}
        stats={stats}
        tags={allTags}
        filters={filters}
        onFilterChange={handleFilterChange}
        onTabChange={switchActiveTab}
        onManageTags={() => setShowTagManager(true)}
        onImport={triggerImport}
        onImportInfo={() => void showImportMappingInfo()}
      />

      <div ref={favoriteListRootRef} className="flex-1 flex flex-col min-w-0 h-full">
        {canUseSelectionMode && (
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50">
            <button
              onClick={toggleSelectionMode}
              data-localization-skip="true"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                isSelectionMode
                  ? 'bg-indigo-50 text-indigo-600 border border-indigo-100 font-medium'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {translate(isSelectionMode ? '取消批量管理' : '批量管理')}
            </button>

            {isSelectionMode && (
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="text-sm text-gray-500">
                    {translate(`已选择 ${selectedEntityIds.size} 项`)}
                  </div>
                  <button
                    onClick={handleSelectAll}
                    data-localization-skip="true"
                    className="text-xs px-2.5 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                  >
                    {translate(
                      selectedCurrentPageCount === paginatedFavorites.length && paginatedFavorites.length > 0
                        ? '取消全选'
                        : '全选'
                    )}
                  </button>
                  <button
                    onClick={() => void handleExportSelected()}
                    disabled={selectedEntityIds.size === 0}
                    className={getBatchActionButtonClass(selectedEntityIds.size > 0)}
                  >
                    导出 CSV
                  </button>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {activeCapabilities.canFavorite && (
                    <>
                      <button
                        onClick={() => void handleBatchFavoriteUpdate('add')}
                        disabled={selectedEntityIds.size === 0}
                        className={getBatchActionButtonClass(selectedEntityIds.size > 0)}
                      >
                        加入收藏
                      </button>
                      <button
                        onClick={() => void handleBatchFavoriteUpdate('remove')}
                        disabled={selectedEntityIds.size === 0}
                        className={getBatchActionButtonClass(selectedEntityIds.size > 0)}
                      >
                        取消收藏
                      </button>
                    </>
                  )}
                  {activeCapabilities.canTag && (
                    <>
                      <button
                        onClick={() => setBatchTagDialogMode('add')}
                        disabled={selectedEntityIds.size === 0}
                        className={getBatchActionButtonClass(selectedEntityIds.size > 0)}
                      >
                        添加标签
                      </button>
                      <button
                        onClick={() => setBatchTagDialogMode('remove')}
                        disabled={selectedEntityIds.size === 0}
                        className={getBatchActionButtonClass(selectedEntityIds.size > 0)}
                      >
                        删除标签
                      </button>
                    </>
                  )}
                  {activeCapabilities.canArchive && (
                    <>
                      <button
                        onClick={() => void handleBatchArchiveUpdate('add')}
                        disabled={selectedEntityIds.size === 0}
                        className={getBatchActionButtonClass(selectedEntityIds.size > 0)}
                      >
                        进行归档
                      </button>
                      <button
                        onClick={() => void handleBatchArchiveUpdate('remove')}
                        disabled={selectedEntityIds.size === 0}
                        className={getBatchActionButtonClass(selectedEntityIds.size > 0)}
                      >
                        取消归档
                      </button>
                    </>
                  )}
                  {activeCapabilities.canNote && (
                    <button
                      onClick={() => void handleBatchClearNotes()}
                      disabled={selectedEntityIds.size === 0}
                      className={getBatchActionButtonClass(selectedEntityIds.size > 0)}
                    >
                      删除笔记
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div ref={favoriteListScrollRef} className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-center text-gray-500 py-8">加载中...</div>
          ) : visibleFavorites.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p>没有匹配的记录</p>
            </div>
          ) : (
            <>
              <div className={`grid gap-3 ${displayMode === 'cn' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {paginatedFavorites.map((favoriteItem) => (
                  <div
                    key={`${getFavoriteItemEntityType(favoriteItem)}-${getFavoriteItemEntityId(favoriteItem)}`}
                    className={`h-full relative transition-transform ${
                      isSelectionMode && canUseSelectionMode ? 'cursor-pointer hover:scale-[1.01]' : ''
                    }`}
                    onClickCapture={
                      isSelectionMode && canUseSelectionMode
                        ? (event) => handleSelectionCardClickCapture(event, getFavoriteItemEntityId(favoriteItem))
                        : undefined
                    }
                  >
                    {isWordItem(favoriteItem) ? (
                      <div className="h-full p-4 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative">
                        {(() => {
                          const isWordFavorited = (favoriteItem.tags || []).some(
                            (tag) => tag.name === SYSTEM_TAGS.FAVORITE.name
                          )
                          const isWordArchived = (favoriteItem.tags || []).some(
                            (tag) => tag.name === SYSTEM_TAGS.ARCHIVED.name
                          )
                          const isWordFavoriteUpdating = wordFavoriteUpdatingIds.has(favoriteItem.wordId)
                          const isWordArchiveUpdating = wordArchiveUpdatingIds.has(favoriteItem.wordId)
                          const isWordNoteUpdating = wordNoteUpdatingIds.has(favoriteItem.wordId)
                          const isWordNoteEditing = editingWordNoteId === favoriteItem.wordId
                          const hasWordNote = !!favoriteItem.note?.trim()
                          const wordVisibleTags = (favoriteItem.tags || []).filter(
                            (tag) =>
                              tag.name !== SYSTEM_TAGS.FAVORITE.name &&
                              tag.name !== SYSTEM_TAGS.ARCHIVED.name
                          )
                          const hasCustomWordTag = wordVisibleTags.some(
                            (tag) => tag.name !== SYSTEM_TAGS.ARCHIVED.name
                          )

                          return (
                            <div className="flex h-full">
                              <div className="flex-1 min-w-0 flex flex-col">
                                <h3
                                  className="font-bold text-gray-900 text-lg cursor-pointer hover:text-teal-600 transition-colors mb-2"
                                  onClick={() => onWordSelect(favoriteItem.wordId)}
                                >
                                  {favoriteItem.headword}
                                </h3>

                                {isWordNoteEditing && (
                                  <div className="mb-3 text-sm">
                                    <div className="bg-yellow-50 p-2 rounded border border-yellow-200">
                                      <textarea
                                        className="w-full bg-transparent resize-none outline-none text-gray-700 min-h-[60px]"
                                        value={wordNoteDraft}
                                        onChange={(event) => setWordNoteDraft(event.target.value)}
                                        placeholder="添加笔记..."
                                        autoFocus
                                        onClick={(event) => event.stopPropagation()}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter' && !event.shiftKey) {
                                            event.preventDefault()
                                            saveWordNote(favoriteItem.wordId)
                                          }
                                        }}
                                      />
                                      <div className="flex justify-between items-center mt-2">
                                        <button
                                          onClick={(event) => {
                                            event.stopPropagation()
                                            setWordNoteDraft('')
                                          }}
                                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                                        >
                                          清空
                                        </button>
                                        <div className="flex gap-2">
                                          <button
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              cancelWordNoteEditing()
                                            }}
                                            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                                          >
                                            取消
                                          </button>
                                          <button
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              saveWordNote(favoriteItem.wordId)
                                            }}
                                            disabled={isWordNoteUpdating}
                                            className={`text-xs px-3 py-1 rounded ${
                                              isWordNoteUpdating
                                                ? 'bg-yellow-100 text-yellow-300 cursor-not-allowed'
                                                : 'bg-yellow-200 hover:bg-yellow-300 text-yellow-800'
                                            }`}
                                          >
                                            保存
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                <div className="flex flex-wrap gap-1 mt-auto">
                                  {wordVisibleTags.map((tag) => (
                                    <span
                                      key={tag.id}
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600"
                                    >
                                      <TagIcon className="h-2.5 w-2.5" aria-hidden="true" />
                                      {tag.name}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div className="flex flex-col gap-1 ml-2">
                                  <button
                                    onClick={(clickEvent) => {
                                      clickEvent.stopPropagation()
                                      handleWordFavoriteToggle(favoriteItem.wordId, isWordFavorited)
                                    }}
                                    className={`favorite-btn ${
                                      isWordFavorited ? 'active' : 'text-gray-300'
                                    } ${isWordFavoriteUpdating ? 'opacity-60' : ''}`}
                                    data-action-tooltip={isWordFavorited ? '取消收藏' : '收藏'}
                                    aria-label={isWordFavorited ? '取消收藏' : '收藏'}
                                  >
                                    <Heart className="h-4 w-4" aria-hidden="true" />
                                  </button>

                                  <button
                                    onClick={(clickEvent) => {
                                      clickEvent.stopPropagation()
                                      setWordTagSelectorState({
                                        wordId: favoriteItem.wordId,
                                        tags: favoriteItem.tags
                                      })
                                    }}
                                    className={`favorite-btn ${
                                      hasCustomWordTag
                                        ? 'is-tag-active'
                                        : 'text-gray-300'
                                    }`}
                                    data-action-tooltip="管理标签"
                                    aria-label="管理标签"
                                  >
                                    <TagIcon className="h-4 w-4" aria-hidden="true" />
                                  </button>

                                  <button
                                    onClick={(clickEvent) => {
                                      clickEvent.stopPropagation()
                                      handleWordArchiveToggle(favoriteItem.wordId, isWordArchived)
                                    }}
                                    className={`favorite-btn ${
                                      isWordArchived
                                        ? 'is-archive-active'
                                        : 'text-gray-300'
                                    } ${isWordArchiveUpdating ? 'opacity-60' : ''}`}
                                    data-action-tooltip={isWordArchived ? '取消归档' : '归档'}
                                    aria-label={isWordArchived ? '取消归档' : '归档'}
                                  >
                                    <ArchiveIcon className="w-4 h-4" />
                                  </button>

                                  <button
                                    onClick={(clickEvent) => {
                                      clickEvent.stopPropagation()
                                      if (isWordNoteEditing) {
                                        cancelWordNoteEditing()
                                      } else {
                                        startWordNoteEditing(favoriteItem.wordId, favoriteItem.note)
                                      }
                                    }}
                                    className={`favorite-btn ${
                                      hasWordNote || isWordNoteEditing
                                        ? 'is-note-active'
                                        : 'text-gray-300'
                                    } ${isWordNoteUpdating ? 'opacity-60' : ''}`}
                                    data-action-tooltip="添加/编辑笔记"
                                    aria-label="添加/编辑笔记"
                                  >
                                    <Pencil className="h-4 w-4" aria-hidden="true" />
                                  </button>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    ) : (
                      <SenseCard
                        sense={{
                          id: favoriteItem.senseId,
                          sense_index: favoriteItem.senseIndex,
                          grammar: favoriteItem.grammar,
                          definition: favoriteItem.definition,
                          definition_cn: favoriteItem.definitionCn,
                          examples: favoriteItem.examples || '[]',
                          is_favorited: favoriteItem.isFavorited ? 1 : 0,
                          tags: favoriteItem.tags || [],
                          favorite_note: favoriteItem.note
                        }}
                        headword={favoriteItem.headword}
                        pos={inferPos(favoriteItem.grammar, favoriteItem.senseGroup)}
                        displayMode={displayMode}
                        showHeadword={true}
                        onFavoriteToggle={
                          isSelectionMode ? () => {} : () => handleFavoriteToggle(favoriteItem.senseId)
                        }
                        onNoteChange={isSelectionMode ? undefined : handleNoteChange}
                        onTagsChange={isSelectionMode ? undefined : () => loadFavorites(true)}
                        onHeadwordClick={
                          isSelectionMode ? undefined : () => onWordSelect(favoriteItem.wordId)
                        }
                      />
                    )}

                    {isSelectionMode && canUseSelectionMode && (
                      <div
                        className={`absolute inset-0 rounded-lg border-2 pointer-events-none transition-colors ${
                          selectedEntityIds.has(getFavoriteItemEntityId(favoriteItem))
                            ? 'border-blue-500 bg-blue-50/10'
                            : 'border-transparent hover:bg-gray-50/20'
                        }`}
                      >
                        <div
                          className={`absolute top-1 left-1 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                            selectedEntityIds.has(getFavoriteItemEntityId(favoriteItem))
                              ? 'bg-blue-500 border-blue-500'
                              : 'bg-white border-gray-300'
                          }`}
                        >
                          {selectedEntityIds.has(getFavoriteItemEntityId(favoriteItem)) && (
                            <Check className="h-3 w-3 text-white" aria-hidden="true" />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex justify-center border-t border-gray-100 pt-3 text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={goToPreviousPage}
                      disabled={currentPage === 1}
                      className={`rounded border px-3 py-1.5 transition-colors ${
                        currentPage === 1
                          ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      上一页
                    </button>
                    <span className="min-w-[5rem] text-center text-gray-600">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={goToNextPage}
                      disabled={currentPage === totalPages}
                      className={`rounded border px-3 py-1.5 transition-colors ${
                        currentPage === totalPages
                          ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        id="csv-import"
        accept=".csv,.txt"
        className="hidden"
        onChange={handleImportFile}
        disabled={importing}
      />

      {wordTagSelectorState && (
        <TagSelector
          wordId={wordTagSelectorState.wordId}
          selectedTags={wordTagSelectorState.tags}
          onTagsChange={() => loadFavorites(true)}
          onClose={() => setWordTagSelectorState(null)}
        />
      )}

      {showTagManager && (
        <TagManagerDialog
          onClose={() => setShowTagManager(false)}
          onTagsChange={() => loadFavorites(true)}
        />
      )}

      {batchTagDialogMode && (
        <BatchTagDialog
          mode={batchTagDialogMode}
          tags={allTags}
          selectedCount={selectedEntityIds.size}
          onConfirm={handleBatchTagConfirm}
          onClose={() => setBatchTagDialogMode(null)}
        />
      )}

      {DialogComponent}
    </div>
  )
}

export default FavoriteList
