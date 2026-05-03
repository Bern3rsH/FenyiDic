/**
 * Advanced Dictionary Parser
 * 
 * Parses advanced English-Chinese bilingual dictionary HTML format
 */

import { BaseDictionaryParser } from '../base'
import { StandardWord, StandardSense, StandardExample } from '../../types'

export class AdvancedParser extends BaseDictionaryParser {
  readonly name = 'Advanced'
  readonly version = '1.0.0'

  private extractDisplayHeadword(rawHtml: string, fallbackHeadword?: string): string {
    const headwordMatch = rawHtml.match(
      /<h1[^>]*class="[^"]*headword[^"]*"[^>]*>([\s\S]*?)<\/h1>/i
    )

    if (!headwordMatch) {
      return fallbackHeadword || ''
    }

    const normalizedHeadword = headwordMatch[1]
      .replace(/<[^>]+>/g, '')
      .replace(/[·‧•]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    return normalizedHeadword || fallbackHeadword || ''
  }

  /**
   * Extract phonetics from OALD HTML
   */
  parseWord(rawHtml: string, headword?: string): StandardWord {
    const word: StandardWord = {
      headword: this.extractDisplayHeadword(rawHtml, headword)
    }

    // UK phonetic: <div class="phons_br">...<span class="phon">/.../</span>
    const ukMatch = rawHtml.match(
      /<div[^>]*class="[^"]*phons_br[^"]*"[^>]*>[\s\S]*?<span[^>]*class="phon"[^>]*>([^<]+)<\/span>/i
    )
    if (ukMatch) {
      word.phonUk = ukMatch[1].trim()
    }

    // US phonetic: <div class="phons_n_am">...<span class="phon">/.../</span>
    const usMatch = rawHtml.match(
      /<div[^>]*class="[^"]*phons_n_am[^"]*"[^>]*>[\s\S]*?<span[^>]*class="phon"[^>]*>([^<]+)<\/span>/i
    )
    if (usMatch) {
      word.phonUs = usMatch[1].trim()
    }

    word.rawHtml = rawHtml

    return word
  }

  /**
   * Parse senses from OALD HTML
   */
  parseSenses(rawHtml: string, _headword?: string): StandardSense[] {
    const senses: StandardSense[] = []
    let autoIndex = 1

    // Find idiom sections to exclude
    const idiomSections = this.findIdiomSections(rawHtml)

    // Find all POS tags for fallback grammar
    const allPosTags = this.findAllPosTags(rawHtml)

    // Find all <li class="sense"> elements
    const senseStartRegex = /<li[^>]*class="[^"]*sense[^"]*"[^>]*>/gi
    let match: RegExpExecArray | null
    const sensePositions: Array<{ start: number; tagEnd: number; tag: string }> = []

    while ((match = senseStartRegex.exec(rawHtml)) !== null) {
      // Skip senses inside idiom sections
      if (this.isInIdiomSection(match.index, idiomSections)) {
        continue
      }
      sensePositions.push({
        start: match.index,
        tagEnd: match.index + match[0].length,
        tag: match[0]
      })
    }

    // Parse each sense
    for (const pos of sensePositions) {
      const endPos = this.findClosingTag(rawHtml, pos.tagEnd, 'li')
      if (endPos === -1) continue

      const fullTag = rawHtml.substring(pos.start, endPos)
      const content = rawHtml.substring(pos.tagEnd, endPos - 5) // -5 for </li>

      // Extract sensenum from tag
      const sensenumMatch = pos.tag.match(/sensenum="(\d+)"/i)
      const index = sensenumMatch ? parseInt(sensenumMatch[1], 10) : autoIndex++

      // Extract definition
      const defMatch = content.match(
        /<span[^>]*class="[^"]*def[^"]*"[^>]*>([\s\S]*?)<\/span>/i
      )
      const definition = defMatch
        ? defMatch[1].replace(/<[^>]+>/g, '').trim()
        : ''

      // Extract Chinese definition
      const definitionCn = this.extractChineseDefinition(content)

      // Extract grammar
      let grammar = this.extractGrammar(content)

      // Add labels to grammar
      const labels = this.extractLabels(content)
      if (labels) {
        grammar = grammar ? `${grammar} ${labels}` : labels
      }

      // Fallback: use closest preceding POS tag
      if (!grammar && allPosTags.length > 0) {
        let closestPos: string | null = null
        for (const pt of allPosTags) {
          if (pt.index < pos.start) {
            closestPos = pt.pos
          } else {
            break
          }
        }
        if (closestPos) {
          grammar = closestPos
        }
      }

      // Extract examples
      const examples = this.extractExamples(content)

      if (definition) {
        senses.push({
          index,
          grammar: grammar || undefined,
          definition,
          definitionCn: definitionCn || undefined,
          examples,
          rawHtml: fullTag.substring(0, 2000)
        })
      }
    }

    // Parse sense groups and attach to senses
    this.parseSenseGroups(rawHtml, senses)

    // Fallback: if no senses found, treat entire content as single sense
    if (senses.length === 0) {
      const textOnly = this.extractTextContent(rawHtml)
      senses.push({
        index: 1,
        definition: textOnly.substring(0, 500),
        examples: [],
        rawHtml: rawHtml.substring(0, 500)
      })
    }

    return senses
  }

  // ============ Private Helper Methods ============

  private findIdiomSections(html: string): Array<{ start: number; end: number }> {
    const sections: Array<{ start: number; end: number }> = []
    const idiomStartRegex = /<div[^>]*class="[^"]*idioms[^"]*"[^>]*>/gi
    let match: RegExpExecArray | null

    while ((match = idiomStartRegex.exec(html)) !== null) {
      const start = match.index
      const end = this.findClosingTag(html, match.index + match[0].length, 'div')
      if (end !== -1) {
        sections.push({ start, end })
      }
    }
    return sections
  }

  private isInIdiomSection(
    position: number,
    sections: Array<{ start: number; end: number }>
  ): boolean {
    return sections.some((s) => position >= s.start && position <= s.end)
  }

  private findAllPosTags(html: string): Array<{ pos: string; index: number }> {
    const posTags: Array<{ pos: string; index: number }> = []
    const spanRegex = /<span[^>]*class="([^"]*)"[^>]*>([^<]+)<\/span>/gi
    let match: RegExpExecArray | null

    while ((match = spanRegex.exec(html)) !== null) {
      const classAttr = match[1]
      const content = match[2]
      const classes = classAttr.split(/\s+/)
      if (classes.includes('pos')) {
        posTags.push({
          pos: content.trim(),
          index: match.index
        })
      }
    }
    return posTags
  }

  private extractChineseDefinition(content: string): string {
    const deftMatch = content.match(/<deft[^>]*>([\s\S]*?)<\/deft>/i)
    if (deftMatch) {
      const deftContent = deftMatch[1]
      const chnMatch = deftContent.match(
        /<chn[^>]*class="simple"[^>]*>([\s\S]*?)<\/chn>/i
      )
      if (chnMatch) {
        return chnMatch[1].replace(/<[^>]+>/g, '').trim()
      }
    }
    return ''
  }

  private extractGrammar(content: string): string {
    const grammarMatch = content.match(
      /<span[^>]*class="[^"]*grammar[^"]*"[^>]*>([\s\S]*?)<\/span>/i
    )
    return grammarMatch ? grammarMatch[1].replace(/<[^>]+>/g, '').trim() : ''
  }

  private extractLabels(content: string): string {
    const labelMatch = content.match(
      /<span[^>]*class="[^"]*labels[^"]*"[^>]*>([\s\S]*?)<\/span>/i
    )
    if (labelMatch) {
      let label = labelMatch[1].replace(/<labelx[^>]*>[\s\S]*?<\/labelx>/gi, '')
      label = label.replace(/<[^>]+>/g, '').trim()
      return label
    }
    return ''
  }

  private extractExamples(content: string): StandardExample[] {
    const examples: StandardExample[] = []
    const exStartRegex = /<span[^>]*class="x"[^>]*>/gi
    let exStartMatch: RegExpExecArray | null

    while (
      (exStartMatch = exStartRegex.exec(content)) !== null &&
      examples.length < 5
    ) {
      const startPos = exStartMatch.index + exStartMatch[0].length
      const endPos = this.findClosingTag(content, startPos, 'span')
      if (endPos !== -1) {
        const exContent = content.substring(startPos, endPos - 7) // -7 for </span>
        const ex = this.extractExample(exContent)
        if (ex.en && ex.en.length > 2) {
          examples.push(ex)
        }
      }
    }
    return examples
  }

  private extractExample(text: string): StandardExample {
    // Extract Chinese from <xt> or <chn class="simple">
    let cn = ''
    const xtMatch = text.match(/<xt[^>]*>([\s\S]*?)<\/xt>/i)
    if (xtMatch) {
      const chnInXt = xtMatch[1].match(
        /<chn[^>]*class="simple"[^>]*>([\s\S]*?)<\/chn>/i
      )
      if (chnInXt) {
        cn = chnInXt[1].replace(/<[^>]+>/g, '').trim()
      } else {
        cn = xtMatch[1].replace(/<[^>]+>/g, '').trim()
      }
    }

    // Extract English (remove <xt> and <chn>)
    let en = text.replace(/<xt[^>]*>[\s\S]*?<\/xt>/gi, '')
    en = en.replace(/<chn[^>]*>[\s\S]*?<\/chn>/gi, '')
    en = en.replace(/<[^>]+>/g, '').trim()

    return { en, cn: cn || undefined }
  }

  private parseSenseGroups(html: string, senses: StandardSense[]): void {
    const shcutRegex =
      /<span[^>]*class="[^"]*shcut-g[^"]*"[^>]*id="([^"]*)"[^>]*>([\s\S]*?)(?=<span[^>]*class="[^"]*shcut-g[^"]*"|<div[^>]*class="[^"]*idioms[^"]*"|$)/gi
    let shcutMatch: RegExpExecArray | null

    while ((shcutMatch = shcutRegex.exec(html)) !== null) {
      const groupContent = shcutMatch[2]

      // Extract group title
      const shcutTitleMatch = groupContent.match(
        /<h2[^>]*class="[^"]*shcut[^"]*"[^>]*>([\s\S]*?)<\/h2>/i
      )
      if (shcutTitleMatch) {
        const titleContent = shcutTitleMatch[1]

        // English title
        let groupTitle = titleContent.replace(
          /<shcut[^>]*>[\s\S]*?<\/shcut>/gi,
          ''
        )
        groupTitle = groupTitle.replace(/<[^>]+>/g, '').trim()

        // Chinese title
        let groupTitleCn = ''
        const shcutCnMatch = titleContent.match(/<shcut[^>]*>([\s\S]*?)<\/shcut>/i)
        if (shcutCnMatch) {
          const chnMatch = shcutCnMatch[1].match(
            /<chn[^>]*class="simple"[^>]*>([\s\S]*?)<\/chn>/i
          )
          if (chnMatch) {
            groupTitleCn = chnMatch[1].replace(/<[^>]+>/g, '').trim()
          }
        }

        // Find senses in this group
        const groupSenseRegex =
          /<li[^>]*class="[^"]*sense[^"]*"[^>]*sensenum="(\d+)"[^>]*>/gi
        let groupSenseMatch: RegExpExecArray | null
        while ((groupSenseMatch = groupSenseRegex.exec(groupContent)) !== null) {
          const senseNum = parseInt(groupSenseMatch[1], 10)
          const sense = senses.find((s) => s.index === senseNum && !s.group)
          if (sense) {
            sense.group = groupTitle
            sense.groupCn = groupTitleCn
          }
        }
      }
    }
  }
}
