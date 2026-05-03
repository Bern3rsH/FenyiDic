const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

// Try standard path
const userDbPath = path.join(os.homedir(), 'Library/Application Support/fenyidic/user.db');
const targetNote = ''; // The note content to clear (e.g. empty string or specific content)

console.log('Opening database at:', userDbPath);

if (!fs.existsSync(userDbPath)) {
  console.error('Database file not found!');
  // Try fallback
  const altPath = path.join(os.homedir(), 'Library/Application Support/divide-meaning-dict/user.db');
    if (fs.existsSync(altPath)) {
        console.log('Found old path:', altPath);
    }
  process.exit(1);
}

const db = new Database(userDbPath);

try {
  // If opened directly, table is 'favorites'
  const stmt = db.prepare('UPDATE favorites SET note = NULL');
  const info = stmt.run();
  console.log(`Success! Updated ${info.changes} rows. All notes cleared.`);
  db.close();
} catch (err) {
  console.error('Error clearing notes:', err.message);
  // Try checking if it's in Electron dev path?
  // Usually 'divide-meaning-dict' is correct for 'name' in package.json
}
