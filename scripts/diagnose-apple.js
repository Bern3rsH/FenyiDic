const Mdict = require('mdict-js').default;
const path = require('path');
const fs = require('fs');

const MDX_PATH = process.env.MDX_PATH;

if (!MDX_PATH) {
  console.error('Missing MDX_PATH. Usage: MDX_PATH=/path/to/dictionary.mdx node scripts/diagnose-apple.js');
  process.exit(1);
}

async function main() {
  console.log('Loading MDX...');
  const mdict = new Mdict(MDX_PATH);
  
  console.log('\nLooking up "apple"...');
  const result = mdict.lookup('apple');
  if (result && result.definition) {
    console.log('Definition found for "apple"');
    console.log('Length:', result.definition.length);
    
    // 保存 HTML 到文件以便查看
    fs.writeFileSync('temp_apple.html', result.definition);
    console.log('Saved HTML to temp_apple.html');
    
    // 尝试用现有的正则匹配一下
    const senseRegex = /<li[^>]*class="[^"]*sense[^"]*"[^>]*sensenum="(\d+)"[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    let count = 0;
    while ((match = senseRegex.exec(result.definition)) !== null) {
      count++;
      console.log(`Match ${count}: sensenum=${match[1]}`);
    }
    
    if (count === 0) {
        console.log('NO matches found with current regex!');
        // 尝试打印前 2000 个字符
        console.log('\nSnippet:\n', result.definition.substring(0, 2000));
    }
  } else {
      console.log('Word "apple" not found.');
  }
}

main().catch(console.error);
