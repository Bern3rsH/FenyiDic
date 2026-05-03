/**
 * MDD Audio Service
 * 
 * This module provides audio playback from MDD files.
 * It now supports user-uploaded MDD files from the active dictionary.
 */

import { MddAudioProvider } from '../dictionary/adapters/advanced/audio'
import { getActiveDictionary } from './dictionary-importer'

// Singleton audio provider instance
let audioProvider: MddAudioProvider | null = null

/**
 * Initialize MDD audio resources
 * Uses MDD paths from the active dictionary config, or falls back to defaults
 */
export async function initMdd(): Promise<void> {
  if (audioProvider) return

  // Get MDD paths from active dictionary
  const activeDictionary = getActiveDictionary()
  const mddPaths = activeDictionary?.mddPaths

  audioProvider = new MddAudioProvider(mddPaths)
  await audioProvider.init()
}

/**
 * Get audio data for a filename
 */
export async function getAudio(filename: string): Promise<Buffer | null> {
  if (!audioProvider) {
    return null
  }
  return audioProvider.getAudio(filename)
}

/**
 * Dispose of audio resources
 */
export function disposeMdd(): void {
  if (audioProvider) {
    audioProvider.dispose()
    audioProvider = null
  }
}

