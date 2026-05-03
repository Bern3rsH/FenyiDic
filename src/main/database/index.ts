import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { initFsrsTables } from '../services/fsrs-service'
import { SYSTEM_TAGS } from '../../shared/types'

let db: Database.Database | null = null
const LEGACY_ARCHIVED_TAG_NAME = '已归档'

function initCustomEntryTables(tablePrefix: 'user_db.' | ''): void {
  if (!db) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${tablePrefix}custom_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      headword TEXT NOT NULL,
      phon_uk TEXT,
      phon_us TEXT,
      definition_html TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${tablePrefix}custom_senses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL,
      sense_index INTEGER NOT NULL,
      sense_group TEXT,
      sense_group_cn TEXT,
      grammar TEXT,
      definition TEXT NOT NULL DEFAULT '',
      definition_cn TEXT NOT NULL,
      examples TEXT NOT NULL DEFAULT '[]',
      raw_html TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (word_id) REFERENCES custom_words(id),
      UNIQUE(word_id, sense_index)
    );
  `)

  if (tablePrefix === 'user_db.') {
    db.exec(`
      CREATE INDEX IF NOT EXISTS user_db.idx_custom_words_headword ON custom_words(headword COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS user_db.idx_custom_words_headword_binary ON custom_words(headword);
      CREATE INDEX IF NOT EXISTS user_db.idx_custom_senses_word_id ON custom_senses(word_id);
    `)
    return
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_custom_words_headword ON custom_words(headword COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_custom_words_headword_binary ON custom_words(headword);
    CREATE INDEX IF NOT EXISTS idx_custom_senses_word_id ON custom_senses(word_id);
  `)
}

function migrateArchivedTagName(tablePrefix: 'user_db.' | ''): void {
  if (!db) return

  const tagsTable = `${tablePrefix}tags`
  const senseTagsTable = `${tablePrefix}sense_tags`
  const wordTagsTable = `${tablePrefix}word_tags`

  const archivedTag = db
    .prepare(`SELECT id FROM ${tagsTable} WHERE name = ?`)
    .get(SYSTEM_TAGS.ARCHIVED.name) as { id: number } | undefined

  const legacyArchivedTag = db
    .prepare(`SELECT id FROM ${tagsTable} WHERE name = ?`)
    .get(LEGACY_ARCHIVED_TAG_NAME) as { id: number } | undefined

  if (!legacyArchivedTag && archivedTag) {
    db.prepare(`UPDATE ${tagsTable} SET color = ? WHERE id = ?`).run(SYSTEM_TAGS.ARCHIVED.color, archivedTag.id)
    return
  }

  if (!legacyArchivedTag) {
    return
  }

  if (!archivedTag) {
    db.prepare(`UPDATE ${tagsTable} SET name = ?, color = ? WHERE id = ?`).run(
      SYSTEM_TAGS.ARCHIVED.name,
      SYSTEM_TAGS.ARCHIVED.color,
      legacyArchivedTag.id
    )
    return
  }

  if (archivedTag.id === legacyArchivedTag.id) {
    db.prepare(`UPDATE ${tagsTable} SET color = ? WHERE id = ?`).run(SYSTEM_TAGS.ARCHIVED.color, archivedTag.id)
    return
  }

  const mergeLegacyArchivedTag = db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO ${senseTagsTable} (sense_id, tag_id)
       SELECT sense_id, ? FROM ${senseTagsTable} WHERE tag_id = ?`
    ).run(archivedTag.id, legacyArchivedTag.id)

    db.prepare(
      `INSERT OR IGNORE INTO ${wordTagsTable} (word_id, tag_id)
       SELECT word_id, ? FROM ${wordTagsTable} WHERE tag_id = ?`
    ).run(archivedTag.id, legacyArchivedTag.id)

    db.prepare(`DELETE FROM ${senseTagsTable} WHERE tag_id = ?`).run(legacyArchivedTag.id)
    db.prepare(`DELETE FROM ${wordTagsTable} WHERE tag_id = ?`).run(legacyArchivedTag.id)
    db.prepare(`DELETE FROM ${tagsTable} WHERE id = ?`).run(legacyArchivedTag.id)
    db.prepare(`UPDATE ${tagsTable} SET color = ? WHERE id = ?`).run(SYSTEM_TAGS.ARCHIVED.color, archivedTag.id)
  })

  mergeLegacyArchivedTag()
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export function isDatabaseReady(): boolean {
  return db !== null
}

/**
 * Initialize the database
 * 
 * This now supports two modes:
 * 1. User-uploaded dictionary (from userData/dict.db)
 * 2. Legacy bundled dictionary (from resources/dict.db) - fallback for development
 */
export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const userDictDbPath = join(userDataPath, 'dict.db')
  const userDbPath = join(userDataPath, 'user.db')
  
  // Try user-uploaded dictionary first
  let dictDbPath: string | null = null
  
  if (existsSync(userDictDbPath)) {
    dictDbPath = userDictDbPath
    console.log('Using user-uploaded dictionary:', dictDbPath)
  } else {
    // Fallback to bundled dictionary (for development/migration)
    const bundledDbPath = app.isPackaged
      ? join(process.resourcesPath, 'dict.db')
      : join(__dirname, '../../resources/dict.db')
    
    if (existsSync(bundledDbPath)) {
      dictDbPath = bundledDbPath
      console.log('Using bundled dictionary:', dictDbPath)
    }
  }

  // If no dictionary available, initialize with user database only
  if (!dictDbPath) {
    console.log('No dictionary found. Initializing user database only.')
    initUserDatabaseOnly(userDbPath)
    initFsrsTables()
    return
  }
  console.log('Database path:', userDbPath)

  // Open main dictionary database
  db = new Database(dictDbPath, { readonly: false })
  db.pragma('journal_mode = WAL')

  // Attach user database
  db.prepare(`ATTACH DATABASE ? AS user_db`).run(userDbPath)

  // Ensure user tables exist
  initUserTables()
  
  // Ensure FSRS tables exist
  initFsrsTables()
}

/**
 * Initialize only user database (for when no dictionary is available yet)
 */
function initUserDatabaseOnly(userDbPath: string): void {
  db = new Database(userDbPath)
  db.pragma('journal_mode = WAL')
  
  // Create empty dictionary tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      headword TEXT NOT NULL,
      phon_uk TEXT,
      phon_us TEXT,
      definition_html TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_words_headword ON words(headword);

    CREATE TABLE IF NOT EXISTS senses (
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
    CREATE INDEX IF NOT EXISTS idx_senses_word_id ON senses(word_id);
  `)

  // For user-only mode, we don't need the user_db prefix
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#3B82F6'
    );

    CREATE TABLE IF NOT EXISTS sense_tags (
      sense_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at DATETIME,
      PRIMARY KEY (sense_id, tag_id),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    );

    CREATE TABLE IF NOT EXISTS sense_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sense_id INTEGER NOT NULL UNIQUE,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS word_tags (
      word_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (word_id, tag_id),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    );

    CREATE TABLE IF NOT EXISTS word_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL UNIQUE,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  initCustomEntryTables('')

  // Create system tags
  db.prepare(`INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)`).run(
    SYSTEM_TAGS.FAVORITE.name,
    SYSTEM_TAGS.FAVORITE.color
  )
  db.prepare(`INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)`).run(
    SYSTEM_TAGS.ARCHIVED.name,
    SYSTEM_TAGS.ARCHIVED.color
  )
  migrateArchivedTagName('')
}

/**
 * Initialize user tables (for attached user_db mode)
 */
function initUserTables(): void {
  if (!db) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_db.tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#3B82F6'
    );

    CREATE TABLE IF NOT EXISTS user_db.sense_tags (
      sense_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (sense_id, tag_id),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    );

    CREATE TABLE IF NOT EXISTS user_db.sense_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sense_id INTEGER NOT NULL UNIQUE,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_db.word_tags (
      word_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (word_id, tag_id),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    );

    CREATE TABLE IF NOT EXISTS user_db.word_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL UNIQUE,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  initCustomEntryTables('user_db.')
  
  // Try to add created_at column to sense_tags
  try {
    const columns = db.pragma('user_db.table_info(sense_tags)') as { name: string }[]
    const hasCreatedAt = columns.some(col => col.name === 'created_at')
    
    if (!hasCreatedAt) {
      console.log('Adding created_at column to sense_tags...')
      db.prepare(`ALTER TABLE user_db.sense_tags ADD COLUMN created_at DATETIME`).run()
      console.log('Column created_at added successfully.')
    }
  } catch (e) {
    console.error('Failed to add created_at column:', e)
  }

  // Create system tags
  db.prepare(`INSERT OR IGNORE INTO user_db.tags (name, color) VALUES (?, ?)`).run(
    SYSTEM_TAGS.FAVORITE.name,
    SYSTEM_TAGS.FAVORITE.color
  )
  db.prepare(`INSERT OR IGNORE INTO user_db.tags (name, color) VALUES (?, ?)`).run(
    SYSTEM_TAGS.ARCHIVED.name,
    SYSTEM_TAGS.ARCHIVED.color
  )
  migrateArchivedTagName('user_db.')
}

/**
 * Reinitialize database after dictionary import
 */
export function reinitDatabase(): void {
  closeDatabase()
  initDatabase()
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
