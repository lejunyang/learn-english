import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  readSchedule,
  upsertScheduleEntry,
  readAllItems,
} from '../../domain/store.js';
import {
  ScheduleEntrySchema,
  SCENARIOS,
  type ScheduleEntry,
} from '../../domain/schemas.js';
import { applyReview, newEntry, isDue, overdueMs, type ReviewScore } from '../../domain/fsrs.js';

// ============================================================
// getDue —— 取到期可复习项
// ============================================================
export const getDueTool = createTool({
  id: 'scheduler.getDue',
  description: '获取到期/已 overdue 的学习项，按 overdue 程度 + 历史低分优先排序。',
  inputSchema: z.object({
    scenario: z.enum(SCENARIOS).optional(),
    limit: z.number().int().positive().max(200).default(20),
  }),
  outputSchema: z.object({
    itemIds: z.array(z.string()),
  }),
  execute: async ({ context }) => {
    const [items, schedule] = await Promise.all([readAllItems(), readSchedule()]);
    const now = new Date();
    const candidates = items
      .filter((it) => (context.scenario ? it.scenario === context.scenario : true))
      .map((it) => ({ it, sched: schedule[it.id] }))
      .filter((p): p is { it: typeof p.it; sched: ScheduleEntry } => !!p.sched && isDue(p.sched, now));

    candidates.sort((a, b) => {
      // overdue 越久越优先；同等 overdue 时分数低的优先
      const od = overdueMs(b.sched, now) - overdueMs(a.sched, now);
      if (od !== 0) return od;
      return (a.it.stats.lastScore ?? 0) - (b.it.stats.lastScore ?? 0);
    });

    return { itemIds: candidates.slice(0, context.limit).map((c) => c.it.id) };
  },
});

// ============================================================
// record —— 用户答题后更新调度 + item.stats
// ============================================================
export const recordReviewTool = createTool({
  id: 'scheduler.record',
  description: '记录一次复习评分，更新 FSRS 调度与 item 统计。',
  inputSchema: z.object({
    itemId: z.string(),
    score: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  }),
  outputSchema: z.object({
    schedule: ScheduleEntrySchema,
  }),
  execute: async ({ context }) => {
    const map = await readSchedule();
    const prev = map[context.itemId] ?? newEntry();
    const next = applyReview(prev, context.score as ReviewScore);
    await upsertScheduleEntry(context.itemId, next);
    return { schedule: next };
  },
});

// 直接给非-tool 调用方使用的工具函数
export { applyReview, newEntry, isDue, overdueMs };
