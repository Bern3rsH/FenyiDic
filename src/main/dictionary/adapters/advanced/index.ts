/**
 * Advanced Dictionary Adapter
 * 
 * Main entry point for advanced English-Chinese dictionary support
 */

import { IDictionaryAdapter, DictionaryConfig, IDictionaryParser, IAudioProvider } from '../../types'
import { AdvancedParser } from './parser'
import { MddAudioProvider } from './audio'

export class AdvancedAdapter implements IDictionaryAdapter {
  readonly config: DictionaryConfig
  readonly parser: IDictionaryParser
  readonly audioProvider: IAudioProvider

  constructor(config: DictionaryConfig) {
    this.config = config
    this.parser = new AdvancedParser()
    this.audioProvider = new MddAudioProvider(config.mddPaths)
  }

  async init(): Promise<void> {
    await this.audioProvider.init()
  }

  canHandle(_filePath: string): boolean {
    // Accept all MDX files
    return true
  }

  dispose(): void {
    this.audioProvider.dispose()
  }
}

// Re-export components
export { AdvancedParser } from './parser'
export { MddAudioProvider, OALDAudioProvider } from './audio'

// Legacy export for backward compatibility
export { AdvancedParser as OALDParser }
export { AdvancedAdapter as OALDAdapter }
