/**
 * Audio Provider for MDD files
 * 
 * Provides audio playback from MDD resource files
 */

import { IAudioProvider } from '../../types'
import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

// Import mdict-js using the same pattern as original mdd-service.ts
import MdictModule from 'mdict-js'
const Mdict = (MdictModule as any).default || MdictModule

export class MddAudioProvider implements IAudioProvider {
  readonly name = 'MDD-Audio'

  private mddInstances: any[] | null = null
  private mddPaths: string[]

  constructor(mddPaths?: string[]) {
    this.mddPaths = mddPaths || this.getDefaultMddPaths()
  }

  private getDefaultMddPaths(): string[] {
    // Return empty array - user must provide their own MDD files
    const basePath = app.isPackaged
      ? join(process.resourcesPath, 'audio')
      : ''

    if (!basePath || !existsSync(basePath)) {
      return []
    }

    return []
  }

  async init(): Promise<void> {
    if (this.mddInstances) return

    const paths = this.mddPaths
    if (paths.length === 0) {
      console.log('[MddAudioProvider] No MDD files found')
      return
    }

    console.log('[MddAudioProvider] Loading MDD files:', paths)
    this.mddInstances = paths.map((p) => new Mdict(p))
    console.log('[MddAudioProvider] MDD files loaded')
  }

  async getAudio(filename: string): Promise<Buffer | null> {
    if (!this.mddInstances || this.mddInstances.length === 0) {
      return null
    }

    // Try different key formats
    const keysToTry = [`\\${filename}`, `/${filename}`, filename]

    for (const mdd of this.mddInstances) {
      for (const key of keysToTry) {
        try {
          const kidResult = mdd._lookupKID(key)
          if (kidResult && kidResult.idx !== undefined) {
            const { idx, list } = kidResult
            const rid = mdd._reduceRecordBlock(list[idx].recordStartOffset)

            const nextStart =
              idx + 1 >= list.length
                ? mdd._recordBlockStartOffset +
                  mdd.recordBlockInfoList[mdd.recordBlockInfoList.length - 1]
                    .decompAccumulator +
                  mdd.recordBlockInfoList[mdd.recordBlockInfoList.length - 1].decompSize
                : list[idx + 1].recordStartOffset

            const data = mdd._decodeRecordBlockByRBID(
              rid,
              list[idx].keyText,
              list[idx].recordStartOffset,
              nextStart
            )

            if (data && data.definition) {
              const definition = data.definition
              console.log(
                '[MddAudioProvider] Found audio:',
                filename,
                'length:',
                definition.length
              )

              if (typeof definition === 'string') {
                return Buffer.from(definition, 'base64')
              } else if (Buffer.isBuffer(definition)) {
                return definition
              } else if (definition instanceof Uint8Array) {
                return Buffer.from(definition)
              }
            }
          }
        } catch {
          // Continue to next key
        }
      }
    }

    return null
  }

  dispose(): void {
    this.mddInstances = null
  }
}

// Legacy export name for backward compatibility
export { MddAudioProvider as OALDAudioProvider }
