// 内存中的活跃会话管理（关闭页面/重启 server 后通过草稿恢复）
import { ulid } from 'ulid';
import type { Item, Session, Scenario, SessionMode, Attempt, HintLevel } from '../domain/schemas.js';
import {
  appendSession,
  saveDraftSession,
  loadDraftSession,
  deleteDraftSession,
  readAllItems,
} from '../domain/store.js';

export interface ActiveSession {
  session: Session;
  // 当前批次的题目（顺序）—— 重启后从 draft + items.jsonl 恢复
  queue: Item[];
  cursor: number; // 下一题在 queue 中的索引
  startedAtMs: number;
  questionStartedAtMs: number;
  hintUsedThisQuestion: HintLevel;
  modelId?: string;
  effort?: 'low' | 'medium' | 'high';
}

const active = new Map<string, ActiveSession>();

// 草稿额外字段（不进 Session 主结构，避免污染最终归档）
interface DraftExtra {
  queueIds: string[];
  cursor: number;
  modelId?: string;
  effort?: 'low' | 'medium' | 'high';
}
const DRAFT_EXTRA_KEY = '__learnDraft' as const;

function packDraft(session: Session, extra: DraftExtra): Session {
  // 把 extra 塞到 session 的一个非标字段里（passthrough 容忍）
  return { ...session, [DRAFT_EXTRA_KEY]: extra } as Session;
}

function unpackDraft(session: Session): { session: Session; extra: DraftExtra | undefined } {
  const raw = session as Session & { [DRAFT_EXTRA_KEY]?: DraftExtra };
  const extra = raw[DRAFT_EXTRA_KEY];
  if (!extra) return { session, extra: undefined };
  const cleaned = { ...raw };
  delete (cleaned as Partial<typeof raw>)[DRAFT_EXTRA_KEY];
  return { session: cleaned, extra };
}

async function persistDraft(act: ActiveSession): Promise<void> {
  await saveDraftSession(
    packDraft(act.session, {
      queueIds: act.queue.map((q) => q.id),
      cursor: act.cursor,
      modelId: act.modelId,
      effort: act.effort,
    }),
  );
}

export function createSession(opts: {
  mode: SessionMode;
  scenario?: Scenario;
  plannedMinutes: number;
  queue: Item[];
  id?: string;
  modelId?: string;
  effort?: 'low' | 'medium' | 'high';
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
    modelId: opts.modelId,
    effort: opts.effort,
  };
  active.set(id, act);
  void persistDraft(act);
  return act;
}

export function getSession(id: string): ActiveSession | undefined {
  return active.get(id);
}

/**
 * 找不到活跃会话时调用 —— 尝试从 draft 文件恢复。
 * 返回 undefined 表示 draft 不存在或已损坏。
 */
export async function restoreSession(id: string): Promise<ActiveSession | undefined> {
  if (active.has(id)) return active.get(id);
  const raw = await loadDraftSession(id);
  if (!raw) return undefined;
  const { session, extra } = unpackDraft(raw);
  if (!extra) return undefined;

  const allItems = await readAllItems();
  const byId = new Map(allItems.map((it) => [it.id, it]));
  const queue: Item[] = [];
  for (const qid of extra.queueIds) {
    const it = byId.get(qid);
    if (it) queue.push(it);
  }
  if (queue.length === 0) return undefined;

  const now = Date.now();
  const act: ActiveSession = {
    session,
    queue,
    cursor: Math.min(extra.cursor, queue.length),
    startedAtMs: new Date(session.startedAt).getTime(),
    questionStartedAtMs: now, // 重启后从现在开始计时本题
    hintUsedThisQuestion: 'none',
    modelId: extra.modelId,
    effort: extra.effort,
  };
  active.set(id, act);
  return act;
}

export function recordAttempt(id: string, attempt: Attempt): void {
  const act = active.get(id);
  if (!act) return;
  act.session.attempts.push(attempt);
  act.cursor += 1;
  act.questionStartedAtMs = Date.now();
  act.hintUsedThisQuestion = 'none';
  void persistDraft(act);
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
