const fs = require('fs');
const path = require('path');

// 复制 build-db.js 中的解析函数
function parseOALDSensesSimple(html) {
  const senses = [];
  let autoIndex = 1;

  // 辅助函数：从例句中提取纯英文（移除 <xt> 和 <chn> 标签内的中文内容）
  function extractEnglishOnly(text) {
    let result = text.replace(/<xt[^>]*>[\s\S]*?<\/xt>/gi, '');
    result = result.replace(/<chn[^>]*>[\s\S]*?<\/chn>/gi, '');
    result = result.replace(/<[^>]+>/g, '');
    return result.trim();
  }

  // 辅助函数：从 deft 标签中提取简体中文释义
  function extractChineseDefinition(content) {
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

  // 辅助函数：提取 labels
  function extractLabels(content) {
    const labelMatch = content.match(/<span[^>]*class="[^"]*labels[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    if (labelMatch) {
      let label = labelMatch[1].replace(/<labelx[^>]*>[\s\S]*?<\/labelx>/gi, '');
      label = label.replace(/<[^>]+>/g, '').trim();
      return label;
    }
    return '';
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

  // 预处理：找到所有习语区域的范围
  function findIdiomSections(html) {
    const sections = [];
    const idiomStartRegex = /<div[^>]*class="[^"]*idioms[^"]*"[^>]*>/gi;
    let match;

    while ((match = idiomStartRegex.exec(html)) !== null) {
      const start = match.index;
      const end = findClosingTag(html, match.index + match[0].length, 'div');
      if (end !== -1) {
        sections.push({ start, end });
      }
    }
    return sections;
  }

  const idiomSections = findIdiomSections(html);

  // 检查位置是否在任何习语区域内
  function isInIdiomSection(position) {
    return idiomSections.some(s => position >= s.start && position <= s.end);
  }

  // 1. 找到所有 <li class="sense"> 的开始位置
  const senseStartRegex = /<li[^>]*class="[^"]*sense[^"]*"[^>]*>/gi;
  let match;
  const sensePositions = [];

  while ((match = senseStartRegex.exec(html)) !== null) {
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
    const content = html.substring(pos.tagEnd, endPos - 5);

    const sensenumMatch = pos.tag.match(/sensenum="(\d+)"/i);
    let index = sensenumMatch ? parseInt(sensenumMatch[1], 10) : autoIndex++;

    const defMatch = content.match(/<span[^>]*class="[^"]*def[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const definition = defMatch ? defMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    const definitionCn = extractChineseDefinition(content);

    const grammarMatch = content.match(/<span[^>]*class="[^"]*grammar[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    let grammar = grammarMatch ? grammarMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    const labels = extractLabels(content);
    if (labels) {
      grammar = grammar ? `${grammar} ${labels}` : labels;
    }

    const examples = [];
    const exRegex = /<span[^>]*class="x"[^>]*>([\s\S]*?)<\/span>/gi;
    let exMatch;
    while ((exMatch = exRegex.exec(content)) !== null && examples.length < 5) {
      const ex = extractEnglishOnly(exMatch[1]);
      if (ex && ex.length > 2) examples.push(ex);
    }

    if (definition) {
      senses.push({
        index,
        grammar,
        definition,
        definitionCn,
        examples,
        sense_group: null,
        rawHtml: fullTag.substring(0, 2000)
      });
    }
  }

  // 3. 解析分组信息 (shcut-g) 并更新对应义项
  const shcutRegex = /<span[^>]*class="[^"]*shcut-g[^"]*"[^>]*id="([^"]*)"[^>]*>([\s\S]*?)(?=<span[^>]*class="[^"]*shcut-g[^"]*"|<div[^>]*class="[^"]*idioms[^"]*"|$)/gi;
  let shcutMatch;

  while ((shcutMatch = shcutRegex.exec(html)) !== null) {
    const groupContent = shcutMatch[2];

    const shcutTitleMatch = groupContent.match(/<h2[^>]*class="[^"]*shcut[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
    if (shcutTitleMatch) {
      let groupTitle = shcutTitleMatch[1].replace(/<shcut[^>]*>[\s\S]*?<\/shcut>/gi, '');
      groupTitle = groupTitle.replace(/<[^>]+>/g, '').trim();

      const groupSenseRegex = /<li[^>]*class="[^"]*sense[^"]*"[^>]*sensenum="(\d+)"[^>]*>/gi;
      let groupSenseMatch;
      while ((groupSenseMatch = groupSenseRegex.exec(groupContent)) !== null) {
        const senseNum = parseInt(groupSenseMatch[1], 10);
        const sense = senses.find(s => s.index === senseNum && !s.sense_group);
        if (sense) {
          sense.sense_group = groupTitle;
        }
      }
    }
  }

  // Fallback
  if (senses.length === 0) {
    const textOnly = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    senses.push({
      index: 1,
      definition: textOnly.substring(0, 500),
      definitionCn: '',
      examples: [],
      rawHtml: html.substring(0, 500),
      sense_group: null
    });
  }

  return senses;
}

// 测试 book (清理后的文件)
console.log('=== Testing "book" (cleaned) ===\n');
const bookHtml = fs.readFileSync(path.join(__dirname, '../temp_book_clean.html'), 'utf-8');
const bookSenses = parseOALDSensesSimple(bookHtml);

bookSenses.forEach(s => {
  console.log(`[${s.index}] Group: ${s.sense_group || 'none'} | Grammar: ${s.grammar || 'none'}`);
  console.log(`    Def EN: ${s.definition.substring(0, 70)}...`);
  console.log(`    Def CN: ${s.definitionCn || 'none'}`);
  console.log('---');
});

console.log(`\nTotal senses: ${bookSenses.length}`);
