import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/**
 * Return true when Enter is used to confirm IME composition.
 * In this case we should not treat Enter as "submit".
 */
export function isImeComposingEnter(
  event: ReactKeyboardEvent<HTMLInputElement>
): boolean {
  if (event.key !== 'Enter') return false

  const nativeEvent = event.nativeEvent as KeyboardEvent & { keyCode?: number }
  return (
    event.isComposing ||
    nativeEvent.isComposing ||
    nativeEvent.keyCode === 229
  )
}
