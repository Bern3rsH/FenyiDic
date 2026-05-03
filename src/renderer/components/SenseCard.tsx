import { useState, useEffect } from 'react'
import { useConfirmDialog } from './ConfirmDialog'
import OverflowActionMenu, { type OverflowActionMenuItem } from './OverflowActionMenu'
import TagSelector from './TagSelector'
import { SYSTEM_TAGS } from '../../shared/types'
import ArchiveIcon from './ArchiveIcon'

interface Example {
  en: string
  cn?: string
}

interface Tag {
  id: number
  name: string
  color: string
}

interface SenseData {
  id: number
  sense_index: number
  grammar?: string
  definition: string
  definition_cn?: string
  examples: string
  is_favorited: number
  tags: Tag[]
  favorite_note?: string
}

interface SenseCardProps {
  sense: SenseData
  headword: string
  pos?: string
  hidePos?: boolean
  onEdit?: () => void
  editButtonTitle?: string
  onDelete?: () => Promise<void> | void
  deleteButtonTitle?: string
  isDeleteDisabled?: boolean
  onFavoriteToggle: () => void
  onNoteChange?: (senseId: number, note: string | null) => void
  onTagsChange?: () => void
  displayMode?: 'en' | 'cn' | 'both'
  showHeadword?: boolean
  onHeadwordClick?: () => void
  readonly?: boolean
  maxExamples?: number
  size?: 'default' | 'compact'
}

// 语法术语翻译映射
const GRAMMAR_TRANSLATIONS: Record<string, string> = {
  // 词性
  'noun': '名词',
  'verb': '动词',
  'adjective': '形容词',
  'adverb': '副词',
  'preposition': '介词',
  'conjunction': '连词',
  'pronoun': '代词',
  'determiner': '限定词',
  'exclamation': '感叹词',
  'interjection': '感叹词',
  'modal': '情态动词',
  'modal verb': '情态动词',
  'auxiliary verb': '助动词',
  'linking verb': '系动词',
  'article': '冠词',
  'prefix': '前缀',
  'suffix': '后缀',
  'combining form': '构词成分',
  'abbreviation': '缩写',
  'symbol': '符号',
  'number': '数词',
  // 名词相关 - 带方括号的完整格式
  '[countable]': '可数名词',
  '[uncountable]': '不可数名词',
  '[countable, uncountable]': '可数/不可数名词',
  '[uncountable, countable]': '不可数/可数名词',
  '[singular]': '单数形式',
  '[plural]': '复数形式',
  '[countable, usually singular]': '可数，通常用单数',
  '[countable, usually plural]': '可数，通常用复数',
  '[uncountable, singular]': '不可数，用单数',
  '[usually singular]': '通常用单数',
  '[usually plural]': '通常用复数',
  '[countable + singular or plural verb]': '可数，可接单复数动词',
  '[singular + singular or plural verb]': '单数形式，可接单复数动词',
  // 名词相关 - 简写
  '[C]': '可数名词',
  '[U]': '不可数名词',
  '[C, U]': '可数/不可数名词',
  '[U, C]': '不可数/可数名词',
  'countable': '可数名词',
  'uncountable': '不可数名词',
  'plural': '复数形式',
  'singular': '单数形式',
  // 动词相关 - 带方括号的完整格式
  '[transitive]': '及物动词',
  '[intransitive]': '不及物动词',
  '[transitive, intransitive]': '及物/不及物动词',
  '[intransitive, transitive]': '不及物/及物动词',
  '[usually passive]': '通常用被动语态',
  '[often passive]': '常用被动语态',
  '[transitive, usually passive]': '及物，通常用被动',
  '[intransitive, usually passive]': '不及物，通常用被动',
  '[no passive]': '无被动形式',
  '[linking verb]': '系动词',
  '[modal verb]': '情态动词',
  'phrasal verb': '短语动词',
  '[phrasal verb]': '短语动词',
  // 动词相关 - 简写
  '[T]': '及物动词',
  '[I]': '不及物动词',
  '[T, I]': '及物/不及物动词',
  '[I, T]': '不及物/及物动词',
  'transitive': '及物动词',
  'intransitive': '不及物动词',
  'passive': '被动语态',
  '[+ obj]': '带宾语',
  '[no obj]': '不带宾语',
  '[+ adv./prep.]': '带副词/介词',
  '[+ to infinitive]': '带不定式',
  '[+ ing]': '带动名词',
  '[+ that]': '带that从句',
  '[+ wh-]': '带wh-从句',
  '[+ speech]': '带直接引语',
  '[+ two objects]': '带双宾语',
  // 形容词相关
  '[only before noun]': '只用于名词前',
  '[usually before noun]': '通常用于名词前',
  '[not before noun]': '不用于名词前',
  '[after noun]': '用于名词后',
  '[only after noun]': '只用于名词后',
  '[not usually before noun]': '通常不用于名词前',
  '[after verb]': '用于动词后',
  '[attributive]': '作定语',
  '[predicative]': '作表语',
  // 比较级相关
  'comparative': '比较级',
  'superlative': '最高级',
  '[comparative]': '比较级',
  '[superlative]': '最高级',
  // 用法标签 - 带括号
  '(informal)': '非正式',
  '(formal)': '正式',
  '(spoken)': '口语',
  '(written)': '书面语',
  '(literary)': '文学用语',
  '(figurative)': '比喻义',
  '(specialist)': '专业术语',
  '(formal or specialist)': '正式或专业',
  '(informal or specialist)': '非正式或专业',
  '(formal, specialist)': '正式，专业',
  '(formal or literary)': '正式或文学',
  '(informal, spoken)': '非正式，口语',
  '(formal, written)': '正式，书面',
  '(technical)': '技术用语',
  '(old-fashioned)': '过时用语',
  '(old use)': '古语',
  '(archaic)': '古语',
  '(dated)': '过时',
  '(British English)': '英式英语',
  '(North American English)': '美式英语',
  '(US English)': '美式英语',
  '(American English)': '美式英语',
  '(Scottish English)': '苏格兰英语',
  '(Irish English)': '爱尔兰英语',
  '(Australian English)': '澳大利亚英语',
  '(South African English)': '南非英语',
  '(Indian English)': '印度英语',
  '(especially British English)': '尤用于英式英语',
  '(especially North American English)': '尤用于美式英语',
  '(especially US English)': '尤用于美式英语',
  '(especially American English)': '尤用于美式英语',
  '(British English, informal)': '英式英语，非正式',
  '(North American English, informal)': '美式英语，非正式',
  '(US English, informal)': '美式英语，非正式',
  '(humorous)': '幽默用法',
  '(ironic)': '讽刺用法',
  '(euphemistic)': '委婉语',
  '(disapproving)': '贬义',
  '(often disapproving)': '常含贬义',
  '(approving)': '褒义',
  '(offensive)': '冒犯性用语',
  '(taboo)': '禁忌语',
  '(vulgar)': '粗俗语',
  '(slang)': '俚语',
  '(dialect)': '方言',
  '(rare)': '罕见',
  '(saying)': '谚语',
  '(proverb)': '谚语',
  '(trademark)': '商标',
  // 学科领域 - 带括号
  '(computing)': '计算机',
  '(computing': '计算机',
  '(law)': '法律',
  '(law': '法律',
  '(medical)': '医学',
  '(medical': '医学',
  '(medicine)': '医学',
  '(music)': '音乐',
  '(music': '音乐',
  '(biology)': '生物学',
  '(biology': '生物学',
  '(chemistry)': '化学',
  '(chemistry': '化学',
  '(physics)': '物理学',
  '(physics': '物理学',
  '(business)': '商业',
  '(business': '商业',
  '(finance)': '金融',
  '(finance': '金融',
  '(sport)': '体育',
  '(sport': '体育',
  '(sports)': '体育',
  '(psychology)': '心理学',
  '(psychology': '心理学',
  '(mathematics)': '数学',
  '(maths)': '数学',
  '(geometry)': '几何学',
  '(architecture)': '建筑学',
  '(art)': '艺术',
  '(literature)': '文学',
  '(philosophy)': '哲学',
  '(religion)': '宗教',
  '(politics)': '政治',
  '(economics)': '经济学',
  '(geography)': '地理学',
  '(history)': '历史',
  '(linguistics)': '语言学',
  '(grammar)': '语法',
  '(phonetics)': '语音学',
  '(anatomy)': '解剖学',
  '(astronomy)': '天文学',
  '(ecology)': '生态学',
  '(agriculture)': '农业',
  '(military)': '军事',
  '(nautical)': '航海',
  '(aviation)': '航空',
  '(cooking)': '烹饪',
  '(theatre)': '戏剧',
  '(cinema)': '电影',
  '(broadcasting)': '广播',
  '(journalism)': '新闻',
  // 不带括号的版本
  'informal': '非正式',
  'formal': '正式',
  'spoken': '口语',
  'written': '书面语',
  'literary': '文学用语',
  'figurative': '比喻义',
  'literal': '字面义',
  'specialist': '专业术语',
  'technical': '技术用语',
  'old-fashioned': '过时用语',
  'British English': '英式英语',
  'North American English': '美式英语',
  'US English': '美式英语',
  'American English': '美式英语',
  'especially British English': '尤用于英式英语',
  'especially North American English': '尤用于美式英语',
  'especially US English': '尤用于美式英语',
  'especially American English': '尤用于美式英语',
  'humorous': '幽默用法',
  'disapproving': '贬义',
  'approving': '褒义',
  'offensive': '冒犯性用语',
  'taboo': '禁忌语',
  'slang': '俚语',
  'dialect': '方言',
  'rare': '罕见',
  'saying': '谚语',
  'computing': '计算机',
  'law': '法律',
  'medical': '医学',
  'medicine': '医学',
  'music': '音乐',
  'biology': '生物学',
  'chemistry': '化学',
  'physics': '物理学',
  'business': '商业',
  'finance': '金融',
  'sport': '体育',
  'sports': '体育',
  'psychology': '心理学',
  'mathematics': '数学',
  'maths': '数学',
  'math': '数学',
  'geometry': '几何学',
  'architecture': '建筑学',
  'art': '艺术',
  'literature': '文学',
  'philosophy': '哲学',
  'religion': '宗教',
  'politics': '政治',
  'economics': '经济学',
  'geography': '地理学',
  'history': '历史',
  'linguistics': '语言学',
  'grammar': '语法',
  'anatomy': '解剖学',
  'astronomy': '天文学',
  'ecology': '生态学',
  'agriculture': '农业',
  'military': '军事',
  'nautical': '航海',
  'aviation': '航空',
  'cooking': '烹饪',
  'theatre': '戏剧',
  'theater': '戏剧',
  'cinema': '电影',
  'film': '电影',
  'broadcasting': '广播',
  'journalism': '新闻',
  'also': '也作',
  'also known as': '也称',
  '(British English also)': '英式英语，亦作',
}

// 解析语法字符串，为每个术语添加悬浮提示
function GrammarWithTooltip({ grammar }: { grammar: string }) {
  // 将语法字符串分割成独立的部分
  // 匹配 [xxx], (xxx) 以及普通文本
  const parts = grammar.match(/\[[^\]]+\]|\([^)]+\)|[^[\]()]+/g) || [grammar]
  
  return (
    <>
      {parts.map((part, idx) => {
        // Normalize whitespace: replace non-breaking spaces and newlines with standard space
        const normalized = part.replace(/\s+/g, ' ')
        const trimmed = normalized.trim()
        
        if (!trimmed) return <span key={idx}>{part}</span>
        
        // 查找翻译（先精确匹配，再不区分大小写匹配）
        let translation = GRAMMAR_TRANSLATIONS[trimmed]
        if (!translation) {
          // 尝试不区分大小写
          const lowerPart = trimmed.toLowerCase()
          for (const [key, value] of Object.entries(GRAMMAR_TRANSLATIONS)) {
            if (key.toLowerCase() === lowerPart) {
              translation = value
              break
            }
          }
        }
        
        if (translation) {
          return (
            <span key={idx} className="relative group cursor-help">
              {part}
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-gray-800/90 text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {translation}
              </span>
            </span>
          )
        }
        
        return <span key={idx}>{part}</span>
      })}
    </>
  )
}

// 词性显示组件：英文词性 + 中文悬浮提示
function PosWithTooltip({ pos }: { pos: string }) {
  // 词性格式为 "english 中文"，例如 "noun 名词"
  const parts = pos.split(' ')
  if (parts.length < 2) {
    return <span>{pos}</span>
  }
  
  const englishPart = parts[0]
  const chinesePart = parts.slice(1).join(' ')
  
  return (
    <span className="relative group cursor-help">
      {englishPart}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-gray-800/90 text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        {chinesePart}
      </span>
    </span>
  )
}

function SenseCard({
  sense,
  headword,
  pos,
  hidePos,
  onEdit,
  editButtonTitle = '编辑卡片',
  onDelete,
  deleteButtonTitle = '删除卡片',
  isDeleteDisabled = false,
  onFavoriteToggle,
  onNoteChange,
  onTagsChange,
  displayMode = 'both',
  showHeadword = false,
  onHeadwordClick,
  readonly = false,
  maxExamples,
  size = 'default'
}: SenseCardProps) {
  const [showExamples, setShowExamples] = useState(false)
  const [note, setNote] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [tags, setTags] = useState<Tag[]>(sense.tags || [])
  const [showTagSelector, setShowTagSelector] = useState(false)
  const [isArchiveSaving, setIsArchiveSaving] = useState(false)
  const { confirm, DialogComponent } = useConfirmDialog()

  // TTS 朗读文本
  const speakText = async (text: string) => {
    // 移除 HTML 标签
    const cleanText = text.replace(/<[^>]*>/g, '')
    
    // 尝试使用 Edge TTS
    try {
      const result = await window.api.getTtsAudio(cleanText)
      
      if (result.success && result.data) {
        try {
          // Convert base64 to Blob
          const binaryString = window.atob(result.data)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          const blob = new Blob([bytes], { type: result.mimeType || 'audio/mpeg' })
          const url = URL.createObjectURL(blob)
          
          const audio = new Audio(url)
          
          audio.onended = () => URL.revokeObjectURL(url)
          audio.onerror = (e) => console.error('Audio playback error:', e)
          
          await audio.play()
          return
        } catch (playErr) {
          console.warn('Frontend playback failed:', playErr)
        }
      }
    } catch (err) {
      console.warn('Edge TTS failed, falling back to local TTS', err)
    }

    // 降级到本地 TTS
    const utterance = new SpeechSynthesisUtterance(cleanText)
    utterance.lang = 'en-US'
    utterance.rate = 0.9
    speechSynthesis.cancel()
    speechSynthesis.speak(utterance)
  }

  // 从数据库加载笔记
  useEffect(() => {
    const loadNote = async () => {
      try {
        const result = await window.api.getNote(sense.id)
        if (result.success && result.note) {
          setNote(result.note)
        } else if (sense.favorite_note) {
          setNote(sense.favorite_note)
        }
      } catch (e) {
        console.error('Failed to load note', e)
        if (sense.favorite_note) {
          setNote(sense.favorite_note)
        }
      }
    }
    loadNote()
  }, [sense.id, sense.favorite_note])

  // 同步标签状态
  useEffect(() => {
    setTags(sense.tags || [])
  }, [sense.tags])

  const startEditing = () => {
    setEditValue(note)
    setIsEditing(true)
  }

  const saveNote = async () => {
    const val = editValue.trim()
    setNote(val)
    setIsEditing(false)
    
    try {
      await window.api.saveNote(sense.id, val)
      onNoteChange?.(sense.id, val || null)
    } catch (e) {
      console.error('Failed to save note', e)
    }
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditValue('')
  }

  // 兼容新旧格式：新格式为 {en, cn} 对象，旧格式为纯字符串
  const rawExamples = JSON.parse(sense.examples || '[]')
  const examples: Example[] = rawExamples.map((ex: string | Example) =>
    typeof ex === 'string' ? { en: ex } : ex
  )
  const isFavorited = sense.is_favorited === 1
  const isArchived = tags.some((tag) => tag.name === SYSTEM_TAGS.ARCHIVED.name)
  const hasCustomTag = tags.some(
    (tag) => tag.name !== SYSTEM_TAGS.FAVORITE.name && tag.name !== SYSTEM_TAGS.ARCHIVED.name
  )
  const isNoteActive = !!note || isEditing
  const isIdiom = pos === 'idiom'
  const isCompact = size === 'compact'

  // 判断 grammar 是否只是基础词性（会和 pos 重复）
  const BASIC_POS = ['adjective', 'noun', 'verb', 'adverb', 'preposition', 'pronoun', 'conjunction', 'exclamation', 'determiner', 'number', 'modal']
  const isBasicPosOnly = sense.grammar && BASIC_POS.includes(sense.grammar.toLowerCase().trim())
  // 只有当 grammar 包含更多信息时才显示（如 [countable]、informal 等）
  const showGrammar = sense.grammar && !isBasicPosOnly

  // 如果我们要显示 grammar，且 grammar 本身就已经包含了词性信息（例如 'noun [C]' 包含了 'noun'），
  // 那么我们就不需要再显示那个简略的 pos 标签了，以避免重复（如显示 "noun" 和 "noun [C]"）。
  // 提取 pos 的英文部分（pos 格式通常为 "noun 名词"）
  const posEng = pos ? pos.split(' ')[0].toLowerCase() : ''
  const grammarStartsWithPos = showGrammar && sense.grammar && sense.grammar.toLowerCase().trim().startsWith(posEng)
  
  const showPos = !hidePos && pos && pos !== 'definitions 释义' && !grammarStartsWithPos

  const handleArchiveToggle = async () => {
    if (isArchiveSaving) return

    setIsArchiveSaving(true)
    try {
      const allTags = await window.api.getTags()
      const archivedTag = allTags.find((tag) => tag.name === SYSTEM_TAGS.ARCHIVED.name)
      if (!archivedTag) {
        console.error('Archived tag does not exist')
        return
      }

      if (isArchived) {
        await window.api.removeEntityTag('sense', sense.id, archivedTag.id)
        setTags((previousTags) => previousTags.filter((tag) => tag.id !== archivedTag.id))
      } else {
        await window.api.addEntityTag('sense', sense.id, archivedTag.id)
        setTags((previousTags) => {
          if (previousTags.some((tag) => tag.id === archivedTag.id)) {
            return previousTags
          }
          return [...previousTags, archivedTag]
        })
      }

      onTagsChange?.()
    } catch (error) {
      console.error('Toggle sense archive failed', error)
    } finally {
      setIsArchiveSaving(false)
    }
  }

  const handleDeleteClick = async () => {
    if (!onDelete || isDeleteDisabled) {
      return
    }

    const isConfirmed = await confirm({
      title: '删除卡片',
      message: '确定要删除这张手动录入释义卡片吗？\n删除后无法恢复。',
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger'
    })

    if (!isConfirmed) {
      return
    }

    try {
      await onDelete()
    } catch (error) {
      console.error('Delete sense card failed:', error)
    }
  }

  const managementMenuItems: OverflowActionMenuItem[] = []

  if (onEdit) {
    managementMenuItems.push({
      key: 'edit-sense',
      label: editButtonTitle,
      onClick: onEdit
    })
  }

  if (onDelete) {
    managementMenuItems.push({
      key: 'delete-sense',
      label: deleteButtonTitle,
      onClick: handleDeleteClick,
      disabled: isDeleteDisabled,
      tone: 'danger'
    })
  }

  return (
    <div 
      className={`sense-card h-full flex flex-col ${isIdiom ? 'sense-card-idiom' : ''} relative`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* 单词和词性放在同一行 - 较小显示 */}
              {/* 单词原文：仅在 showHeadword 为 true 时显示（如收藏页），独立一行 */}
              {showHeadword && (
                <div className="mb-1">
                  <span 
                    className={`font-bold text-gray-900 ${isCompact ? 'text-base' : 'text-lg'} ${
                      onHeadwordClick ? 'cursor-pointer hover:text-teal-600 transition-colors' : ''
                    }`}
                    onClick={onHeadwordClick}
                  >
                    {headword}
                  </span>
                </div>
              )}

              {/* 词性和语法 */}
              <div className="flex items-baseline gap-2 mb-1.5">
                {/* 在收藏页显示词性（英文部分），除非 hidePos 为 true */}
                {showPos && (
                  <span className={`${isCompact ? 'text-[11px]' : 'text-xs'} text-gray-400 italic`}>
                    <PosWithTooltip pos={pos!} />
                  </span>
                )}

                {showGrammar && (
                  <span className={`${isCompact ? 'text-[11px]' : 'text-xs'} text-gray-400 italic`}>
                    <GrammarWithTooltip grammar={sense.grammar!} />
                  </span>
                )}
              </div>

              {/* 释义区域 */}
              <div>
                {/* 英文释义 - 主要内容 */}
                {(displayMode === 'en' || displayMode === 'both') && (
                  <p
                    className={`definition text-gray-900 font-semibold ${
                      isCompact ? 'text-base leading-7' : 'text-lg leading-relaxed'
                    }`}
                  >
                    {sense.definition}
                  </p>
                )}

                {/* 中文释义 */}
                {sense.definition_cn && (displayMode === 'cn' || displayMode === 'both') && (
                  <p
                    className={`definition-cn text-gray-700 font-semibold ${
                      isCompact ? 'mt-1.5 text-sm leading-6' : 'mt-1 text-base'
                    }`}
                  >
                    {sense.definition_cn}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 标签显示区域（过滤掉系统预置的收藏标签） */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {tags
              .filter(
                (tag) =>
                  tag.name !== SYSTEM_TAGS.FAVORITE.name &&
                  tag.name !== SYSTEM_TAGS.ARCHIVED.name
              )
              .map((tag) => (
              <span
                key={tag.id}
                className={`inline-flex items-center gap-1 rounded-full font-medium bg-gray-100 text-gray-600 ${
                  isCompact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
                }`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                {tag.name}
              </span>
            ))}
          </div>

          {/* TagSelector 弹窗 */}
          {showTagSelector && (
            <TagSelector
              senseId={sense.id}
              selectedTags={tags}
              onTagsChange={(newTags) => {
                setTags(newTags)
                onTagsChange?.()
              }}
              onClose={() => setShowTagSelector(false)}
            />
          )}

          {/* 笔记显示与编辑区域 */}
          {(note || isEditing) && (
            <div className="mt-3 text-sm">
              {isEditing ? (
                <div className="bg-yellow-50 p-2 rounded border border-yellow-200">
                  <textarea
                    className="w-full bg-transparent resize-none outline-none text-gray-700 min-h-[60px]"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="添加笔记..."
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        saveNote()
                      }
                    }}
                    onFocus={(e) => {
                      const len = e.target.value.length
                      e.target.setSelectionRange(len, len)
                    }}
                  />
                  <div className="flex justify-between items-center mt-2">
                    <button 
                      onClick={() => setEditValue('')}
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                    >
                      清空
                    </button>
                    <div className="flex gap-2">
                      <button 
                        onClick={cancelEditing}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                      >
                        取消
                      </button>
                      <button 
                        onClick={saveNote}
                        className="text-xs bg-yellow-200 hover:bg-yellow-300 text-yellow-800 px-3 py-1 rounded"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div 
                  className="group relative text-gray-600 pl-3 py-1 pr-6 border-l-2 border-yellow-400 bg-yellow-50/50"
                >
                  <p className="whitespace-pre-wrap">
                    {(() => {
                      if (!headword) return note
                      try {
                        const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                        const regex = new RegExp(`(${escapeRegExp(headword)})`, 'gi')
                        return note.split(regex).map((part, i) => 
                          (i % 2 === 1) ? <span key={i} className="font-bold text-yellow-600">{part}</span> : part
                        )
                      } catch (e) {
                        return note
                      }
                    })()}
                  </p>
                  
                  {/* 快速删除按钮 */}
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                        const isConfirmed = await confirm({
                          title: '删除笔记',
                          message: '确定要删除这条笔记吗？',
                          confirmText: '删除',
                          type: 'danger'
                        })
                      
                      if (isConfirmed) {
                        console.log('[SenseCard] Deleting note for sense.id:', sense.id, 'sense:', sense)
                        setNote('')
                        try {
                          await window.api.deleteNote(sense.id)
                          onNoteChange?.(sense.id, null)
                        } catch(err) {
                          console.error(err)
                        }
                      }
                    }}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    title="删除笔记"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 例句显示 */}
          {examples.length > 0 && (
            <>
              {(showExamples || (maxExamples && maxExamples > 0)) && (
                <div className="examples">
                  {/* 计算显示的例句 */}
                  {(() => {
                    const displayList = (showExamples || !maxExamples) 
                      ? examples 
                      : examples.slice(0, maxExamples)
                    
                    return displayList.map((ex, i) => {
                      const hasEnglishExample = ex.en.trim() !== ''
                      const hasChineseExample = typeof ex.cn === 'string' && ex.cn.trim() !== ''

                      return (
                        <div key={i} className="example-item group/ex">
                          {hasEnglishExample && (
                            <div className="flex items-start gap-2">
                              <p className="example flex-1" dangerouslySetInnerHTML={{ __html: ex.en }} />
                              <button
                                onClick={() => speakText(ex.en)}
                                className="opacity-0 group-hover/ex:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500"
                                title="朗读例句"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                </svg>
                              </button>
                            </div>
                          )}
                          {hasChineseExample && <p className="example-cn" dangerouslySetInnerHTML={{ __html: ex.cn }} />}
                        </div>
                      )
                    })
                  })()}
                  
                  {/* 展开更多按钮 (仅在有最大限制且未完全展开时显示) */}
                  {!showExamples && maxExamples && examples.length > maxExamples && (
                    <button 
                      onClick={() => setShowExamples(true)}
                      className="text-xs text-blue-500 hover:text-blue-600 mt-2 flex items-center gap-1"
                    >
                      <span>展开更多例句 ({examples.length - maxExamples})</span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* 右侧操作栏 */}
        {!readonly && (
          <div className="flex flex-col gap-1 ml-2">
            {/* 收藏按钮 */}
            <button
              onClick={onFavoriteToggle}
              className={`favorite-btn ${isFavorited ? 'active' : 'text-gray-300'}`}
              title={isFavorited ? '取消收藏' : '收藏'}
            >
              <svg className="w-4 h-4" fill={isFavorited ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
            </button>

            {/* 标签按钮 */}
            <button
              onClick={() => setShowTagSelector(true)}
              className={`favorite-btn ${hasCustomTag ? 'text-indigo-500 bg-indigo-50' : 'text-gray-300'}`}
              title="管理标签"
            >
              <svg
                className="w-4 h-4"
                fill={hasCustomTag ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </button>

            {/* 归档按钮 */}
            <button
              onClick={handleArchiveToggle}
              disabled={isArchiveSaving}
              className={`favorite-btn ${
                isArchived ? 'text-gray-600 bg-gray-200' : 'text-gray-300'
              } ${isArchiveSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
              title={isArchived ? '取消归档' : '归档'}
            >
              <ArchiveIcon className="w-4 h-4" />
            </button>

            {/* 笔记按钮 */}
            <button
              onClick={isEditing ? () => setIsEditing(false) : startEditing}
              className={`favorite-btn ${isNoteActive ? 'text-yellow-600 bg-yellow-100' : 'text-gray-300'}`}
              title="添加/编辑笔记"
            >
              <svg 
                className="w-4 h-4" 
                fill={isNoteActive ? "currentColor" : "none"} 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            {/* 例句按钮 */}
            {examples.length > 0 && (
              <button
                onClick={() => setShowExamples(!showExamples)}
                className={`favorite-btn ${showExamples ? 'text-blue-500 bg-blue-50' : 'text-gray-300'}`}
                title="查看例句"
              >
                <svg 
                  className={`w-4 h-4 transition-transform duration-200 ${showExamples ? 'rotate-90' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {managementMenuItems.length > 0 && (
              <OverflowActionMenu items={managementMenuItems} buttonTitle="管理卡片" />
            )}
          </div>
        )}
      </div>
      {DialogComponent}
    </div>
  )
}

export default SenseCard
