/**
 * Dictionary Data Layer
 * 
 * Provides an abstraction layer for dictionary data processing,
 * enabling support for multiple dictionary formats.
 */

// Types and interfaces
export type {
  StandardWord,
  StandardSense,
  StandardExample,
  IDictionaryParser,
  IAudioProvider,
  IDictionaryAdapter,
  DictionaryType,
  DictionaryConfig
} from './types'

// Factory functions
export {
  createAdapter,
  createParser,
  createAudioProvider,
  registerAdapter,
  getRegisteredTypes
} from './factory'

// Built-in adapters
export { OALDAdapter, OALDParser, OALDAudioProvider } from './adapters/oald'
export { BaseDictionaryParser } from './adapters/base'
