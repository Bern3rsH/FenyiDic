
import { useEffect, useState } from 'react'

import ReviewHeader from '../common/ReviewHeader'

interface WordSpeakBackProps {
  headword: string
  phon_uk?: string
  phon_us?: string
  userAudioUrl: string | null
  senses: {
    definition?: string
    definition_cn?: string
  }[]
  onPlayUk?: () => void
  onPlayUs?: () => void
  onPlayStandard?: () => void
  onNavigate?: () => void
}

export default function WordSpeakBack({ headword, phon_uk, phon_us, userAudioUrl, senses, onPlayUk, onPlayUs, onPlayStandard, onNavigate }: WordSpeakBackProps) {
  const [isPlaying, setIsPlaying] = useState(false)

  const playSequence = async () => {
    if (isPlaying) return
    setIsPlaying(true)

    try {
        // 1. Play User Audio
        if (userAudioUrl) {
            await new Promise<void>((resolve) => {
                const audio = new Audio(userAudioUrl)
                audio.onended = () => resolve()
                audio.onerror = () => resolve() // Continue even if error
                audio.play().catch(() => resolve())
            })
        }

        // Delay slightly
        await new Promise(r => setTimeout(r, 500))

        // 2. Play Standard Audio
        if (onPlayStandard) {
             onPlayStandard()
        }
    } finally {
        setIsPlaying(false)
    }
  }

  // Auto play on mount
  useEffect(() => {
    playSequence()
  }, [])

  return (
    <div className="flex flex-col h-full items-center p-8">
       {/* Headword & Senses (Same Visuals) */}
       <div className="flex-1 flex flex-col items-center w-full gap-6">
        <div className="w-full">
            <ReviewHeader 
                headword={headword} 
                phonUk={phon_uk} 
                phonUs={phon_us} 
                onPlayUk={onPlayUk}
                onPlayUs={onPlayUs}
                isBack={true}
                onClickHeadword={onNavigate}
            />
        </div>
        
        {/* Definitions */}
        <div className="w-full max-w-lg space-y-4">
            {senses.map((sense, idx) => (
                <div key={idx} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                    {sense.definition && <div className="text-lg font-medium text-gray-700">{sense.definition}</div>}
                    {sense.definition_cn && <div className="text-gray-500 mt-1">{sense.definition_cn}</div>}
                </div>
            ))}
        </div>
      </div>

       {/* Replay Control */}
       <div className="flex-shrink-0 mt-8 mb-4 flex flex-col items-center">
         <button 
           onClick={playSequence}
           disabled={isPlaying}
           className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center hover:bg-indigo-200 transition-colors disabled:opacity-50"
         >
             <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
            </svg>
         </button>
         <div className="mt-2 text-gray-500 text-sm">重播对比 (您 vs 标准)</div>
       </div>
    </div>
  )
}
