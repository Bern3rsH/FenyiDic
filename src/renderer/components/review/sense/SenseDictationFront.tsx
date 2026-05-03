import { useRef, useEffect } from 'react'
import { isImeComposingEnter } from '../../../utils/ime'

interface SenseDictationFrontProps {
  userInput: string
  onInputChange: (value: string) => void
  onPlayAudio: () => void
  onSubmit?: () => void
}

export default function SenseDictationFront({
  userInput,
  onInputChange,
  onPlayAudio,
  onSubmit
}: SenseDictationFrontProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Auto-play audio on mount (only once)
  useEffect(() => {
    const timer = setTimeout(() => {
      onPlayAudio()
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="p-8 flex flex-col h-full flex-1">
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Play Button */}
        <button
          onClick={onPlayAudio}
          className="w-24 h-24 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center transition-colors mb-8 shadow-lg"
          title="播放发音"
        >
          <svg className="w-12 h-12 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>

        {/* Input Field */}
        <div className="w-full max-w-xs">
          <input
            ref={inputRef}
            type="text"
            value={userInput}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (isImeComposingEnter(e)) return
              if (e.key !== 'Enter') return
              e.preventDefault()
              onSubmit?.()
            }}
            placeholder="输入听到的英文内容..."
            className="w-full px-4 py-3 text-center text-lg border-2 border-gray-200 rounded-xl focus:border-blue-400 focus:outline-none transition-colors"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            lang="en"
            spellCheck={false}
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
          />
        </div>

        <div className="mt-6 text-center text-gray-400 text-sm">
          点击下方按钮提交
        </div>
      </div>

      <div className="mt-auto pt-8 text-center text-gray-400 text-sm">
        听写内容
      </div>
    </div>
  )
}
