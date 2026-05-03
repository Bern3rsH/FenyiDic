const Mdict = require('mdict-js').default;
const Database = require('better-sqlite3');
const path = require('path');

const MDX_PATH = process.env.MDX_PATH;
const DB_PATH = path.join(__dirname, '../resources/dict.db');

if (!MDX_PATH) {
  console.error('Missing MDX_PATH. Usage: MDX_PATH=/path/to/dictionary.mdx node scripts/build-db.js');
  process.exit(1);
}

// 简化的义项解析 - 不使用 JSDOM 减少内存
function parseOALDSensesSimple(html) {
  const senses = [];
  let autoIndex = 1;

  // 辅助函数：从例句中提取英文和中文翻译
  function extractExample(text) {
    // 提取中文翻译（从 <xt> 或 <chn class="simple"> 标签中）
    let cn = '';
    const xtMatch = text.match(/<xt[^>]*>([\s\S]*?)<\/xt>/i);
    if (xtMatch) {
      // xt 标签内可能还有 chn 标签
      const chnInXt = xtMatch[1].match(/<chn[^>]*class="simple"[^>]*>([\s\S]*?)<\/chn>/i);
      if (chnInXt) {
        cn = chnInXt[1].replace(/<[^>]+>/g, '').trim();
      } else {
        cn = xtMatch[1].replace(/<[^>]+>/g, '').trim();
      }
    }

    // 提取英文部分（移除 <xt> 和 <chn> 标签）
    let en = text.replace(/<xt[^>]*>[\s\S]*?<\/xt>/gi, '');
    en = en.replace(/<chn[^>]*>[\s\S]*?<\/chn>/gi, '');
    en = en.replace(/<[^>]+>/g, '').trim();

    return { en, cn: cn || undefined };
  }

  // 辅助函数：从 deft 标签中提取简体中文释义
  function extractChineseDefinition(content) {
    // 匹配 <deft><chn class="simple">...</chn></deft> 结构
    const deftMatch = content.match(/<deft[^>]*>([\s\S]*?)<\/deft>/i);
    if (deftMatch) {
      const deftContent = deftMatch[1];
      const chnMatch = deftContent.match(/<chn[^>]*class="simple"[^>]*>([\s\S]*?)<\/chn>/i);
      if (chnMatch) {
        return chnMatch[1].replace(/<[^>]+>/g, '').trim();
      }
    }
    return '';
  }

  // 辅助函数：提取 labels（用法标签如 informal, British English）
  function extractLabels(content) {
    const labelMatch = content.match(/<span[^>]*class="[^"]*labels[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    if (labelMatch) {
      // 移除 <labelx> 等标签，只保留英文标签
      let label = labelMatch[1].replace(/<labelx[^>]*>[\s\S]*?<\/labelx>/gi, '');
      label = label.replace(/<[^>]+>/g, '').trim();
      return label;
    }
    return '';
  }

  // 预处理：找到所有习语区域的范围
  function findIdiomSections(html) {
    const sections = [];
    const idiomStartRegex = /<div[^>]*class="[^"]*idioms[^"]*"[^>]*>/gi;
    let match;

    while ((match = idiomStartRegex.exec(html)) !== null) {
      const start = match.index;
      // 找到对应的闭合 </div>
      const end = findClosingTag(html, match.index + match[0].length, 'div');
      if (end !== -1) {
        sections.push({ start, end });
      }
    }
    return sections;
  }

  const idiomSections = findIdiomSections(html);

  // 提取所有位置的词性标签（处理多词性词条，如 compound）
  function findAllPosTags(html) {
    const posTags = [];
    // 只匹配 class 属性中精确包含 "pos" 的 span 标签 (例如 class="pos" 或 class="pos bold")
    // 正则解释: class="... pos ..." 或 class="pos"
    // 为了更严谨，我们先匹配 span 和 class，然后用 JS 判断
    const spanRegex = /<span[^>]*class="([^"]*)"[^>]*>([^<]+)<\/span>/gi;
    let match;
    while ((match = spanRegex.exec(html)) !== null) {
      const classAttr = match[1];
      const content = match[2];
      
      // 分割类名并检查是否包含 'pos'
      const classes = classAttr.split(/\s+/);
      if (classes.includes('pos')) {
        posTags.push({
          pos: content.trim(),
          index: match.index
        });
      }
    }
    return posTags;
  }

  const allPosTags = findAllPosTags(html);

  // 检查位置是否在任何习语区域内
  function isInIdiomSection(position) {
    return idiomSections.some(s => position >= s.start && position <= s.end);
  }

  // 辅助函数：找到匹配的闭合标签位置（处理嵌套）
  function findClosingTag(html, startPos, tagName) {
    let depth = 1;
    let pos = startPos;
    const openPattern = new RegExp(`<${tagName}[^>]*>`, 'gi');
    const closePattern = new RegExp(`</${tagName}>`, 'gi');

    while (depth > 0 && pos < html.length) {
      openPattern.lastIndex = pos;
      closePattern.lastIndex = pos;

      const openMatch = openPattern.exec(html);
      const closeMatch = closePattern.exec(html);

      if (!closeMatch) break;

      if (openMatch && openMatch.index < closeMatch.index) {
        depth++;
        pos = openMatch.index + openMatch[0].length;
      } else {
        depth--;
        if (depth === 0) {
          return closeMatch.index + closeMatch[0].length;
        }
        pos = closeMatch.index + closeMatch[0].length;
      }
    }
    return -1;
  }

  // 1. 找到所有 <li class="sense"> 的开始位置
  const senseStartRegex = /<li[^>]*class="[^"]*sense[^"]*"[^>]*>/gi;
  let match;
  const sensePositions = [];

  while ((match = senseStartRegex.exec(html)) !== null) {
    // 跳过习语区域内的义项
    if (isInIdiomSection(match.index)) {
      continue;
    }
    sensePositions.push({
      start: match.index,
      tagEnd: match.index + match[0].length,
      tag: match[0]
    });
  }

  // 2. 解析每个义项
  for (const pos of sensePositions) {
    const endPos = findClosingTag(html, pos.tagEnd, 'li');
    if (endPos === -1) continue;

    const fullTag = html.substring(pos.start, endPos);
    const content = html.substring(pos.tagEnd, endPos - 5); // -5 for </li>

    // 尝试从标签中提取 sensenum
    const sensenumMatch = pos.tag.match(/sensenum="(\d+)"/i);
    let index = sensenumMatch ? parseInt(sensenumMatch[1], 10) : autoIndex++;

    // 提取定义
    const defMatch = content.match(/<span[^>]*class="[^"]*def[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const definition = defMatch ? defMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // 提取中文定义（从 deft 标签）
    const definitionCn = extractChineseDefinition(content);

    // [New Logic]: Create a "clean" content string by removing variants blocks
    // This prevents labels inside variants (e.g. "informal" inside "also ... times table") 
    // from being extracted as the main sense label.
    let cleanContent = content;
    const variantsStartRegex = /<(div|span)[^>]*class="[^"]*variants[^"]*"[^>]*>/gi;
    let vMatch;
    // We need to remove all variant blocks. 
    // Since removing modifies string length, we collect ranges first on the ORIGINAL content string.
    // However, findClosingTag works on the string passed to it.
    // Simpler approach: Iterate and remove one by one, resetting/re-searching or handling offsets.
    // Given typically 0 or 1 variant block per sense, we can just do one pass loop.
    // BUT modifying string invalidates indices.
    // Strategy: constructing a mask or rebuilding string? 
    // Robust Strategy: Find all top-level variant blocks in original content.
    const rangesToRemove = [];
    while ((vMatch = variantsStartRegex.exec(content)) !== null) {
        const vStart = vMatch.index;
        const tagName = vMatch[1];
        const vEnd = findClosingTag(content, vStart + vMatch[0].length, tagName);
        if (vEnd !== -1) {
            rangesToRemove.push({start: vStart, end: vEnd});
        }
    }
    
    // Sort ranges descending by start to remove safely
    rangesToRemove.sort((a, b) => b.start - a.start);
    for (const r of rangesToRemove) {
        cleanContent = cleanContent.substring(0, r.start) + cleanContent.substring(r.end);
    }

    // 提取语法 (Use cleanContent)
    const grammarMatch = cleanContent.match(/<span[^>]*class="[^"]*grammar[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    let localGrammar = grammarMatch ? grammarMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // 提取标签并附加到局部语法 (Use cleanContent)
    const labels = extractLabels(cleanContent);
    if (labels) {
      localGrammar = localGrammar ? `${localGrammar} ${labels}` : labels;
    }

    // [New Logic]: Clean up dangling 'also' phrases which might be unstripped variant markers
    if (localGrammar) {
        // Specific fix for "table": remove broken "(British English also)" label
        localGrammar = localGrammar.replace(/\(British English also\)/gi, '').trim();
        // General fix: remove trailing "also" if present
        localGrammar = localGrammar.replace(/\s+also\s*$/i, '').trim();
        localGrammar = localGrammar.replace(/^also\s+/i, '').trim();
    }

    // 查找该义项前面最近的词性标签（Global POS）
    let closestPos = '';
    for (const pt of allPosTags) {
        if (pt.index < pos.start) {
            closestPos = pt.pos;
        } else {
            break; // allPosTags should be sorted by index
        }
    }

    // 组合最终语法字段: [Global POS] [Local Grammar]
    // 例如: "noun [C, U]" 或 "verb transitive"
    // 注意避免重复（如果 localGrammar 已经包含了 POS，虽不常见）
    let grammar = closestPos;
    if (localGrammar) {
        grammar = grammar ? `${grammar} ${localGrammar}` : localGrammar;
    }

    // 提取例句 (最多5个)，提取英文和中文
    // 使用 findClosingTag 处理嵌套的 span 标签
    const examples = [];
    const exStartRegex = /<span[^>]*class="x"[^>]*>/gi;
    let exStartMatch;
    while ((exStartMatch = exStartRegex.exec(content)) !== null && examples.length < 5) {
      const startPos = exStartMatch.index + exStartMatch[0].length;
      const endPos = findClosingTag(content, startPos, 'span');
      if (endPos !== -1) {
        const exContent = content.substring(startPos, endPos - 7); // -7 for </span>
        const ex = extractExample(exContent);
        if (ex.en && ex.en.length > 2) examples.push(ex);
      }
    }

    if (definition) {
      senses.push({
        index,
        grammar,
        definition,
        definitionCn,
        examples,
        sense_group: null,
        sense_group_cn: null,
        rawHtml: fullTag.substring(0, 2000)
      });
    }
  }

  // 3. 解析分组信息 (shcut-g) 并更新对应义项
  const shcutRegex = /<span[^>]*class="[^"]*shcut-g[^"]*"[^>]*id="([^"]*)"[^>]*>([\s\S]*?)(?=<span[^>]*class="[^"]*shcut-g[^"]*"|<div[^>]*class="[^"]*idioms[^"]*"|$)/gi;
  let shcutMatch;

  while ((shcutMatch = shcutRegex.exec(html)) !== null) {
    const groupContent = shcutMatch[2];

    // 提取分组标题
    const shcutTitleMatch = groupContent.match(/<h2[^>]*class="[^"]*shcut[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
    if (shcutTitleMatch) {
      const titleContent = shcutTitleMatch[1];

      // 提取英文部分（移除 <shcut> 标签及内容）
      let groupTitle = titleContent.replace(/<shcut[^>]*>[\s\S]*?<\/shcut>/gi, '');
      groupTitle = groupTitle.replace(/<[^>]+>/g, '').trim();

      // 提取中文部分（从 <shcut><chn class="simple"> 中）
      let groupTitleCn = '';
      const shcutCnMatch = titleContent.match(/<shcut[^>]*>([\s\S]*?)<\/shcut>/i);
      if (shcutCnMatch) {
        const chnMatch = shcutCnMatch[1].match(/<chn[^>]*class="simple"[^>]*>([\s\S]*?)<\/chn>/i);
        if (chnMatch) {
          groupTitleCn = chnMatch[1].replace(/<[^>]+>/g, '').trim();
        }
      }

      // 找到该分组内的义项并更新 sense_group
      const groupSenseRegex = /<li[^>]*class="[^"]*sense[^"]*"[^>]*sensenum="(\d+)"[^>]*>/gi;
      let groupSenseMatch;
      while ((groupSenseMatch = groupSenseRegex.exec(groupContent)) !== null) {
        const senseNum = parseInt(groupSenseMatch[1], 10);
        const sense = senses.find(s => s.index === senseNum && !s.sense_group);
        if (sense) {
          sense.sense_group = groupTitle;
          sense.sense_group_cn = groupTitleCn;
        }
      }
    }
  }

  // 如果没有找到义项，整体作为一个义项 (Fallback)
  if (senses.length === 0) {
    const textOnly = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    senses.push({
      index: 1,
      definition: textOnly.substring(0, 500),
      definitionCn: '',
      examples: [],
      rawHtml: html.substring(0, 500),
      sense_group: null,
      sense_group_cn: null
    });
  }

  return senses;
}

async function main() {
  const targetWord = process.argv[2];
  
  if (targetWord && targetWord !== 'build') {
     console.log(`Debugging Mode: target word '${targetWord}'`);
     console.log('Loading MDX file...');
     const mdict = new Mdict(MDX_PATH);
     
     // Wait a bit for async load if needed, though mdict-js is usually sync after constructor? 
     // The original code had a sleep, maybe for memory or loading? 
     // "await new Promise(resolve => setTimeout(resolve, 3000));"
     // Let's keep it safe.
     await new Promise(resolve => setTimeout(resolve, 1000));

     const definition = mdict.lookup(targetWord).definition;
     if (!definition) {
         console.error('Word not found!');
         return;
     }

     console.log('--- Raw HTML Start ---');
     console.log(definition.substring(0, 500));
     console.log('... (truncated)');
     console.log('--- Raw HTML End ---');

     console.log('\nParsing...');
     const senses = parseOALDSensesSimple(definition);
     console.log(JSON.stringify(senses, null, 2));
     console.log(`\nTotal Senses Found: ${senses.length}`);
     return;
  }

  console.log('Loading MDX file...');
  const mdict = new Mdict(MDX_PATH);

  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('Creating database...');
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    DROP TABLE IF EXISTS sense_tags;
    DROP TABLE IF EXISTS tags;
    DROP TABLE IF EXISTS favorites;
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

    CREATE TABLE favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sense_id INTEGER NOT NULL UNIQUE,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#3B82F6'
    );

    CREATE TABLE sense_tags (
      sense_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (sense_id, tag_id)
    );
  `);

  const keys = mdict.keys();
  console.log(`Total entries: ${keys.length}`);

  const insertWord = db.prepare(
    'INSERT INTO words (headword, phon_uk, phon_us, definition_html) VALUES (?, ?, ?, ?)'
  );
  const insertSense = db.prepare(`
    INSERT INTO senses (word_id, sense_index, sense_group, sense_group_cn, grammar, definition, definition_cn, examples, raw_html)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 提取音标的辅助函数
  function extractPhonetics(html) {
    let phonUk = '';
    let phonUs = '';

    // 英式音标: <div class="phons_br">...<span class="phon">/.../</span>
    const ukMatch = html.match(/<div[^>]*class="[^"]*phons_br[^"]*"[^>]*>[\s\S]*?<span[^>]*class="phon"[^>]*>([^<]+)<\/span>/i);
    if (ukMatch) {
      phonUk = ukMatch[1].trim();
    }

    // 美式音标: <div class="phons_n_am">...<span class="phon">/.../</span>
    const usMatch = html.match(/<div[^>]*class="[^"]*phons_n_am[^"]*"[^>]*>[\s\S]*?<span[^>]*class="phon"[^>]*>([^<]+)<\/span>/i);
    if (usMatch) {
      phonUs = usMatch[1].trim();
    }

    return { phonUk, phonUs };
  }

  let processed = 0;
  let skipped = 0;
  const batchSize = 500;

  const insertBatch = db.transaction((batch) => {
    for (const key of batch) {
      try {
        if (key.startsWith('@') || key.startsWith('entry://') || key.length > 100) {
          skipped++;
          continue;
        }

        const result = mdict.lookup(key);
        if (!result || !result.definition) {
          skipped++;
          continue;
        }

        // 限制 HTML 大小
        const html = result.definition.substring(0, 500000);

        // 提取音标
        const { phonUk, phonUs } = extractPhonetics(html);

        const wordResult = insertWord.run(key, phonUk || null, phonUs || null, html);
        const wordId = wordResult.lastInsertRowid;

        const senses = parseOALDSensesSimple(html, key);
        for (const sense of senses) {
          insertSense.run(
            wordId,
            sense.index,
            sense.sense_group || null,
            sense.sense_group_cn || null,
            sense.grammar || null,
            sense.definition,
            sense.definitionCn || null,
            JSON.stringify(sense.examples),
            sense.rawHtml
          );
        }

        processed++;
      } catch (err) {
        skipped++;
      }
    }
  });

  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    insertBatch(batch);

    if ((i / batchSize) % 20 === 0) {
      console.log(`Processed: ${processed} / ${keys.length} (skipped: ${skipped})`);
      // 手动触发 GC
      if (global.gc) global.gc();
    }
  }

  console.log(`\nDone! Processed: ${processed}, Skipped: ${skipped}`);
  console.log(`Database saved to: ${DB_PATH}`);

  db.close();
}
main().catch(console.error);
