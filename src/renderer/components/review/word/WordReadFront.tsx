import React, { useMemo } from 'react'
import { Volume2 } from 'lucide-react'
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
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                </button>
                </div>
            </div>
        ))}
        {frontExamples.length === 0 && <p className="text-gray-400 text-center text-sm">（暂无例句）</p>}
      </div>
    </div>
  )
}
