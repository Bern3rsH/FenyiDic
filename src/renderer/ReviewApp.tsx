import { useState, useEffect, useMemo, useCallback } from 'react'
import ReviewFlipCard from './components/ReviewFlipCard'
import ReviewWordFlipCard from './components/ReviewWordFlipCard'
import ReadReviewPreparationList from './components/review/common/ReadReviewPreparationList'
import './styles/index.css'
import { getDefaultTagModeConfigs, normalizeTagModeConfigs } from './utils/tagModeConfigs'
import type {
  ReviewMode,
  TagModeConfig,
  ReviewQueueItem,
  ReviewWordQueueItem,
  ReviewWordSense
} from '../shared/types'

declare global {
  interface Window {
    api: import('../preload/index').IpcApi
  }
}

type ReviewCardItem = ReviewQueueItem & {
  reviewTagName?: string
}

type ReviewStage = 'prepare' | 'review'

type ReadPreparationListItem = {
  key: string
  headword: string
  cardTypeLabel: '释义卡' | '词条卡'
  reviewTagName?: string
}

const LEGACY_LISTEN_TAG_ID = 19

function pruneReviewItemsAfterArchive(
  reviewItems: ReviewCardItem[],
  archivedReviewItem: ReviewCardItem
): ReviewCardItem[] {
  if (archivedReviewItem.type === 'word') {
    const archivedWordId = archivedReviewItem.wordId
    return reviewItems.filter((reviewItem) => reviewItem.wordId !== archivedWordId)
  }

  const archivedSenseId = archivedReviewItem.senseId
  const archivedWordId = archivedReviewItem.wordId

  return reviewItems
    .map((reviewItem) => {
      if (reviewItem.type === 'sense') {
        return reviewItem.senseId === archivedSenseId ? null : reviewItem
      }

      if (reviewItem.wordId !== archivedWordId) {
        return reviewItem
      }

      const remainingWordSenses = reviewItem.senses.filter(
        (reviewSense) => reviewSense.id !== archivedSenseId
      )

      if (remainingWordSenses.length === 0) {
        return null
      }

      return {
        ...reviewItem,
        senses: remainingWordSenses
      }
    })
    .filter((reviewItem): reviewItem is ReviewCardItem => reviewItem !== null)
}

function resolveReviewMode(reviewItem: ReviewCardItem): ReviewMode | undefined {
  if (reviewItem.reviewMode === 'listen') {
    return 'listen'
  }

  const tags = reviewItem.tags || []
  if (tags.some((tag) => tag.id === LEGACY_LISTEN_TAG_ID || tag.name.includes('听不懂'))) {
    return 'listen'
  }

  return reviewItem.reviewMode
}

function getReviewItemKey(reviewItem: ReviewCardItem): string {
  const resolvedReviewMode = resolveReviewMode(reviewItem) || 'unknown'
  return `${reviewItem.type}-${reviewItem.entityId}-${resolvedReviewMode}`
}

function buildReadPreparationItem(reviewItem: ReviewCardItem): ReadPreparationListItem {
  return {
    key: getReviewItemKey(reviewItem),
    headword: reviewItem.headword,
    cardTypeLabel: reviewItem.type === 'word' ? '词条卡' : '释义卡',
    reviewTagName: reviewItem.reviewTagName
  }
}

export default function ReviewApp() {
  const [loadedItems, setLoadedItems] = useState<ReviewCardItem[]>([])
  const [items, setItems] = useState<ReviewCardItem[]>([])
  const [reviewStage, setReviewStage] = useState<ReviewStage>('review')
  const [skippedReadItemKeys, setSkippedReadItemKeys] = useState<string[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [isReviewComplete, setIsReviewComplete] = useState(false)
  const [loading, setLoading] = useState(true)
  const [displayMode, setDisplayMode] = useState<'en' | 'cn' | 'both'>('both')
  const [autoPlay, setAutoPlay] = useState(false)
  const [autoPlayAccent, setAutoPlayAccent] = useState<'uk' | 'us'>('uk')
  const [reviewDebugNoFsrs, setReviewDebugNoFsrs] = useState(false)

  const shouldSkipFsrs = import.meta.env.DEV && reviewDebugNoFsrs

  // 加载"不认识"标签下的义项和单词
  useEffect(() => {
    loadReviewItems()
  }, [])

  const loadReviewItems = async () => {
    setLoading(true)
    try {
      // 加载用户设置
      const [displayModeSetting, autoPlaySetting, accentSetting, debugNoFsrsSetting, tagModeSetting] = await Promise.all([
        window.api.getSetting<'en' | 'cn' | 'both'>('displayMode'),
        window.api.getSetting<boolean>('reviewAutoPlay'),
        window.api.getSetting<'uk' | 'us'>('reviewAutoPlayAccent'),
        window.api.getSetting<boolean>('reviewDebugNoFsrs'),
        window.api.getSetting<unknown>('tagModes')
      ])
      
      if (displayModeSetting) setDisplayMode(displayModeSetting)
      if (autoPlaySetting !== null && autoPlaySetting !== undefined) setAutoPlay(autoPlaySetting)
      if (accentSetting) setAutoPlayAccent(accentSetting)
      if (debugNoFsrsSetting !== null && debugNoFsrsSetting !== undefined) setReviewDebugNoFsrs(debugNoFsrsSetting)

      const parsedTagModeConfigs = normalizeTagModeConfigs(tagModeSetting)
      const effectiveTagModeConfigs: TagModeConfig[] =
        parsedTagModeConfigs.length > 0 ? parsedTagModeConfigs : getDefaultTagModeConfigs()

      const uniqueTagNames = Array.from(
        new Set(effectiveTagModeConfigs.map((config) => config.tagName))
      )

      const dueItemsByTagNameEntries = await Promise.all(
        uniqueTagNames.map(async (tagName) => {
          const dueItems = await window.api.getFsrsDueItems(tagName)
          return [tagName, dueItems] as const
        })
      )
      const dueItemsByTagName = new Map<string, ReviewQueueItem[]>(dueItemsByTagNameEntries)

      const results = effectiveTagModeConfigs.map((config) => ({
        tagName: config.tagName,
        mode: config.mode,
        items: dueItemsByTagName.get(config.tagName) || []
      }))

      // Deduplication Map
      // Key: `type-id-mode`
      // But for 'speak' mode, we treat Senses as Words, and merge them.
      const uniqueItemsMap = new Map<string, ReviewCardItem>()

      for (const result of results) {
        for (const rawItem of result.items) {
          let item: ReviewCardItem
          let key: string
          const mode = result.mode as ReviewMode

          if (mode === 'speak' && rawItem.type === 'sense') {
            // Special handling for Speak Mode: Convert Sense to Word
            const wordId = rawItem.wordId
            key = `word-${wordId}-speak`

            const newSense: ReviewWordSense = {
              id: rawItem.senseId,
              examples: rawItem.examples,
              definition: rawItem.definition,
              definitionCn: rawItem.definitionCn
            }

            if (uniqueItemsMap.has(key)) {
              // Merge logic
              const existing = uniqueItemsMap.get(key) as ReviewWordQueueItem
              // Avoid duplicate senses in list
              if (!existing.senses.find((existingSense) => existingSense.id === newSense.id)) {
                existing.senses.push(newSense)
              }
              continue // Done merging
            }

            // Create new converted item
            item = {
              type: 'word',
              entityType: 'word',
              entityId: wordId,
              wordId,
              headword: rawItem.headword,
              phonUk: rawItem.phonUk,
              phonUs: rawItem.phonUs,
              senses: [newSense],
              reviewMode: 'speak',
              reviewTagName: result.tagName,
              fsrsCardId: rawItem.fsrsCardId,
              fsrsDue: rawItem.fsrsDue,
              fsrsState: rawItem.fsrsState,
              tags: rawItem.tags
            }
          } else {
            // Standard logic - use data from FSRS API which includes fsrsCardId
            item = {
              ...rawItem,
              reviewTagName: result.tagName,
              reviewMode: mode,
              fsrsCardId: rawItem.fsrsCardId
            } as ReviewCardItem
            
            key = `${rawItem.type}-${rawItem.entityId}-${mode}`
          }
          
          if (!uniqueItemsMap.has(key)) {
            uniqueItemsMap.set(key, item)
          }
        }
      }
      
      // Items are already sorted by due date from FSRS API, no need to shuffle
      const combined = Array.from(uniqueItemsMap.values())

      setLoadedItems(combined)
      setSkippedReadItemKeys([])
      setCurrentIndex(0)
      setIsFlipped(false)
      setIsReviewComplete(false)

      const hasReadModeItems = combined.some((reviewItem) => resolveReviewMode(reviewItem) === 'read')
      if (hasReadModeItems) {
        setItems([])
        setReviewStage('prepare')
      } else {
        setItems(combined)
        setReviewStage('review')
      }
    } catch (err) {
      console.error('Failed to load review items:', err)
    } finally {
      setLoading(false)
    }
  }

  const readPreparationItems = useMemo(
    () =>
      loadedItems
        .filter((reviewItem) => resolveReviewMode(reviewItem) === 'read')
        .map((reviewItem) => buildReadPreparationItem(reviewItem)),
    [loadedItems]
  )

  const skippedReadItemKeySet = useMemo(
    () => new Set(skippedReadItemKeys),
    [skippedReadItemKeys]
  )

  const nonReadItemCount = useMemo(
    () =>
      loadedItems.filter((reviewItem) => resolveReviewMode(reviewItem) !== 'read').length,
    [loadedItems]
  )

  const currentItem = items[currentIndex]

  // 为当前义项卡生成稳定的单条例句，优先选择带英文内容的例句
  const stableSenseExamples = useMemo(() => {
    if (!currentItem || currentItem.type !== 'sense' || currentItem.examples.length === 0) return []

    const nonEmptyExamples = currentItem.examples.filter(
      (example) => example.en.trim() !== '' || (typeof example.cn === 'string' && example.cn.trim() !== '')
    )
    if (nonEmptyExamples.length === 0) return []

    const preferredExamples = nonEmptyExamples.some((example) => example.en.trim() !== '')
      ? nonEmptyExamples.filter((example) => example.en.trim() !== '')
      : nonEmptyExamples

    return [preferredExamples[Math.floor(Math.random() * preferredExamples.length)]]
  }, [currentItem ? currentItem.entityId : -1])

  // Determine effective review mode (explicit or tag-based)
  const effectiveReviewMode = useMemo(() => {
    if (!currentItem) return undefined
    return resolveReviewMode(currentItem)
  }, [currentItem])

  const toggleReadItemSkip = useCallback((itemKey: string) => {
    setSkippedReadItemKeys((currentKeys) =>
      currentKeys.includes(itemKey)
        ? currentKeys.filter((currentKey) => currentKey !== itemKey)
        : [...currentKeys, itemKey]
    )
  }, [])

  const selectAllReadItems = useCallback(() => {
    setSkippedReadItemKeys(readPreparationItems.map((reviewItem) => reviewItem.key))
  }, [readPreparationItems])

  const clearReadItemSelections = useCallback(() => {
    setSkippedReadItemKeys([])
  }, [])

  const handleStartReview = useCallback(() => {
    const nextItems = loadedItems.filter((reviewItem) => {
      const resolvedReviewMode = resolveReviewMode(reviewItem)
      if (resolvedReviewMode !== 'read') {
        return true
      }

      return !skippedReadItemKeySet.has(getReviewItemKey(reviewItem))
    })

    setItems(nextItems)
    setCurrentIndex(0)
    setIsFlipped(false)
    setIsReviewComplete(false)
    setReviewStage('review')
  }, [loadedItems, skippedReadItemKeySet])

  const playTtsFallback = useCallback(async (text: string) => {
    const { audioManager } = await import('./utils/audioManager')
    await audioManager.playTts(text, 1)
  }, [])

  // 自动发音
  useEffect(() => {
    if (!currentItem) return

    if (effectiveReviewMode !== 'read') {
      return
    }

    if (autoPlay && currentItem && !loading) {
      const playAuto = async () => {
        try {
          const suffix = autoPlayAccent === 'uk' ? 'gb' : 'us'
          // 尝试多个编号
          for (let i = 1; i <= 10; i++) {
            const filename = `${currentItem.headword}__${suffix}_${i}.mp3`
            const result = await window.api.getAudio(filename)
            if (result.success && result.data) {
               const url = `data:${result.mimeType};base64,${result.data}`
               await import('./utils/audioManager').then(({ audioManager }) => audioManager.playUrl(url))
               return
            }
          }
          await playTtsFallback(currentItem.headword)
        } catch (err) {
          console.error('Auto play failed:', err)
          try {
            await playTtsFallback(currentItem.headword)
          } catch (ttsError) {
            console.error('Auto play TTS fallback failed:', ttsError)
          }
        }
      }
      playAuto()
    }
  }, [currentIndex, autoPlay, autoPlayAccent, loading, effectiveReviewMode, currentItem, playTtsFallback])

  const handleFlip = () => {
    setIsFlipped(true)
  }

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setIsFlipped(false)
      return
    }

    setIsReviewComplete(true)
  }

  const handleCloseReviewWindow = useCallback(() => {
    window.close()
  }, [])

  const handleKnow = async () => {
    // FSRS: Rate as Good (3)
    const item = items[currentIndex]
    if (!shouldSkipFsrs && item?.fsrsCardId) {
      try {
        const result = await window.api.recordFsrsReview(item.fsrsCardId, 3)
        console.log('[FSRS] Good rating recorded, next due:', result.nextDue)
      } catch (e) {
        console.error('[FSRS] Failed to record review:', e)
      }
    } else if (shouldSkipFsrs) {
      console.log('[FSRS] Dev debug mode enabled, skip recording review')
    }
    handleNext()
  }

  const handleFuzzy = async () => {
    // FSRS: Rate as Hard (2)
    const item = items[currentIndex]
    if (!shouldSkipFsrs && item?.fsrsCardId) {
      try {
        const result = await window.api.recordFsrsReview(item.fsrsCardId, 2)
        console.log('[FSRS] Hard rating recorded, next due:', result.nextDue)
      } catch (e) {
        console.error('[FSRS] Failed to record review:', e)
      }
    } else if (shouldSkipFsrs) {
      console.log('[FSRS] Dev debug mode enabled, skip recording review')
    }
    handleNext()
  }

  const handleDontKnow = async () => {
    // FSRS: Rate as Again (1)
    const item = items[currentIndex]
    if (!shouldSkipFsrs && item?.fsrsCardId) {
      try {
        const result = await window.api.recordFsrsReview(item.fsrsCardId, 1)
        console.log('[FSRS] Again rating recorded, next due:', result.nextDue)
      } catch (e) {
        console.error('[FSRS] Failed to record review:', e)
      }
    } else if (shouldSkipFsrs) {
      console.log('[FSRS] Dev debug mode enabled, skip recording review')
    }
    handleNext()
  }

  const handleArchiveCurrent = useCallback(async () => {
    const currentReviewItem = items[currentIndex]
    if (!currentReviewItem || isArchiving) {
      return
    }

    setIsArchiving(true)
    try {
      const archiveResult =
        currentReviewItem.type === 'sense'
          ? await window.api.quickArchiveSense(currentReviewItem.senseId)
          : await window.api.quickArchiveWord(currentReviewItem.wordId)

      if (!archiveResult.success) {
        console.error('[Review] Failed to archive current item:', archiveResult.error)
        return
      }

      const nextItems = pruneReviewItemsAfterArchive(items, currentReviewItem)
      setItems(nextItems)

      if (nextItems.length === 0) {
        setCurrentIndex(0)
      } else {
        const nextIndex = Math.min(currentIndex, nextItems.length - 1)
        setCurrentIndex(nextIndex)
      }

      setIsFlipped(false)
    } catch (error) {
      console.error('[Review] Archive action failed:', error)
    } finally {
      setIsArchiving(false)
    }
  }, [currentIndex, isArchiving, items])

  const shouldIgnoreReviewShortcut = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
      return false
    }

    if (target.isContentEditable) {
      return true
    }

    const editableOrInteractiveSelector = [
      'input',
      'textarea',
      'select',
      'button',
      'a[href]',
      '[role="button"]',
      '[role="link"]'
    ].join(', ')

    return target.closest(editableOrInteractiveSelector) !== null
  }

  const isImeEnter = (event: KeyboardEvent): boolean => {
    if (event.key !== 'Enter') return false

    const composingEvent = event as KeyboardEvent & { isComposing?: boolean; keyCode?: number }
    return composingEvent.isComposing === true || composingEvent.keyCode === 229
  }

  // Keyboard shortcuts for review rating buttons:
  // Enter = 翻面, 1 = 不知道, 2 = 模糊, 3 = 知道
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isReviewComplete) return

      if (shouldIgnoreReviewShortcut(event.target)) {
        return
      }

      if (!isFlipped) {
        if (isArchiving || isImeEnter(event) || event.key !== 'Enter') {
          return
        }

        event.preventDefault()
        handleFlip()
        return
      }

      if (event.key === '1') {
        event.preventDefault()
        void handleDontKnow()
      } else if (event.key === '2') {
        event.preventDefault()
        void handleFuzzy()
      } else if (event.key === '3') {
        event.preventDefault()
        void handleKnow()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isArchiving, isFlipped, isReviewComplete, handleDontKnow, handleFuzzy, handleKnow])

  const handlePlayAudio = useCallback(async (accent: 'uk' | 'us') => {
    if (!currentItem) return
    try {
      const suffix = accent === 'uk' ? 'gb' : 'us'
      for (let i = 1; i <= 10; i++) {
        const filename = `${currentItem.headword}__${suffix}_${i}.mp3`
        const result = await window.api.getAudio(filename)
        if (result.success && result.data) {
          const url = `data:${result.mimeType};base64,${result.data}`
          await import('./utils/audioManager').then(({ audioManager }) => audioManager.playUrl(url))
          return
        }
      }
      console.log(`${accent.toUpperCase()} audio not found for:`, currentItem.headword)
      await playTtsFallback(currentItem.headword)
    } catch (err) {
      console.error(`Failed to play ${accent.toUpperCase()} audio:`, err)
      try {
        await playTtsFallback(currentItem.headword)
      } catch (ttsError) {
        console.error(`Failed to play ${accent.toUpperCase()} TTS fallback:`, ttsError)
      }
    }
  }, [currentItem, playTtsFallback])

  const playUk = useCallback(() => handlePlayAudio('uk'), [handlePlayAudio])
  const playUs = useCallback(() => handlePlayAudio('us'), [handlePlayAudio])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (reviewStage === 'prepare' && readPreparationItems.length > 0) {
    return (
      <ReadReviewPreparationList
        items={readPreparationItems}
        selectedKeys={skippedReadItemKeySet}
        nonReadItemCount={nonReadItemCount}
        onToggleItem={toggleReadItemSkip}
        onSelectAll={selectAllReadItems}
        onClearSelection={clearReadItemSelections}
        onStartReview={handleStartReview}
      />
    )
  }

  if (items.length === 0) {
    if (loadedItems.length > 0) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="text-4xl mb-4">🗂️</div>
            <div className="font-medium">本次已跳过全部阅读卡片</div>
            <div className="text-sm mt-2">当前这次没有剩余复习内容，后续再次进入复习时这些卡片仍会出现。</div>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-4">📚</div>
          <div className="font-medium">当前没有到期复习内容</div>
          <div className="text-sm mt-2">稍后再来，或给更多词条/义项打上复习标签</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col overflow-hidden">
      {/* 顶部进度 */}
      <div className="px-6 pt-6 pb-4 shrink-0">
        <div className="flex items-center justify-end mb-2">
          <span className="text-sm text-gray-500">
            {currentIndex + 1} / {items.length}
          </span>
        </div>
        {shouldSkipFsrs && (
          <div className="mb-2 inline-flex items-center rounded bg-amber-100 px-2 py-1 text-xs text-amber-700">
            调试模式：本次复习不计入 FSRS
          </div>
        )}
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / items.length) * 100}%` }}
          />
        </div>
      </div>

      {/* 复习卡片 */}
      {currentItem.type === 'word' ? (
         <ReviewWordFlipCard
           key={`word-${currentItem.entityId}`}
           word={currentItem}
           reviewTagName={currentItem.reviewTagName}
           isFlipped={isFlipped}
           isArchiving={isArchiving}
           displayMode={displayMode}
           onFlip={handleFlip}
           onArchive={handleArchiveCurrent}
           onKnow={handleKnow}
           onFuzzy={handleFuzzy}
           onDontKnow={handleDontKnow}
           reviewMode={effectiveReviewMode}
           onPlayAudioUk={playUk}
           onPlayAudioUs={playUs}
         />
      ) : (
         <ReviewFlipCard
           key={`sense-${currentItem.senseId}`}
           wordId={currentItem.wordId}
           headword={currentItem.headword}
           phonUk={currentItem.phonUk}
           phonUs={currentItem.phonUs}
           definition={currentItem.definition}
           definitionCn={currentItem.definitionCn}
           examples={stableSenseExamples}
           note={currentItem.note}
           tags={currentItem.tags}
           reviewTagName={currentItem.reviewTagName}
           isFlipped={isFlipped}
           isArchiving={isArchiving}
           displayMode={displayMode}
           onFlip={handleFlip}
           onArchive={handleArchiveCurrent}
           onKnow={handleKnow}
           onFuzzy={handleFuzzy}
           onDontKnow={handleDontKnow}
           reviewMode={effectiveReviewMode}
           onPlayAudioUk={playUk}
           onPlayAudioUs={playUs}
         />
      )}

      {isReviewComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">已完成本次复习</h2>
            <p className="mt-2 text-sm text-gray-500">
              本次队列中的所有卡片都已处理完成。
            </p>
            <button
              type="button"
              onClick={handleCloseReviewWindow}
              className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              关闭复习窗口
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
