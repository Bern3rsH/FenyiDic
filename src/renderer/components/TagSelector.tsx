import { useState, useEffect } from 'react'
import { Check, Plus, Tag, X } from 'lucide-react'
// import { useConfirmDialog } from './ConfirmDialog'
import { useBodyScrollLock } from '../utils/scrollLock'
import { SYSTEM_TAGS } from '../../shared/types'
import type { EntityType } from '../../shared/types'

interface Tag {
  id: number
  name: string
  color: string
}

interface TagSelectorProps {
  senseId?: number
  wordId?: number
  selectedTags: Tag[]
  onTagsChange: (tags: Tag[]) => void
  onClose: () => void
}

// 统一使用灰色
const DEFAULT_TAG_COLOR = '#6B7280'

export default function TagSelector({ senseId, wordId, selectedTags, onTagsChange, onClose }: TagSelectorProps) {
  useBodyScrollLock(true)

  const [allTags, setAllTags] = useState<Tag[]>([])
  const [tempSelectedTags, setTempSelectedTags] = useState<Tag[]>(selectedTags)
  const [isCreating, setIsCreating] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [loading, setLoading] = useState(true)

  // 当外部 selectedTags 变化时，如果未在编辑中，可以同步？(一般不需要，因为是模态框)
  
  useEffect(() => {
    loadTags()
  }, [])

  const loadTags = async () => {
    try {
      const tags = await window.api.getTags()
      setAllTags(tags)
    } catch (e) {
      console.error('Failed to load tags', e)
    } finally {
      setLoading(false)
    }
  }

  const isSelected = (tagId: number) => tempSelectedTags.some(t => t.id === tagId)

  const handleToggleTag = (tag: Tag) => {
    if (isSelected(tag.id)) {
      setTempSelectedTags(prev => prev.filter(t => t.id !== tag.id))
    } else {
      setTempSelectedTags(prev => [...prev, tag])
    }
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    try {
      const newTag = await window.api.createTag(newTagName.trim(), DEFAULT_TAG_COLOR)
      setAllTags([...allTags, newTag])
      // 自动选中新创建的标签
      setTempSelectedTags(prev => [...prev, newTag])
      
      setNewTagName('')
      setIsCreating(false)
    } catch (e) {
      console.error('Failed to create tag', e)
    }
  }

  const handleConfirm = async () => {
    setLoading(true)
    try {
      let finalSelectedTags = [...tempSelectedTags]
      
      // 如果有未创建的标签，先创建它
      if (isCreating && newTagName.trim()) {
        const newTag = await window.api.createTag(newTagName.trim(), DEFAULT_TAG_COLOR)
        setAllTags([...allTags, newTag])
        finalSelectedTags.push(newTag)
        setNewTagName('')
        setIsCreating(false)
      }

      const originalIds = new Set(selectedTags.map(t => t.id))
      const currentIds = new Set(finalSelectedTags.map(t => t.id))

      // 找出需要添加的
      const toAdd = finalSelectedTags.filter(t => !originalIds.has(t.id))
      // 找出需要删除的
      const toRemove = selectedTags.filter(t => !currentIds.has(t.id))

      const targetEntityType: EntityType | null = senseId ? 'sense' : wordId ? 'word' : null
      const targetEntityId = senseId ?? wordId ?? null
      if (!targetEntityType || !targetEntityId) {
        throw new Error('Missing target entity for tag update')
      }

      // 执行 API 操作
      const promises: Promise<any>[] = []
      promises.push(
        ...toAdd.map((tag) => window.api.addEntityTag(targetEntityType, targetEntityId, tag.id))
      )
      promises.push(
        ...toRemove.map((tag) => window.api.removeEntityTag(targetEntityType, targetEntityId, tag.id))
      )
      
      await Promise.all(promises)
      
      onTagsChange(finalSelectedTags)
      onClose()
    } catch (e) {
      console.error('Failed to save tags', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-xl p-4 w-80 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3 flex-shrink-0">
          <h3 className="font-medium text-gray-800">选择标签</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 mb-3">
          {loading && allTags.length === 0 ? (
            <div className="text-center text-gray-400 py-4">加载中...</div>
          ) : (
            <>
              {/* 标签列表 */}
              <div className="space-y-1 mb-3">
                {allTags
                  .filter(
                    (tag) =>
                      tag.name !== SYSTEM_TAGS.FAVORITE.name &&
                      tag.name !== SYSTEM_TAGS.ARCHIVED.name
                  )
                  .sort((leftTag, rightTag) => {
                    return leftTag.id - rightTag.id
                  })
                  .map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => handleToggleTag(tag)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      isSelected(tag.id) 
                        ? 'bg-blue-50 text-blue-700' 
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <Tag className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                    <span className="flex-1 text-left text-sm">{tag.name}</span>
                    {isSelected(tag.id) && (
                      <Check className="h-4 w-4 text-blue-600" aria-hidden="true" />
                    )}
                  </button>
                ))}
                {allTags.length === 0 && (
                  <div className="text-center text-gray-400 py-2 text-sm">暂无标签</div>
                )}
              </div>

              {/* 创建新标签 */}
              {isCreating ? (
                <div className="space-y-3 p-1">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={e => setNewTagName(e.target.value)}
                    placeholder="输入名称，回车创建"
                    className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                    autoFocus
                    onBlur={() => {
                        // 如果失去焦点时输入框为空，则退出创建模式
                        if (!newTagName.trim()) setIsCreating(false)
                    }}
                    onKeyDown={e => {
                        if (e.key === 'Enter') handleCreateTag()
                        if (e.key === 'Escape') setIsCreating(false)
                    }}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  新建标签
                </button>
              )}
            </>
          )}
        </div>

        {/* 底部确定取消按钮 */}
        <div className="flex gap-3 pt-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
