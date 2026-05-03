/**
 * Dictionary Adapter Factory
 * 
 * Creates dictionary adapters based on configuration
 */

import {
  DictionaryConfig,
  IDictionaryAdapter,
  IDictionaryParser,
  IAudioProvider
} from './types'
import { OALDAdapter, OALDParser, OALDAudioProvider } from './adapters/oald'

/**
 * Registry of available adapters
 */
const adapterRegistry = new Map<string, typeof OALDAdapter>()

// Register built-in adapters
adapterRegistry.set('oald', OALDAdapter)

/**
 * Create a dictionary adapter based on config
 */
export function createAdapter(config: DictionaryConfig): IDictionaryAdapter {
  const AdapterClass = adapterRegistry.get(config.type)
  if (!AdapterClass) {
    throw new Error(`Unknown dictionary type: ${config.type}`)
  }
  return new AdapterClass(config)
}

/**
 * Create a parser for the given dictionary type
 */
export function createParser(type: string): IDictionaryParser {
  switch (type) {
    case 'oald':
      return new OALDParser()
    default:
      throw new Error(`Unknown dictionary type: ${type}`)
  }
}

/**
 * Create an audio provider for the given dictionary type
 */
export function createAudioProvider(
  type: string,
  mddPaths?: string[]
): IAudioProvider {
  switch (type) {
    case 'oald':
      return new OALDAudioProvider(mddPaths)
    default:
      throw new Error(`Unknown dictionary type: ${type}`)
  }
}

/**
 * Register a custom adapter
 */
export function registerAdapter(
  type: string,
  adapterClass: new (config: DictionaryConfig) => IDictionaryAdapter
): void {
  adapterRegistry.set(type, adapterClass as typeof OALDAdapter)
}

/**
 * Get list of registered adapter types
 */
export function getRegisteredTypes(): string[] {
  return Array.from(adapterRegistry.keys())
}
