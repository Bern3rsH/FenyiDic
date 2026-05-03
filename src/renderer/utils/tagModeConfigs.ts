import { DEFAULT_TAG_MODE_CONFIGS } from '../../shared/types'
import type { ReviewMode, TagModeConfig } from '../../shared/types'

const validReviewModes = new Set<ReviewMode>(['read', 'listen', 'speak', 'spell', 'dictation'])

const isReviewMode = (value: unknown): value is ReviewMode => {
  return typeof value === 'string' && validReviewModes.has(value as ReviewMode)
}

const createConfigKey = (config: TagModeConfig): string => `${config.tagName}\u0000${config.mode}`

const dedupeTagModeConfigs = (configs: TagModeConfig[]): TagModeConfig[] => {
  const seenConfigKeys = new Set<string>()
  const uniqueConfigs: TagModeConfig[] = []

  for (const config of configs) {
    const configKey = createConfigKey(config)
    if (seenConfigKeys.has(configKey)) {
      continue
    }
    seenConfigKeys.add(configKey)
    uniqueConfigs.push(config)
  }

  return uniqueConfigs
}

const normalizeTagName = (value: unknown): string => {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

const parseLegacyTagModesObject = (rawValue: Record<string, unknown>): TagModeConfig[] => {
  const parsedConfigs: TagModeConfig[] = []

  for (const [rawTagName, rawModeValue] of Object.entries(rawValue)) {
    const tagName = normalizeTagName(rawTagName)
    if (!tagName) {
      continue
    }

    if (Array.isArray(rawModeValue)) {
      for (const modeValue of rawModeValue) {
        if (isReviewMode(modeValue)) {
          parsedConfigs.push({ tagName, mode: modeValue })
        }
      }
      continue
    }

    if (isReviewMode(rawModeValue)) {
      parsedConfigs.push({ tagName, mode: rawModeValue })
    }
  }

  return parsedConfigs
}

const parseTagModeConfigArray = (rawValue: unknown[]): TagModeConfig[] => {
  const parsedConfigs: TagModeConfig[] = []

  for (const rawConfig of rawValue) {
    if (!rawConfig || typeof rawConfig !== 'object') {
      continue
    }

    const tagName = normalizeTagName((rawConfig as { tagName?: unknown }).tagName)
    const mode = (rawConfig as { mode?: unknown }).mode

    if (!tagName || !isReviewMode(mode)) {
      continue
    }

    parsedConfigs.push({ tagName, mode })
  }

  return parsedConfigs
}

export const normalizeTagModeConfigs = (rawValue: unknown): TagModeConfig[] => {
  if (Array.isArray(rawValue)) {
    return dedupeTagModeConfigs(parseTagModeConfigArray(rawValue))
  }

  if (rawValue && typeof rawValue === 'object') {
    return dedupeTagModeConfigs(parseLegacyTagModesObject(rawValue as Record<string, unknown>))
  }

  return []
}

export const getDefaultTagModeConfigs = (): TagModeConfig[] => {
  return DEFAULT_TAG_MODE_CONFIGS.map((config) => ({ ...config }))
}
