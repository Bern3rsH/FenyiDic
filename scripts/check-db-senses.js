const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../resources/dict.db');
const db = new Database(DB_PATH);

console.log('Checking word "book"...');
const word = db.prepare('SELECT * FROM words WHERE headword = "book"').get();

if (!word) {
  console.log('Word "book" not found!');
} else {
  console.log('Word found:', word);
  
  const senses = db.prepare('SELECT * FROM senses WHERE word_id = ?').all(word.id);
  console.log(`\nFound ${senses.length} senses:`);
  
  senses.forEach(s => {
    console.log(`[${s.sense_index}] Group: ${s.sense_group || 'none'} | Grammar: ${s.grammar || 'none'}`);
    console.log(`    Def: ${s.definition.substring(0, 100)}...`);
  });
}
