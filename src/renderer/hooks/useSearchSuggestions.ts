import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchResultItem } from '../../shared/types'

interface UseSearchSuggestionsOptions {
  initialQuery?: string
  enabled?: boolean
  limit: number
  debounceMs: number
  errorLogMessage: string
}

interface UseSearchSuggestionsResult {
  query: string
  normalizedQuery: string
  results: SearchResultItem[]
  loading: boolean
  setQuery: (nextQuery: string) => void
  clearResults: () => void
}

function resultMatchesQuery(result: SearchResultItem, normalizedQuery: string): boolean {
  const normalizedSearchQuery = normalizedQuery.toLowerCase()

  return [
    result.headword,
    result.lookupHeadword,
    result.matchedHeadword
  ].some((headword) => headword?.toLowerCase().startsWith(normalizedSearchQuery))
}

export function useSearchSuggestions({
  initialQuery = '',
  enabled = true,
  limit,
  debounceMs,
  errorLogMessage
}: UseSearchSuggestionsOptions): UseSearchSuggestionsResult {
  const [query, setQueryState] = useState(initialQuery)
  const [resultSnapshot, setResultSnapshot] = useState<{
    query: string
    items: SearchResultItem[]
  }>({ query: initialQuery.trim(), items: [] })
  const [loading, setLoading] = useState(false)
  const requestIdRef = useRef(0)
  const latestQueryRef = useRef(initialQuery)
  const normalizedQuery = query.trim()
  const results = resultSnapshot.query === normalizedQuery ? resultSnapshot.items : []

  const clearResults = useCallback(() => {
    requestIdRef.current += 1
    setResultSnapshot({ query: latestQueryRef.current.trim(), items: [] })
    setLoading(false)
  }, [])

  const setQuery = useCallback((nextQuery: string) => {
    latestQueryRef.current = nextQuery
    setQueryState(nextQuery)
    clearResults()
  }, [clearResults])

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery, setQuery])

  useEffect(() => {
    if (!enabled || normalizedQuery.length === 0) {
      clearResults()
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const timerId = window.setTimeout(async () => {
      setLoading(true)

      try {
        const searchResults = await window.api.searchWord(normalizedQuery, limit)
        if (
          requestIdRef.current !== requestId ||
          latestQueryRef.current.trim() !== normalizedQuery
        ) {
          return
        }

        setResultSnapshot({
          query: normalizedQuery,
          items: searchResults
            .filter((result) => resultMatchesQuery(result, normalizedQuery))
            .slice(0, limit)
        })
      } catch (error) {
        if (requestIdRef.current === requestId) {
          console.error(errorLogMessage, error)
          setResultSnapshot({ query: normalizedQuery, items: [] })
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false)
        }
      }
    }, debounceMs)

    return () => window.clearTimeout(timerId)
  }, [clearResults, debounceMs, enabled, errorLogMessage, limit, normalizedQuery])

  return {
    query,
    normalizedQuery,
    results,
    loading,
    setQuery,
    clearResults
  }
}
