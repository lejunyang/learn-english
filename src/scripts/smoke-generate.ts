// 烟雾测试：试一次 contentGenerator，看 .object 字段名是否对
import 'dotenv/config';
import { generateItems } from '../mastra/agents/contentGenerator.js';

async function main() {
  console.log('[smoke] provider:', process.env.MODEL_PROVIDER || 'anthropic');
  console.log('[smoke] base URL:', process.env.ANTHROPIC_BASE_URL || '(default)');
  console.log('[smoke] model:', process.env.MODEL_GENERATOR);

  const start = Date.now();
  try {
    const res = await generateItems({
      scenario: 'daily',
      count: 3,
      existingFingerprints: [],
    });
    console.log(`[smoke] ok in ${Date.now() - start}ms, generated ${res.items.length} items`);
    console.log('[smoke] first item:\n', JSON.stringify(res.items[0], null, 2));
  } catch (e) {
    console.error('[smoke] FAILED in', Date.now() - start, 'ms');
    console.error(e);
    process.exit(1);
  }
}

main();
