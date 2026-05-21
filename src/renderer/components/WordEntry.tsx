import { useState, useEffect } from 'react'
import SenseCard from './SenseCard'
import TagSelector from './TagSelector'
import ManualEntryDialog from './ManualEntryDialog'
import OverflowActionMenu, { type OverflowActionMenuItem } from './OverflowActionMenu'
import { useConfirmDialog } from './ConfirmDialog'
import WordPronunciation from './WordPronunciation'
import ArchiveIcon from './ArchiveIcon'
import { SYSTEM_TAGS, CreateCustomEntryExample } from '../../shared/types'

interface WordEntryProps {
  wordId: number
  selectedEntryHeadword?: string
  onBack: () => void
  displayMode?: 'en' | 'cn' | 'both'
  onNavigate?: (wordId: number, entryHeadword?: string) => void
  readonly?: boolean
  defaultExpandedExamples?: number
  className?: string
  hideHeader?: boolean
  autoPlay?: boolean
  autoPlayAccent?: 'uk' | 'us'
}

interface Tag {
  id: number
  name: string
  color: string
}

interface WordData {
  id: number
  headword: string
  phon_uk?: string
  phon_us?: string
  definition_html: string
  tags?: Tag[]
  note?: string
}

interface SenseData {
  id: number
  sense_index: number
  sense_group?: string
  sense_group_cn?: string
  grammar?: string
  definition: string
  definition_cn?: string
  examples: string
  raw_html: string
  is_favorited: number
  favorite_note?: string
  tags: Tag[]
}

interface EditingCustomSenseState {
  senseId: number
  headword: string
  definitionCn: string
  note?: string
  examples: CreateCustomEntryExample[]
}

interface RedirectTarget {
  displayHeadword: string
  lookupHeadword: string
}

function decodeStoredCustomEntryText(value: string): string {
  const normalizedValue = value.replace(/<br\s*\/?>/gi, '\n')

  if (typeof document === 'undefined') {
    return normalizedValue
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
  }

  const textarea = document.createElement('textarea')
  textarea.innerHTML = normalizedValue
  return textarea.value
}

function parseCustomEntryExamples(examplesJson: string): CreateCustomEntryExample[] {
  try {
    const rawExamples = JSON.parse(examplesJson || '[]') as Array<string | { en?: string; cn?: string }>
    if (!Array.isArray(rawExamples)) {
      return []
    }

    return rawExamples
      .map((example) => {
        if (typeof example === 'string') {
          return {
            en: decodeStoredCustomEntryText(example),
            cn: ''
          }
        }

        return {
          en: decodeStoredCustomEntryText(typeof example.en === 'string' ? example.en : ''),
          cn: decodeStoredCustomEntryText(typeof example.cn === 'string' ? example.cn : '')
        }
      })
      .filter((example) => example.en !== '' || example.cn !== '')
  } catch (error) {
    console.error('Parse custom entry examples failed:', error)
    return []
  }
}

function normalizeRedirectLookupHeadword(rawHeadword: string): string {
  return rawHeadword
    .replace(/^entry:\/\//i, '')
    .split(/[\s<]/)[0]
    .trim()
}

function getRedirectDisplayHeadword(lookupHeadword: string): string {
  return lookupHeadword.replace(/_\d+$/, '').trim()
}

function extractRedirectTargetFromDefinitionHtml(
  definitionHtml: string | null | undefined
): RedirectTarget | null {
  if (!definitionHtml) {
    return null
  }

  const trimmedDefinitionHtml = definitionHtml.trim()
  if (!trimmedDefinitionHtml) {
    return null
  }

  const directRedirectMatch = trimmedDefinitionHtml.match(/^@@@LINK=([^\s<]+)/i)
  if (directRedirectMatch?.[1]) {
    const lookupHeadword = normalizeRedirectLookupHeadword(directRedirectMatch[1])
    if (!lookupHeadword) {
      return null
    }

    return {
      displayHeadword: getRedirectDisplayHeadword(lookupHeadword),
      lookupHeadword
    }
  }

  if (typeof DOMParser === 'undefined') {
    return null
  }

  const documentParser = new DOMParser()
  const parsedDocument = documentParser.parseFromString(trimmedDefinitionHtml, 'text/html')

  if (parsedDocument.querySelector('.def')) {
    return null
  }

  const redirectCandidates = Array.from(
    parsedDocument.querySelectorAll<HTMLAnchorElement>('a.Ref[href^="entry://"]')
  ).reduce<Map<string, string>>((candidates, link) => {
    const rawLookupHeadword = link.getAttribute('href')
    const lookupHeadword = rawLookupHeadword
      ? normalizeRedirectLookupHeadword(rawLookupHeadword)
      : ''

    if (!lookupHeadword) {
      return candidates
    }

    const displayHeadword =
      link.querySelector('.xh')?.textContent?.trim() ||
      link.textContent?.trim() ||
      getRedirectDisplayHeadword(lookupHeadword)

    candidates.set(lookupHeadword, displayHeadword)
    return candidates
  }, new Map<string, string>())

  if (redirectCandidates.size !== 1) {
    return null
  }

  const [[lookupHeadword, displayHeadword]] = Array.from(redirectCandidates.entries())
  return {
    displayHeadword: displayHeadword || getRedirectDisplayHeadword(lookupHeadword),
    lookupHeadword
  }
}

// 辅助函数：判断是否为习语
function isIdiomGroup(senseGroup?: string): boolean {
  if (!senseGroup) return false
  const g = senseGroup.toLowerCase()
  return g.includes('idiom') || g.includes('phrase')
}

// 辅助函数：推断词性
function inferPos(grammar?: string, senseGroup?: string): string {
  // 如果是习语，返回 'idiom'
  if (isIdiomGroup(senseGroup)) return 'idiom 习语'
  if (!grammar) return 'definitions 释义'
  const g = grammar.toLowerCase()
  // 注意：检测顺序很重要，adverb 需要在 verb 之前检测，因为 adverb 包含 'v'
  if (g.includes('adv') || g === 'adverb') return 'adverb 副词'
  if (g.includes('adj') || g === 'adjective') return 'adjective 形容词'
  if (g.includes('[c]') || g.includes('[u]') || g.includes('noun') || g.includes('plural') || g.includes('sing') || g.includes('countable') || g.includes('uncountable')) return 'noun 名词'
  if (g.includes('[t]') || g.includes('[i]') || g.includes('verb') || g.includes('transitive') || g.includes('intransitive')) return 'verb 动词'
  if (g.includes('prep') || g === 'preposition') return 'preposition 介词'
  if (g.includes('pron') || g === 'pronoun') return 'pronoun 代词'
  if (g.includes('conj') || g === 'conjunction') return 'conjunction 连词'
  if (g.includes('interj') || g === 'exclamation') return 'exclamation 感叹词'
  if (g.includes('det') || g === 'determiner') return 'determiner 限定词'
  if (g.includes('num') || g === 'number') return 'number 数词'
  if (g.includes('modal')) return 'modal 情态动词'
  return 'definitions 释义'
}



function WordEntry({
  wordId,
  selectedEntryHeadword,
  onBack,
  displayMode = 'both',
  onNavigate,
  readonly = false,
  defaultExpandedExamples,
  className,
  hideHeader = false,
  autoPlay = false,
  autoPlayAccent = 'uk'
}: WordEntryProps) {
  const [word, setWord] = useState<WordData | null>(null)
  const [senses, setSenses] = useState<SenseData[]>([])
  const [redirectTarget, setRedirectTarget] = useState<RedirectTarget | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [showTagSelector, setShowTagSelector] = useState(false)
  const [isWordFavoriteSaving, setIsWordFavoriteSaving] = useState(false)
  const [isWordArchiveSaving, setIsWordArchiveSaving] = useState(false)
  const [isWordNoteEditing, setIsWordNoteEditing] = useState(false)
  const [wordNoteDraft, setWordNoteDraft] = useState('')
  const [isWordNoteSaving, setIsWordNoteSaving] = useState(false)
  const [editingCustomSense, setEditingCustomSense] = useState<EditingCustomSenseState | null>(null)
  const [deletingCustomSenseId, setDeletingCustomSenseId] = useState<number | null>(null)
  const [isDeletingCustomWord, setIsDeletingCustomWord] = useState(false)
  const { confirm, DialogComponent } = useConfirmDialog()

  useEffect(() => {
    setIsWordNoteEditing(false)
    setWordNoteDraft('')
    setEditingCustomSense(null)
    setDeletingCustomSenseId(null)
    loadWordData()
  }, [wordId, selectedEntryHeadword])

  const loadWordData = async () => {
    setLoading(true)
    try {
      const [data, wordNoteResult] = await Promise.all([
        window.api.getWordSenses(wordId, selectedEntryHeadword),
        window.api.getWordNote(wordId)
      ])
      
      const wordNote = wordNoteResult.success ? wordNoteResult.note || undefined : undefined
      setWord({ ...data.word, note: wordNote })
      setRedirectTarget(extractRedirectTargetFromDefinitionHtml(data.word.definition_html))

      // 只过滤掉习语，保留其他所有义项
      const validSenses = data.senses.filter((s: SenseData) => {
        const pos = inferPos(s.grammar, s.sense_group)
        return pos !== 'idiom'
      })
      setSenses(validSenses)
    } catch (err) {
      console.error('Failed to load word:', err)
      showError('加载词条失败')
    } finally {
      setLoading(false)
    }
  }

  const handleFavoriteToggle = async (senseId: number, isFavorited: boolean) => {
    if (isFavorited) {
      await window.api.removeFavorite(senseId)
    } else {
      await window.api.addFavorite(senseId)
    }
    // 直接更新状态，避免重新加载导致滚动位置重置
    setSenses(prev => prev.map(s => 
      s.id === senseId ? { ...s, is_favorited: isFavorited ? 0 : 1 } : s
    ))
  }

  const handleWordFavoriteToggle = async () => {
    if (!word || isWordFavoriteSaving) return

    const isWordFavorited = (word.tags || []).some((tag) => tag.name === SYSTEM_TAGS.FAVORITE.name)

    setIsWordFavoriteSaving(true)
    try {
      const allTags = await window.api.getTags()
      const favoriteTag = allTags.find((tag) => tag.name === SYSTEM_TAGS.FAVORITE.name)
      if (!favoriteTag) {
        showError('收藏标签不存在')
        return
      }

      if (isWordFavorited) {
        await window.api.removeEntityTag('word', word.id, favoriteTag.id)
        setWord((previousWord) =>
          previousWord
            ? {
                ...previousWord,
                tags: (previousWord.tags || []).filter((tag) => tag.id !== favoriteTag.id)
              }
            : previousWord
        )
      } else {
        await window.api.addEntityTag('word', word.id, favoriteTag.id)
        setWord((previousWord) => {
          if (!previousWord) return previousWord
          const currentTags = previousWord.tags || []
          const hasFavoriteTag = currentTags.some((tag) => tag.id === favoriteTag.id)
          if (hasFavoriteTag) return previousWord
          return {
            ...previousWord,
            tags: [...currentTags, favoriteTag]
          }
        })
      }
    } catch (error) {
      console.error('Toggle word favorite failed:', error)
      showError('更新词条收藏失败')
    } finally {
      setIsWordFavoriteSaving(false)
    }
  }

  const handleWordArchiveToggle = async () => {
    if (!word || isWordArchiveSaving) return

    const isWordArchived = (word.tags || []).some((tag) => tag.name === SYSTEM_TAGS.ARCHIVED.name)

    setIsWordArchiveSaving(true)
    try {
      const allTags = await window.api.getTags()
      const archivedTag = allTags.find((tag) => tag.name === SYSTEM_TAGS.ARCHIVED.name)
      if (!archivedTag) {
        showError('归档标签不存在')
        return
      }

      if (isWordArchived) {
        await window.api.removeEntityTag('word', word.id, archivedTag.id)
        setWord((previousWord) =>
          previousWord
            ? {
                ...previousWord,
                tags: (previousWord.tags || []).filter((tag) => tag.id !== archivedTag.id)
              }
            : previousWord
        )
      } else {
        await window.api.addEntityTag('word', word.id, archivedTag.id)
        setWord((previousWord) => {
          if (!previousWord) return previousWord
          const currentTags = previousWord.tags || []
          const hasArchivedTag = currentTags.some((tag) => tag.id === archivedTag.id)
          if (hasArchivedTag) return previousWord
          return {
            ...previousWord,
            tags: [...currentTags, archivedTag]
          }
        })
      }
    } catch (error) {
      console.error('Toggle word archive failed:', error)
      showError('更新词条归档失败')
    } finally {
      setIsWordArchiveSaving(false)
    }
  }

  const startWordNoteEditing = () => {
    if (!word) return
    setWordNoteDraft(word.note || '')
    setIsWordNoteEditing(true)
  }

  const cancelWordNoteEditing = () => {
    setWordNoteDraft('')
    setIsWordNoteEditing(false)
  }

  const saveWordNote = async () => {
    if (!word || isWordNoteSaving) return
    const normalizedWordNote = wordNoteDraft.trim()

    setIsWordNoteSaving(true)
    try {
      await window.api.saveWordNote(word.id, normalizedWordNote)
      setWord((previousWord) =>
        previousWord
          ? {
              ...previousWord,
              note: normalizedWordNote || undefined
            }
          : previousWord
      )
      setIsWordNoteEditing(false)
      setWordNoteDraft('')
    } catch (error) {
      console.error('Save word note failed:', error)
      showError('保存词条笔记失败')
    } finally {
      setIsWordNoteSaving(false)
    }
  }

  const deleteWordNote = async () => {
    if (!word || isWordNoteSaving) return

    setIsWordNoteSaving(true)
    try {
      await window.api.deleteWordNote(word.id)
      setWord((previousWord) =>
        previousWord
          ? {
              ...previousWord,
              note: undefined
            }
          : previousWord
      )
      setIsWordNoteEditing(false)
      setWordNoteDraft('')
    } catch (error) {
      console.error('Delete word note failed:', error)
      showError('删除词条笔记失败')
    } finally {
      setIsWordNoteSaving(false)
    }
  }

  const showError = (msg: string) => {
    setErrorMsg(msg)
    setTimeout(() => setErrorMsg(null), 3000)
  }

  const handleRedirect = async () => {
    if (!redirectTarget || !onNavigate) return
    try {
      setLoading(true)
      const targetLookupHeadword = redirectTarget.lookupHeadword.trim()
      const targetDisplayHeadword = redirectTarget.displayHeadword.trim()
      let results = await window.api.searchWord(targetLookupHeadword)

      const findRedirectMatch = (searchResults: any[]) =>
        searchResults.find(
          (result: any) =>
            result.lookupHeadword === targetLookupHeadword ||
            result.headword === targetLookupHeadword ||
            result.headword === targetDisplayHeadword
        )

      let match = findRedirectMatch(results)

      if (!match && targetDisplayHeadword && targetDisplayHeadword !== targetLookupHeadword) {
        results = await window.api.searchWord(targetDisplayHeadword)
        match = findRedirectMatch(results)
      }

      if (match) {
        // 防止跳回自己（死循环）
        if (match.id === wordId) {
          console.warn('Redirect target is same as source')
          const other = results.find(
            (result: any) =>
              result.id !== wordId &&
              (
                result.lookupHeadword === targetLookupHeadword ||
                result.headword === targetLookupHeadword ||
                result.headword === targetDisplayHeadword
              )
          )
          if (other) {
            onNavigate(other.id, other.headword)
          } else {
            showError(`未找到目标词条: "${targetDisplayHeadword || targetLookupHeadword}"`)
          }
        } else {
          onNavigate(match.id, match.headword)
        }
      } else {
        showError(`未找到目标词条: "${targetDisplayHeadword || targetLookupHeadword}"`)
      }
    } catch (e) {
      console.error('Redirect failed', e)
      showError('重定向失败')
    } finally {
      setLoading(false)
    }
  }

  const toggleGroup = (groupTitle: string) => {
    const newCollapsed = new Set(collapsedGroups)
    if (newCollapsed.has(groupTitle)) {
      newCollapsed.delete(groupTitle)
    } else {
      newCollapsed.add(groupTitle)
    }
    setCollapsedGroups(newCollapsed)
  }

  const openCustomSenseEditor = (sense: SenseData) => {
    if (!word || word.id >= 0 || readonly) {
      return
    }

    setEditingCustomSense({
      senseId: sense.id,
      headword: word.headword,
      definitionCn: sense.definition_cn || '',
      note: sense.favorite_note,
      examples: parseCustomEntryExamples(sense.examples)
    })
  }

  const closeCustomSenseEditor = () => {
    setEditingCustomSense(null)
  }

  const handleCustomSenseUpdated = async () => {
    setEditingCustomSense(null)
    await loadWordData()
  }

  const handleCustomSenseDeleted = async (senseId: number) => {
    if (deletingCustomSenseId !== null) {
      return
    }

    setDeletingCustomSenseId(senseId)
    try {
      const result = await window.api.deleteCustomEntry({ senseId })
      if (!result.success) {
        showError(result.error || '删除手动录入卡片失败')
        return
      }

      setEditingCustomSense((currentEditingSense) =>
        currentEditingSense?.senseId === senseId ? null : currentEditingSense
      )

      if (result.deletedWord) {
        onBack()
        return
      }

      await loadWordData()
    } catch (error) {
      console.error('Delete custom sense failed:', error)
      showError('删除手动录入卡片失败')
    } finally {
      setDeletingCustomSenseId(null)
    }
  }

  const handleCustomWordDelete = async () => {
    if (!word || !isCustomWord || isDeletingCustomWord) {
      return
    }

    const isConfirmed = await confirm({
      title: '删除词条',
      message: '确定要删除这个手动录入词条及其全部释义卡片吗？\n删除后无法恢复。',
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger'
    })

    if (!isConfirmed) {
      return
    }

    setIsDeletingCustomWord(true)
    try {
      const result = await window.api.deleteCustomWord({ wordId: word.id })
      if (!result.success) {
        showError(result.error || '删除手动录入词条失败')
        return
      }

      setEditingCustomSense(null)
      onBack()
    } catch (error) {
      console.error('Delete custom word failed:', error)
      showError('删除手动录入词条失败')
    } finally {
      setIsDeletingCustomWord(false)
    }
  }

  if (loading) {
    return <div className="text-center text-gray-500 py-8">加载中...</div>
  }

  if (!word) {
    return <div className="text-center text-gray-500 py-8">未找到词条</div>
  }

  const wordTags = word.tags || []
  const wordVisibleTags = wordTags.filter(
    (tag) =>
      tag.name !== SYSTEM_TAGS.FAVORITE.name &&
      tag.name !== SYSTEM_TAGS.ARCHIVED.name
  )
  const hasCustomWordTag = wordTags.some(
    (tag) => tag.name !== SYSTEM_TAGS.FAVORITE.name && tag.name !== SYSTEM_TAGS.ARCHIVED.name
  )
  const isWordFavorited = wordTags.some((tag) => tag.name === SYSTEM_TAGS.FAVORITE.name)
  const isWordArchived = wordTags.some((tag) => tag.name === SYSTEM_TAGS.ARCHIVED.name)
  const hasWordNote = !!word.note?.trim()
  const isWordNoteActive = hasWordNote || isWordNoteEditing
  const isCustomWord = word.id < 0
  const wordManagementMenuItems: OverflowActionMenuItem[] =
    !readonly && isCustomWord
      ? [
          {
            key: 'delete-word',
            label: '删除',
            onClick: handleCustomWordDelete,
            disabled: isDeletingCustomWord,
            tone: 'danger'
          }
        ]
      : []

  if (redirectTarget) {
    return (
      <div className="flex flex-col h-full bg-white animate-fade-in">
           {/* 标题 */}
           <div className="mb-6">
               <h1 className="text-3xl font-bold text-gray-900">{word?.headword}</h1>
           </div>
           
           {/* 提示信息 */}
           <div className="text-lg text-gray-600 flex items-center gap-2 pl-1">
              你是不是要找: 
              <button 
                onClick={handleRedirect}
                className="text-teal-600 font-bold hover:underline text-lg"
              >
                 {redirectTarget.displayHeadword}
              </button>
           </div>
      </div>
    )
  }

   // 预处理义项：计算并修正词性
   const processedSenses = senses.map(s => ({
     ...s,
     _inferredPos: inferPos(s.grammar, s.sense_group)
   }))

   // "粘性"词性修正：如果某个义项被识别为默认的"definitions 释义"，且带有用法标签（如 (formal)），则继承上一个义项的词性
   // 只有当我们在特定词性组内时才这样做
   let lastSolidPos: string | null = null
    // 假设 senses 是按 index 排序的。如果不是，最好先 sort 一下 index
    // FIX: 不要按 index 排序，因为这会打乱同形异义词（homographs）的顺序。
    // 应该按 ID 排序（即数据库插入顺序，通常对应原始 HTML 顺序）
    processedSenses.sort((a, b) => a.id - b.id)
    
    processedSenses.forEach(s => {
      // 如果这是一个明确的词性（非默认，非习语），更新 lastSolidPos
      if (s._inferredPos !== 'definitions 释义' && s._inferredPos !== 'idiom 习语') {
        lastSolidPos = s._inferredPos
      }
      // 如果是弱词性（默认），且看起来是用法说明 OR 是无效的'definitions'，尝试继承
      else if (s._inferredPos === 'definitions 释义' && lastSolidPos && (s.grammar?.trim().startsWith('(') || s.grammar?.trim().startsWith('[') || s.grammar?.toLowerCase().includes('definitions'))) {
        s._inferredPos = lastSolidPos
      }
   })

   // 排序
   const sortedSenses = [...processedSenses]
   const POS_ORDER = ['noun 名词', 'verb 动词', 'adjective 形容词', 'adverb 副词', 'preposition 介词', 'definitions 释义', 'idiom 习语']
   
   sortedSenses.sort((a, b) => {
     const posA = a._inferredPos
     const posB = b._inferredPos
     
     if (posA !== posB) {
       const indexA = POS_ORDER.indexOf(posA)
       const indexB = POS_ORDER.indexOf(posB)
       const orderA = indexA === -1 ? 999 : indexA
       const orderB = indexB === -1 ? 999 : indexB
       return orderA - orderB
     }
     
     return a.sense_index - b.sense_index
   })

  // 按分组组织义项，同时记录中文分组名
  // 按推断的词性分组
  interface PosGroup {
    posTitle: string
    senses: SenseData[]
  }
  const posGroups: PosGroup[] = []
  let currentGroup: PosGroup | null = null

  sortedSenses.forEach(sense => {
    const pos = sense._inferredPos
    
    if (!currentGroup || currentGroup.posTitle !== pos) {
      currentGroup = {
        posTitle: pos,
        senses: []
      }
      posGroups.push(currentGroup)
    }
    
    currentGroup.senses.push(sense)
  })

  return (
    <div className={`flex flex-col h-full bg-white relative ${className || ''}`}>
      {/* 错误提示 Toast */}
      {errorMsg && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in pointer-events-none">
          <div className="bg-gray-800/90 backdrop-blur text-white px-6 py-3 rounded-lg shadow-xl flex items-center gap-3">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{errorMsg}</span>
          </div>
        </div>
      )}
      {/* 返回按钮和词头 */}
      {!hideHeader && (
        <div className="flex items-start gap-4 mb-4">

          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-gray-800">{word.headword}</h2>
              <WordPronunciation
                headword={word.headword}
                phonUk={word.phon_uk}
                phonUs={word.phon_us}
                autoPlay={autoPlay}
                autoPlayAccent={autoPlayAccent}
              />

              {/* 单词标签 */}
              <div className="flex items-center gap-1.5 ml-2">
                {wordVisibleTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    {tag.name}
                  </span>
                ))}
                
                {!readonly && (
                  <button
                    onClick={handleWordFavoriteToggle}
                    className={`favorite-btn ${
                      isWordFavorited ? 'active' : 'text-gray-300'
                    } ${isWordFavoriteSaving ? 'opacity-60' : ''}`}
                    title={isWordFavorited ? '取消收藏' : '收藏'}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
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
                )}

                {!readonly && (
                  <button
                    onClick={() => setShowTagSelector(true)}
                    className={`favorite-btn ${
                      hasCustomWordTag ? 'is-tag-active' : 'text-gray-300'
                    }`}
                    title="管理标签"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </button>
                )}

                {!readonly && (
                  <button
                    onClick={handleWordArchiveToggle}
                    className={`favorite-btn ${
                      isWordArchived ? 'is-archive-active' : 'text-gray-300'
                    } ${isWordArchiveSaving ? 'opacity-60' : ''}`}
                    title={isWordArchived ? '取消归档' : '归档'}
                  >
                    <ArchiveIcon className="w-4 h-4" />
                  </button>
                )}

                {!readonly && (
                  <button
                    onClick={() => (isWordNoteEditing ? cancelWordNoteEditing() : startWordNoteEditing())}
                    className={`favorite-btn ${
                      isWordNoteActive ? 'is-note-active' : 'text-gray-300'
                    }`}
                    title="添加/编辑笔记"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
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
                )}

                {wordManagementMenuItems.length > 0 && (
                  <OverflowActionMenu items={wordManagementMenuItems} buttonTitle="管理词条" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!hideHeader && (isWordNoteEditing || hasWordNote) && (
        <div className="mb-4 text-sm">
          {isWordNoteEditing ? (
            <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
              <textarea
                className="w-full bg-transparent resize-none outline-none text-gray-700 min-h-[72px]"
                value={wordNoteDraft}
                onChange={(event) => setWordNoteDraft(event.target.value)}
                placeholder="添加词条笔记..."
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    saveWordNote()
                  }
                }}
              />
              <div className="flex justify-between items-center mt-2">
                <button
                  onClick={deleteWordNote}
                  disabled={isWordNoteSaving || !hasWordNote}
                  className={`text-xs px-2 py-1 ${
                    isWordNoteSaving || !hasWordNote
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-red-500 hover:text-red-700'
                  }`}
                >
                  删除
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={cancelWordNoteEditing}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                  >
                    取消
                  </button>
                  <button
                    onClick={saveWordNote}
                    disabled={isWordNoteSaving}
                    className={`text-xs px-3 py-1 rounded ${
                      isWordNoteSaving
                        ? 'bg-yellow-100 text-yellow-300 cursor-not-allowed'
                        : 'bg-yellow-200 hover:bg-yellow-300 text-yellow-800'
                    }`}
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="group relative text-gray-600 pl-3 py-2 pr-7 border-l-2 border-yellow-400 bg-yellow-50/60 rounded-r">
              <p className="whitespace-pre-wrap">{word.note}</p>
              {!readonly && (
                <button
                  onClick={startWordNoteEditing}
                  className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-yellow-600 hover:bg-yellow-100 transition-all"
                  title="编辑笔记"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 义项列表 */}
      {posGroups.length === 0 ? (
        <div className="text-center py-8 text-gray-400">该分类下没有义项</div>
      ) : (
        <div className="space-y-8">
          {posGroups.map((group) => (
            <div key={group.posTitle}>
              {/* 词性标题：只有当多于一组，或者这组不是通用的"释义"时才显示，或者虽然只有一组但为了清晰也显示 */}
              {(posGroups.length > 1 || group.posTitle !== 'definitions 释义') && (
                <h3 
                  className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors select-none"
                  onClick={() => toggleGroup(group.posTitle)}
                >
                  <span className="w-1.5 h-6 bg-teal-500 rounded-full"></span>
                  {group.posTitle}
                  <svg 
                    className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${collapsedGroups.has(group.posTitle) ? 'rotate-0' : 'rotate-90'}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-sm font-normal text-gray-400 ml-auto bg-gray-100 px-2 py-0.5 rounded-full">
                    {group.senses.length}
                  </span>
                </h3>
              )}
              
              <div className={`grid gap-4 ${displayMode === 'cn' ? 'grid-cols-3' : 'grid-cols-2'} transition-all duration-300 ${collapsedGroups.has(group.posTitle) ? 'hidden' : ''}`}>
                {group.senses.map((sense) => (
                  <div key={sense.id} className="h-full">
                    <SenseCard
                      sense={sense}
                      headword={word.headword}
                      pos={inferPos(sense.grammar, sense.sense_group)}
                      hidePos={false}
                      onEdit={isCustomWord ? () => openCustomSenseEditor(sense) : undefined}
                      editButtonTitle="编辑"
                      onDelete={isCustomWord ? () => handleCustomSenseDeleted(sense.id) : undefined}
                      deleteButtonTitle="删除"
                      isDeleteDisabled={deletingCustomSenseId === sense.id}
                      displayMode={displayMode}
                      onFavoriteToggle={() => handleFavoriteToggle(sense.id, sense.is_favorited === 1)}
                      onNoteChange={(senseId, note) =>
                        setSenses((previousSenses) =>
                          previousSenses.map((item) =>
                            item.id === senseId
                              ? {
                                  ...item,
                                  favorite_note: note || undefined
                                }
                              : item
                          )
                        )
                      }
                      readonly={readonly}
                      maxExamples={defaultExpandedExamples}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {showTagSelector && word && (
        <TagSelector
          wordId={word.id}
          selectedTags={word.tags || []}
          onTagsChange={(newTags) => {
            setWord(prev => prev ? { ...prev, tags: newTags } : null)
          }}
          onClose={() => setShowTagSelector(false)}
        />
      )}
      {editingCustomSense && (
        <ManualEntryDialog
          isOpen={true}
          mode="edit"
          initialData={editingCustomSense}
          onClose={closeCustomSenseEditor}
          onCompleted={handleCustomSenseUpdated}
        />
      )}
      {DialogComponent}
    </div>
  )
}

export default WordEntry
