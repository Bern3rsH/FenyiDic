const Database = require('better-sqlite3');
const path = require('path');
const DB_PATH = path.join(__dirname, '../resources/dict.db');
const db = new Database(DB_PATH);

console.log('Checking word "book"...');
const word = db.prepare("SELECT * FROM words WHERE headword = 'book'").get();

if (!word) {
  console.log('Word "apple" not found!');
} else {
  console.log('Word ID:', word.id);

  const senses = db.prepare('SELECT * FROM senses WHERE word_id = ?').all(word.id);
  console.log('Found ' + senses.length + ' senses:\n');

  senses.forEach(s => {
    console.log('[' + s.sense_index + '] Group: ' + (s.sense_group || 'none'));
    console.log('    Grammar: ' + (s.grammar || 'none'));
    console.log('    Def EN: ' + (s.definition || '').substring(0, 100));
    console.log('    Def CN: ' + (s.definition_cn || 'none'));
    console.log('    Examples: ' + s.examples);
    console.log('---');
  });
}
db.close();
