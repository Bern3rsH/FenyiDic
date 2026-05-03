import { useEffect } from 'react'

let lockCount = 0
let prevOverflow = ''
let prevPaddingRight = ''
let prevOverscrollBehavior = ''

function lockBodyScroll(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return

  const body = document.body
  const docEl = document.documentElement

  if (lockCount === 0) {
    prevOverflow = body.style.overflow
    prevPaddingRight = body.style.paddingRight
    prevOverscrollBehavior = body.style.overscrollBehavior

    const scrollbarWidth = window.innerWidth - docEl.clientWidth
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`
    }
  }

  lockCount += 1
}

function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return
  if (lockCount <= 0) return

  lockCount -= 1
  if (lockCount > 0) return

  const body = document.body
  body.style.overflow = prevOverflow
  body.style.paddingRight = prevPaddingRight
  body.style.overscrollBehavior = prevOverscrollBehavior
}

export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    lockBodyScroll()
    return () => {
      unlockBodyScroll()
    }
  }, [active])
}
