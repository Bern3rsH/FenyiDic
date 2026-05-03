const Mdict = require('mdict-js').default;

const MDD_PATH = process.env.MDD_PATH;

if (!MDD_PATH) {
  console.error('Missing MDD_PATH. Usage: MDD_PATH=/path/to/dictionary.mdd node scripts/analyze-mdd.js');
  process.exit(1);
}

async function analyzeMdd() {
  console.log('Loading MDD file...');

  const mdd = new Mdict(MDD_PATH);
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('MDD loaded');
  console.log('Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(mdd)));

  // 尝试查找特定音频
  const testKeys = [
    '\\run__gb_1.mp3',
    '/run__gb_1.mp3',
    'run__gb_1.mp3',
    '\\sound\\run__gb_1.mp3',
    '/sound/run__gb_1.mp3',
  ];

  for (const key of testKeys) {
    try {
      const result = mdd.lookup(key);
      if (result) {
        console.log(`Found: ${key}`, typeof result, result.definition ? result.definition.length : 'no def');
      }
    } catch (e) {
      // ignore
    }
  }

  // 尝试 prefix 搜索
  console.log('\nTrying prefix search...');
  try {
    const prefixResult = mdd.prefix('\\');
    console.log('Prefix result:', prefixResult?.slice(0, 10));
  } catch (e) {
    console.log('Prefix error:', e.message);
  }

  // 检查内部属性
  console.log('\nInternal properties:');
  console.log('_key:', mdd._key?.length);
  console.log('keyList:', mdd.keyList?.length);
}

analyzeMdd().catch(console.error);
