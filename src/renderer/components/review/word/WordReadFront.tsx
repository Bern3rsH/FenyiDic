import React, { useMemo } from 'react'
import ReviewHeader from '../common/ReviewHeader'

interface Example {
  en: string
  cn?: string
}

interface WordReadFrontProps {
  word: {
    headword: string
    phon_uk?: string
    phon_us?: string
    senses: {
        examples: Example[]
    }[]
  }
  onPlayUk?: () => void
  onPlayUs?: () => void
}

export default function WordReadFront({ word, onPlayUk, onPlayUs }: WordReadFrontProps) {
  // Front Examples: Pick one per sense to show context
  const frontExamples = useMemo(() => {
    if (!word || !word.senses) return []
    return word.senses.map(sense => {
        const playableExamples = (sense.examples || []).filter((example) => example.en.trim() !== '')
        if (playableExamples.length > 0) {
            return playableExamples[Math.floor(Math.random() * playableExamples.length)]
        }
        return null
    }).filter(Boolean) as Example[]
  }, [word])

  // Simple TTS for example sentences
  const speakText = async (text: string) => {
      const { audioManager } = await import('../../../utils/audioManager')
      await audioManager.playTts(text, 1)
  }

  return (
    <div className="p-8 flex flex-col h-full flex-1">
      <ReviewHeader 
        headword={word.headword} 
        phonUk={word.phon_uk} 
        phonUs={word.phon_us} 
        onPlayUk={onPlayUk}
        onPlayUs={onPlayUs}
      />

      {/* Examples List */}
      <div className="flex-1 flex flex-col gap-4">
        {frontExamples.map((ex, i) => (
            <div key={i} className="w-full pl-3 border-l-2 border-blue-200">
                <div className="flex items-start gap-2">
                <p className="text-gray-500 text-sm leading-relaxed flex-1">{ex.en}</p>
                <button 
                  onClick={() => speakText(ex.en)} 
                  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 flex-shrink-0" 
                  title="朗读例句"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                </button>
                </div>
            </div>
        ))}
        {frontExamples.length === 0 && <p className="text-gray-400 text-center text-sm">（暂无例句）</p>}
      </div>
    </div>
  )
}
