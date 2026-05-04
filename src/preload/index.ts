import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  ImportItem,
  DictionaryStatus,
  DictionaryParserType,
  DictionaryImportProgress,
  UserDictionaryConfig,
  EntityType,
  FavoriteListItem,
  FavoriteSenseItem,
  FavoriteWordItem,
  ReviewQueueItem,
  SearchResultItem,
  CreateCustomEntryPayload,
  CreateCustomEntryResult,
  UpdateCustomEntryPayload,
  UpdateCustomEntryResult,
  DeleteCustomEntryPayload,
  DeleteCustomEntryResult,
  DeleteCustomWordPayload,
  DeleteCustomWordResult,
  AppUpdateCheckResult
} from '../shared/types'

export type IpcApi = {
  // 搜索
  searchWord: (query: string, limit?: number) => Promise<SearchResultItem[]>
  getWordSenses: (wordId: number, selectedEntryHeadword?: string) => Promise<{ word: any; senses: any[] }>
  createCustomEntry: (payload: CreateCustomEntryPayload) => Promise<CreateCustomEntryResult>
  updateCustomEntry: (payload: UpdateCustomEntryPayload) => Promise<UpdateCustomEntryResult>
  deleteCustomEntry: (payload: DeleteCustomEntryPayload) => Promise<DeleteCustomEntryResult>
  deleteCustomWord: (payload: DeleteCustomWordPayload) => Promise<DeleteCustomWordResult>
  getAllCustomSenses: () => Promise<FavoriteSenseItem[]>
  getAllCustomWords: () => Promise<FavoriteWordItem[]>

  // 音频
  getAudio: (filename: string) => Promise<{ success: boolean; data?: string; mimeType?: string }>
  getTtsAudio: (text: string) => Promise<{ success: boolean; data?: string; mimeType?: string }>

  // 收藏（通过标签系统实现）
  addFavorite: (senseId: number) => Promise<{ success: boolean }>
  removeFavorite: (senseId: number) => Promise<{ success: boolean }>
  removeFavoritesBatch: (senseIds: number[]) => Promise<{ success: boolean }>
  updateFavoritesNoteBatch: (senseIds: number[], note: string | null) => Promise<{ success: boolean }>
  getFavorites: () => Promise<FavoriteListItem[]>
  importFavorites: (items: ImportItem[]) => Promise<{ success: boolean; count?: number; error?: string }>
  quickArchiveSense: (senseId: number) => Promise<{ success: boolean; error?: string }>
  quickArchiveWord: (wordId: number) => Promise<{ success: boolean; error?: string }>

  // 标签
  createTag: (name: string, color?: string) => Promise<{ id: number; name: string; color: string }>
  getTags: () => Promise<any[]>
  getSenseTags: (senseId: number) => Promise<any[]>
  addEntityTag: (entityType: EntityType, entityId: number, tagId: number) => Promise<{ success: boolean }>
  removeEntityTag: (entityType: EntityType, entityId: number, tagId: number) => Promise<{ success: boolean }>
  /** @deprecated Prefer addEntityTag('sense', senseId, tagId). */
  addSenseTag: (senseId: number, tagId: number) => Promise<{ success: boolean }>
  /** @deprecated Prefer removeEntityTag('sense', senseId, tagId). */
  removeSenseTag: (senseId: number, tagId: number) => Promise<{ success: boolean }>
  /** @deprecated Prefer addEntityTag('word', wordId, tagId). */
  addWordTag: (wordId: number, tagId: number) => Promise<{ success: boolean }>
  /** @deprecated Prefer removeEntityTag('word', wordId, tagId). */
  removeWordTag: (wordId: number, tagId: number) => Promise<{ success: boolean }>
  updateTag: (tagId: number, name: string, color: string) => Promise<{ success: boolean }>
  deleteTag: (tagId: number) => Promise<{ success: boolean }>

  // 笔记（独立存储，与收藏解耦）
  saveNote: (senseId: number, note: string) => Promise<{ success: boolean }>
  getNote: (senseId: number) => Promise<{ success: boolean; note: string | null }>
  deleteNote: (senseId: number) => Promise<{ success: boolean }>
  saveWordNote: (wordId: number, note: string) => Promise<{ success: boolean }>
  getWordNote: (wordId: number) => Promise<{ success: boolean; note: string | null }>
  deleteWordNote: (wordId: number) => Promise<{ success: boolean }>

  // 用户设置
  getSetting: <T>(key: string) => Promise<T>
  setSetting: <T>(key: string, value: T) => Promise<{ success: boolean }>

  // 软件更新
  getAppVersion: () => Promise<string>
  checkForAppUpdate: () => Promise<AppUpdateCheckResult>
  openLatestReleasePage: () => Promise<{ success: boolean; error?: string }>
  onOpenAppUpdateCheckDialog: (callback: () => void) => () => void

  // 词典管理
  checkDictionary: () => Promise<DictionaryStatus>
  selectDictionaryFile: (type: 'mdx' | 'mdd') => Promise<{ success: boolean; canceled?: boolean; filePaths?: string[] }>
  importDictionary: (mdxPath: string, mddPaths: string[], parserType: DictionaryParserType) => Promise<{ success: boolean; config?: UserDictionaryConfig; error?: string }>
  listDictionaries: () => Promise<UserDictionaryConfig[]>
  deleteDictionary: (dictId: string) => Promise<{ success: boolean }>
  setActiveDictionary: (dictId: string) => Promise<{ success: boolean }>
  onDictionaryImportProgress: (callback: (progress: DictionaryImportProgress) => void) => () => void

  // 复习窗口
  openReviewWindow: () => Promise<{ success: boolean }>
  openReadingWindow: () => Promise<{ success: boolean }>
  getReviewSenses: (tagName: string) => Promise<any[]>
  getReviewWords: (tagName: string) => Promise<any[]>
  navigateToWord: (identifier: number | string) => Promise<{ success: boolean; error?: string }>
  onNavigateToWord: (callback: (identifier: number | string) => void) => () => void

  // FSRS 调度
  getFsrsDueItems: (tagName: string) => Promise<ReviewQueueItem[]>
  recordFsrsReview: (cardId: number, rating: 1 | 2 | 3 | 4) => Promise<{ success: boolean; nextDue?: string; scheduledDays?: number; state?: number; error?: string }>
  getFsrsStats: (tagName: string) => Promise<{ total: number; due: number; new: number; learning: number; review: number; relearning: number }>
}

const addEntityTagInternal = (entityType: EntityType, entityId: number, tagId: number) =>
  ipcRenderer.invoke(IPC_CHANNELS.ADD_ENTITY_TAG, entityType, entityId, tagId)

const removeEntityTagInternal = (entityType: EntityType, entityId: number, tagId: number) =>
  ipcRenderer.invoke(IPC_CHANNELS.REMOVE_ENTITY_TAG, entityType, entityId, tagId)

const api: IpcApi = {
  // 搜索
  searchWord: (query, limit) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_WORD, query, limit),
  getWordSenses: (wordId, selectedEntryHeadword) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_WORD_SENSES, wordId, selectedEntryHeadword),
  createCustomEntry: (payload) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_CUSTOM_ENTRY, payload),
  updateCustomEntry: (payload) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CUSTOM_ENTRY, payload),
  deleteCustomEntry: (payload) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_CUSTOM_ENTRY, payload),
  deleteCustomWord: (payload) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_CUSTOM_WORD, payload),
  getAllCustomSenses: () => ipcRenderer.invoke(IPC_CHANNELS.GET_ALL_CUSTOM_SENSES),
  getAllCustomWords: () => ipcRenderer.invoke(IPC_CHANNELS.GET_ALL_CUSTOM_WORDS),

  // 音频
  getAudio: (filename) => ipcRenderer.invoke(IPC_CHANNELS.GET_AUDIO, filename),
  getTtsAudio: (text: string) => ipcRenderer.invoke('getTtsAudio', text),

  // 收藏（通过标签系统实现）
  addFavorite: (senseId) => ipcRenderer.invoke(IPC_CHANNELS.ADD_FAVORITE, senseId),
  removeFavorite: (senseId) => ipcRenderer.invoke(IPC_CHANNELS.REMOVE_FAVORITE, senseId),
  removeFavoritesBatch: (senseIds) => ipcRenderer.invoke(IPC_CHANNELS.REMOVE_FAVORITES_BATCH, senseIds),
  updateFavoritesNoteBatch: (senseIds, note) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_FAVORITES_NOTE_BATCH, senseIds, note),
  getFavorites: () => ipcRenderer.invoke(IPC_CHANNELS.GET_FAVORITES),
  importFavorites: (items) => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_FAVORITES, items),
  quickArchiveSense: (senseId) => ipcRenderer.invoke(IPC_CHANNELS.QUICK_ARCHIVE_SENSE, senseId),
  quickArchiveWord: (wordId) => ipcRenderer.invoke(IPC_CHANNELS.QUICK_ARCHIVE_WORD, wordId),

  // 标签
  createTag: (name, color) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_TAG, name, color),
  getTags: () => ipcRenderer.invoke(IPC_CHANNELS.GET_TAGS),
  getSenseTags: (senseId) => ipcRenderer.invoke(IPC_CHANNELS.GET_SENSE_TAGS, senseId),
  addEntityTag: (entityType, entityId, tagId) => addEntityTagInternal(entityType, entityId, tagId),
  removeEntityTag: (entityType, entityId, tagId) => removeEntityTagInternal(entityType, entityId, tagId),
  addSenseTag: (senseId, tagId) => addEntityTagInternal('sense', senseId, tagId),
  removeSenseTag: (senseId, tagId) => removeEntityTagInternal('sense', senseId, tagId),
  addWordTag: (wordId, tagId) => addEntityTagInternal('word', wordId, tagId),
  removeWordTag: (wordId, tagId) => removeEntityTagInternal('word', wordId, tagId),
  updateTag: (tagId, name, color) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_TAG, tagId, name, color),
  deleteTag: (tagId) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_TAG, tagId),

  // 笔记
  saveNote: (senseId, note) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_NOTE, senseId, note),
  getNote: (senseId) => ipcRenderer.invoke(IPC_CHANNELS.GET_NOTE, senseId),
  deleteNote: (senseId) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_NOTE, senseId),
  saveWordNote: (wordId, note) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_WORD_NOTE, wordId, note),
  getWordNote: (wordId) => ipcRenderer.invoke(IPC_CHANNELS.GET_WORD_NOTE, wordId),
  deleteWordNote: (wordId) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_WORD_NOTE, wordId),

  // 用户设置
  getSetting: (key) => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTING, key),
  setSetting: (key, value) => ipcRenderer.invoke(IPC_CHANNELS.SET_SETTING, key, value),

  // 软件更新
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION),
  checkForAppUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.CHECK_APP_UPDATE),
  openLatestReleasePage: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_LATEST_RELEASE_PAGE),
  onOpenAppUpdateCheckDialog: (callback) => {
    const listener = () => callback()
    ipcRenderer.on(IPC_CHANNELS.APP_UPDATE_OPEN_CHECK_DIALOG, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_UPDATE_OPEN_CHECK_DIALOG, listener)
  },

  // 词典管理
  checkDictionary: () => ipcRenderer.invoke(IPC_CHANNELS.DICTIONARY_CHECK),
  selectDictionaryFile: (type) => ipcRenderer.invoke(IPC_CHANNELS.DICTIONARY_SELECT_FILE, type),
  importDictionary: (mdxPath, mddPaths, parserType) => ipcRenderer.invoke(IPC_CHANNELS.DICTIONARY_IMPORT, mdxPath, mddPaths, parserType),
  listDictionaries: () => ipcRenderer.invoke(IPC_CHANNELS.DICTIONARY_LIST),
  deleteDictionary: (dictId) => ipcRenderer.invoke(IPC_CHANNELS.DICTIONARY_DELETE, dictId),
  setActiveDictionary: (dictId) => ipcRenderer.invoke(IPC_CHANNELS.DICTIONARY_SET_ACTIVE, dictId),
  onDictionaryImportProgress: (callback) => {
    const listener = (_event: any, progress: DictionaryImportProgress) => callback(progress)
    ipcRenderer.on('dictionary:import-progress', listener)
    return () => ipcRenderer.removeListener('dictionary:import-progress', listener)
  },

  // 复习窗口
  openReviewWindow: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_REVIEW_WINDOW),
  openReadingWindow: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_READING_WINDOW),
  getReviewSenses: (tagName) => ipcRenderer.invoke(IPC_CHANNELS.GET_REVIEW_SENSES, tagName),
  getReviewWords: (tagName) => ipcRenderer.invoke(IPC_CHANNELS.GET_REVIEW_WORDS, tagName),
  navigateToWord: (identifier) => ipcRenderer.invoke(IPC_CHANNELS.NAVIGATE_TO_WORD, identifier),
  onNavigateToWord: (callback) => {
    const listener = (_event: any, identifier: number | string) => callback(identifier)
    ipcRenderer.on('navigate-to-word', listener)
    return () => ipcRenderer.removeListener('navigate-to-word', listener)
  },

  // FSRS 调度
  getFsrsDueItems: (tagName) => ipcRenderer.invoke(IPC_CHANNELS.FSRS_GET_DUE_ITEMS, tagName),
  recordFsrsReview: (cardId, rating) => ipcRenderer.invoke(IPC_CHANNELS.FSRS_RECORD_REVIEW, cardId, rating),
  getFsrsStats: (tagName) => ipcRenderer.invoke(IPC_CHANNELS.FSRS_GET_STATS, tagName),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}
