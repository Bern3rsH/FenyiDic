import { Archive } from 'lucide-react'

interface ArchiveIconProps {
  className?: string
  strokeWidth?: number
}

export default function ArchiveIcon({
  className = 'w-4 h-4',
  strokeWidth = 2
}: ArchiveIconProps) {
  return <Archive className={className} strokeWidth={strokeWidth} aria-hidden="true" />
}
