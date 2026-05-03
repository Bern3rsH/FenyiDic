/**
 * Dictionary Data Layer - Base Adapter
 * 
 * Provides default implementations and utilities for dictionary adapters
 */

import {
  IDictionaryParser,
  StandardWord,
  StandardSense
} from '../types'

/**
 * Base parser with fallback implementations
 * 
 * Subclasses should override methods for dictionary-specific parsing
 */
export abstract class BaseDictionaryParser implements IDictionaryParser {
  abstract readonly name: string
  abstract readonly version: string

  /**
   * Default implementation: extract headword only
   */
  parseWord(rawHtml: string, headword?: string): StandardWord {
    return {
      headword: headword || this.extractTextContent(rawHtml).substring(0, 50)
    }
  }

  /**
   * Default implementation: treat entire content as single sense
   */
  parseSenses(rawHtml: string, _headword?: string): StandardSense[] {
    const textContent = this.extractTextContent(rawHtml)
    return [
      {
        index: 1,
        definition: textContent.substring(0, 500),
        examples: [],
        rawHtml: rawHtml.substring(0, 2000)
      }
    ]
  }

  /**
   * Utility: Strip HTML tags and get text content
   */
  protected extractTextContent(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Utility: Find matching closing tag position (handles nesting)
   */
  protected findClosingTag(html: string, startPos: number, tagName: string): number {
    let depth = 1
    let pos = startPos
    const openPattern = new RegExp(`<${tagName}[^>]*>`, 'gi')
    const closePattern = new RegExp(`</${tagName}>`, 'gi')

    while (depth > 0 && pos < html.length) {
      openPattern.lastIndex = pos
      closePattern.lastIndex = pos

      const openMatch = openPattern.exec(html)
      const closeMatch = closePattern.exec(html)

      if (!closeMatch) break

      if (openMatch && openMatch.index < closeMatch.index) {
        depth++
        pos = openMatch.index + openMatch[0].length
      } else {
        depth--
        if (depth === 0) {
          return closeMatch.index + closeMatch[0].length
        }
        pos = closeMatch.index + closeMatch[0].length
      }
    }
    return -1
  }
}
