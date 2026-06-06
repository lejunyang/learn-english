// 内存中的活跃会话管理（关闭页面后通过草稿恢复）
import { ulid } from 'ulid';
import type { Item, Session, Scenario, SessionMode, Attempt, HintLevel } from '../domain/schemas.js';
import { appendSession, saveDraftSession, deleteDraftSession } from '../domain/store.js';

export interface ActiveSession {
  session: Session;
  // 当前批次的题目（顺序）
  queue: Item[];
  cursor: number; // 下一题在 queue 中的索引
  startedAtMs: number;
  questionStartedAtMs: number;
  hintUsedThisQuestion: HintLevel;
}

const active = new Map<string, ActiveSession>();

export function createSession(opts: {
  mode: SessionMode;
  scenario?: Scenario;
  plannedMinutes: number;
  queue: Item[];
  id?: string;
}): ActiveSession {
  const id = opts.id ?? ulid();
  const now = new Date();
  const session: Session = {
    id,
    startedAt: now.toISOString(),
    mode: opts.mode,
    scenario: opts.scenario,
    plannedMinutes: opts.plannedMinutes,
    attempts: [],
  };
  const act: ActiveSession = {
    session,
    queue: opts.queue,
    cursor: 0,
    startedAtMs: now.getTime(),
    questionStartedAtMs: now.getTime(),
    hintUsedThisQuestion: 'none',
  };
  active.set(id, act);
  void saveDraftSession(session);
  return act;
}

export function getSession(id: string): ActiveSession | undefined {
  return active.get(id);
}

export function recordAttempt(id: string, attempt: Attempt): void {
  const act = active.get(id);
  if (!act) return;
  act.session.attempts.push(attempt);
  act.cursor += 1;
  act.questionStartedAtMs = Date.now();
  act.hintUsedThisQuestion = 'none';
  void saveDraftSession(act.session);
}

export function markHint(id: string, level: HintLevel): void {
  const act = active.get(id);
  if (!act) return;
  // 升级提示等级：none < weak < strong
  const rank: Record<HintLevel, number> = { none: 0, weak: 1, strong: 2 };
  if (rank[level] > rank[act.hintUsedThisQuestion]) {
    act.hintUsedThisQuestion = level;
  }
}

export function currentQuestion(id: string): Item | undefined {
  const act = active.get(id);
  if (!act) return undefined;
  return act.queue[act.cursor];
}

export async function finishSession(id: string): Promise<Session | undefined> {
  const act = active.get(id);
  if (!act) return undefined;
  act.session.finishedAt = new Date().toISOString();
  await appendSession(act.session);
  await deleteDraftSession(id);
  active.delete(id);
  return act.session;
}
