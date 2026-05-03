const Mdict = require('mdict-js').default;
const path = require('path');
const Database = require('better-sqlite3');

const MDX_PATH = process.env.MDX_PATH;
const DB_PATH = path.join(__dirname, '../resources/dict.db');

if (!MDX_PATH) {
  console.error('Missing MDX_PATH. Usage: MDX_PATH=/path/to/dictionary.mdx node scripts/diagnose-book.js');
  process.exit(1);
}

async function main() {
  console.log('Loading MDX...');
  const mdict = new Mdict(MDX_PATH);
  
  // 1. 检查所有相关 Keys
  const keys = mdict.keys();
  console.log('Total keys:', keys.length);
  
  const bookKeys = keys.filter(k => k.startsWith('book'));
  console.log('Keys starting with "book" (first 20):', bookKeys.slice(0, 20));
  
  // 2. 检查 "book" 的定义内容
  console.log('\nLooking up "book"...');
  const result = mdict.lookup('book');
  if (result && result.definition) {
    console.log('Definition found via mdict.lookup("book")');
    console.log('Length:', result.definition.length);
    console.log('Snippet (first 500 chars):', result.definition.substring(0, 500));
    
    // 检查是否包含 verb 标识
    if (result.definition.includes('class="verb"')) {
        console.log('HTML contains class="verb"!');
    } else {
        console.log('HTML DOES NOT contain class="verb".');
    }
    
    // 保存 HTML 到文件
    const fs = require('fs');
    fs.writeFileSync('temp_book.html', result.definition);
    console.log('Saved HTML to temp_book.html');
  }

  // 3. 检查数据库里存的内容
  const db = new Database(DB_PATH);
  const row = db.prepare('SELECT definition_html FROM words WHERE headword = "book"').get();
  if (row) {
      console.log('\nDatabase content for "book":');
      console.log('Length:', row.definition_html.length);
      // 检查我们的解析是否漏掉了什么
  }
}

main().catch(console.error);
