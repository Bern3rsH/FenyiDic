/**
 * Dictionary Data Layer - Type Definitions
 * 
 * This module defines the core interfaces for the dictionary adapter pattern,
 * enabling support for multiple dictionary data sources.
 */

/**
 * Example structure with English and optional Chinese translation
 */
export interface StandardExample {
  en: string
  cn?: string
}

/**
 * Standardized word entry structure
 */
export interface StandardWord {
  headword: string
  phonUk?: string
  phonUs?: string
  rawHtml?: string
}

/**
 * Standardized sense/definition structure
 */
export interface StandardSense {
  index: number
  group?: string
  groupCn?: string
  grammar?: string
  definition: string
  definitionCn?: string
  examples: StandardExample[]
  rawHtml?: string
}

/**
 * Dictionary parser interface
 * 
 * Implementations parse dictionary-specific HTML/data into standardized structures
 */
export interface IDictionaryParser {
  /** Parser identifier */
  readonly name: string
  /** Parser version */
  readonly version: string

  /**
   * Parse word-level information (headword, pronunciation)
   */
  parseWord(rawHtml: string, headword?: string): StandardWord

  /**
   * Parse all senses/definitions from raw dictionary data
   */
  parseSenses(rawHtml: string, headword?: string): StandardSense[]
}

/**
 * Audio provider interface
 * 
 * Implementations provide audio data for pronunciation
 */
export interface IAudioProvider {
  /** Provider identifier */
  readonly name: string

  /**
   * Initialize the audio provider (load resources, etc.)
   */
  init(): Promise<void>

  /**
   * Get audio data for a given filename
   * @param filename - The audio filename (e.g., "book.mp3")
   * @returns Audio data as Buffer, or null if not found
   */
  getAudio(filename: string): Promise<Buffer | null>

  /**
   * Clean up resources
   */
  dispose(): void
}

/**
 * Dictionary source type
 */
export type DictionaryType = 'oald' | 'custom'

/**
 * Dictionary configuration
 */
export interface DictionaryConfig {
  type: DictionaryType
  name: string
  mdxPath?: string
  mddPaths?: string[]
  enabled: boolean
}

/**
 * Dictionary adapter combining parser and audio provider
 */
export interface IDictionaryAdapter {
  readonly config: DictionaryConfig
  readonly parser: IDictionaryParser
  readonly audioProvider?: IAudioProvider

  /**
   * Initialize the adapter
   */
  init(): Promise<void>

  /**
   * Check if this adapter can handle the given dictionary file
   */
  canHandle(filePath: string): boolean

  /**
   * Dispose of resources
   */
  dispose(): void
}
