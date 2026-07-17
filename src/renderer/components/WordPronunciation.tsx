import { useEffect, useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'

interface WordPronunciationProps {
  headword: string
  phonUk?: string
  phonUs?: string
  autoPlay?: boolean
  autoPlayAccent?: 'uk' | 'us'
  size?: 'default' | 'compact'
  className?: string
}

export default function WordPronunciation({
  headword,
  phonUk,
  phonUs,
  autoPlay = false,
  autoPlayAccent = 'uk',
  size = 'default',
  className = ''
}: WordPronunciationProps) {
  const [playingAudio, setPlayingAudio] = useState<string | null>(null)
  const hasAutoPlayedRef = useRef(false)
  const defaultPronunciationType: 'gb' | 'us' = autoPlayAccent === 'uk' ? 'gb' : 'us'
  const hasDefaultPronunciation = Boolean(phonUk || phonUs)
  const isCompact = size === 'compact'

  useEffect(() => {
    hasAutoPlayedRef.current = false
    setPlayingAudio(null)
  }, [autoPlayAccent, headword, phonUk, phonUs])

  const playAudio = async (type: 'gb' | 'us') => {
    if (!headword) {
      return
    }

    setPlayingAudio(type)

    try {
      for (let i = 1; i <= 10; i++) {
        const filename = `${headword}__${type}_${i}.mp3`
        const result = await window.api.getAudio(filename)

        if (result.success && result.data) {
          const url = `data:${result.mimeType};base64,${result.data}`
          await import('../utils/audioManager').then(({ audioManager }) => audioManager.playUrl(url))
          setPlayingAudio(null)
          return
        }
      }

      await import('../utils/audioManager').then(({ audioManager }) => audioManager.playTts(headword, 1))
      setPlayingAudio(null)
    } catch (error) {
      console.error('Failed to play pronunciation audio:', error)

      try {
        await import('../utils/audioManager').then(({ audioManager }) => audioManager.playTts(headword, 1))
      } catch (ttsError) {
        console.error('TTS fallback failed:', ttsError)
      } finally {
        setPlayingAudio(null)
      }
    }
  }

  useEffect(() => {
    if (!headword || !autoPlay || hasAutoPlayedRef.current) {
      return
    }

    hasAutoPlayedRef.current = true
    void playAudio(defaultPronunciationType)
  }, [autoPlay, defaultPronunciationType, headword])

  const containerClassName = [
    'flex items-center gap-3 flex-wrap',
    isCompact ? 'gap-x-2 gap-y-1.5' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  const badgeClassName = isCompact
    ? 'flex items-center gap-1 px-2 py-1 rounded text-xs'
    : 'flex items-center gap-1 px-2 py-1 rounded text-sm'

  const phoneticClassName = isCompact ? 'text-xs text-gray-400' : 'text-sm text-gray-400'
  const speakerIconClassName = isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'

  return (
    <div className={containerClassName}>
      {phonUk && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void playAudio('gb')}
            className={`${badgeClassName} ${
              playingAudio === 'gb'
                ? 'bg-blue-100 text-blue-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title="英式发音"
          >
            <Volume2 className={speakerIconClassName} aria-hidden="true" />
            UK
          </button>
          <span className={phoneticClassName}>{phonUk}</span>
        </div>
      )}

      {phonUs && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void playAudio('us')}
            className={`${badgeClassName} ${
              playingAudio === 'us'
                ? 'bg-blue-100 text-blue-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title="美式发音"
          >
            <Volume2 className={speakerIconClassName} aria-hidden="true" />
            US
          </button>
          <span className={phoneticClassName}>{phonUs}</span>
        </div>
      )}

      {!hasDefaultPronunciation && (
        <button
          type="button"
          onClick={() => void playAudio(defaultPronunciationType)}
          className={`inline-flex items-center justify-center rounded-full p-1.5 transition-colors ${
            playingAudio === defaultPronunciationType
              ? 'bg-blue-100 text-blue-600'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
          }`}
          title="再次发音"
        >
          <Volume2 className={speakerIconClassName} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
