import React, { useMemo } from 'react'
import WordReadFront from './review/word/WordReadFront'
import WordListenFront from './review/word/WordListenFront'
import WordBack from './review/word/WordBack'
import WordSpeakFront from './review/word/WordSpeakFront'
import WordSpeakBack from './review/word/WordSpeakBack'
import WordSpellFront from './review/word/WordSpellFront'
import WordSpellBack from './review/word/WordSpellBack'
import WordDictationFront from './review/word/WordDictationFront'
import { getReturnKeyLabel } from '../utils/keyboard'
import ReviewCardShell from './review/common/ReviewCardShell'

// Interfaces (Keep locally for now or move to shared types)
interface Example {
  en: string
  cn?: string
}

interface ReviewSense {
    id: number
    examples: Example[]
    definition?: string
    definitionCn?: string
}

interface ReviewWord {
    entityId: number
    wordId: number
    headword: string
    phonUk?: string
    phonUs?: string
    senses: ReviewSense[]
}

interface ReviewWordFlipCardProps {
    word: ReviewWord
    reviewTagName?: string
    isFlipped: boolean
    isArchiving?: boolean
    displayMode?: 'en' | 'cn' | 'both'
    onFlip: () => void
    onArchive: () => void
    onKnow: () => void
    onFuzzy: () => void
    onDontKnow: () => void
    reviewMode?: import('../../shared/types').ReviewMode
    onPlayAudioUk?: () => void
    onPlayAudioUs?: () => void
}

export default function ReviewWordFlipCard({
  word,
  reviewTagName,
  isFlipped,
  isArchiving = false,
  displayMode = 'both',
  onFlip,
  onArchive,
  onKnow,
  onFuzzy,
  onDontKnow,
  reviewMode,
  onPlayAudioUk,
  onPlayAudioUs
}: ReviewWordFlipCardProps) {
  const returnKeyLabel = getReturnKeyLabel()
  const isListenMode = reviewMode === 'listen'
  const isSpeakMode = reviewMode === 'speak'
  const isSpellMode = reviewMode === 'spell'
  const isDictationMode = reviewMode === 'dictation'
  
  const [userAudioUrl, setUserAudioUrl] = React.useState<string | null>(null)
  const [userInput, setUserInput] = React.useState('')

  // Clear input when switching cards or when card flips back to front
  React.useEffect(() => {
    if (!isFlipped) {
      setUserInput('')
      setUserAudioUrl(null)
    }
  }, [word.entityId, isFlipped])

  // Randomly select a sense index for spell mode (stable per card)
  const selectedSenseIndex = useMemo(() => {
    if (word.senses.length === 0) return 0
    return Math.floor(Math.random() * word.senses.length)
  }, [word.entityId])

  const handleNavigate = () => {
    window.api.navigateToWord(word.wordId)
  }

  // Wrapper for play functions to be compatible with children
  const handlePlayWord = React.useCallback(async (rate: number = 1) => {
      if (onPlayAudioUk) {
          onPlayAudioUk()
      } else {
          const { audioManager } = await import('../utils/audioManager')
          await audioManager.playTts(word.headword, rate)
      }
  }, [onPlayAudioUk, word.headword])

  const legacySenses = useMemo(
    () =>
      word.senses.map((sense) => ({
        ...sense,
        definition_cn: sense.definitionCn
      })),
    [word.senses]
  )

  // Determine which Front component to render
  const renderFront = () => {
      if (isSpellMode) {
        return (
            <WordSpellFront
              headword={word.headword}
              senses={legacySenses}
              displayMode={displayMode}
              userInput={userInput}
              onInputChange={setUserInput}
              selectedSenseIndex={selectedSenseIndex}
              onSubmit={onFlip}
            />
        )
      }
      if (isDictationMode) {
        return (
            <WordDictationFront
              userInput={userInput}
              onInputChange={setUserInput}
              onPlayAudio={() => handlePlayWord(1)}
              onSubmit={onFlip}
            />
        )
      }
      if (isSpeakMode) {
        return (
            <WordSpeakFront
              headword={word.headword}
              senses={legacySenses}
              onRecordingComplete={(url) => {
                  setUserAudioUrl(url)
              }}
            />
        )
      }
      if (isListenMode) {
          return (
              <WordListenFront 
                  headword={word.headword}
                  onPlayWord={handlePlayWord}
              />
          )
      }
      return (
          <WordReadFront 
              word={{
                headword: word.headword,
                phon_uk: word.phonUk,
                phon_us: word.phonUs,
                senses: legacySenses
              }}
              onPlayUk={onPlayAudioUk}
              onPlayUs={onPlayAudioUs}
          />
      )
  }

  const renderBack = () => {
      if (isSpellMode || isDictationMode) {
          return (
              <WordSpellBack
                headword={word.headword}
                phon_uk={word.phonUk}
                phon_us={word.phonUs}
                senses={legacySenses}
                displayMode={displayMode}
                userInput={userInput}
                selectedSenseIndex={selectedSenseIndex}
                onPlayUk={onPlayAudioUk}
                onPlayUs={onPlayAudioUs}
                onNavigate={handleNavigate}
              />
          )
      }
      if (isSpeakMode) {
          return (
              <WordSpeakBack
                headword={word.headword}
                phon_uk={word.phonUk}
                phon_us={word.phonUs}
                userAudioUrl={userAudioUrl}
                senses={legacySenses}
                onPlayUk={onPlayAudioUk}
                onPlayUs={onPlayAudioUs}
                onPlayStandard={onPlayAudioUk}
                onNavigate={handleNavigate}
              />
          )
      }
      return (
          <WordBack 
              word={{
                id: word.wordId,
                headword: word.headword,
                phon_uk: word.phonUk,
                phon_us: word.phonUs
              }}
              onPlayUk={onPlayAudioUk}
              onPlayUs={onPlayAudioUs}
              onNavigate={handleNavigate}
          />
      )
  }

  return (
    <ReviewCardShell
      axisType="word"
      reviewTagName={reviewTagName}
      isFlipped={isFlipped}
      isArchiving={isArchiving}
      returnKeyLabel={returnKeyLabel}
      frontContent={renderFront()}
      backContent={renderBack()}
      onFlip={onFlip}
      onArchive={onArchive}
      onKnow={onKnow}
      onFuzzy={onFuzzy}
      onDontKnow={onDontKnow}
    />
  )
}
