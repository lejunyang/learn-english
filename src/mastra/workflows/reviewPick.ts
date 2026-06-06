import { readAllItems, readSchedule, readRecentMistakes } from '../../domain/store.js';
import { isDue, overdueMs } from '../../domain/fsrs.js';
import type { Item, Scenario } from '../../domain/schemas.js';

export interface ReviewPickInput {
  scenario?: Scenario;
  minutes: number;
}

export interface ReviewPickOutput {
  items: Item[];
  available: number;
  mistakeBoost: number; // 本次因错题被前置的题目数
}

/**
 * 复习 workflow：取到期 item，先把错题相关的 item 前置，剩下按 overdue + 历史低分排序，截取本次需要的数量。
 */
export async function runReviewPick(input: ReviewPickInput): Promise<ReviewPickOutput> {
  const limit = Math.max(3, Math.min(40, Math.round(input.minutes * 2)));

  const [items, schedule, mistakes] = await Promise.all([
    readAllItems(),
    readSchedule(),
    readRecentMistakes({ days: 30, limit: 100 }),
  ]);
  const now = new Date();
  const mistakeItemIds = new Set(mistakes.map((m) => m.itemId));

  const due = items
    .map((it) => ({ it, sched: schedule[it.id] }))
    .filter((p): p is { it: Item; sched: NonNullable<typeof p.sched> } => !!p.sched && isDue(p.sched, now))
    .filter((p) => (input.scenario ? p.it.scenario === input.scenario : true));

  due.sort((a, b) => {
    // 1) 错题优先
    const aIsMistake = mistakeItemIds.has(a.it.id) ? 1 : 0;
    const bIsMistake = mistakeItemIds.has(b.it.id) ? 1 : 0;
    if (aIsMistake !== bIsMistake) return bIsMistake - aIsMistake;
    // 2) overdue 越久越优先
    const od = overdueMs(b.sched, now) - overdueMs(a.sched, now);
    if (od !== 0) return od;
    // 3) 历史分数低优先
    return (a.it.stats.lastScore ?? 0) - (b.it.stats.lastScore ?? 0);
  });

  const picked = due.slice(0, limit).map((p) => p.it);
  const mistakeBoost = picked.filter((it) => mistakeItemIds.has(it.id)).length;

  return { items: picked, available: due.length, mistakeBoost };
}
