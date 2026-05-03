import ReviewHeader from '../common/ReviewHeader'
import { checkSpelling, SpellResult, LetterResult } from '../../../utils/spellChecker'

interface Example {
  en: string
  cn?: string
}

interface ReviewSense {
  id: number
  examples: Example[]
  definition?: string
  definition_cn?: string
}

interface WordSpellBackProps {
  headword: string
  phon_uk?: string
  phon_us?: string
  senses: ReviewSense[]
  displayMode?: 'en' | 'cn' | 'both'
  userInput: string
  selectedSenseIndex: number
  onPlayUk?: () => void
  onPlayUs?: () => void
  onNavigate?: () => void
}

function SpellingFeedback({ result }: { result: SpellResult }) {
  if (result.isCorrect) {
    return (
      <div className="flex flex-col items-center gap-2 my-4">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <span className="text-green-600 font-medium">拼写正确！</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 my-4">
      <div className="text-sm text-gray-500 mb-1">你的答案：</div>
      <div className="flex items-center justify-center gap-0.5 text-2xl font-mono">
        {result.letters.map((letter, i) => (
          <LetterDisplay key={i} letter={letter} />
        ))}
      </div>
      <div className="flex items-center justify-center gap-0.5 mt-1">
        {result.letters.map((letter, i) => (
          <div 
            key={i} 
            className={`w-6 h-6 flex items-center justify-center text-xs ${
              letter.correct ? 'text-green-600' : 'text-red-500'
            }`}
          >
            {letter.correct ? '✓' : '✗'}
          </div>
        ))}
      </div>
    </div>
  )
}

function LetterDisplay({ letter }: { letter: LetterResult }) {
  const baseClass = 'w-6 h-8 flex items-center justify-center rounded'
  
  if (letter.correct) {
    return (
      <span className={`${baseClass} bg-green-100 text-green-700`}>
        {letter.char}
      </span>
    )
  }
  
  if (letter.type === 'missing') {
    return (
      <span className={`${baseClass} bg-red-100 text-red-500 border border-dashed border-red-300`}>
        {letter.char}
      </span>
    )
  }
  
  return (
    <span className={`${baseClass} bg-red-100 text-red-600`}>
      {letter.char}
    </span>
  )
}

export default function WordSpellBack({
  headword,
  phon_uk,
  phon_us,
  senses,
  displayMode = 'both',
  userInput,
  selectedSenseIndex,
  onPlayUk,
  onPlayUs,
  onNavigate
}: WordSpellBackProps) {
  const spellResult = checkSpelling(userInput, headword)
  const selectedSense = senses[selectedSenseIndex] || senses[0]

  return (
    <div className="p-8 flex flex-col h-full flex-1">
      <ReviewHeader 
        headword={headword}
        phonUk={phon_uk}
        phonUs={phon_us}
        onPlayUk={() => onPlayUk?.()}
        onPlayUs={() => onPlayUs?.()}
        isBack={true}
        onClickHeadword={onNavigate}
      />

      {/* Spelling Feedback */}
      <SpellingFeedback result={spellResult} />

      <div className="flex-1 flex flex-col gap-4">
        {/* Selected Sense Definition */}
        {selectedSense && (
          <div className="text-center">
            {(displayMode === 'en' || displayMode === 'both') && selectedSense.definition && (
              <p className="text-lg font-bold text-gray-900 leading-relaxed mb-1">{selectedSense.definition}</p>
            )}
            {(displayMode === 'cn' || displayMode === 'both') && selectedSense.definition_cn && (
              <p className="text-base font-bold text-gray-700">{selectedSense.definition_cn}</p>
            )}
          </div>
        )}

        {/* Example from selected sense */}
        {selectedSense?.examples?.length > 0 && (
          <div className="space-y-2">
            {selectedSense.examples.slice(0, 1).map((ex, i) => (
              <div key={i} className="pl-3 border-l-2 border-blue-200">
                <p className="text-gray-500 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: ex.en }} />
                {ex.cn && <p className="text-gray-500 text-sm mt-1" dangerouslySetInnerHTML={{ __html: ex.cn }} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
