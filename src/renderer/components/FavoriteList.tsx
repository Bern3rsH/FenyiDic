import { useState, useEffect, useMemo, useRef } from 'react'
import SenseCard from './SenseCard'
import Sidebar from './Sidebar'
import TagSelector from './TagSelector'
import ArchiveIcon from './ArchiveIcon'
import { useConfirmDialog } from './ConfirmDialog'
import TagManagerDialog from './TagManagerDialog'
import { SYSTEM_TAGS } from '../../shared/types'
import type { EntityType, FavoriteListItem, FavoriteSenseItem, FavoriteWordItem } from '../../shared/types'
import { entityCapabilities } from '../constants/entityCapabilities'

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
  const [showTagManager, setShowTagManager] = useState(false)
  const [wordTagSelectorState, setWordTagSelectorState] = useState<WordTagSelectorState | null>(null)
  const { confirm, alert, DialogComponent } = useConfirmDialog()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const activeCapabilities = entityCapabilities[activeTab]
  const canUseSelectionMode = activeCapabilities.canFavorite || activeCapabilities.canNote
  const filters = filterStateByTab[activeTab]

  const triggerImport = () => {
    fileInputRef.current?.click()
  }

  useEffect(() => {
    if (canUseSelectionMode) {
      return
    }
    setIsSelectionMode(false)
    setSelectedEntityIds(new Set())
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

  const handleFilterChange = (newFilters: FilterState) => {
    setFilterStateByTab((previousFilterStateByTab) => ({
      ...previousFilterStateByTab,
      [activeTab]: newFilters
    }))
    setIsSelectionMode(false)
    setSelectedEntityIds(new Set())
    setEditingWordNoteId(null)
    setWordNoteDraft('')
  }

  const switchActiveTab = (nextTab: EntityType) => {
    if (nextTab === activeTab) {
      return
    }
    setActiveTab(nextTab)
    setIsSelectionMode(false)
    setSelectedEntityIds(new Set())
    setEditingWordNoteId(null)
    setWordNoteDraft('')
    setWordTagSelectorState(null)
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

  const handleSelectAll = () => {
    if (selectedEntityIds.size === visibleFavorites.length) {
      setSelectedEntityIds(new Set())
      return
    }
    setSelectedEntityIds(new Set(visibleFavorites.map((favoriteItem) => getFavoriteItemEntityId(favoriteItem))))
  }

  const handleBatchDelete = async () => {
    if (!activeCapabilities.canFavorite || selectedEntityIds.size === 0) return
    const confirmed = await confirm({
      title: '取消收藏',
      message: `确定要取消收藏选中的 ${selectedEntityIds.size} 个义项吗？`,
      type: 'danger',
      confirmText: '取消收藏'
    })
    if (!confirmed) return

    setLoading(true)
    try {
      await window.api.removeFavoritesBatch(Array.from(selectedEntityIds))
      await loadFavorites()
      setIsSelectionMode(false)
      setSelectedEntityIds(new Set())
    } catch (error) {
      console.error('Batch delete failed:', error)
      await alert({ title: '操作失败', message: '请重试', type: 'danger' })
      await loadFavorites()
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
        isQuoted = !isQuoted
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
            isQuoted = !isQuoted
            currentLine += currentChar
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
        headerColumn.trim().replace(/^"|"$/g, '').toLowerCase()
      )

      const importConfig = await import('./../import-config.json').then((module) => module.default)
      let wordColumnIndex = -1
      for (const possibleWordColumnName of importConfig.fields.word) {
        const foundIndex = normalizedHeaders.indexOf(possibleWordColumnName.toLowerCase())
        if (foundIndex !== -1) {
          wordColumnIndex = foundIndex
          break
        }
      }

      if (wordColumnIndex === -1) {
        const useFirstColumn = await confirm({
          title: '列匹配',
          message: `未自动找到"单词"列 (支持: ${importConfig.fields.word.join(', ')}).\n\n检测到的表头: ${normalizedHeaders.join(', ')}\n\n是否使用第一列作为单词列?`,
          confirmText: '使用第一列'
        })
        if (!useFirstColumn) return
        wordColumnIndex = 0
      }

      let noteColumnIndex = -1
      for (const possibleNoteColumnName of importConfig.fields.note) {
        const foundIndex = normalizedHeaders.indexOf(possibleNoteColumnName.toLowerCase())
        if (foundIndex !== -1) {
          noteColumnIndex = foundIndex
          break
        }
      }

      const proceedImport = await confirm({
        title: '导入确认',
        message: `分隔符: ${delimiter === '\t' ? 'TAB' : '逗号'}\n单词列: ${normalizedHeaders[wordColumnIndex]} (索引 ${wordColumnIndex})\n笔记列: ${noteColumnIndex !== -1 ? normalizedHeaders[noteColumnIndex] : '未找到 (将留空)'}`,
        confirmText: '开始导入'
      })
      if (!proceedImport) return

      const importItems = parsedLines
        .slice(1)
        .map((line) => {
          const columns = parseCsvLine(line, delimiter)
          let headword = columns[wordColumnIndex]?.trim()
          let note = noteColumnIndex !== -1 ? columns[noteColumnIndex]?.trim() : undefined

          if (headword) headword = headword.replace(/^"|"$/g, '')
          if (note) note = note.replace(/^"|"$/g, '')

          return { headword, note: note || undefined }
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
          message: `成功添加了 ${importResult.count} 个相关单词的义项`,
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
      title: '清空笔记',
      message: `确定要清空选中的 ${selectedEntityIds.size} 个词条的笔记吗？`,
      type: 'warning',
      confirmText: '清空'
    })
    if (!confirmed) return

    try {
      const senseIds = Array.from(selectedEntityIds)
      await Promise.all(senseIds.map((senseId) => window.api.deleteNote(senseId)))
      setSelectedEntityIds(new Set())
      setIsSelectionMode(false)
      await loadFavorites()
    } catch (error) {
      console.error(error)
      await alert({ title: '操作出错', message: '请重试', type: 'danger' })
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
        isSelectionMode={isSelectionMode}
        canToggleSelectionMode={canUseSelectionMode}
        onToggleSelectionMode={() => {
          if (!canUseSelectionMode) return
          if (isSelectionMode) {
            setIsSelectionMode(false)
            setSelectedEntityIds(new Set())
          } else {
            setIsSelectionMode(true)
          }
        }}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full">
        {isSelectionMode && canUseSelectionMode && (
          <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="text-sm text-gray-500">已选择 {selectedEntityIds.size} 项</div>
            <div className="flex gap-2">
                <button
                  onClick={handleSelectAll}
                  className="text-xs px-2.5 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                >
                  {selectedEntityIds.size === visibleFavorites.length && visibleFavorites.length > 0
                    ? '取消'
                    : '全选'}
                </button>
              {activeCapabilities.canFavorite && (
                <button
                  onClick={handleBatchDelete}
                  disabled={selectedEntityIds.size === 0}
                  className={`text-xs px-2.5 py-1 rounded transition-colors ${
                    selectedEntityIds.size > 0
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  取消收藏
                </button>
              )}
              {activeCapabilities.canNote && (
                <button
                  onClick={handleBatchClearNotes}
                  disabled={selectedEntityIds.size === 0}
                  className={`text-xs px-2.5 py-1 rounded transition-colors ${
                    selectedEntityIds.size > 0
                      ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  清空笔记
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-center text-gray-500 py-8">加载中...</div>
          ) : visibleFavorites.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p>没有匹配的记录</p>
            </div>
          ) : (
            <div className={`grid gap-3 ${displayMode === 'cn' ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {visibleFavorites.map((favoriteItem) => (
                <div
                  key={`${getFavoriteItemEntityType(favoriteItem)}-${getFavoriteItemEntityId(favoriteItem)}`}
                  className={`h-full relative transition-transform ${
                    isSelectionMode && canUseSelectionMode ? 'cursor-pointer hover:scale-[1.01]' : ''
                  }`}
                  onClick={
                    isSelectionMode && canUseSelectionMode
                      ? () => toggleSelection(getFavoriteItemEntityId(favoriteItem))
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
                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                                      />
                                    </svg>
                                    {tag.name}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {!isSelectionMode && (
                              <div className="flex flex-col gap-1 ml-2">
                                <button
                                  onClick={(clickEvent) => {
                                    clickEvent.stopPropagation()
                                    handleWordFavoriteToggle(favoriteItem.wordId, isWordFavorited)
                                  }}
                                  className={`favorite-btn ${
                                    isWordFavorited ? 'active' : 'text-gray-300'
                                  } ${isWordFavoriteUpdating ? 'opacity-60' : ''}`}
                                  title={isWordFavorited ? '取消收藏' : '收藏'}
                                >
                                  <svg
                                    className="w-4 h-4"
                                    fill={isWordFavorited ? 'currentColor' : 'none'}
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                                    />
                                  </svg>
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
                                    hasCustomWordTag ? 'text-indigo-500 bg-indigo-50' : 'text-gray-300'
                                  }`}
                                  title="管理标签"
                                >
                                  <svg
                                    className="w-4 h-4"
                                    fill={hasCustomWordTag ? 'currentColor' : 'none'}
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                                    />
                                  </svg>
                                </button>

                                <button
                                  onClick={(clickEvent) => {
                                    clickEvent.stopPropagation()
                                    handleWordArchiveToggle(favoriteItem.wordId, isWordArchived)
                                  }}
                                  className={`favorite-btn ${
                                    isWordArchived ? 'text-gray-600 bg-gray-200' : 'text-gray-300'
                                  } ${isWordArchiveUpdating ? 'opacity-60' : ''}`}
                                  title={isWordArchived ? '取消归档' : '归档'}
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
                                      ? 'text-yellow-600 bg-yellow-100'
                                      : 'text-gray-300'
                                  } ${isWordNoteUpdating ? 'opacity-60' : ''}`}
                                  title="添加/编辑笔记"
                                >
                                  <svg
                                    className="w-4 h-4"
                                    fill={hasWordNote || isWordNoteEditing ? 'currentColor' : 'none'}
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    />
                                  </svg>
                                </button>
                              </div>
                            )}
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
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
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

      {DialogComponent}
    </div>
  )
}

export default FavoriteList
