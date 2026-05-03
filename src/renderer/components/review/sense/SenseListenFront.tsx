import React, { useEffect, useRef, useState } from 'react'

interface Example {
  en: string
  cn?: string
}

interface SenseListenFrontProps {
  headword: string
  examples?: Example[]
  note?: string
  onPlayWord: (rate: number) => Promise<void>
}

export default function SenseListenFront({
  headword,
  examples = [],
  note,
  onPlayWord
}: SenseListenFrontProps) {
  const [playbackRate, setPlaybackRate] = useState<0.5 | 0.75 | 1>(1)
  const hasAutoPlayedRef = useRef(false)
  const lastHeadwordRef = useRef(headword)

  if (lastHeadwordRef.current !== headword) {
      hasAutoPlayedRef.current = false
      lastHeadwordRef.current = headword
      setPlaybackRate(1)
  }

  const playableExample = examples.find((example) => example.en.trim() !== '')

  const speakText = async (text: string, rate: number = 1): Promise<void> => {
      try {
        const { audioManager } = await import('../../../utils/audioManager')
        await audioManager.playTts(text, rate)
      } catch (e) {
        console.error('speakText failed:', e)
      }
  }

  const playContext = async () => {
      if (playableExample) {
          await speakText(playableExample.en, playbackRate)
      } else if (note) {
          await speakText(note, playbackRate)
      }
  }

  // Auto-play Sequence
  useEffect(() => {
      let isCancelled = false
      const sequence = async () => {
          await new Promise(r => setTimeout(r, 300))
          if (isCancelled) return
          
          // 1. Play Context
          await playContext()
          
          if (isCancelled) return
          await new Promise(resolve => setTimeout(resolve, 1000))

          // 3. Play Word
          if (isCancelled) return
          await onPlayWord(playbackRate)
      }
      sequence()
      return () => { isCancelled = true }
  }, [headword, playbackRate, onPlayWord]) // Adding onPlayWord dependency might trigger loop if not stable?
  // Ideally onPlayWord should be useCallback in parent.

  return (
    <div className="p-8 flex flex-col h-full flex-1">
      <div className="flex-1 flex items-center justify-center">
        {/* Audio Controls */}
        <div className="flex items-start justify-center gap-12 w-full py-12">
          {/* Left Side: Replay Context + Speed Controls */}
          {(playableExample || note) && (
            <div className="flex flex-col items-center gap-4">
              <button
                onClick={(e) => { e.stopPropagation(); playContext() }}
                className="flex flex-col items-center gap-2 text-gray-400 hover:text-blue-500 transition-colors group"
              >
                <div className="p-4 rounded-full bg-gray-50 group-hover:bg-blue-50 border border-gray-100 group-hover:border-blue-100 transition-all">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </div>
                <span className="text-sm font-medium">{playableExample ? '重播例句' : '重播笔记'}</span>
              </button>

              {/* Speed Control */}
              <div className="flex bg-gray-50 rounded-lg p-1 border border-gray-100" onClick={e => e.stopPropagation()}>
                {[1, 0.75, 0.5].map(rate => (
                  <button
                    key={rate}
                    onClick={() => setPlaybackRate(rate as any)}
                    className={`px-2 py-0.5 text-xs font-medium rounded transition-all ${
                      playbackRate === rate ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Right Side: Replay Word */}
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={(e) => { e.stopPropagation(); onPlayWord(playbackRate) }}
              className="flex flex-col items-center gap-2 text-gray-400 hover:text-blue-500 transition-colors group"
            >
              <div className="p-4 rounded-full bg-gray-50 group-hover:bg-blue-50 border border-gray-100 group-hover:border-blue-100 transition-all">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
              </div>
              <span className="text-sm font-medium">重播原文</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-8 text-center text-gray-400 text-sm">
        思考释义
      </div>
    </div>
  )
}
