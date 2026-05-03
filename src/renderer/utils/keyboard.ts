export function getReturnKeyLabel(): 'Return' | 'Enter' {
  if (typeof navigator === 'undefined') return 'Enter'

  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string }
  }
  const platform = (nav.userAgentData?.platform || nav.platform || '').toLowerCase()

  return platform.includes('mac') ? 'Return' : 'Enter'
}
