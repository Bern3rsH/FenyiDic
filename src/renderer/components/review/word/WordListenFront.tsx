import React, { useEffect, useRef, useState } from 'react'

interface WordListenFrontProps {
  headword: string
  onPlayWord: (rate: number) => Promise<void>
  setPlaybackRate?: (rate: 0.5 | 0.75 | 1) => void // If parent wants to control, or local
}

export default function WordListenFront({ headword, onPlayWord }: WordListenFrontProps) {
  const [rate, setRate] = useState<0.5 | 0.75 | 1>(1)
  const hasAutoPlayedRef = useRef(false)
  const lastHeadwordRef = useRef(headword)

  if (lastHeadwordRef.current !== headword) {
      hasAutoPlayedRef.current = false
      lastHeadwordRef.current = headword
      setRate(1)
  }

  // Auto-play logic
  useEffect(() => {
    let isCancelled = false
    const sequence = async () => {
         console.log('[WordListenFront] AutoPlay Sequence Start')
         await new Promise(r => setTimeout(r, 300))
         if (isCancelled) {
             console.log('[WordListenFront] AutoPlay Cancelled')
             return
         }
         console.log('[WordListenFront] AutoPlay Executing')
         await onPlayWord(rate)
    }
    sequence()
    return () => { isCancelled = true }
  }, [headword, onPlayWord]) // Ideally onPlayWord should be stable

  return (
    <div className="p-8 flex flex-col h-full flex-1">
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center justify-center gap-6 py-12">
          <button
            onClick={(e) => { e.stopPropagation(); onPlayWord(rate) }}
            className="flex flex-col items-center gap-2 text-gray-500 hover:text-blue-500 transition-colors group"
          >
            <div className="p-6 rounded-full bg-blue-50 group-hover:bg-blue-100 border-2 border-blue-100 group-hover:border-blue-200 transition-all shadow-sm">
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
            </div>
            <span className="text-lg font-medium">播放原文</span>
          </button>

          {/* Speed Control (Local state for now, logic affects playback if using TTS) */}
          {/* Note: If using real audio, speed/rate might not work unless we use HTMLAudioElement.playbackRate.
              Our current audioManager might accept rate for TTS but maybe not for file audio?
              If Word card uses files, rate might be ignored. That's fine.
              Keep UI for consistency.
          */}
          <button
            onClick={(e) => { e.stopPropagation(); onPlayWord(rate) }}
            className="text-sm text-gray-400 hover:text-gray-600 mt-2"
          >
            (点击重播)
          </button>
        </div>
      </div>

      <div className="mt-auto pt-8 text-center text-gray-400 text-sm">
        思考释义
      </div>
    </div>
  )
}
