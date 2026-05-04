// 共享类型定义

export interface Word {
  id: number
  headword: string
  definitionHtml: string
  phon_uk?: string
  phon_us?: string
  tags?: Tag[]
}

export interface Example {
  en: string
  cn?: string
}

export interface Sense {
  id: number
  wordId: number
  senseIndex: number
  group?: string
  grammar?: string
  definition: string
  definitionCn?: string
  examples: Example[]
  rawHtml: string
}

export interface Favorite {
  id: number
  senseId: number
  note?: string
  createdAt: string
}

export interface Tag {
  id: number
  name: string
  color: string
}

export type EntityType = 'sense' | 'word'

export function isEntityType(value: unknown): value is EntityType {
  return value === 'sense' || value === 'word'
}

export interface FavoriteListBaseItem {
  type: EntityType
  entityType: EntityType
  entityId: number
  wordId: number
  headword: string
  tags: Tag[]
  isArchived: boolean
  createdAt: string
}

export interface FavoriteSenseItem extends FavoriteListBaseItem {
  type: 'sense'
  entityType: 'sense'
  senseId: number
  definition: string
  definitionCn?: string
  grammar?: string
  senseGroup?: string
  senseIndex: number
  examples?: string
  isFavorited: boolean
  note?: string
}

export interface FavoriteWordItem extends FavoriteListBaseItem {
  type: 'word'
  entityType: 'word'
  definitionHtml?: string
  note?: string
}

export type FavoriteListItem = FavoriteSenseItem | FavoriteWordItem

export const SYSTEM_TAGS = {
  FAVORITE: { name: '★ 收藏', color: '#EF4444' },
  ARCHIVED: { name: '归档', color: '#6B7280' }
} as const

export const SYSTEM_TAG_NAMES = [
  SYSTEM_TAGS.FAVORITE.name,
  SYSTEM_TAGS.ARCHIVED.name
] as const

export const LEGACY_SYSTEM_TAG_NAMES = ['已归档'] as const

export function isSystemTagName(tagName: string): boolean {
  return (
    (SYSTEM_TAG_NAMES as readonly string[]).includes(tagName) ||
    (LEGACY_SYSTEM_TAG_NAMES as readonly string[]).includes(tagName)
  )
}

// 词典配置类型
export type DictionaryParserType = 'default'

export type ReviewMode = 'read' | 'listen' | 'speak' | 'spell' | 'dictation'

export interface ReviewWordSense {
  id: number
  examples: Example[]
  definition?: string
  definitionCn?: string
}

export interface ReviewQueueBaseItem {
  type: EntityType
  entityType: EntityType
  entityId: number
  wordId: number
  headword: string
  phonUk?: string
  phonUs?: string
  tags?: Tag[]
  fsrsCardId?: number
  fsrsState?: number
  fsrsDue?: string
  reviewMode?: ReviewMode
}

export interface ReviewSenseQueueItem extends ReviewQueueBaseItem {
  type: 'sense'
  entityType: 'sense'
  senseId: number
  definition: string
  definitionCn?: string
  examples: Example[]
  note?: string
}

export interface ReviewWordQueueItem extends ReviewQueueBaseItem {
  type: 'word'
  entityType: 'word'
  definitionHtml?: string
  senses: ReviewWordSense[]
}

export type ReviewQueueItem = ReviewSenseQueueItem | ReviewWordQueueItem

export interface TagModeConfig {
  tagName: string
  mode: ReviewMode | ''
}
export const DEFAULT_TAG_MODE_CONFIGS: TagModeConfig[] = [
  { tagName: '不认识', mode: 'read' },
  { tagName: '听不懂', mode: 'listen' },
  { tagName: '不会读', mode: 'speak' },
  { tagName: '不会拼', mode: 'spell' },
  { tagName: '听写错', mode: 'dictation' }
]

export const DEFAULT_REVIEW_TAG_COLOR = '#3B82F6'

export const DEFAULT_REVIEW_TAGS = DEFAULT_TAG_MODE_CONFIGS.map(({ tagName }) => ({
  name: tagName,
  color: DEFAULT_REVIEW_TAG_COLOR
}))

export interface UserDictionaryConfig {
  id: string
  name: string
  mdxPath: string
  mddPaths: string[]
  parserType: DictionaryParserType
  wordCount: number
  importedAt: string
  isActive: boolean
}

export interface DictionaryImportProgress {
  stage: 'copying' | 'loading' | 'parsing' | 'indexing' | 'done' | 'error'
  current: number
  total: number
  message: string
}

export interface DictionaryStatus {
  hasActiveDictionary: boolean
  activeDictionary?: UserDictionaryConfig
  dictionaries: UserDictionaryConfig[]
}

export interface SearchResultItem {
  id: number
  headword: string
  lookupHeadword?: string
  dict_name: string
}

export interface CreateCustomEntryExample {
  en: string
  cn: string
}

export interface CreateCustomEntryPayload {
  headword: string
  definitionCn: string
  note?: string
  examples?: CreateCustomEntryExample[]
}

export interface CreateCustomEntryResult {
  success: boolean
  wordId?: number
  senseId?: number
  error?: string
}

export interface UpdateCustomEntryPayload {
  senseId: number
  headword: string
  definitionCn: string
  note?: string
  examples?: CreateCustomEntryExample[]
}

export interface UpdateCustomEntryResult {
  success: boolean
  wordId?: number
  senseId?: number
  error?: string
}

export interface DeleteCustomEntryPayload {
  senseId: number
}

export interface DeleteCustomEntryResult {
  success: boolean
  wordId?: number
  senseId?: number
  deletedWord?: boolean
  error?: string
}

export interface DeleteCustomWordPayload {
  wordId: number
}

export interface DeleteCustomWordResult {
  success: boolean
  wordId?: number
  error?: string
}

export interface AppUpdateInfo {
  version: string
  releaseName?: string | null
  releaseNotes?: string | null
  releaseDate?: string | null
}

export interface AppUpdateProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export type AppUpdateCheckResult =
  | {
      status: 'available'
      currentVersion: string
      updateInfo: AppUpdateInfo
    }
  | {
      status: 'not-available'
      currentVersion: string
      updateInfo?: AppUpdateInfo
    }
  | {
      status: 'unsupported'
      currentVersion: string
      reason: string
    }
  | {
      status: 'error'
      currentVersion: string
      error: string
    }

export interface AppUpdateDownloadResult {
  success: boolean
  updateInfo?: AppUpdateInfo
  error?: string
}

export interface AppUpdateInstallResult {
  success: boolean
  error?: string
}

// IPC 通道
export const IPC_CHANNELS = {
  // 搜索
  SEARCH_WORD: 'word:search',
  GET_WORD_SENSES: 'word:getSenses',
  CREATE_CUSTOM_ENTRY: 'customEntry:create',
  UPDATE_CUSTOM_ENTRY: 'customEntry:update',
  DELETE_CUSTOM_ENTRY: 'customEntry:delete',
  DELETE_CUSTOM_WORD: 'customWord:delete',
  GET_ALL_CUSTOM_SENSES: 'customSense:getAll',
  GET_ALL_CUSTOM_WORDS: 'customWord:getAll',

  // 音频
  GET_AUDIO: 'audio:get',

  // 收藏
  ADD_FAVORITE: 'favorite:add',
  REMOVE_FAVORITE: 'favorite:remove',
  GET_FAVORITES: 'favorite:getAll',

  // 标签
  CREATE_TAG: 'tag:create',
  GET_TAGS: 'tag:getAll',
  GET_SENSE_TAGS: 'senseTag:get',
  ADD_ENTITY_TAG: 'entityTag:add',
  REMOVE_ENTITY_TAG: 'entityTag:remove',
  ADD_SENSE_TAG: 'senseTag:add',
  REMOVE_SENSE_TAG: 'senseTag:remove',
  ADD_WORD_TAG: 'wordTag:add',
  REMOVE_WORD_TAG: 'wordTag:remove',
  UPDATE_TAG: 'tag:update',
  DELETE_TAG: 'tag:delete',
  QUICK_ARCHIVE_SENSE: 'archive:quickSense',
  QUICK_ARCHIVE_WORD: 'archive:quickWord',
  
  // 导入
  IMPORT_FAVORITES: 'favorite:import',

  // 批量删除
  REMOVE_FAVORITES_BATCH: 'favorite:removeBatch',
  // 批量更新笔记
  UPDATE_FAVORITES_NOTE_BATCH: 'favorite:updateNoteBatch',
  
  // 笔记（独立存储，与收藏解耦）
  SAVE_NOTE: 'note:save',
  GET_NOTE: 'note:get',
  DELETE_NOTE: 'note:delete',
  SAVE_WORD_NOTE: 'wordNote:save',
  GET_WORD_NOTE: 'wordNote:get',
  DELETE_WORD_NOTE: 'wordNote:delete',

  // 用户设置
  GET_SETTING: 'setting:get',
  SET_SETTING: 'setting:set',

  // 软件更新
  GET_APP_VERSION: 'app:getVersion',
  CHECK_APP_UPDATE: 'appUpdate:check',
  DOWNLOAD_APP_UPDATE: 'appUpdate:download',
  INSTALL_APP_UPDATE: 'appUpdate:install',
  APP_UPDATE_DOWNLOAD_PROGRESS: 'appUpdate:downloadProgress',
  APP_UPDATE_OPEN_CHECK_DIALOG: 'appUpdate:openCheckDialog',

  // 词典管理
  DICTIONARY_CHECK: 'dictionary:check',
  DICTIONARY_IMPORT: 'dictionary:import',
  DICTIONARY_LIST: 'dictionary:list',
  DICTIONARY_DELETE: 'dictionary:delete',
  DICTIONARY_SET_ACTIVE: 'dictionary:setActive',
  DICTIONARY_SELECT_FILE: 'dictionary:selectFile',

  // 复习窗口
  OPEN_REVIEW_WINDOW: 'review:openWindow',
  OPEN_READING_WINDOW: 'reading:openWindow',
  NAVIGATE_TO_WORD: 'review:navigateWord',
  GET_REVIEW_SENSES: 'review:getSenses',
  GET_REVIEW_WORDS: 'review:getWords',

  // FSRS 调度
  FSRS_GET_DUE_ITEMS: 'fsrs:getDueItems',
  FSRS_RECORD_REVIEW: 'fsrs:recordReview',
  FSRS_GET_STATS: 'fsrs:getStats',
} as const

export interface ImportItem {
  headword: string
  note?: string
}
