import type { EntityType } from '../../shared/types'

export interface EntityCapabilityConfig {
  canFavorite: boolean
  canNote: boolean
  canTag: boolean
  canArchive: boolean
  canReview: boolean
}

export const entityCapabilities: Record<EntityType, EntityCapabilityConfig> = {
  sense: {
    canFavorite: true,
    canNote: true,
    canTag: true,
    canArchive: true,
    canReview: true
  },
  word: {
    canFavorite: true,
    canNote: true,
    canTag: true,
    canArchive: true,
    canReview: true
  }
}
