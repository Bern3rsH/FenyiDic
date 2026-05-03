import type { ReactNode } from 'react'
import ArchiveIcon from '../../ArchiveIcon'

interface ReviewCardShellProps {
  axisType: 'sense' | 'word'
  reviewTagName?: string
  axisSubtitle?: string
  isFlipped: boolean
  isArchiving?: boolean
  returnKeyLabel: string
  frontContent: ReactNode
  backContent: ReactNode
  onFlip: () => void
  onArchive: () => void
  onKnow: () => void
  onFuzzy: () => void
  onDontKnow: () => void
}

export default function ReviewCardShell({
  axisType,
  reviewTagName,
  axisSubtitle,
  isFlipped,
  isArchiving = false,
  returnKeyLabel,
  frontContent,
  backContent,
  onFlip,
  onArchive,
  onKnow,
  onFuzzy,
  onDontKnow
}: ReviewCardShellProps) {
  const axisLabel = axisType === 'sense' ? '释义' : '词条'
  const axisBadgeClassName =
    axisType === 'sense'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-violet-50 text-violet-700 border-violet-200'

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full px-6 pb-6">
      <div className="flex-1 min-h-0 flex justify-center">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg flex flex-col overflow-y-auto min-h-[400px] h-full relative">
          {!isFlipped && reviewTagName && (
            <div className="pointer-events-none absolute top-4 left-4 z-10 max-w-[12rem]">
              <span
                title={reviewTagName}
                className="inline-flex truncate rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 shadow-sm"
              >
                {reviewTagName}
              </span>
            </div>
          )}
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            <button
              type="button"
              onClick={onArchive}
              disabled={isArchiving}
              aria-busy={isArchiving}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-200 ${
                isArchiving
                  ? 'cursor-not-allowed border-gray-300 bg-gray-100 text-gray-400 shadow-none'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 hover:shadow active:translate-y-px'
              }`}
              title="归档并跳过当前复习项"
            >
              <ArchiveIcon className="h-4 w-4" />
              <span>{isArchiving ? '归档中...' : '归档'}</span>
            </button>
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${axisBadgeClassName}`}>
              {axisLabel}
            </span>
            {axisSubtitle && <span className="text-xs text-gray-500">{axisSubtitle}</span>}
          </div>
          {!isFlipped ? frontContent : backContent}
        </div>
      </div>

      <div className="flex gap-4 flex-shrink-0 z-10 min-h-[60px] mt-4 justify-center">
        {!isFlipped ? (
          <button
            onClick={onFlip}
            className="px-8 py-3 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors shadow-md"
          >
            展示答案 {returnKeyLabel}
          </button>
        ) : (
          <>
            <button onClick={onDontKnow} title="快捷键: 1" className="px-6 py-3 rounded-xl bg-red-100 text-red-600 font-medium hover:bg-red-200 transition-colors">不知道 1</button>
            <button onClick={onFuzzy} title="快捷键: 2" className="px-6 py-3 rounded-xl bg-yellow-100 text-yellow-700 font-medium hover:bg-yellow-200 transition-colors">模糊 2</button>
            <button onClick={onKnow} title="快捷键: 3" className="px-6 py-3 rounded-xl bg-green-100 text-green-600 font-medium hover:bg-green-200 transition-colors">知道 3</button>
          </>
        )}
      </div>
    </div>
  )
}
