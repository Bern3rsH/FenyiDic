import { useEffect, useRef, useState } from 'react'
import { SYSTEM_TAGS } from '../../shared/types'
import type { ReviewMode, TagModeConfig } from '../../shared/types'

type SettingSection = 'search' | 'review' | 'reading' | 'software'
type DefinitionDisplayMode = 'en' | 'cn' | 'both'

interface SettingsProps {
  displayMode: DefinitionDisplayMode
  setDisplayMode: (mode: DefinitionDisplayMode) => void
  reviewAutoPlay: boolean
  setReviewAutoPlay: (value: boolean) => void
  reviewAutoPlayAccent: 'uk' | 'us'
  setReviewAutoPlayAccent: (accent: 'uk' | 'us') => void
  tagModeConfigs: TagModeConfig[]
  setTagModeConfigs: (configs: TagModeConfig[]) => void
  searchAutoPlay: boolean
  setSearchAutoPlay: (value: boolean) => void
  searchAutoPlayAccent: 'uk' | 'us'
  setSearchAutoPlayAccent: (accent: 'uk' | 'us') => void
  readingDisplayMode: DefinitionDisplayMode
  setReadingDisplayMode: (mode: DefinitionDisplayMode) => void
  readingAutoPlay: boolean
  setReadingAutoPlay: (value: boolean) => void
  readingAutoPlayAccent: 'uk' | 'us'
  setReadingAutoPlayAccent: (accent: 'uk' | 'us') => void
  appVersion: string
  updateRequestStatus: 'idle' | 'checking'
  onCheckForAppUpdate: () => void
}

const sectionDefinitions: Array<{
  id: SettingSection
  title: string
  subtitle: string
}> = [
  { id: 'search', title: '查词设置', subtitle: '配置查词行为与释义显示' },
  { id: 'review', title: '复习设置', subtitle: '配置复习模式、发音与标签策略' },
  { id: 'reading', title: '阅读设置', subtitle: '配置辅助精读法阅读相关选项' },
  { id: 'software', title: '软件更新', subtitle: '检查版本并前往下载页面' }
]

const tagReviewModeOptions: Array<{ value: ReviewMode; label: string }> = [
  { value: 'read', label: '阅读理解' },
  { value: 'listen', label: '听力理解' },
  { value: 'speak', label: '口语检测' },
  { value: 'spell', label: '拼写检测' },
  { value: 'dictation', label: '听写检测' }
]

const definitionDisplayModeOptions: Array<{ value: DefinitionDisplayMode; label: string }> = [
  { value: 'en', label: '英文' },
  { value: 'cn', label: '中文' },
  { value: 'both', label: '双语' }
]

function Settings({
  displayMode,
  setDisplayMode,
  reviewAutoPlay,
  setReviewAutoPlay,
  reviewAutoPlayAccent,
  setReviewAutoPlayAccent,
  tagModeConfigs,
  setTagModeConfigs,
  searchAutoPlay,
  setSearchAutoPlay,
  searchAutoPlayAccent,
  setSearchAutoPlayAccent,
  readingDisplayMode,
  setReadingDisplayMode,
  readingAutoPlay,
  setReadingAutoPlay,
  readingAutoPlayAccent,
  setReadingAutoPlayAccent,
  appVersion,
  updateRequestStatus,
  onCheckForAppUpdate
}: SettingsProps) {
  const [activeSection, setActiveSection] = useState<SettingSection>('search')
  const [availableTagNames, setAvailableTagNames] = useState<string[]>([])
  const [openReviewConfigDropdownKey, setOpenReviewConfigDropdownKey] = useState<string | null>(null)
  const reviewConfigDropdownRegionRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!openReviewConfigDropdownKey) {
      return
    }

    const closeDropdownWhenClickOutside = (event: MouseEvent) => {
      if (!reviewConfigDropdownRegionRef.current) {
        return
      }

      if (!reviewConfigDropdownRegionRef.current.contains(event.target as Node)) {
        setOpenReviewConfigDropdownKey(null)
      }
    }

    document.addEventListener('mousedown', closeDropdownWhenClickOutside)
    return () => {
      document.removeEventListener('mousedown', closeDropdownWhenClickOutside)
    }
  }, [openReviewConfigDropdownKey])

  useEffect(() => {
    setOpenReviewConfigDropdownKey(null)
  }, [activeSection])

  useEffect(() => {
    if (activeSection !== 'review') {
      return
    }

    let isEffectActive = true

    const loadAvailableTagsForReviewConfig = async () => {
      try {
        const tags = await window.api.getTags()

        if (!isEffectActive) {
          return
        }

        const normalizedTagNames = tags
          .map((tag) => (typeof tag?.name === 'string' ? tag.name.trim() : ''))
          .filter(
            (tagName) =>
              tagName.length > 0 &&
              tagName !== SYSTEM_TAGS.FAVORITE.name &&
              tagName !== SYSTEM_TAGS.ARCHIVED.name
          )

        setAvailableTagNames(Array.from(new Set(normalizedTagNames)))
      } catch (error) {
        console.error('Failed to load tags for review config', error)
      }
    }

    void loadAvailableTagsForReviewConfig()

    return () => {
      isEffectActive = false
    }
  }, [activeSection])

  const getTagModeLabel = (tagModeValue: ReviewMode | ''): string => {
    if (!tagModeValue) {
      return '请选择复习模式'
    }
    const matchedOption = tagReviewModeOptions.find(({ value }) => value === tagModeValue)
    return matchedOption?.label || '请选择复习模式'
  }

  const getSelectableTagNamesForConfig = (currentTagName: string): string[] => {
    const normalizedCurrentTagName = currentTagName.trim()

    if (!normalizedCurrentTagName) {
      return availableTagNames
    }

    if (availableTagNames.includes(normalizedCurrentTagName)) {
      return availableTagNames
    }
    return Array.from(new Set([normalizedCurrentTagName, ...availableTagNames]))
  }

  const canAddReviewTagModeConfig = availableTagNames.length > 0

  const addTagModeConfig = () => {
    const firstAvailableTagName = availableTagNames[0]
    if (!firstAvailableTagName) {
      return
    }

    setTagModeConfigs([...tagModeConfigs, { tagName: '', mode: '' }])
  }

  const updateConfigTagNameAtIndex = (configIndex: number, nextTagName: string) => {
    if (!nextTagName) {
      setOpenReviewConfigDropdownKey(null)
      return
    }

    const nextTagModeConfigs = tagModeConfigs.map((config, index) =>
      index === configIndex ? { ...config, tagName: nextTagName } : config
    )
    setTagModeConfigs(nextTagModeConfigs)
    setOpenReviewConfigDropdownKey(null)
  }

  const updateConfigModeAtIndex = (configIndex: number, nextMode: ReviewMode | '') => {
    const nextTagModeConfigs = tagModeConfigs.map((config, index) =>
      index === configIndex ? { ...config, mode: nextMode } : config
    )
    setTagModeConfigs(nextTagModeConfigs)
    setOpenReviewConfigDropdownKey(null)
  }

  const removeConfigAtIndex = (configIndex: number) => {
    const nextTagModeConfigs = tagModeConfigs.filter((_, index) => index !== configIndex)
    setTagModeConfigs(nextTagModeConfigs)
    setOpenReviewConfigDropdownKey(null)
  }

  const isUpdateActionRunning = updateRequestStatus !== 'idle'
  const updateButtonText = updateRequestStatus === 'checking' ? '检查中...' : '检查更新'

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">设置</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <aside className="md:w-64 md:shrink-0 bg-gray-50/80 border-b md:border-b-0 md:border-r border-gray-200 p-3">
            <nav className="space-y-1">
              {sectionDefinitions.map(({ id, title, subtitle }) => {
                const isActive = activeSection === id

                return (
                  <button
                    key={id}
                    onClick={() => setActiveSection(id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                      isActive
                        ? 'bg-white border-blue-200 text-blue-700 shadow-sm'
                        : 'bg-transparent border-transparent text-gray-600 hover:bg-white hover:border-gray-200'
                    }`}
                  >
                    <div className="text-sm font-semibold">{title}</div>
                    <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
                  </button>
                )
              })}
            </nav>
          </aside>

          <section className="flex-1 p-5 md:p-7">
            {activeSection === 'search' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <div className="font-medium text-gray-900">释义语言模式</div>
                      <div className="text-sm text-gray-500 mt-1">选择词条详情页显示的语言组合</div>
                    </div>

                    <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
                      {definitionDisplayModeOptions.map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => setDisplayMode(value)}
                          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                            displayMode === value
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-500 hover:text-gray-900'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">查词时自动发音</div>
                    <div className="text-sm text-gray-500 mt-1">进入词条详情页时自动播放发音</div>
                  </div>

                  <button
                    onClick={() => setSearchAutoPlay(!searchAutoPlay)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      searchAutoPlay ? 'bg-blue-500' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        searchAutoPlay ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {searchAutoPlay && (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">自动发音口音</div>
                      <div className="text-sm text-gray-500 mt-1">选择自动播放的发音口音</div>
                    </div>

                    <div className="flex bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => setSearchAutoPlayAccent('uk')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          searchAutoPlayAccent === 'uk'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        英音
                      </button>
                      <button
                        onClick={() => setSearchAutoPlayAccent('us')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          searchAutoPlayAccent === 'us'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        美音
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'review' && (
              <div className="space-y-6">
                <div className="space-y-4 pb-6 border-b border-gray-100">
                  <h3 className="text-base font-semibold text-gray-800">标签复习模式</h3>
                  <div className="text-sm text-gray-500">
                    配置不同标签对应的复习模式。例如：将「听不懂」设置为「听力理解」。
                  </div>

                  <div ref={reviewConfigDropdownRegionRef} className="rounded-xl bg-gray-50/70 divide-y divide-gray-100">
                    {tagModeConfigs.length === 0 && (
                      <div className="px-3.5 py-4 text-sm text-gray-400">暂无配置，点击左下角 + 添加</div>
                    )}

                    {tagModeConfigs.map((tagModeConfig, configIndex) => {
                      const selectableTagNames = getSelectableTagNamesForConfig(tagModeConfig.tagName)
                      const tagDropdownKey = `tag:${configIndex}`
                      const modeDropdownKey = `mode:${configIndex}`

                      return (
                        <div
                          key={`${tagModeConfig.tagName}-${tagModeConfig.mode}-${configIndex}`}
                          className="grid grid-cols-[180px_210px_40px] items-center gap-2 px-3.5 py-3"
                        >
                          <div className="relative w-[180px]">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenReviewConfigDropdownKey((currentOpenKey) =>
                                  currentOpenKey === tagDropdownKey ? null : tagDropdownKey
                                )
                              }
                              className="w-full inline-flex items-start justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                            >
                              <span
                                className={`text-left leading-5 break-all ${
                                  tagModeConfig.tagName ? 'text-gray-700' : 'text-gray-400'
                                }`}
                              >
                                {tagModeConfig.tagName || '请选择标签'}
                              </span>
                              <svg
                                className={`mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                                  openReviewConfigDropdownKey === tagDropdownKey ? 'rotate-180' : ''
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>

                            {openReviewConfigDropdownKey === tagDropdownKey && (
                              <div className="absolute left-0 z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                                {selectableTagNames.map((selectableTagName) => {
                                  const isCurrentTag = tagModeConfig.tagName === selectableTagName

                                  return (
                                    <button
                                      key={selectableTagName}
                                      type="button"
                                      onClick={() => updateConfigTagNameAtIndex(configIndex, selectableTagName)}
                                      className={`w-full text-left px-3 py-2 rounded-md text-sm leading-5 whitespace-normal break-all transition-colors ${
                                        isCurrentTag
                                          ? 'bg-blue-50 text-blue-700 font-medium'
                                          : 'text-gray-700 hover:bg-gray-50'
                                      }`}
                                    >
                                      {selectableTagName || '请选择标签'}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          <div className="relative w-[210px]">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenReviewConfigDropdownKey((currentOpenKey) =>
                                  currentOpenKey === modeDropdownKey ? null : modeDropdownKey
                                )
                              }
                              className="h-9 w-full inline-flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                            >
                              <span className={tagModeConfig.mode ? 'text-gray-700' : 'text-gray-400'}>
                                {getTagModeLabel(tagModeConfig.mode)}
                              </span>
                              <svg
                                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                                  openReviewConfigDropdownKey === modeDropdownKey ? 'rotate-180' : ''
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>

                            {openReviewConfigDropdownKey === modeDropdownKey && (
                              <div className="absolute right-0 z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                                {tagReviewModeOptions.map(({ value, label }) => {
                                  const isCurrentMode = tagModeConfig.mode === value

                                  return (
                                    <button
                                      key={value}
                                      type="button"
                                      onClick={() => updateConfigModeAtIndex(configIndex, value)}
                                      className={`w-full text-left px-3 py-2 rounded-md text-sm leading-5 whitespace-normal break-all transition-colors ${
                                        isCurrentMode
                                          ? 'bg-blue-50 text-blue-700 font-medium'
                                          : 'text-gray-700 hover:bg-gray-50'
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => removeConfigAtIndex(configIndex)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                            title="删除此配置"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex justify-start">
                    <button
                      onClick={addTagModeConfig}
                      disabled={!canAddReviewTagModeConfig}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                        canAddReviewTagModeConfig
                          ? 'border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100'
                          : 'border-gray-200 bg-gray-100 text-gray-300 cursor-not-allowed'
                      }`}
                      title={canAddReviewTagModeConfig ? '添加配置' : '请先创建至少一个标签'}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">打开卡片时自动发音</div>
                    <div className="text-sm text-gray-500 mt-1">切换到新卡片时自动播放词条发音</div>
                  </div>

                  <button
                    onClick={() => setReviewAutoPlay(!reviewAutoPlay)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      reviewAutoPlay ? 'bg-blue-500' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        reviewAutoPlay ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {reviewAutoPlay && (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">自动发音口音</div>
                      <div className="text-sm text-gray-500 mt-1">选择自动播放的发音口音</div>
                    </div>

                    <div className="flex bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => setReviewAutoPlayAccent('uk')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          reviewAutoPlayAccent === 'uk'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        英音
                      </button>
                      <button
                        onClick={() => setReviewAutoPlayAccent('us')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          reviewAutoPlayAccent === 'us'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        美音
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'reading' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <div className="font-medium text-gray-900">释义语言模式</div>
                      <div className="text-sm text-gray-500 mt-1">选择阅读查词和选义列表显示的语言组合</div>
                    </div>

                    <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
                      {definitionDisplayModeOptions.map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => setReadingDisplayMode(value)}
                          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                            readingDisplayMode === value
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-500 hover:text-gray-900'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">点击查词时自动发音</div>
                    <div className="text-sm text-gray-500 mt-1">点击原文单词查词时自动播放词条发音</div>
                  </div>

                  <button
                    onClick={() => setReadingAutoPlay(!readingAutoPlay)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      readingAutoPlay ? 'bg-blue-500' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        readingAutoPlay ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {readingAutoPlay && (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">自动发音口音</div>
                      <div className="text-sm text-gray-500 mt-1">选择自动播放的发音口音</div>
                    </div>

                    <div className="flex bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => setReadingAutoPlayAccent('uk')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          readingAutoPlayAccent === 'uk'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        英音
                      </button>
                      <button
                        onClick={() => setReadingAutoPlayAccent('us')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          readingAutoPlayAccent === 'us'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        美音
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'software' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-medium text-gray-900">检查软件更新</div>
                      <div className="mt-1 text-sm text-gray-500">
                        当前版本 {appVersion || '读取中'}。点击后会检查发布源，有新版本时可前往 GitHub Releases 下载新版安装包。
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={onCheckForAppUpdate}
                      disabled={isUpdateActionRunning}
                      className={`inline-flex min-w-[104px] items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        isUpdateActionRunning
                          ? 'cursor-not-allowed bg-gray-200 text-gray-400'
                          : 'bg-blue-600 text-white shadow-sm shadow-blue-100 hover:bg-blue-700'
                      }`}
                    >
                      {updateButtonText}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default Settings
