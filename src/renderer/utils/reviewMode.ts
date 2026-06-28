import type { ReviewMode } from '../../shared/types'

export interface ReviewModeResolvableItem {
  reviewMode?: ReviewMode
}

export function resolveReviewMode(reviewItem: ReviewModeResolvableItem): ReviewMode | undefined {
  return reviewItem.reviewMode
}
