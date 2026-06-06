import { Hono } from 'hono';
import { promises as fs } from 'node:fs';
import { readAllItems, readSchedule, SESSIONS_DIR } from '../../domain/store.js';
import path from 'node:path';
import { isDue } from '../../domain/fsrs.js';

export const statsRoutes = new Hono();

statsRoutes.get('/overview', async (c) => {
  const [items, schedule] = await Promise.all([readAllItems(), readSchedule()]);
  const now = new Date();
  const due = items.filter((it) => {
    const s = schedule[it.id];
    return s && isDue(s, now);
  }).length;

  const byScenario: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const it of items) {
    byScenario[it.scenario] = (byScenario[it.scenario] ?? 0) + 1;
    byType[it.type] = (byType[it.type] ?? 0) + 1;
  }

  let sessionsCount = 0;
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    sessionsCount = files.filter((f) => f.endsWith('.jsonl')).length;
  } catch {
    sessionsCount = 0;
  }

  return c.json({
    totalItems: items.length,
    due,
    byScenario,
    byType,
    sessionDays: sessionsCount,
  });
});

statsRoutes.get('/recent-sessions', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '7');
  try {
    const files = (await fs.readdir(SESSIONS_DIR))
      .filter((f) => f.endsWith('.jsonl'))
      .sort()
      .reverse()
      .slice(0, limit);
    const days = await Promise.all(
      files.map(async (f) => {
        const text = await fs.readFile(path.join(SESSIONS_DIR, f), 'utf8');
        const lines = text.split('\n').filter(Boolean);
        return { date: f.replace('.jsonl', ''), sessions: lines.length };
      }),
    );
    return c.json({ days });
  } catch {
    return c.json({ days: [] });
  }
});
