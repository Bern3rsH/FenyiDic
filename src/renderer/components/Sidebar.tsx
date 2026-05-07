import { SYSTEM_TAGS } from '../../shared/types'
import type { EntityType } from '../../shared/types'
import ArchiveIcon from './ArchiveIcon'

interface Tag {
  id: number
  name: string
  color: string
}

interface FilterState {
  showFavorited: boolean
  showWithNote: boolean
  showManualEntry: boolean
  selectedTagIds: Set<number>
}

interface SidebarProps {
  activeTab: EntityType
  entityCounts: {
    sense: number
    word: number
  }
  stats: {
    total: number
    favCount: number
    noteCount: number
    manualEntryCount: number
    tagCounts: Record<number, number>
  }
  tags: Tag[]
  filters: FilterState
  onFilterChange: (newFilters: FilterState) => void
  onTabChange: (nextTab: EntityType) => void
  onManageTags: () => void
  onImport: () => void
  isSelectionMode: boolean
  canToggleSelectionMode: boolean
  onToggleSelectionMode: () => void
}

const SHOW_CSV_IMPORT_BUTTON = false

export default function Sidebar({
  activeTab,
  entityCounts,
  stats,
  tags,
  filters,
  onFilterChange,
  onTabChange,
  onManageTags,
  onImport,
  isSelectionMode,
  canToggleSelectionMode,
  onToggleSelectionMode
}: SidebarProps) {
  const clearFilters = () => {
    onFilterChange({
      showFavorited: false,
      showWithNote: false,
      showManualEntry: false,
      selectedTagIds: new Set()
    })
  }

  const toggleTag = (tagId: number) => {
    if (filters.selectedTagIds.has(tagId) && filters.selectedTagIds.size === 1) {
      return
    }

    onFilterChange({
      showFavorited: false,
      showWithNote: false,
      showManualEntry: false,
      selectedTagIds: new Set([tagId])
    })
  }

  const toggleFavorited = () => {
    if (filters.showFavorited) {
      return
    }

    onFilterChange({
      showFavorited: true,
      showWithNote: false,
      showManualEntry: false,
      selectedTagIds: new Set()
    })
  }

  const toggleWithNote = () => {
    if (filters.showWithNote) {
      return
    }

    onFilterChange({
      showFavorited: false,
      showWithNote: true,
      showManualEntry: false,
      selectedTagIds: new Set()
    })
  }

  const toggleManualEntry = () => {
    if (filters.showManualEntry) {
      return
    }

    onFilterChange({
      showFavorited: false,
      showWithNote: false,
      showManualEntry: true,
      selectedTagIds: new Set()
    })
  }

  const hasActiveFilters =
    filters.showFavorited || filters.showWithNote || filters.showManualEntry || filters.selectedTagIds.size > 0
  const archivedTag = tags.find((tag) => tag.name === SYSTEM_TAGS.ARCHIVED.name)
  const isArchivedSelected = archivedTag ? filters.selectedTagIds.has(archivedTag.id) : false

  const toggleArchived = () => {
    if (!archivedTag) return
    if (filters.selectedTagIds.has(archivedTag.id) && filters.selectedTagIds.size === 1) {
      return
    }
    onFilterChange({
      showFavorited: false,
      showWithNote: false,
      showManualEntry: false,
      selectedTagIds: new Set([archivedTag.id])
    })
  }

  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full flex-shrink-0">
      <div className="p-3 border-b border-gray-200 bg-white">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => onTabChange('sense')}
            className={`w-full px-3 py-2 text-sm rounded-md transition-colors ${
              activeTab === 'sense'
                ? 'bg-white text-blue-700 shadow-sm font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            释义
            <span className="ml-1 text-xs opacity-70">{entityCounts.sense}</span>
          </button>
          <button
            onClick={() => onTabChange('word')}
            className={`w-full px-3 py-2 text-sm rounded-md transition-colors ${
              activeTab === 'word'
                ? 'bg-white text-blue-700 shadow-sm font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            词条
            <span className="ml-1 text-xs opacity-70">{entityCounts.word}</span>
          </button>
        </div>
      </div>

      <div className="p-4 border-b border-gray-100">
        <button
          onClick={clearFilters}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
            !hasActiveFilters
              ? 'bg-blue-100 text-blue-700 font-medium'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <svg
              className={`w-4 h-4 ${!hasActiveFilters ? 'fill-current' : 'fill-none'}`}
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <span>全部条目</span>
          </div>
          <span className="text-xs opacity-60 bg-white/50 px-1.5 rounded-full">{stats.total}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        <div className="space-y-1">
          <button
            onClick={toggleFavorited}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              filters.showFavorited
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg
                className={`w-4 h-4 ${filters.showFavorited ? 'fill-current' : 'fill-none'}`}
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
              <span>收藏</span>
            </div>
            <span className="text-xs opacity-60 bg-white/50 px-1.5 rounded-full">{stats.favCount}</span>
          </button>

          <button
            onClick={toggleWithNote}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              filters.showWithNote
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg
                className={`w-4 h-4 ${filters.showWithNote ? 'fill-current' : 'fill-none'}`}
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
              <span>笔记</span>
            </div>
            <span className="text-xs opacity-60 bg-white/50 px-1.5 rounded-full">{stats.noteCount}</span>
          </button>

          {archivedTag && (
            <button
              onClick={toggleArchived}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                isArchivedSelected
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <ArchiveIcon className="w-4 h-4" />
                <span>归档</span>
              </div>
              <span className="text-xs opacity-60 bg-white/50 px-1.5 rounded-full">
                {stats.tagCounts[archivedTag.id] || 0}
              </span>
            </button>
          )}

          <button
            onClick={toggleManualEntry}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              filters.showManualEntry
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg
                className={`w-4 h-4 ${filters.showManualEntry ? 'fill-current' : 'fill-none'}`}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4m4-6h8a2 2 0 012 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2z"
                />
              </svg>
              <span>手动录入</span>
            </div>
            <span className="text-xs opacity-60 bg-white/50 px-1.5 rounded-full">{stats.manualEntryCount}</span>
          </button>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between px-2 mb-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">标签</h3>
            <button
              onClick={onManageTags}
              className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-200 transition-colors"
              title="管理标签"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          {tags.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">暂无标签</div>
          ) : (
            tags
              .filter((tag) => tag.name !== SYSTEM_TAGS.FAVORITE.name)
              .filter((tag) => tag.name !== SYSTEM_TAGS.ARCHIVED.name)
              .sort((leftTag, rightTag) => leftTag.id - rightTag.id)
              .map((tag) => {
                const isSelected = filters.selectedTagIds.has(tag.id)
                const count = stats.tagCounts[tag.id] || 0
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`w-full flex items-start justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      isSelected
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1 text-left">
                      <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${isSelected ? 'bg-blue-500' : 'bg-gray-300'}`} />
                      <span className="break-all whitespace-normal leading-5">{tag.name}</span>
                    </div>
                    <span className="text-xs opacity-60 bg-white/50 px-1.5 rounded-full ml-2 mt-0.5 flex-shrink-0">{count}</span>
                  </button>
                )
              })
          )}
        </div>
      </div>

      <div className="p-3 border-t border-gray-200">
        {canToggleSelectionMode && (
          <button
            onClick={onToggleSelectionMode}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${
              isSelectionMode
                ? 'bg-indigo-50 text-indigo-600 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {isSelectionMode ? '退出批量管理' : '批量管理'}
          </button>
        )}

        {SHOW_CSV_IMPORT_BUTTON && (
          <button
            onClick={onImport}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            导入 CSV
          </button>
        )}
      </div>
    </div>
  )
}
