import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

export class TtsService {
  private cacheDir: string

  constructor() {
    this.cacheDir = path.join(app.getPath('userData'), 'tts_cache')
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }
  }

  async getAudio(text: string, voice: string = 'en-US-JennyNeural'): Promise<{ success: boolean; data: string; mimeType: string }> {
    // 生成缓存文件名 (hash of text + voice)
    const hash = crypto.createHash('md5').update(`${text}-${voice}`).digest('hex')
    const cacheFile = path.join(this.cacheDir, `${hash}.mp3`)

    // 检查缓存
    if (fs.existsSync(cacheFile)) {
      // 验证文件大小，如果是空文件则视为无效
      const stat = fs.statSync(cacheFile)
      if (stat.size > 0) {
        const data = await fs.promises.readFile(cacheFile)
        return {
          success: true,
          data: data.toString('base64'),
          mimeType: 'audio/mpeg'
        }
      } else {
        try {
          fs.unlinkSync(cacheFile)
        } catch (e) { console.warn('Failed to delete empty cache file', e)}
      }
    }

    // 每次新建实例以避免状态复用导致的问题
    const tts = new MsEdgeTTS()
    
    try {
      console.log(`[TtsService] Requesting Edge TTS for: "${text.substring(0, 20)}..."`)
      
      // 显式指定 voiceLocale，避免调用耗时的 getVoices()
      // 注意：这里假设 voice 都是 en-US 的，如果后续支持其他语言，需要动态获取 locale
      const locale = voice.startsWith('zh-') ? 'zh-CN' : 'en-US'
      
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
        voiceLocale: locale
      })
      
      const { audioStream } = tts.toStream(text)

      const writeStream = fs.createWriteStream(cacheFile)
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
           reject(new Error('TTS Timeout'))
        }, 15000)

        audioStream.pipe(writeStream)
        
        writeStream.on('finish', () => {
          clearTimeout(timeout)
          resolve()
        })
        writeStream.on('error', (err) => {
          clearTimeout(timeout)
          reject(err)
        })
        audioStream.on('error', (err) => {
          clearTimeout(timeout)
          reject(err)
        })
      })
      
      const data = await fs.promises.readFile(cacheFile)
      return {
        success: true,
        data: data.toString('base64'),
        mimeType: 'audio/mpeg'
      }
    } catch (error) {
      console.error('TTS failed:', error)
      // 如果生成失败，删除可能损坏的文件
      if (fs.existsSync(cacheFile)) {
        try {
          fs.unlinkSync(cacheFile)
        } catch (e) {} 
      }
      throw error
    }
  }

  async clearCache() {
    if (fs.existsSync(this.cacheDir)) {
      fs.rmSync(this.cacheDir, { recursive: true, force: true })
      fs.mkdirSync(this.cacheDir)
    }
  }
}

export const ttsService = new TtsService()
