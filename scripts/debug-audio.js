const MdictModule = require('mdict-js');
const Mdict = MdictModule.default || MdictModule;

async function main() {
  const mddPath = process.env.MDD_PATH;
  if (!mddPath) {
    console.error('Missing MDD_PATH. Usage: MDD_PATH=/path/to/dictionary.mdd node scripts/debug-audio.js');
    process.exit(1);
  }

  const mdd = new Mdict(mddPath);

  await new Promise(r => setTimeout(r, 3000));

  // 测试 _lookupKID
  const word = 'apple__gb_1.mp3';
  console.log('Looking up:', word);

  const kidResult = mdd._lookupKID(word);
  console.log('_lookupKID result:', kidResult);

  // 手动查找
  // 先找到正确的 key block
  for (let i = 0; i < Math.min(5, mdd.keyBlockInfoList.length); i++) {
    const kb = mdd.keyBlockInfoList[i];
    console.log('KeyBlock', i, ':', kb.firstKey, '->', kb.lastKey);
  }

  // 解码第一个 keyblock 看看 key 格式
  const keyBlock0 = mdd._decodeKeyBlockByKBID(0);
  console.log('\nFirst keyblock has', keyBlock0.length, 'keys');
  console.log('Sample keys:');
  keyBlock0.slice(0, 10).forEach((k, i) => {
    console.log('  ', i, k.keyText);
  });

  // 找 apple
  const allKeys = [];
  for (let i = 0; i < mdd.keyBlockInfoList.length; i++) {
    const keys = mdd._decodeKeyBlockByKBID(i);
    allKeys.push(...keys);
  }
  console.log('\nTotal keys decoded:', allKeys.length);

  const appleKey = allKeys.find(k => k.keyText.toLowerCase().includes('apple__gb'));
  console.log('Found apple key:', appleKey);

  if (appleKey) {
    // 手动解码
    const rid = mdd._reduceRecordBlock(appleKey.recordStartOffset);
    const idx = allKeys.findIndex(k => k === appleKey);
    const nextStart = idx + 1 < allKeys.length
      ? allKeys[idx + 1].recordStartOffset
      : mdd._recordBlockStartOffset + mdd.recordBlockInfoList[mdd.recordBlockInfoList.length - 1].decompAccumulator + mdd.recordBlockInfoList[mdd.recordBlockInfoList.length - 1].decompSize;

    console.log('\nDecoding record block', rid);
    console.log('Start offset:', appleKey.recordStartOffset);
    console.log('Next start:', nextStart);

    const data = mdd._decodeRecordBlockByRBID(rid, appleKey.keyText, appleKey.recordStartOffset, nextStart);
    console.log('Result:', data ? 'got data' : 'null');
    if (data && data.definition) {
      console.log('Definition type:', typeof data.definition);
      console.log('Definition length:', data.definition.length);
    }
  }
}

main().catch(console.error);
