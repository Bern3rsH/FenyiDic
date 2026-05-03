/**
 * FSRS (Free Spaced Repetition Scheduler) Service
 * Wraps ts-fsrs to manage card scheduling and review logging
 */

import { FSRS, createEmptyCard, generatorParameters, Grade, State, Card } from 'ts-fsrs'
import { getDatabase } from '../database'

// Use ts-fsrs library defaults
const fsrsParams = generatorParameters()

const fsrs = new FSRS(fsrsParams)

// Database types
interface FsrsCardRow {
  id: number
  item_type: 'sense' | 'word'
  item_id: number
  tag_id: number
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  state: number
  last_review: string | null
  created_at: string
  updated_at: string
}

/**
 * Initialize FSRS tables in database
 */
export function initFsrsTables(): void {
  const db = getDatabase()
  if (!db) return

  // Determine table prefix based on database mode
  const prefix = getTablePrefix()

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${prefix}fsrs_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_type TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      
      due DATETIME NOT NULL,
      stability REAL DEFAULT 0,
      difficulty REAL DEFAULT 0,
      elapsed_days INTEGER DEFAULT 0,
      scheduled_days INTEGER DEFAULT 0,
      reps INTEGER DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      state INTEGER DEFAULT 0,
      last_review DATETIME,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(item_type, item_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS ${prefix}fsrs_review_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      state INTEGER NOT NULL,
      due DATETIME,
      stability REAL,
      difficulty REAL,
      elapsed_days INTEGER,
      scheduled_days INTEGER,
      review DATETIME NOT NULL,
      
      FOREIGN KEY (card_id) REFERENCES fsrs_cards(id)
    );
  `)

  if (prefix === 'user_db.') {
    db.exec(`
      CREATE INDEX IF NOT EXISTS user_db.idx_fsrs_cards_due ON fsrs_cards(due);
      CREATE INDEX IF NOT EXISTS user_db.idx_fsrs_cards_item ON fsrs_cards(item_type, item_id);
    `)
  } else {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fsrs_cards_due ON fsrs_cards(due);
      CREATE INDEX IF NOT EXISTS idx_fsrs_cards_item ON fsrs_cards(item_type, item_id);
    `)
  }

  // Compatibility migration:
  // earlier builds accidentally created fsrs tables in main schema.
  // when user_db is active, move legacy data to user_db schema once.
  if (prefix === 'user_db.') {
    migrateLegacyFsrsTablesToUserDb()
  }
}

function migrateLegacyFsrsTablesToUserDb(): void {
  const db = getDatabase()
  if (!db) return

  const hasLegacyCards = !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='fsrs_cards'")
    .get()
  if (!hasLegacyCards) return

  const hasLegacyLogs = !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='fsrs_review_logs'")
    .get()

  const userCardCount = (
    db.prepare('SELECT COUNT(*) as count FROM user_db.fsrs_cards').get() as { count: number }
  ).count
  if (userCardCount > 0) return

  const migrate = db.transaction(() => {
    db.exec(`
      INSERT INTO user_db.fsrs_cards (
        id, item_type, item_id, tag_id, due, stability, difficulty,
        elapsed_days, scheduled_days, reps, lapses, state, last_review,
        created_at, updated_at
      )
      SELECT
        id, item_type, item_id, tag_id, due, stability, difficulty,
        elapsed_days, scheduled_days, reps, lapses, state, last_review,
        created_at, updated_at
      FROM fsrs_cards;
    `)

    if (hasLegacyLogs) {
      db.exec(`
        INSERT INTO user_db.fsrs_review_logs (
          id, card_id, rating, state, due, stability, difficulty,
          elapsed_days, scheduled_days, review
        )
        SELECT
          id, card_id, rating, state, due, stability, difficulty,
          elapsed_days, scheduled_days, review
        FROM fsrs_review_logs;
      `)
    }
  })

  try {
    migrate()
    console.log('[FSRS] Migrated legacy fsrs tables from main schema to user_db schema.')
  } catch (error) {
    console.error('[FSRS] Failed to migrate legacy fsrs tables:', error)
  }
}

/**
 * Get table prefix for queries
 */
function getTablePrefix(): string {
  const db = getDatabase()
  if (!db) return ''
  
  try {
    db.prepare("SELECT 1 FROM user_db.tags LIMIT 1").get()
    return 'user_db.'
  } catch {
    return ''
  }
}

/**
 * Convert database row to ts-fsrs Card object
 */
function rowToCard(row: FsrsCardRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
    learning_steps: 0
  }
}

/**
 * Convert ts-fsrs Card to database values
 */
function cardToRow(card: Card): Partial<FsrsCardRow> {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review?.toISOString() || null
  }
}

/**
 * Get or create an FSRS card for an item
 */
export function getOrCreateCard(
  itemType: 'sense' | 'word',
  itemId: number,
  tagId: number
): { cardId: number; card: Card; isNew: boolean } {
  const db = getDatabase()
  if (!db) throw new Error('Database not initialized')

  const prefix = getTablePrefix()
  
  // Try to find existing card
  const existing = db.prepare(`
    SELECT * FROM ${prefix}fsrs_cards 
    WHERE item_type = ? AND item_id = ? AND tag_id = ?
  `).get(itemType, itemId, tagId) as FsrsCardRow | undefined

  if (existing) {
    return {
      cardId: existing.id,
      card: rowToCard(existing),
      isNew: false
    }
  }

  // Create new card
  const newCard = createEmptyCard()
  const values = cardToRow(newCard)
  
  const result = db.prepare(`
    INSERT INTO ${prefix}fsrs_cards 
    (item_type, item_id, tag_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    itemType, itemId, tagId,
    values.due, values.stability, values.difficulty,
    values.elapsed_days, values.scheduled_days,
    values.reps, values.lapses, values.state, values.last_review
  )

  return {
    cardId: Number(result.lastInsertRowid),
    card: newCard,
    isNew: true
  }
}

/**
 * Get cards that are due for review
 */
export function getDueCards(tagId: number, limit = 50): FsrsCardRow[] {
  const db = getDatabase()
  if (!db) return []

  const prefix = getTablePrefix()
  const now = new Date().toISOString()

  return db.prepare(`
    SELECT * FROM ${prefix}fsrs_cards 
    WHERE tag_id = ? AND due <= ?
    ORDER BY due ASC
    LIMIT ?
  `).all(tagId, now, limit) as FsrsCardRow[]
}

/**
 * Get all cards for a tag (including future due)
 */
export function getAllCardsForTag(tagId: number): FsrsCardRow[] {
  const db = getDatabase()
  if (!db) return []

  const prefix = getTablePrefix()

  return db.prepare(`
    SELECT * FROM ${prefix}fsrs_cards 
    WHERE tag_id = ?
    ORDER BY due ASC
  `).all(tagId) as FsrsCardRow[]
}

/**
 * Record a review and update the card
 * @param rating 1=Again, 2=Hard, 3=Good, 4=Easy
 */
export function recordReview(
  cardId: number,
  rating: 1 | 2 | 3 | 4
): Card {
  const db = getDatabase()
  if (!db) throw new Error('Database not initialized')

  const prefix = getTablePrefix()
  
  // Get current card
  const row = db.prepare(`SELECT * FROM ${prefix}fsrs_cards WHERE id = ?`).get(cardId) as FsrsCardRow
  if (!row) throw new Error(`Card not found: ${cardId}`)

  const currentCard = rowToCard(row)
  const now = new Date()

  // Calculate new scheduling using next() for specific rating
  const result = fsrs.next(currentCard, now, rating as Grade)
  const newCard = result.card
  const log = result.log

  // Update card in database
  const values = cardToRow(newCard)
  db.prepare(`
    UPDATE ${prefix}fsrs_cards 
    SET due = ?, stability = ?, difficulty = ?, elapsed_days = ?, 
        scheduled_days = ?, reps = ?, lapses = ?, state = ?, 
        last_review = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    values.due, values.stability, values.difficulty,
    values.elapsed_days, values.scheduled_days,
    values.reps, values.lapses, values.state, values.last_review,
    cardId
  )

  // Log the review
  db.prepare(`
    INSERT INTO ${prefix}fsrs_review_logs 
    (card_id, rating, state, due, stability, difficulty, elapsed_days, scheduled_days, review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cardId, rating, log.state, 
    log.due.toISOString(), log.stability, log.difficulty,
    log.elapsed_days, log.scheduled_days, log.review.toISOString()
  )

  return newCard
}

/**
 * Get card statistics for a tag
 */
export function getCardStats(tagId: number): {
  total: number
  due: number
  new: number
  learning: number
  review: number
  relearning: number
} {
  const db = getDatabase()
  if (!db) return { total: 0, due: 0, new: 0, learning: 0, review: 0, relearning: 0 }

  const prefix = getTablePrefix()
  const now = new Date().toISOString()

  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN due <= ? THEN 1 ELSE 0 END) as due,
      SUM(CASE WHEN state = 0 THEN 1 ELSE 0 END) as new,
      SUM(CASE WHEN state = 1 THEN 1 ELSE 0 END) as learning,
      SUM(CASE WHEN state = 2 THEN 1 ELSE 0 END) as review,
      SUM(CASE WHEN state = 3 THEN 1 ELSE 0 END) as relearning
    FROM ${prefix}fsrs_cards 
    WHERE tag_id = ?
  `).get(now, tagId) as {
    total: number
    due: number
    new: number
    learning: number
    review: number
    relearning: number
  }

  return stats
}

/**
 * Delete card when tag is removed from item
 */
export function deleteCard(itemType: 'sense' | 'word', itemId: number, tagId: number): void {
  const db = getDatabase()
  if (!db) return

  const prefix = getTablePrefix()

  db.prepare(`
    DELETE FROM ${prefix}fsrs_cards 
    WHERE item_type = ? AND item_id = ? AND tag_id = ?
  `).run(itemType, itemId, tagId)
}
