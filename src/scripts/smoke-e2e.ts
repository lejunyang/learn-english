// 跑一遍完整 newLearning workflow，看磁盘是否落库
import 'dotenv/config';
import { runNewLearning } from '../mastra/workflows/newLearning.js';
import { readAllItems, readSchedule } from '../domain/store.js';

async function main() {
  console.log('[e2e] running newLearning workflow...');
  const t0 = Date.now();
  const res = await runNewLearning({
    scenario: 'daily',
    minutes: 2, // 4 题
    sessionId: 'smoke-' + Date.now(),
  });
  console.log(`[e2e] workflow ok in ${Date.now() - t0}ms`);
  console.log(`[e2e] requested=${res.requested} localUsed=${res.localUsed} aiGenerated=${res.aiGenerated} aiDuplicates=${res.aiDuplicates} created=${res.created.length}`);

  const [items, schedule] = await Promise.all([readAllItems(), readSchedule()]);
  console.log(`[e2e] disk: items=${items.length} schedule=${Object.keys(schedule).length}`);
  if (items[0]) {
    console.log('[e2e] sample item type=' + items[0].type + ' scenario=' + items[0].scenario);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
