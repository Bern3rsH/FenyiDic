import { useState, useEffect } from 'react'
import { useConfirmDialog } from './ConfirmDialog'
import { useBodyScrollLock } from '../utils/scrollLock'
import { SYSTEM_TAGS } from '../../shared/types'

interface Tag {
  id: number
  name: string
  color: string
}

interface TagManagerDialogProps {
  onClose: () => void
  onTagsChange?: () => void
}

const DEFAULT_TAG_COLOR = '#6B7280'

export default function TagManagerDialog({ onClose, onTagsChange }: TagManagerDialogProps) {
  useBodyScrollLock(true)

  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [newTagName, setNewTagName] = useState('')
  const [editingTagId, setEditingTagId] = useState<number | null>(null)
  const [editTagName, setEditTagName] = useState('')
  
  const { confirm, DialogComponent } = useConfirmDialog()
  const visibleTags = allTags.filter(
    (tag) =>
      tag.name !== SYSTEM_TAGS.FAVORITE.name &&
      tag.name !== SYSTEM_TAGS.ARCHIVED.name
  )

  useEffect(() => {
    loadTags()
  }, [])

  const loadTags = async () => {
    try {
      const tags = await window.api.getTags()
      // 前端强制按 ID 排序，确保新建的在最后
      tags.sort((a: Tag, b: Tag) => a.id - b.id)
      setAllTags(tags)
    } catch (e) {
      console.error('Failed to load tags', e)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    try {
      await window.api.createTag(newTagName.trim(), DEFAULT_TAG_COLOR)
      setNewTagName('')
      loadTags()
      onTagsChange?.()
    } catch (e) {
      console.error('Failed to create tag', e)
    }
  }

  const handleDeleteTag = async (tag: Tag) => {
    const isConfirmed = await confirm({
      title: '删除标签',
      message: `确定要删除标签 "${tag.name}" 吗？\n这将从所有关联的词条中移除此标签。`,
      confirmText: '删除',
      type: 'danger'
    })

    if (isConfirmed) {
      try {
        await window.api.deleteTag(tag.id)
        loadTags()
        onTagsChange?.()
      } catch (e) {
        console.error('Failed to delete tag', e)
      }
    }
  }

  const startEditing = (tag: Tag) => {
    setEditingTagId(tag.id)
    setEditTagName(tag.name)
  }

  const cancelEditing = () => {
    setEditingTagId(null)
    setEditTagName('')
  }

  const saveEditing = async (id: number) => {
    if (!editTagName.trim()) return

    const targetTag = allTags.find((tag) => tag.id === id)
    if (!targetTag) {
      cancelEditing()
      return
    }

    try {
      await window.api.updateTag(id, editTagName.trim(), DEFAULT_TAG_COLOR)
      setEditingTagId(null)
      loadTags()
      onTagsChange?.()
    } catch (e) {
      console.error('Failed to update tag', e)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-xl p-6 w-96 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h3 className="text-lg font-medium text-gray-800">标签管理</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 标签列表 */}
        <div className="flex-1 overflow-y-auto min-h-0 border rounded-lg border-gray-100 p-1">
          {loading ? (
            <div className="text-center text-gray-400 py-8">加载中...</div>
          ) : visibleTags.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">暂无标签</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {visibleTags.map((tag) => (
                <div key={tag.id} className="flex items-center justify-between p-2 hover:bg-gray-50 group rounded">
                  {editingTagId === tag.id ? (
                     <div className="flex items-center gap-2 flex-1 mr-2">
                       <input
                         type="text"
                         value={editTagName}
                         onChange={e => setEditTagName(e.target.value)}
                         className="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:border-blue-500"
                         autoFocus
                         onKeyDown={e => {
                           if (e.key === 'Enter') saveEditing(tag.id)
                           if (e.key === 'Escape') cancelEditing()
                         }}
                         onClick={e => e.stopPropagation()}
                       />
                       <button onClick={() => saveEditing(tag.id)} className="text-blue-500 hover:text-blue-700">
                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                       </button>
                       <button onClick={cancelEditing} className="text-gray-400 hover:text-gray-600">
                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                       </button>
                     </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-1">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        <span className="text-sm text-gray-700">{tag.name}</span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEditing(tag)}
                          className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                          title="重命名"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>

                        <button
                          onClick={() => handleDeleteTag(tag)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="删除标签"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 新增标签输入框 - 移动到底部 */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 flex-shrink-0">
          <input
            type="text"
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            placeholder="输入新标签名称..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
            onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
          />
          <button
            onClick={handleCreateTag}
            disabled={!newTagName.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            添加
          </button>
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        {DialogComponent}
      </div>
    </div>
  )
}
