const Mdict = require('mdict-js').default;
const path = require('path');

const MDX_PATH = process.env.MDX_PATH;
if (!MDX_PATH) {
  console.error('Missing MDX_PATH. Usage: MDX_PATH=/path/to/dictionary.mdx node scripts/check_pos_logic.js');
  process.exit(1);
}
console.log('Loading MDX file...');

function checkWait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 模拟 build-db.js 中的解析函数 (复制最新的逻辑)
function parseOALDSensesSimple(html) {
  const senses = [];
  let autoIndex = 1;

  function extractExample(text) {
    let cn = '';
    const xtMatch = text.match(/<xt[^>]*>([\s\S]*?)<\/xt>/i);
    if (xtMatch) {
      const chnInXt = xtMatch[1].match(/<chn[^>]*class="simple"[^>]*>([\s\S]*?)<\/chn>/i);
      if (chnInXt) {
        cn = chnInXt[1].replace(/<[^>]+>/g, '').trim();
      } else {
        cn = xtMatch[1].replace(/<[^>]+>/g, '').trim();
      }
    }
    let en = text.replace(/<xt[^>]*>[\s\S]*?<\/xt>/gi, '');
    en = en.replace(/<chn[^>]*>[\s\S]*?<\/chn>/gi, '');
    en = en.replace(/<[^>]+>/g, '').trim();
    return { en, cn: cn || undefined };
  }

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

  function extractLabels(content) {
    const labelMatch = content.match(/<span[^>]*class="[^"]*labels[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    if (labelMatch) {
      let label = labelMatch[1].replace(/<labelx[^>]*>[\s\S]*?<\/labelx>/gi, '');
      label = label.replace(/<[^>]+>/g, '').trim();
      return label;
    }
    return '';
  }

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

  function findAllPosTags(html) {
    const posTags = [];
    const spanRegex = /<span[^>]*class="([^"]*)"[^>]*>([^<]+)<\/span>/gi;
    let match;
    while ((match = spanRegex.exec(html)) !== null) {
      const classAttr = match[1];
      const content = match[2];
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

  function isInIdiomSection(position) {
    return idiomSections.some(s => position >= s.start && position <= s.end);
  }

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

    // NEW LOGIC: Always combine Global POS with Local Labels
    const grammarMatch = content.match(/<span[^>]*class="[^"]*grammar[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    let localGrammar = grammarMatch ? grammarMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    const labels = extractLabels(content);
    if (labels) {
      localGrammar = localGrammar ? `${localGrammar} ${labels}` : labels;
    }
    let closestPos = '';
    for (const pt of allPosTags) {
        if (pt.index < pos.start) {
            closestPos = pt.pos;
        } else {
            break;
        }
    }
    let grammar = closestPos;
    if (localGrammar) {
        grammar = grammar ? `${grammar} ${localGrammar}` : localGrammar;
    }
    // END NEW LOGIC

    if (definition) {
      senses.push({
        index,
        grammar,
        allPosTagsCount: allPosTags.length, // For debug
        posUsed: closestPos // For debug
      });
    }
  }
  return senses;
}

async function main() {
    const mdict = new Mdict(MDX_PATH);
    await checkWait(1000);
    
    const target = 'table';
    console.log(`Checking '${target}'...`);
    const def = mdict.lookup(target).definition;
    console.log('--- HTML Start ---');
    console.log(def.substring(0, 1000));
    console.log('--- HTML End ---');
    const senses = parseOALDSensesSimple(def);
    
    console.log('--- Sense 1 HTML ---');
    if (senses.length > 0) {
        console.log(senses[0].rawHtml);
    }
    console.log(JSON.stringify(senses, null, 2));
}

main();
