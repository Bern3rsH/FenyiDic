interface ReadPreparationListItem {
  key: string
  headword: string
  cardTypeLabel: string
  reviewTagName?: string
}

interface ReadReviewPreparationListProps {
  items: ReadPreparationListItem[]
  selectedKeys: Set<string>
  nonReadItemCount: number
  onToggleItem: (itemKey: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onStartReview: () => void
}

export default function ReadReviewPreparationList({
  items,
  selectedKeys,
  nonReadItemCount,
  onToggleItem,
  onSelectAll,
  onClearSelection,
  onStartReview
}: ReadReviewPreparationListProps) {
  const selectedCount = selectedKeys.size
  const remainingTotalCount = items.length - selectedCount + nonReadItemCount

  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-4 shrink-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              复习前列表模式
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-gray-900">先筛掉本次不用复习的卡片</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              勾选后仅跳过当前这次复习，后续复习时这些卡片仍会再次出现。目前仅支持先筛掉进行阅读理解复习的卡片。
            </p>
          </div>

          <button
            type="button"
            onClick={onStartReview}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 active:translate-y-px"
          >
            开始复习（剩余 {remainingTotalCount} 张）
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={items.length === 0 || selectedCount === items.length}
            className="inline-flex h-9 items-center rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:shadow-none"
          >
            全部跳过
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            disabled={selectedCount === 0}
            className="inline-flex h-9 items-center rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:shadow-none"
          >
            清空勾选
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-6 pb-6">
        <div className="h-full overflow-hidden rounded-3xl border border-white/70 bg-white/85 shadow-xl shadow-indigo-100/60 backdrop-blur">
          <div className="h-full overflow-y-auto p-4">
            <div className="space-y-3">
              {items.map((item) => {
                const isSelected = selectedKeys.has(item.key)

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onToggleItem(item.key)}
                    className={`flex w-full items-start gap-4 rounded-2xl border px-4 py-4 text-left transition ${
                      isSelected
                        ? 'border-blue-200 bg-blue-50/80 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-gray-300 bg-white text-transparent'
                      }`}
                      aria-hidden="true"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-gray-900">{item.headword}</span>
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          {item.cardTypeLabel}
                        </span>
                        {item.reviewTagName && (
                          <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                            {item.reviewTagName}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-sm font-medium text-gray-400">
                      {isSelected ? '本次跳过' : '参与复习'}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
