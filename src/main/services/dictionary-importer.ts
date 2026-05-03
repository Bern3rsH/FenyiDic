/**
 * Dictionary Importer Service
 * 
 * Handles importing user-uploaded MDX dictionary files
 */

import { app, BrowserWindow } from 'electron'
import { join, basename } from 'path'
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import { UserDictionaryConfig, DictionaryImportProgress, DictionaryParserType } from '../../shared/types'
import { AdvancedParser } from '../dictionary/adapters/advanced/parser'
import { BaseDictionaryParser } from '../dictionary/adapters/base'

// Import mdict-js
import MdictModule from 'mdict-js'
const Mdict = (MdictModule as any).default || MdictModule

// Paths
function getDictionariesDir(): string {
  const dir = join(app.getPath('userData'), 'dictionaries')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getConfigPath(): string {
  return join(app.getPath('userData'), 'dictionary-config.json')
}

function getDictDbPath(): string {
  return join(app.getPath('userData'), 'dict.db')
}

/**
 * Load dictionary configurations from disk
 */
export function loadDictionaryConfigs(): UserDictionaryConfig[] {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) {
    return []
  }
  try {
    const content = readFileSync(configPath, 'utf-8')
    return JSON.parse(content) as UserDictionaryConfig[]
  } catch {
    return []
  }
}

/**
 * Save dictionary configurations to disk
 */
function saveDictionaryConfigs(configs: UserDictionaryConfig[]): void {
  const configPath = getConfigPath()
  writeFileSync(configPath, JSON.stringify(configs, null, 2), 'utf-8')
}

/**
 * Get the active dictionary configuration
 */
export function getActiveDictionary(): UserDictionaryConfig | undefined {
  const configs = loadDictionaryConfigs()
  return configs.find(c => c.isActive)
}

/**
 * Check if any dictionary is available
 */
export function hasDictionary(): boolean {
  const configs = loadDictionaryConfigs()
  return configs.length > 0 && configs.some(c => c.isActive)
}



/**
 * Get parser based on type
 * Currently only supports the default advanced parser
 */
function getParser(_type: DictionaryParserType): BaseDictionaryParser {
  // Use the advanced English-Chinese parser as default
  return new AdvancedParser()
}

/**
 * Send progress update to renderer
 */
function sendProgress(
  window: BrowserWindow | null,
  progress: DictionaryImportProgress
): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send('dictionary:import-progress', progress)
  }
}

/**
 * Import a dictionary from MDX file
 */
export async function importDictionary(
  mdxPath: string,
  mddPaths: string[],
  parserType: DictionaryParserType,
  window: BrowserWindow | null
): Promise<UserDictionaryConfig> {
  const dictId = randomUUID()
  const dictDir = join(getDictionariesDir(), dictId)
  mkdirSync(dictDir, { recursive: true })

  // Stage 1: Copy files
  sendProgress(window, {
    stage: 'copying',
    current: 0,
    total: 1 + mddPaths.length,
    message: '正在复制词典文件...'
  })

  const mdxDest = join(dictDir, basename(mdxPath))
  copyFileSync(mdxPath, mdxDest)

  const mddDests: string[] = []
  for (let i = 0; i < mddPaths.length; i++) {
    const mddDest = join(dictDir, basename(mddPaths[i]))
    copyFileSync(mddPaths[i], mddDest)
    mddDests.push(mddDest)
    sendProgress(window, {
      stage: 'copying',
      current: i + 2,
      total: 1 + mddPaths.length,
      message: `正在复制音频文件 ${i + 1}/${mddPaths.length}...`
    })
  }

  // Stage 2: Load MDX
  sendProgress(window, {
    stage: 'loading',
    current: 0,
    total: 1,
    message: '正在加载词典...'
  })

  const mdict = new Mdict(mdxDest)
  await new Promise(resolve => setTimeout(resolve, 3000))

  const keys = mdict.keys() as string[]
  const totalWords = keys.length
  const dictName = basename(mdxPath, '.mdx')

  // Stage 3: Parse and insert into database
  const dbPath = getDictDbPath()
  
  // Create new database (or overwrite existing)
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  // Create tables
  db.exec(`
    DROP TABLE IF EXISTS senses;
    DROP TABLE IF EXISTS words;

    CREATE TABLE words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      headword TEXT NOT NULL,
      phon_uk TEXT,
      phon_us TEXT,
      definition_html TEXT NOT NULL
    );
    CREATE INDEX idx_words_headword ON words(headword);

    CREATE TABLE senses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL,
      sense_index INTEGER NOT NULL,
      sense_group TEXT,
      sense_group_cn TEXT,
      grammar TEXT,
      definition TEXT NOT NULL,
      definition_cn TEXT,
      examples TEXT,
      raw_html TEXT NOT NULL,
      FOREIGN KEY (word_id) REFERENCES words(id)
    );
    CREATE INDEX idx_senses_word_id ON senses(word_id);
  `)

  const parser = getParser(parserType)

  const insertWord = db.prepare(
    'INSERT INTO words (headword, phon_uk, phon_us, definition_html) VALUES (?, ?, ?, ?)'
  )
  const insertSense = db.prepare(`
    INSERT INTO senses (word_id, sense_index, sense_group, sense_group_cn, grammar, definition, definition_cn, examples, raw_html)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let processed = 0
  let skipped = 0
  const batchSize = 500

  const insertBatch = db.transaction((batch: string[]) => {
    for (const key of batch) {
      try {
        if (key.startsWith('@') || key.startsWith('entry://') || key.length > 100) {
          skipped++
          continue
        }

        const result = mdict.lookup(key)
        if (!result || !result.definition) {
          skipped++
          continue
        }

        const html = result.definition.substring(0, 500000)
        const wordInfo = parser.parseWord(html, key)
        const senses = parser.parseSenses(html, key)
        const storedHeadword = wordInfo.headword?.trim() || key

        const wordResult = insertWord.run(
          storedHeadword,
          wordInfo.phonUk || null,
          wordInfo.phonUs || null,
          html
        )
        const wordId = wordResult.lastInsertRowid as number

        for (const sense of senses) {
          insertSense.run(
            wordId,
            sense.index,
            sense.group || null,
            sense.groupCn || null,
            sense.grammar || null,
            sense.definition,
            sense.definitionCn || null,
            JSON.stringify(sense.examples),
            sense.rawHtml || ''
          )
        }

        processed++
      } catch {
        skipped++
      }
    }
  })

  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize)
    insertBatch(batch)

    if ((i / batchSize) % 10 === 0) {
      sendProgress(window, {
        stage: 'parsing',
        current: processed,
        total: totalWords,
        message: `正在解析词条 ${processed}/${totalWords}...`
      })
    }
  }

  db.close()

  // Stage 4: Save config
  sendProgress(window, {
    stage: 'indexing',
    current: 1,
    total: 1,
    message: '正在保存配置...'
  })

  const config: UserDictionaryConfig = {
    id: dictId,
    name: dictName,
    mdxPath: mdxDest,
    mddPaths: mddDests,
    parserType,
    wordCount: processed,
    importedAt: new Date().toISOString(),
    isActive: true
  }

  // Deactivate other dictionaries and add new one
  const configs = loadDictionaryConfigs()
  configs.forEach(c => c.isActive = false)
  configs.push(config)
  saveDictionaryConfigs(configs)

  sendProgress(window, {
    stage: 'done',
    current: processed,
    total: processed,
    message: `导入完成！共 ${processed} 个词条`
  })

  return config
}

/**
 * Delete a dictionary by ID
 */
export function deleteDictionary(dictId: string): boolean {
  const configs = loadDictionaryConfigs()
  const index = configs.findIndex(c => c.id === dictId)
  
  if (index === -1) return false

  const config = configs[index]
  
  // Remove files
  try {
    if (existsSync(config.mdxPath)) {
      unlinkSync(config.mdxPath)
    }
    for (const mddPath of config.mddPaths) {
      if (existsSync(mddPath)) {
        unlinkSync(mddPath)
      }
    }
  } catch (e) {
    console.error('Failed to delete dictionary files:', e)
  }

  // Remove from config
  configs.splice(index, 1)
  
  // If deleted the active one, activate another if available
  if (config.isActive && configs.length > 0) {
    configs[0].isActive = true
  }
  
  saveDictionaryConfigs(configs)
  return true
}

/**
 * Set a dictionary as active
 */
export function setActiveDictionary(dictId: string): boolean {
  const configs = loadDictionaryConfigs()
  const target = configs.find(c => c.id === dictId)
  
  if (!target) return false

  configs.forEach(c => c.isActive = c.id === dictId)
  saveDictionaryConfigs(configs)
  return true
}
