import React from 'react'
import { Volume2 } from 'lucide-react'

interface ReviewHeaderProps {
  headword: string
  phonUk?: string
  phonUs?: string
  onPlayUk?: () => void
  onPlayUs?: () => void
  isBack?: boolean
  onClickHeadword?: () => void
  className?: string
  axisType?: 'sense' | 'word'
  axisLabel?: string
  subtitle?: string
}

export default function ReviewHeader({
  headword,
  phonUk,
  phonUs,
  onPlayUk,
  onPlayUs,
  isBack = false,
  onClickHeadword,
  className = '',
  axisType,
  axisLabel,
  subtitle
}: ReviewHeaderProps) {
  const resolvedAxisLabel =
    axisLabel || (axisType === 'sense' ? '释义' : axisType === 'word' ? '词条' : '')
  const axisBadgeClassName =
    axisType === 'word'
      ? 'bg-violet-50 text-violet-700 border-violet-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200'

  return (
    <div className={`text-center ${className}`}>
      {resolvedAxisLabel && (
        <div className="mb-3 flex items-center justify-center gap-2">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${axisBadgeClassName}`}>
            {resolvedAxisLabel}
          </span>
          {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
        </div>
      )}

      {/* Headword */}
      <div className="mb-3">
        <span 
          className={`text-3xl font-bold text-gray-800 ${isBack && onClickHeadword ? 'cursor-pointer hover:text-teal-600 transition-colors' : ''}`}
          onClick={isBack ? onClickHeadword : undefined}
          title={isBack ? "点击跳转查词" : undefined}
        >
          {headword}
        </span>
      </div>

      {/* Audio Buttons */}
      <div className="flex items-center justify-center gap-3 mb-6">
        {phonUk && (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onPlayUk?.() }}
              className="flex items-center gap-1 px-2 py-1 rounded text-sm bg-gray-100 text-gray-600 hover:bg-gray-200"
              title="英式发音"
            >
              <Volume2 className="h-4 w-4" aria-hidden="true" />
              UK
            </button>
            <span className="text-sm text-gray-400">{phonUk}</span>
          </div>
        )}
        {phonUs && (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onPlayUs?.() }}
              className="flex items-center gap-1 px-2 py-1 rounded text-sm bg-gray-100 text-gray-600 hover:bg-gray-200"
              title="美式发音"
            >
              <Volume2 className="h-4 w-4" aria-hidden="true" />
              US
            </button>
            <span className="text-sm text-gray-400">{phonUs}</span>
          </div>
        )}
      </div>
    </div>
  )
}
