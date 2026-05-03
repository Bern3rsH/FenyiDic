// 测试语法翻译逻辑
const GRAMMAR_TRANSLATIONS = {
  '[countable]': '可数名词',
  '[uncountable]': '不可数名词',
  '[transitive]': '及物动词',
  '[intransitive]': '不及物动词',
  '(informal)': '非正式',
  '(formal)': '正式',
  '(British English)': '英式英语',
  '(US English)': '美式英语',
  'transitive': '及物动词',
};

function testMatch(grammar) {
  const patterns = Object.keys(GRAMMAR_TRANSLATIONS).sort((a, b) => b.length - a.length);
  
  let result = [];
  let remaining = grammar;
  
  while (remaining.length > 0) {
    let matched = false;
    
    for (const pattern of patterns) {
      const lowerRemaining = remaining.toLowerCase();
      const lowerPattern = pattern.toLowerCase();
      const index = lowerRemaining.indexOf(lowerPattern);
      
      if (index === 0) {
        const actualMatch = remaining.substring(0, pattern.length);
        const translation = GRAMMAR_TRANSLATIONS[pattern];
        result.push({ text: actualMatch, translation });
        remaining = remaining.substring(pattern.length);
        matched = true;
        break;
      } else if (index > 0) {
        result.push({ text: remaining.substring(0, index), translation: null });
        remaining = remaining.substring(index);
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      result.push({ text: remaining[0], translation: null });
      remaining = remaining.substring(1);
    }
  }
  
  return result;
}

// 测试用例
const testCases = [
  '[transitive]',
  '[transitive] (British English)',
  '[countable] (US English)',
  '[intransitive, transitive]',
];

for (const test of testCases) {
  console.log(`\nInput: "${test}"`);
  console.log('Result:', JSON.stringify(testMatch(test), null, 2));
}
