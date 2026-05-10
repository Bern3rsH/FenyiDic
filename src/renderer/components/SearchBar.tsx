import { useState, useEffect, useMemo, useRef } from 'react'
import type { SearchResultItem } from '../../shared/types'
import { useSearchSuggestions } from '../hooks/useSearchSuggestions'
import ManualEntryDialog from './ManualEntryDialog'

interface SearchBarProps {
  onWordSelect: (wordId: number, entryHeadword?: string) => void
  initialQuery?: string
  variant?: 'page' | 'nav'
}

interface HistoryItem {
  id: number
  headword: string
}

const MAX_SEARCH_SUGGESTION_RESULTS = 10
const SEARCH_SUGGESTION_DEBOUNCE_MS = 150
const MANUAL_ENTRY_QUERY_PREVIEW_LENGTH = 24

function buildManualEntryPreview(query: string): string {
  if (query.length <= MANUAL_ENTRY_QUERY_PREVIEW_LENGTH) {
    return query
  }

  return `${query.slice(0, MANUAL_ENTRY_QUERY_PREVIEW_LENGTH)}...`
}

function SearchBar({ onWordSelect, initialQuery = '', variant = 'page' }: SearchBarProps) {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [isNavDropdownOpen, setIsNavDropdownOpen] = useState(false)
  const [isManualEntryDialogOpen, setIsManualEntryDialogOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const {
    query,
    normalizedQuery,
    results,
    loading,
    setQuery: updateQuery,
    clearResults
  } = useSearchSuggestions({
    initialQuery,
    limit: MAX_SEARCH_SUGGESTION_RESULTS,
    debounceMs: SEARCH_SUGGESTION_DEBOUNCE_MS,
    errorLogMessage: 'Search failed:'
  })
  const isNavVariant = variant === 'nav'
  const canCreateManualEntry = normalizedQuery.length > 0
  const manualEntryPreview = buildManualEntryPreview(normalizedQuery)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('search_history')
      if (saved) {
        setHistory(JSON.parse(saved))
      }
    } catch (e) {
      console.error('Failed to load history', e)
    }
  }, [])

  useEffect(() => {
    if (!isNavVariant) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const containerElement = containerRef.current
      if (!containerElement) {
        return
      }

      if (!containerElement.contains(event.target as Node)) {
        setIsNavDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isNavVariant])

  const saveToHistory = (item: HistoryItem) => {
    const newHistory = [item, ...history.filter((historyItem) => !(historyItem.id === item.id && historyItem.headword === item.headword))].slice(0, 50)
    setHistory(newHistory)
    localStorage.setItem('search_history', JSON.stringify(newHistory))
  }

  const handleResultSelect = (result: SearchResultItem) => {
    saveToHistory({ id: result.id, headword: result.headword })
    updateQuery(result.headword)
    setIsNavDropdownOpen(false)
    onWordSelect(result.id, result.headword)
  }

  const handleHistorySelect = (item: HistoryItem) => {
    saveToHistory(item)
    updateQuery(item.headword)
    setIsNavDropdownOpen(false)
    onWordSelect(item.id, item.headword)
  }

  const clearHistory = () => {
    setHistory([])
    localStorage.removeItem('search_history')
  }

  const navPanelShouldShow = useMemo(() => {
    if (!isNavVariant || !isNavDropdownOpen) {
      return false
    }

    return loading || query.length > 0 || history.length > 0
  }, [history.length, isNavDropdownOpen, isNavVariant, loading, query.length])

  const handleInputFocus = () => {
    if (isNavVariant) {
      setIsNavDropdownOpen(true)
    }
  }

  const openManualEntryDialog = () => {
    if (!canCreateManualEntry) {
      return
    }

    setIsNavDropdownOpen(false)
    setIsManualEntryDialogOpen(true)
  }

  const closeManualEntryDialog = () => {
    setIsManualEntryDialogOpen(false)
  }

  const handleCustomEntryCreated = (wordId: number, headword: string) => {
    saveToHistory({ id: wordId, headword })
    updateQuery(headword)
    clearResults()
    setIsManualEntryDialogOpen(false)
    onWordSelect(wordId, headword)
  }

  const searchInputClassName = isNavVariant
    ? 'w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-800 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20'
    : 'search-input'

  return (
    <div ref={containerRef} className="relative">
      {!isNavVariant && (
        <div className="pointer-events-none absolute inset-x-0 -top-16 text-center">
          <h2 className="text-4xl font-semibold tracking-wide text-gray-800">FenyiDic 分义词典</h2>
        </div>
      )}

      <input
        type="text"
        value={query}
        onChange={(e) => updateQuery(e.target.value)}
        onFocus={handleInputFocus}
        placeholder="输入并搜索"
        className={searchInputClassName}
        autoFocus={!isNavVariant}
      />

      {!isNavVariant && loading && (
        <div className="mt-4 text-center text-gray-500">搜索中...</div>
      )}

      {!isNavVariant && !loading && query.length > 0 && results.length > 0 && (
        <div className="mt-4">
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
            {results.map((result) => (
              <li
                key={`${result.id}:${result.lookupHeadword || result.headword}:${result.headword}`}
                onClick={() => handleResultSelect(result)}
                className="flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-teal-50"
              >
                <span className="font-medium text-gray-800">{result.headword}</span>
                <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-400">{result.dict_name}</span>
              </li>
            ))}
          </ul>

          {canCreateManualEntry && (
            <div className="mt-3 flex justify-center">
              <button
                onClick={openManualEntryDialog}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-blue-50 hover:text-blue-700"
              >
                <span>没有想要的？手动录入「{manualEntryPreview}」</span>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {!isNavVariant && !loading && query.length > 0 && results.length === 0 && (
        <div className="mt-12 text-center">
          <div className="mb-3 text-gray-300">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-gray-500">未找到结果</p>

          {canCreateManualEntry && (
            <div className="mt-5 flex justify-center">
              <button
                onClick={openManualEntryDialog}
                className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-5 py-2.5 text-sm font-medium text-blue-700 transition hover:border-blue-200 hover:bg-blue-100"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>词典里没有？手动录入「{manualEntryPreview}」</span>
              </button>
            </div>
          )}
        </div>
      )}

      {!isNavVariant && !loading && query.length === 0 && history.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between px-1">
            <h3 className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              搜索历史
            </h3>
            <button
              onClick={clearHistory}
              className="text-xs text-gray-400 transition-colors hover:text-red-500"
            >
              清空
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.map((item) => (
              <button
                key={item.id}
                onClick={() => handleHistorySelect(item)}
                className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-teal-100 hover:bg-teal-50 hover:text-teal-700"
              >
                {item.headword}
              </button>
            ))}
          </div>
        </div>
      )}

      {isNavVariant && navPanelShouldShow && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl shadow-gray-200/70">
          {loading && <div className="px-4 py-3 text-sm text-gray-500">搜索中...</div>}

          {!loading && query.length > 0 && results.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {results.map((result) => (
                <li
                  key={`${result.id}:${result.lookupHeadword || result.headword}:${result.headword}`}
                  onClick={() => handleResultSelect(result)}
                  className="flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-blue-50"
                >
                  <span className="font-medium text-gray-800">{result.headword}</span>
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-400">{result.dict_name}</span>
                </li>
              ))}
            </ul>
          )}

          {!loading && query.length > 0 && results.length === 0 && (
            <div className="px-4 py-4">
              <div className="mb-3 text-sm text-gray-500">未找到结果</div>
              {canCreateManualEntry && (
                <button
                  onClick={openManualEntryDialog}
                  className="flex w-full items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-100"
                >
                  <div>
                    <div className="text-sm font-medium text-blue-700">词典里没有？手动录入「{manualEntryPreview}」</div>
                    <div className="mt-0.5 text-xs text-blue-600/80">适合词典里没有的短语、句子或自定义释义</div>
                  </div>
                  <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {!loading && query.length > 0 && results.length > 0 && canCreateManualEntry && (
            <button
              onClick={openManualEntryDialog}
              className="flex w-full items-center justify-between border-t border-gray-100 px-4 py-3 text-left text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
            >
              <div>
                <div className="text-sm font-medium">没有想要的？手动录入「{manualEntryPreview}」</div>
                <div className="mt-0.5 text-xs text-gray-400">适合词典里没有的短语、句子或自定义释义</div>
              </div>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}

          {!loading && query.length === 0 && history.length > 0 && (
            <div className="p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-gray-500">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  搜索历史
                </h3>
                <button
                  onClick={clearHistory}
                  className="text-xs text-gray-400 transition-colors hover:text-red-500"
                >
                  清空
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleHistorySelect(item)}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    {item.headword}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ManualEntryDialog
        isOpen={isManualEntryDialogOpen}
        initialHeadword={normalizedQuery}
        onClose={closeManualEntryDialog}
        onCompleted={handleCustomEntryCreated}
      />
    </div>
  )
}

export default SearchBar
