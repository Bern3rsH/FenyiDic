import { useEffect, useRef, useState } from 'react'

type OverflowActionMenuItemTone = 'default' | 'danger'

export interface OverflowActionMenuItem {
  key: string
  label: string
  onClick: () => void | Promise<void>
  disabled?: boolean
  tone?: OverflowActionMenuItemTone
}

interface OverflowActionMenuProps {
  items: OverflowActionMenuItem[]
  buttonTitle?: string
}

function getMenuItemClassName(tone: OverflowActionMenuItemTone, disabled: boolean): string {
  if (disabled) {
    return 'cursor-not-allowed text-gray-300'
  }

  if (tone === 'danger') {
    return 'text-red-600 hover:bg-red-50'
  }

  return 'text-gray-700 hover:bg-gray-100'
}

export default function OverflowActionMenu({
  items,
  buttonTitle = '更多操作'
}: OverflowActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuContainerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (items.length === 0) {
    return null
  }

  return (
    <div ref={menuContainerRef} className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setIsOpen((currentState) => !currentState)
        }}
        className={`favorite-btn ${isOpen ? 'is-menu-active' : 'text-gray-300'}`}
        title={buttonTitle}
        aria-label={buttonTitle}
        aria-expanded={isOpen}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-20 mt-2 min-w-[88px] rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
          {items.map((item) => {
            const itemTone = item.tone ?? 'default'
            const isItemDisabled = item.disabled === true

            return (
              <button
                key={item.key}
                type="button"
                disabled={isItemDisabled}
                onClick={async (event) => {
                  event.stopPropagation()
                  if (isItemDisabled) {
                    return
                  }

                  setIsOpen(false)
                  await item.onClick()
                }}
                className={`flex w-full items-center justify-center rounded-lg px-2.5 py-2 text-center text-sm font-medium transition ${getMenuItemClassName(itemTone, isItemDisabled)}`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
