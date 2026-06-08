import { Hono } from 'hono';
import { readAllItems, updateItem, patchDictShard, patchCorpusShard } from '../../domain/store.js';
import { SCENARIOS } from '../../domain/schemas.js';

export const itemRoutes = new Hono();

itemRoutes.get('/', async (c) => {
  const scenario = c.req.query('scenario');
  const type = c.req.query('type');
  const q = c.req.query('q')?.toLowerCase();
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100'), 500);

  const all = await readAllItems();
  const filtered = all.filter((it) => {
    if (scenario && !SCENARIOS.includes(scenario as never)) return false;
    if (scenario && it.scenario !== scenario) return false;
    if (type && it.type !== type) return false;
    if (q) {
      const hay = [it.prompt.en, it.prompt.cn, it.prompt.cloze, it.answer.en, it.answer.cn]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return c.json({
    items: filtered.slice(0, limit),
    total: filtered.length,
  });
});

/** 用户备注 —— 直接回写到 item + 源数据（dict/corpus），不经 agent */
itemRoutes.post('/:id/note', async (c) => {
  const id = c.req.param('id');
  const { userNote } = await c.req.json<{ userNote?: string }>();
  if (typeof userNote !== 'string') {
    return c.json({ error: 'userNote must be a string' }, 400);
  }

  const item = await updateItem(id, { userNote });
  if (!item) return c.json({ error: 'item not found' }, 404);

  // 如有 sourceRef，同步写回源数据
  if (item.sourceRef) {
    const isDict = item.source.model.includes('local:ecdict');
    if (isDict) {
      await patchDictShard(item.sourceRef, { userNote });
    } else {
      // local:corpus — sourceRef 存 corpus id
      await patchCorpusShard(item.sourceRef, { userNote });
    }
  }

  return c.json({ ok: true, userNote });
});
