import { useEffect, useMemo, useState } from 'react'
import { SYSTEM_TAGS } from '../../shared/types'
import type { Tag } from '../../shared/types'
import { useBodyScrollLock } from '../utils/scrollLock'

export type BatchTagDialogMode = 'add' | 'remove'

interface BatchTagDialogProps {
  mode: BatchTagDialogMode
  tags: Tag[]
  selectedCount: number
  onConfirm: (selectedTags: Tag[]) => Promise<void>
  onClose: () => void
}

const DEFAULT_BATCH_TAG_COLOR = '#6B7280'

export default function BatchTagDialog({
  mode,
  tags,
  selectedCount,
  onConfirm,
  onClose
}: BatchTagDialogProps) {
  useBodyScrollLock(true)

  const [availableTags, setAvailableTags] = useState<Tag[]>(tags)
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set())
  const [isCreating, setIsCreating] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    setAvailableTags(tags)
  }, [tags])

  const visibleTags = useMemo(() => {
    return availableTags
      .filter((tag) => tag.name !== SYSTEM_TAGS.FAVORITE.name && tag.name !== SYSTEM_TAGS.ARCHIVED.name)
      .sort((leftTag, rightTag) => leftTag.id - rightTag.id)
  }, [availableTags])

  const selectedTags = useMemo(() => {
    return visibleTags.filter((tag) => selectedTagIds.has(tag.id))
  }, [selectedTagIds, visibleTags])

  const title = mode === 'add' ? '批量添加标签' : '批量删除标签'
  const description =
    mode === 'add'
      ? `给选中的 ${selectedCount} 项添加以下标签`
      : `从选中的 ${selectedCount} 项移除以下标签`
  const confirmText = mode === 'add' ? '添加标签' : '删除标签'

  const toggleTag = (tagId: number) => {
    setErrorMessage('')
    setSelectedTagIds((previousTagIds) => {
      const nextTagIds = new Set(previousTagIds)
      if (nextTagIds.has(tagId)) {
        nextTagIds.delete(tagId)
      } else {
        nextTagIds.add(tagId)
      }
      return nextTagIds
    })
  }

  const handleCreateTag = async () => {
    const normalizedTagName = newTagName.trim()
    if (!normalizedTagName) return

    const existingTag = visibleTags.find((tag) => tag.name === normalizedTagName)
    if (existingTag) {
      setSelectedTagIds((previousTagIds) => new Set([...previousTagIds, existingTag.id]))
      setNewTagName('')
      setIsCreating(false)
      return
    }

    setErrorMessage('')
    try {
      const createdTag = await window.api.createTag(normalizedTagName, DEFAULT_BATCH_TAG_COLOR)
      setAvailableTags((previousTags) => [...previousTags, createdTag])
      setSelectedTagIds((previousTagIds) => new Set([...previousTagIds, createdTag.id]))
      setNewTagName('')
      setIsCreating(false)
    } catch (error) {
      console.error('Create batch tag failed:', error)
      setErrorMessage('创建标签失败，请重试')
    }
  }

  const handleConfirm = async () => {
    if (selectedTags.length === 0) {
      setErrorMessage('请至少选择一个标签')
      return
    }

    setIsSaving(true)
    setErrorMessage('')
    try {
      await onConfirm(selectedTags)
      onClose()
    } catch (error) {
      console.error('Batch tag operation failed:', error)
      setErrorMessage('批量标签操作失败，请重试')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl p-4 w-80 max-h-[85vh] flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3 flex-shrink-0">
          <div>
            <h3 className="font-medium text-gray-800">{title}</h3>
            <p className="text-xs text-gray-400 mt-1">{description}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={isSaving}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 mb-3">
          <div className="space-y-1 mb-3">
            {visibleTags.map((tag) => {
              const isSelected = selectedTagIds.has(tag.id)
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                    isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                  disabled={isSaving}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color || DEFAULT_BATCH_TAG_COLOR }}
                  />
                  <span className="flex-1 text-left text-sm">{tag.name}</span>
                  {isSelected && (
                    <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4A1 1 0 014.707 9.293L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              )
            })}
            {visibleTags.length === 0 && (
              <div className="text-center text-gray-400 py-4 text-sm">暂无可用标签</div>
            )}
          </div>

          {mode === 'add' && (
            isCreating ? (
              <div className="space-y-2 p-1">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(event) => setNewTagName(event.target.value)}
                  placeholder="输入名称，回车创建"
                  className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                  autoFocus
                  disabled={isSaving}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void handleCreateTag()
                    }
                    if (event.key === 'Escape') {
                      setIsCreating(false)
                    }
                  }}
                />
                <button
                  onClick={() => void handleCreateTag()}
                  className="w-full px-3 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                  disabled={isSaving || !newTagName.trim()}
                >
                  创建并选中
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                disabled={isSaving}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                新建标签
              </button>
            )
          )}

          {errorMessage && <div className="mt-3 text-xs text-red-500">{errorMessage}</div>}
        </div>

        <div className="flex gap-3 pt-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
            disabled={isSaving}
          >
            取消
          </button>
          <button
            onClick={() => void handleConfirm()}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-lg transition-colors shadow-sm"
            disabled={isSaving || selectedTags.length === 0}
          >
            {isSaving ? '处理中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
