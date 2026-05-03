import { useRef, useEffect } from 'react'
import { isImeComposingEnter } from '../../../utils/ime'

interface Example {
  en: string
  cn?: string
}

interface SenseSpellFrontProps {
  headword: string
  definition: string
  definitionCn?: string
  examples?: Example[]
  displayMode?: 'en' | 'cn' | 'both'
  userInput: string
  onInputChange: (value: string) => void
  onSubmit?: () => void
}

/**
 * Replace headword and its variations in example text with blanks
 * Handles: plurals (s, es), verb forms (ing, ed, s), comparatives (er, est)
 */
function blankOutWord(text: string, word: string): string {
  // Escape special regex characters
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  
  // Match word with optional common suffixes (case insensitive)
  // Also match inside HTML tags like <b>word</b>
  const suffixes = '(?:s|es|ed|ing|er|est|ly)?'
  const regex = new RegExp(`(>?)\\b${escaped}${suffixes}\\b(<?)`, 'gi')
  
  return text.replace(regex, (_match, before, after) => {
    // Preserve any HTML tag markers
    return `${before || ''}______${after || ''}`
  })
}

export default function SenseSpellFront({
  headword,
  definition,
  definitionCn,
  examples = [],
  displayMode = 'both',
  userInput,
  onInputChange,
  onSubmit
}: SenseSpellFrontProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Get first example and blank out the word
  const exampleToShow = examples.find((example) => example.en.trim() !== '') || null
  const blankedExample = exampleToShow 
    ? blankOutWord(exampleToShow.en, headword)
    : null

  return (
    <div className="p-8 flex flex-col h-full flex-1">
      {/* Definition */}
      <div className="text-center mb-6">
        {(displayMode === 'en' || displayMode === 'both') && (
          <p className="text-xl font-bold text-gray-900 leading-relaxed mb-2">{definition}</p>
        )}
        {(displayMode === 'cn' || displayMode === 'both') && definitionCn && (
          <p className="text-lg font-bold text-gray-700">{definitionCn}</p>
        )}
      </div>

      {/* Blanked Example */}
      {blankedExample && (
        <div className="mb-6">
          <div className="pl-3 border-l-2 border-blue-200">
            <p 
              className="text-gray-700 text-base leading-relaxed"
              dangerouslySetInnerHTML={{ __html: blankedExample }}
            />
            {exampleToShow?.cn && (
              <p 
                className="text-gray-500 text-sm mt-1"
                dangerouslySetInnerHTML={{ __html: exampleToShow.cn }}
              />
            )}
          </div>
        </div>
      )}

      {/* Input Field */}
      <div className="flex-1 flex flex-col items-center justify-center">
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
            placeholder="输入英文原文..."
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
        拼写原文
      </div>
    </div>
  )
}
