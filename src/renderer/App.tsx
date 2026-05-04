import { useState, useCallback, useEffect, useRef } from 'react'
import SearchBar from './components/SearchBar'
import WordEntry from './components/WordEntry'
import FavoriteList from './components/FavoriteList'
import Settings from './components/Settings'
import DictionarySetup from './components/DictionarySetup'
import type { TagModeConfig } from '../shared/types'
import { useConfirmDialog } from './components/ConfirmDialog'
import { getDefaultTagModeConfigs, normalizeTagModeConfigs } from './utils/tagModeConfigs'

declare global {
  interface Window {
    api: import('../preload/index').IpcApi
  }
}

type View = 'search' | 'favorites' | 'settings'

interface HistoryItem {
  view: View
  wordId: number | null
  entryHeadword: string | null
}

// 语言显示模式
export type DisplayMode = 'en' | 'cn' | 'both'

const SEARCH_PAGE_INPUT_TOP_RATIO = 0.38
const SEARCH_PAGE_MIN_TOP_PADDING_PX = 24
const HEADER_HEIGHT_FALLBACK_PX = 88
const EMPTY_RELEASE_NOTES_MESSAGE = '本次发布未填写更新内容。'

type UpdateRequestStatus = 'idle' | 'checking'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return '未知错误'
}

function formatReleaseNotesForDialog(releaseNotes: string | null | undefined): string {
  const trimmedReleaseNotes = releaseNotes?.trim()
  return trimmedReleaseNotes || EMPTY_RELEASE_NOTES_MESSAGE
}

function App() {
  // 词典状态
  const [hasDictionary, setHasDictionary] = useState<boolean | null>(null)
  
  const [view, setView] = useState<View>('search')
  const [selectedWordId, setSelectedWordId] = useState<number | null>(null)
  const [selectedEntryHeadword, setSelectedEntryHeadword] = useState<string | null>(null)
  
  // 语言显示模式 - 默认值，等待从主进程加载
  const [displayMode, setDisplayMode] = useState<DisplayMode>('both')
  const [displayModeLoaded, setDisplayModeLoaded] = useState(false)
  
  // 复习设置
  const [reviewAutoPlay, setReviewAutoPlay] = useState(false)
  const [reviewAutoPlayAccent, setReviewAutoPlayAccent] = useState<'uk' | 'us'>('uk')
  const [reviewDebugNoFsrs, setReviewDebugNoFsrs] = useState(false)
  const [tagModeConfigs, setTagModeConfigs] = useState<TagModeConfig[]>(() => getDefaultTagModeConfigs())
  
  // 查词设置
  const [searchAutoPlay, setSearchAutoPlay] = useState(false)
  const [searchAutoPlayAccent, setSearchAutoPlayAccent] = useState<'uk' | 'us'>('uk')
  
  // 阅读设置
  const [readingAutoPlay, setReadingAutoPlay] = useState(false)
  const [readingAutoPlayAccent, setReadingAutoPlayAccent] = useState<'uk' | 'us'>('uk')

  // 软件更新
  const [appVersion, setAppVersion] = useState('')
  const [updateRequestStatus, setUpdateRequestStatus] = useState<UpdateRequestStatus>('idle')
  const { confirm, alert, DialogComponent } = useConfirmDialog()
  
  // URL Schema 预填充查询词
  const [pendingSearchQuery, setPendingSearchQuery] = useState('')
  const headerRef = useRef<HTMLElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(HEADER_HEIGHT_FALLBACK_PX)
  const updateRequestStatusRef = useRef<UpdateRequestStatus>('idle')

  useEffect(() => {
    updateRequestStatusRef.current = updateRequestStatus
  }, [updateRequestStatus])

  // 检查词典状态
  useEffect(() => {
    window.api.checkDictionary().then((status) => {
      setHasDictionary(status.hasActiveDictionary)
    })
  }, [])

  const handleCheckForAppUpdate = useCallback(async () => {
    if (updateRequestStatusRef.current !== 'idle') {
      return
    }

    updateRequestStatusRef.current = 'checking'
    setUpdateRequestStatus('checking')

    try {
      const updateCheckResult = await window.api.checkForAppUpdate()

      if (updateCheckResult.status === 'unsupported') {
        await alert({
          title: '当前环境无法检查更新',
          message: updateCheckResult.reason,
          type: 'warning'
        })
        return
      }

      if (updateCheckResult.status === 'error') {
        await alert({
          title: '检查更新失败',
          message: updateCheckResult.error,
          type: 'danger'
        })
        return
      }

      if (updateCheckResult.status === 'not-available') {
        await alert({
          title: '已是最新版本',
          message: `当前版本 ${updateCheckResult.currentVersion} 已是最新版本。`,
          type: 'success'
        })
        return
      }

      const releaseNotes = formatReleaseNotesForDialog(updateCheckResult.updateInfo.releaseNotes)
      const updateMessage = [
        `当前版本：${updateCheckResult.currentVersion}`,
        `最新版本：${updateCheckResult.updateInfo.version}`,
        updateCheckResult.updateInfo.releaseName ? `版本名称：${updateCheckResult.updateInfo.releaseName}` : null,
        `本次更新内容：\n${releaseNotes}`,
        '是否前往 GitHub Releases 下载新版安装包？'
      ]
        .filter(Boolean)
        .join('\n\n')

      const shouldOpenReleasePage = await confirm({
        title: '发现新版本',
        message: updateMessage,
        confirmText: '前往下载',
        cancelText: '稍后',
        type: 'info'
      })

      if (!shouldOpenReleasePage) {
        return
      }

      const openReleasePageResult = await window.api.openLatestReleasePage()
      if (!openReleasePageResult.success) {
        await alert({
          title: '打开下载页面失败',
          message: openReleasePageResult.error || '无法打开 GitHub Releases 页面，请稍后再试。',
          type: 'danger'
        })
      }
    } catch (error) {
      await alert({
        title: '检查更新失败',
        message: getErrorMessage(error),
        type: 'danger'
      })
    } finally {
      updateRequestStatusRef.current = 'idle'
      setUpdateRequestStatus('idle')
    }
  }, [alert, confirm])

  useEffect(() => {
    const headerElement = headerRef.current
    if (!headerElement) {
      return
    }

    const syncHeaderHeight = () => {
      const nextHeaderHeight = Math.round(headerElement.getBoundingClientRect().height)
      if (nextHeaderHeight > 0) {
        setHeaderHeight(nextHeaderHeight)
      }
    }

    syncHeaderHeight()

    const resizeObserver = new ResizeObserver(syncHeaderHeight)
    resizeObserver.observe(headerElement)
    window.addEventListener('resize', syncHeaderHeight)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', syncHeaderHeight)
    }
  }, [])

  useEffect(() => {
    let isEffectActive = true

    window.api
      .getAppVersion()
      .then((version) => {
        if (isEffectActive) {
          setAppVersion(version)
        }
      })
      .catch((error) => {
        console.error('Failed to load app version', error)
      })

    const removeOpenUpdateDialogListener = window.api.onOpenAppUpdateCheckDialog(() => {
      void handleCheckForAppUpdate()
    })

    return () => {
      isEffectActive = false
      removeOpenUpdateDialogListener()
    }
  }, [handleCheckForAppUpdate])
  
  // 从 electron-store 加载设置
  useEffect(() => {
    Promise.all([
      window.api.getSetting<DisplayMode>('displayMode'),
      window.api.getSetting<boolean>('reviewAutoPlay'),
      window.api.getSetting<'uk' | 'us'>('reviewAutoPlayAccent'),
      window.api.getSetting<boolean>('reviewDebugNoFsrs'),
      window.api.getSetting<unknown>('tagModes'),
      window.api.getSetting<boolean>('searchAutoPlay'),
      window.api.getSetting<'uk' | 'us'>('searchAutoPlayAccent'),
      window.api.getSetting<boolean>('readingAutoPlay'),
      window.api.getSetting<'uk' | 'us'>('readingAutoPlayAccent')
    ]).then(
      ([
        mode,
        autoPlay,
        accent,
        debugNoFsrs,
        tagModeSetting,
        searchAP,
        searchAPAccent,
        readingAP,
        readingAPAccent
      ]) => {
        if (mode) setDisplayMode(mode)
        if (autoPlay !== null && autoPlay !== undefined) setReviewAutoPlay(autoPlay)
        if (accent) setReviewAutoPlayAccent(accent)
        if (debugNoFsrs !== null && debugNoFsrs !== undefined) setReviewDebugNoFsrs(debugNoFsrs)
        if (searchAP !== null && searchAP !== undefined) setSearchAutoPlay(searchAP)
        if (searchAPAccent) setSearchAutoPlayAccent(searchAPAccent)
        if (readingAP !== null && readingAP !== undefined) setReadingAutoPlay(readingAP)
        if (readingAPAccent) setReadingAutoPlayAccent(readingAPAccent)
        const normalizedTagModeConfigs = normalizeTagModeConfigs(tagModeSetting)
        setTagModeConfigs(
          normalizedTagModeConfigs.length > 0 ? normalizedTagModeConfigs : getDefaultTagModeConfigs()
        )
        setDisplayModeLoaded(true)
      }
    )
  }, [])
  
  // 当设置变化时保存到 electron-store
  useEffect(() => {
    if (displayModeLoaded) {
      window.api.setSetting('displayMode', displayMode)
      window.api.setSetting('reviewAutoPlay', reviewAutoPlay)
      window.api.setSetting('reviewAutoPlayAccent', reviewAutoPlayAccent)
      window.api.setSetting('reviewDebugNoFsrs', reviewDebugNoFsrs)
      window.api.setSetting('tagModes', normalizeTagModeConfigs(tagModeConfigs))
      window.api.setSetting('searchAutoPlay', searchAutoPlay)
      window.api.setSetting('searchAutoPlayAccent', searchAutoPlayAccent)
      window.api.setSetting('readingAutoPlay', readingAutoPlay)
      window.api.setSetting('readingAutoPlayAccent', readingAutoPlayAccent)
    }
  }, [
    displayMode,
    reviewAutoPlay,
    reviewAutoPlayAccent,
    reviewDebugNoFsrs,
    tagModeConfigs,
    searchAutoPlay,
    searchAutoPlayAccent,
    readingAutoPlay,
    readingAutoPlayAccent,
    displayModeLoaded
  ])
  

  
  // 历史记录
  const [history, setHistory] = useState<HistoryItem[]>([{ view: 'search', wordId: null, entryHeadword: null }])
  const [historyIndex, setHistoryIndex] = useState(0)
  
  // 用于强制刷新收藏列表的 key
  const [favoritesRefreshKey, setFavoritesRefreshKey] = useState(0)

  // 添加到历史记录
  const pushHistory = useCallback((newView: View, wordId: number | null, entryHeadword: string | null) => {
    // 如果不在历史末尾，截断后面的记录
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push({ view: newView, wordId, entryHeadword })
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }, [history, historyIndex])

  const handleWordSelect = (wordId: number, entryHeadword?: string) => {
    setSelectedWordId(wordId)
    setSelectedEntryHeadword(entryHeadword ?? null)
    pushHistory(view, wordId, entryHeadword ?? null)
  }

  // 监听来自复习窗口的导航请求
  useEffect(() => {
    return window.api.onNavigateToWord(async (identifier) => {
      let id: number | null = null
      let entryHeadword: string | null = null
      
      if (typeof identifier === 'number') {
        id = identifier
      } else {
        // 如果是字符串，先搜索获取 ID
        try {
          const results = await window.api.searchWord(identifier)
          if (results && results.length > 0) {
            // 优先完全匹配
            const match = results.find(
              (result) => result.lookupHeadword === identifier || result.headword === identifier
            )
            if (match) {
              id = match.id
              entryHeadword = match.headword

              // 添加到搜索历史
              try {
                const historyItem = { id: match.id, headword: match.headword }
                const saved = localStorage.getItem('search_history')
                let history: any[] = saved ? JSON.parse(saved) : []

                // 过滤掉已存在的相同单词，并将新单词加到最前面
                history = [historyItem, ...history.filter((h: any) => h.headword !== match.headword)].slice(0, 50)
                localStorage.setItem('search_history', JSON.stringify(history))
              } catch (e) {
                console.error('Failed to save deep link to history', e)
              }
            }
          }
        } catch (err) {
          console.error('Failed to search word for navigation:', identifier, err)
        }
      }
      
      if (id) {
        setView('search')
        handleWordSelect(id, entryHeadword || undefined)
      } else if (typeof identifier === 'string') {
        // 没有找到匹配的单词，跳转到搜索页面并预填充搜索词
        setView('search')
        setSelectedWordId(null)
        setSelectedEntryHeadword(null)
        setPendingSearchQuery(identifier)
      }
    })
  }, [handleWordSelect])

  const handleBack = () => {
    setSelectedWordId(null)
    setSelectedEntryHeadword(null)
    pushHistory(view, null, null)
  }

  const handleViewChange = (newView: View) => {
    // 如果切换到"我的"页面，或者在"我的"页面点击按钮，都触发刷新
    if (newView === 'favorites') {
      setFavoritesRefreshKey(k => k + 1)
    }

    setView(newView)
    setSelectedWordId(null)
    setSelectedEntryHeadword(null)
    pushHistory(newView, null, null)
  }

  // 后退
  const goBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      const item = history[newIndex]
      setHistoryIndex(newIndex)
      setView(item.view)
      setSelectedWordId(item.wordId)
      setSelectedEntryHeadword(item.entryHeadword)
      // 返回到收藏页面时刷新数据
      if (item.view === 'favorites' && item.wordId === null) {
        setFavoritesRefreshKey(k => k + 1)
      }
    }
  }

  // 前进
  const goForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      const item = history[newIndex]
      setHistoryIndex(newIndex)
      setView(item.view)
      setSelectedWordId(item.wordId)
      setSelectedEntryHeadword(item.entryHeadword)
    }
  }

  const canGoBack = historyIndex > 0
  const canGoForward = historyIndex < history.length - 1
  const searchPageMinHeight = `calc(100vh - ${headerHeight}px)`
  const searchPagePaddingTop = `max(${SEARCH_PAGE_MIN_TOP_PADDING_PX}px, calc(${SEARCH_PAGE_INPUT_TOP_RATIO * 100}vh - ${headerHeight}px))`
  const isSearchHome = view === 'search' && !selectedWordId
  const showHeaderSearchBar = !isSearchHome
  const topNavButtonBaseClass = 'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150'
  const getTopNavButtonClass = (isActive: boolean): string =>
    `${topNavButtonBaseClass} ${
      isActive
        ? 'bg-blue-600 text-white shadow-sm shadow-blue-100'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`

  // 词典导入完成后刷新
  const handleDictionaryImportComplete = () => {
    setHasDictionary(true)
    // 重新加载页面以确保新词典生效
    window.location.reload()
  }

  // 加载中
  if (hasDictionary === null) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  // 无词典，显示导入页面
  if (!hasDictionary) {
    return <DictionarySetup onComplete={handleDictionaryImportComplete} />
  }

  return (
    <div className="min-h-screen bg-white">
      {/* 顶部导航 */}
      <header
        ref={headerRef}
        className="sticky top-0 z-10 border-b border-gray-200/90 bg-white/95 px-4 py-3 backdrop-blur"
      >
        <div
          className={`mx-auto grid w-full max-w-7xl grid-cols-1 gap-2 sm:items-center ${
            showHeaderSearchBar ? 'sm:grid-cols-[1fr_minmax(16rem,26rem)_1fr]' : 'sm:grid-cols-[1fr_auto]'
          }`}
        >
          {/* 左侧：前进后退按钮 + 标题 */}
          <div className="flex min-w-0 items-center gap-3 sm:justify-self-start">
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              <button
                onClick={goBack}
                disabled={!canGoBack}
                className={`rounded-md p-1.5 transition-colors ${
                  canGoBack
                    ? 'text-gray-600 hover:bg-white hover:text-gray-900'
                    : 'cursor-not-allowed text-gray-300'
                }`}
                title="后退"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={goForward}
                disabled={!canGoForward}
                className={`rounded-md p-1.5 transition-colors ${
                  canGoForward
                    ? 'text-gray-600 hover:bg-white hover:text-gray-900'
                    : 'cursor-not-allowed text-gray-300'
                }`}
                title="前进"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleViewChange('search')}
              className="select-none whitespace-nowrap text-left text-xl text-gray-800 transition-colors hover:text-gray-950"
              title="返回查词页"
            >
              <span className="text-2xl font-black">分义</span>
              <span className="ml-1 font-normal">词典</span>
            </button>
          </div>

          {showHeaderSearchBar && (
            <div className="w-full sm:justify-self-center">
              <SearchBar onWordSelect={handleWordSelect} variant="nav" />
            </div>
          )}

          {/* 右侧：收藏/设置 */}
          <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-self-end">
            <button
              onClick={() => handleViewChange('favorites')}
              className={getTopNavButtonClass(view === 'favorites' && !selectedWordId)}
            >
              我的
            </button>

            <button onClick={() => window.api.openReviewWindow()} className={getTopNavButtonClass(false)}>
              复习
            </button>

            <button onClick={() => window.api.openReadingWindow()} className={getTopNavButtonClass(false)}>
              阅读
            </button>

            <button
              onClick={() => handleViewChange('settings')}
              className={getTopNavButtonClass(view === 'settings')}
            >
              设置
            </button>
          </div>
        </div>
      </header>

      {/* 主内容区 - 移除 max-w-4xl 限制，FavoriteList 全宽显示 */}
      <main className="w-full">

        {isSearchHome && (
          <div
            className="mx-auto box-border max-w-4xl px-6 pb-6"
            style={{ minHeight: searchPageMinHeight, paddingTop: searchPagePaddingTop }}
          >
            <SearchBar 
              key={pendingSearchQuery} 
              onWordSelect={handleWordSelect} 
              initialQuery={pendingSearchQuery}
              variant="page"
            />
          </div>
        )}

        {selectedWordId && (
          <div className="max-w-4xl mx-auto p-6">
            <WordEntry 
              wordId={selectedWordId} 
              selectedEntryHeadword={selectedEntryHeadword || undefined}
              onBack={handleBack} 
              displayMode={displayMode}
              onNavigate={handleWordSelect}
              autoPlay={searchAutoPlay}
              autoPlayAccent={searchAutoPlayAccent}
            />
          </div>
        )}

        {/* FavoriteList 始终挂载，仅控制显示隐藏以保持状态 */}
        <div className={view === 'favorites' && !selectedWordId ? 'contents' : 'hidden'}>
           <FavoriteList 
             key={favoritesRefreshKey}
             displayMode={displayMode} 
             onWordSelect={handleWordSelect}
           />
        </div>

        {view === 'settings' && !selectedWordId && (
          <div className="max-w-6xl mx-auto p-6">
            <Settings 
              displayMode={displayMode}
              setDisplayMode={setDisplayMode}
              reviewAutoPlay={reviewAutoPlay}
              setReviewAutoPlay={setReviewAutoPlay}
              reviewAutoPlayAccent={reviewAutoPlayAccent}
              setReviewAutoPlayAccent={setReviewAutoPlayAccent}
              tagModeConfigs={tagModeConfigs}
              setTagModeConfigs={setTagModeConfigs}
              searchAutoPlay={searchAutoPlay}
              setSearchAutoPlay={setSearchAutoPlay}
              searchAutoPlayAccent={searchAutoPlayAccent}
              setSearchAutoPlayAccent={setSearchAutoPlayAccent}
              readingAutoPlay={readingAutoPlay}
              setReadingAutoPlay={setReadingAutoPlay}
              readingAutoPlayAccent={readingAutoPlayAccent}
              setReadingAutoPlayAccent={setReadingAutoPlayAccent}
              appVersion={appVersion}
              updateRequestStatus={updateRequestStatus}
              onCheckForAppUpdate={handleCheckForAppUpdate}
            />
          </div>
        )}
      </main>

      {import.meta.env.DEV && (
        <button
          onClick={() => setReviewDebugNoFsrs((prev) => !prev)}
          className={`fixed bottom-4 right-4 z-50 rounded-full border px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur transition-colors ${
            reviewDebugNoFsrs
              ? 'border-amber-500 bg-amber-100/95 text-amber-700 hover:bg-amber-200'
              : 'border-gray-200 bg-white/95 text-gray-600 hover:bg-gray-50'
          }`}
          title="开发模式：开启后复习结果不会写入 FSRS"
        >
          调试FSRS: {reviewDebugNoFsrs ? '不写入' : '正常'}
        </button>
      )}
      {DialogComponent}
    </div>
  )
}

export default App
