import { Hono } from 'hono';
import { readAllItems } from '../../domain/store.js';
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
