import { readAllItems, readSchedule } from '../../domain/store.js';
import { isDue, overdueMs } from '../../domain/fsrs.js';
import type { Item, Scenario } from '../../domain/schemas.js';

export interface ReviewPickInput {
  scenario?: Scenario;
  minutes: number;
}

export interface ReviewPickOutput {
  items: Item[];
  available: number; // 总到期数
}

/**
 * 复习 workflow：取到期 item，按 overdue + 历史低分排序，截取本次需要的数量。
 */
export async function runReviewPick(input: ReviewPickInput): Promise<ReviewPickOutput> {
  const limit = Math.max(3, Math.min(40, Math.round(input.minutes * 2)));

  const [items, schedule] = await Promise.all([readAllItems(), readSchedule()]);
  const now = new Date();

  const due = items
    .map((it) => ({ it, sched: schedule[it.id] }))
    .filter((p): p is { it: Item; sched: NonNullable<typeof p.sched> } => !!p.sched && isDue(p.sched, now))
    .filter((p) => (input.scenario ? p.it.scenario === input.scenario : true));

  due.sort((a, b) => {
    const od = overdueMs(b.sched, now) - overdueMs(a.sched, now);
    if (od !== 0) return od;
    return (a.it.stats.lastScore ?? 0) - (b.it.stats.lastScore ?? 0);
  });

  return {
    items: due.slice(0, limit).map((p) => p.it),
    available: due.length,
  };
}
