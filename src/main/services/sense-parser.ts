/**
 * OALD Sense Parser
 * 
 * This module is now a thin wrapper around the dictionary adapter layer.
 * Kept for backward compatibility with existing code.
 * 
 * @deprecated Use dictionary/adapters/oald/parser.ts directly
 */

import { OALDParser } from '../dictionary/adapters/oald/parser'
import { StandardSense } from '../dictionary/types'

// Singleton parser instance
const parser = new OALDParser()

/**
 * Legacy interface for parsed sense
 * Maps to StandardSense from the new module
 */
export interface ParsedSense {
  index: number
  group?: string
  grammar?: string
  definition: string
  definitionCn?: string
  examples: string[]
  rawHtml: string
}

/**
 * Parse OALD HTML into senses (legacy interface)
 * 
 * @deprecated Use OALDParser.parseSenses() directly
 */
export function parseOALDSenses(html: string): ParsedSense[] {
  const standardSenses = parser.parseSenses(html)
  
  // Convert StandardSense to legacy ParsedSense format
  return standardSenses.map((sense: StandardSense): ParsedSense => ({
    index: sense.index,
    group: sense.group,
    grammar: sense.grammar,
    definition: sense.definition,
    definitionCn: sense.definitionCn,
    // Legacy format: examples were just strings (English only)
    examples: sense.examples.map(ex => ex.en),
    rawHtml: sense.rawHtml || ''
  }))
}
