import { useCallback, useState, useEffect } from 'react'
import SenseReadFront from './review/sense/SenseReadFront'
import SenseListenFront from './review/sense/SenseListenFront'
import SenseSpellFront from './review/sense/SenseSpellFront'
import SenseDictationFront from './review/sense/SenseDictationFront'
import SenseBack from './review/sense/SenseBack'
import SenseSpellBack from './review/sense/SenseSpellBack'
import { ReviewMode } from '../../shared/types'
import { getReturnKeyLabel } from '../utils/keyboard'
import ReviewCardShell from './review/common/ReviewCardShell'

interface ReviewFlipCardProps {
  wordId: number
  headword: string
  phonUk?: string
  phonUs?: string
  definition: string
  definitionCn?: string
  examples?: { en: string; cn?: string }[]
  note?: string
  tags?: { id: number; name: string; color: string }[]
  reviewTagName?: string
  isFlipped: boolean
  displayMode?: 'en' | 'cn' | 'both'
  onFlip: () => void
  onArchive: () => void
  isArchiving?: boolean
  onKnow: () => void
  onFuzzy: () => void
  onDontKnow: () => void
  reviewMode?: ReviewMode
  onPlayAudioUk?: (rate?: number) => void
  onPlayAudioUs?: (rate?: number) => void
}

export default function ReviewFlipCard({
  wordId,
  headword,
  phonUk,
  phonUs,
  definition,
  definitionCn,
  examples = [],
  note,
  reviewTagName,
  isFlipped,
  displayMode = 'both',
  onFlip,
  onArchive,
  isArchiving = false,
  onKnow,
  onFuzzy,
  onDontKnow,
  reviewMode = 'read',
  onPlayAudioUk,
  onPlayAudioUs
}: ReviewFlipCardProps) {
  const returnKeyLabel = getReturnKeyLabel()
  const isListenMode = reviewMode === 'listen'
  const isSpellMode = reviewMode === 'spell'
  const isDictationMode = reviewMode === 'dictation'

  // Spell/Dictation mode state
  const [userInput, setUserInput] = useState('')

  // Clear input when switching cards or when card flips back to front
  useEffect(() => {
    if (!isFlipped) {
      setUserInput('')
    }
  }, [headword, isFlipped])

  // Standardize audio playing for SenseListenFront
  const handlePlayWord = useCallback(async (rate: number) => {
      // Prefer UK if available, else use TTS
      if (onPlayAudioUk) {
          onPlayAudioUk(rate)
      } else {
          const { audioManager } = await import('../utils/audioManager')
          await audioManager.playTts(headword, rate)
      }
  }, [headword, onPlayAudioUk])

  const handleNavigate = () => {
      window.api.navigateToWord(wordId)
  }

  const renderFront = () => {
      if (isSpellMode) {
          return (
              <SenseSpellFront
                  headword={headword}
                  definition={definition}
                  definitionCn={definitionCn}
                  examples={examples}
                  displayMode={displayMode}
                  userInput={userInput}
                  onInputChange={setUserInput}
                  onSubmit={onFlip}
              />
          )
      }
      if (isDictationMode) {
          return (
              <SenseDictationFront
                  userInput={userInput}
                  onInputChange={setUserInput}
                  onPlayAudio={() => handlePlayWord(1)}
                  onSubmit={onFlip}
              />
          )
      }
      if (isListenMode) {
          return (
              <SenseListenFront 
                  headword={headword}
                  examples={examples}
                  note={note}
                  onPlayWord={handlePlayWord}
              />
          )
      }
      return (
          <SenseReadFront 
              headword={headword}
              phonUk={phonUk}
              phonUs={phonUs}
              definition={definition}
              definitionCn={definitionCn}
              examples={examples}
              note={note}
              displayMode={displayMode}
              onPlayUk={onPlayAudioUk}
              onPlayUs={onPlayAudioUs}
          />
      )
  }

  const renderBack = () => {
      if (isSpellMode || isDictationMode) {
          return (
              <SenseSpellBack
                  headword={headword}
                  phonUk={phonUk}
                  phonUs={phonUs}
                  definition={definition}
                  definitionCn={definitionCn}
                  examples={examples}
                  displayMode={displayMode}
                  userInput={userInput}
                  onPlayUk={onPlayAudioUk}
                  onPlayUs={onPlayAudioUs}
                  onNavigate={handleNavigate}
              />
          )
      }
      return (
          <SenseBack 
              headword={headword}
              phonUk={phonUk}
              phonUs={phonUs}
              definition={definition}
              definitionCn={definitionCn}
              examples={examples}
              note={note}
              displayMode={displayMode}
              onPlayUk={onPlayAudioUk}
              onPlayUs={onPlayAudioUs}
              onNavigate={handleNavigate}
          />
      )
  }

  return (
    <ReviewCardShell
      axisType="sense"
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
