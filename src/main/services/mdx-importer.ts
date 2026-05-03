import Mdict from 'mdict-js'
import { getDatabase } from '../database'
import { parseOALDSenses } from './sense-parser'

export interface ImportProgress {
  current: number
  total: number
  word?: string
}

export async function importMdxDictionary(
  filePath: string,
  dictName: string,
  onProgress?: (progress: ImportProgress) => void
): Promise<number> {
  const db = getDatabase()

  // 创建词典记录
  const insertDict = db.prepare(
    'INSERT INTO dictionaries (name, file_path) VALUES (?, ?)'
  )
  const dictResult = insertDict.run(dictName, filePath)
  const dictId = dictResult.lastInsertRowid as number

  // 加载 MDX 文件
  const mdict = new Mdict(filePath)

  // 等待加载完成
  await new Promise((resolve) => setTimeout(resolve, 3000))

  // 获取所有词条
  const keys = mdict.keys() as string[]
  const total = keys.length

  // 准备语句
  const insertWord = db.prepare(
    'INSERT INTO words (dict_id, headword, definition_html) VALUES (?, ?, ?)'
  )
  const insertSense = db.prepare(`
    INSERT INTO senses (word_id, sense_index, sense_group, grammar, definition, definition_cn, examples, raw_html)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  // 批量插入
  const batchSize = 100
  let processed = 0

  const insertBatch = db.transaction((batch: string[]) => {
    for (const key of batch) {
      try {
        const result = mdict.lookup(key)
        if (!result || !result.definition) continue

        // 插入词条
        const wordResult = insertWord.run(dictId, key, result.definition)
        const wordId = wordResult.lastInsertRowid as number

        // 解析并插入义项
        const senses = parseOALDSenses(result.definition)
        for (const sense of senses) {
          insertSense.run(
            wordId,
            sense.index,
            sense.group || null,
            sense.grammar || null,
            sense.definition,
            sense.definitionCn || null,
            JSON.stringify(sense.examples),
            sense.rawHtml
          )
        }

        processed++
        if (onProgress && processed % 500 === 0) {
          onProgress({ current: processed, total, word: key })
        }
      } catch (err) {
        // 跳过解析失败的词条
        console.error(`Failed to import word: ${key}`, err)
      }
    }
  })

  // 分批处理
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize)
    insertBatch(batch)
  }

  onProgress?.({ current: processed, total })

  return dictId
}
