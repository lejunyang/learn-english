import { Hono } from 'hono';
import { z } from 'zod';
import { runNewLearning } from '../../mastra/workflows/newLearning.js';
import { runReviewPick } from '../../mastra/workflows/reviewPick.js';
import { gradeTranslation } from '../../mastra/agents/translationGrader.js';
import { streamCoachExplanation } from '../../mastra/agents/learningCoach.js';
import { applyReview, type ReviewScore } from '../../domain/fsrs.js';
import { readSchedule, upsertScheduleEntry, updateItem } from '../../domain/store.js';
import {
  createSession,
  getSession,
  currentQuestion,
  recordAttempt,
  markHint,
  finishSession,
} from '../sessionManager.js';
import { ulid } from 'ulid';
import { SCENARIOS, type Item, type Scenario } from '../../domain/schemas.js';

export const sessionRoutes = new Hono();

// ============================================================
// 启动 —— 新学习 或 复习
// ============================================================
const StartBody = z.object({
  mode: z.enum(['new', 'review']),
  scenario: z.enum(SCENARIOS).optional(),
  minutes: z.number().int().positive().max(120),
});

sessionRoutes.post('/start', async (c) => {
  const parsed = StartBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { mode, scenario, minutes } = parsed.data;
  const sessionId = ulid();

  let queue: Item[];
  let meta: Record<string, unknown> = {};

  if (mode === 'new') {
    if (!scenario) return c.json({ error: 'scenario required for mode=new' }, 400);
    const result = await runNewLearning({ scenario, minutes, sessionId });
    queue = result.created;
    meta = {
      requested: result.requested,
      generated: result.generated,
      duplicates: result.duplicates,
    };
  } else {
    const result = await runReviewPick({ scenario, minutes });
    queue = result.items;
    meta = { available: result.available };
  }

  if (queue.length === 0) {
    return c.json({ error: 'no items to learn/review', meta }, 200);
  }

  const act = createSession({
    mode,
    scenario,
    plannedMinutes: minutes,
    queue,
    id: sessionId,
  });
  return c.json({
    sessionId: act.session.id,
    total: queue.length,
    current: sanitizeForClient(queue[0]!),
    meta,
  });
});

// ============================================================
// 当前题
// ============================================================
sessionRoutes.get('/:id/current', (c) => {
  const id = c.req.param('id');
  const item = currentQuestion(id);
  const act = getSession(id);
  if (!act) return c.json({ error: 'session not found' }, 404);
  if (!item) return c.json({ done: true });
  return c.json({
    current: sanitizeForClient(item),
    index: act.cursor,
    total: act.queue.length,
  });
});

// ============================================================
// 提示
// ============================================================
sessionRoutes.get('/:id/hint', (c) => {
  const id = c.req.param('id');
  const level = c.req.query('level') === 'strong' ? 'strong' : 'weak';
  const item = currentQuestion(id);
  if (!item) return c.json({ error: 'no current question' }, 404);
  markHint(id, level);
  return c.json({ hint: item.hints[level], level });
});

// ============================================================
// 评分（en2cn / cn2en / cloze —— 客户端比对，服务端记录 + 调度）
// ============================================================
const GradeBody = z.object({
  itemId: z.string(),
  userAnswer: z.string(),
  score: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

sessionRoutes.post('/:id/grade', async (c) => {
  const id = c.req.param('id');
  const act = getSession(id);
  if (!act) return c.json({ error: 'session not found' }, 404);
  const parsed = GradeBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const item = currentQuestion(id);
  if (!item || item.id !== parsed.data.itemId) {
    return c.json({ error: 'itemId mismatch' }, 400);
  }

  await applyAndPersist(parsed.data.itemId, parsed.data.score as ReviewScore, item);

  const durationMs = Date.now() - act.questionStartedAtMs;
  recordAttempt(id, {
    itemId: parsed.data.itemId,
    type: item.type,
    userAnswer: parsed.data.userAnswer,
    score: parsed.data.score,
    usedHint: act.hintUsedThisQuestion,
    durationMs,
  });

  const next = currentQuestion(id);
  return c.json({
    next: next ? sanitizeForClient(next) : null,
    index: act.cursor,
    total: act.queue.length,
    done: !next,
  });
});

// ============================================================
// 翻译题评分 (SSE 流式反馈)
// ============================================================
const GradeTranslationBody = z.object({
  itemId: z.string(),
  userAnswer: z.string(),
});

sessionRoutes.post('/:id/grade-translation', async (c) => {
  const id = c.req.param('id');
  const act = getSession(id);
  if (!act) return c.json({ error: 'session not found' }, 404);
  const parsed = GradeTranslationBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const item = currentQuestion(id);
  if (!item || item.id !== parsed.data.itemId || item.type !== 'translate') {
    return c.json({ error: 'not a translate item or itemId mismatch' }, 400);
  }
  if (!item.prompt.cn || !item.answer.en) {
    return c.json({ error: 'malformed translate item' }, 500);
  }

  // 同步评分（grader 输出结构化），然后一次性返回 JSON。
  // 流式 coach 解释走 /coach 单独路由。
  const { grade } = await gradeTranslation({
    cn: item.prompt.cn,
    userEn: parsed.data.userAnswer,
    referenceEn: item.answer.en,
  });

  await applyAndPersist(parsed.data.itemId, grade.score as ReviewScore, item, grade.feedback);

  const durationMs = Date.now() - act.questionStartedAtMs;
  recordAttempt(id, {
    itemId: parsed.data.itemId,
    type: 'translate',
    userAnswer: parsed.data.userAnswer,
    score: grade.score,
    usedHint: act.hintUsedThisQuestion,
    durationMs,
    feedback: grade.feedback,
  });

  const next = currentQuestion(id);
  return c.json({
    grade,
    next: next ? sanitizeForClient(next) : null,
    index: act.cursor,
    total: act.queue.length,
    done: !next,
  });
});

// ============================================================
// Coach 解释（SSE）—— 用于答错后流式获取讲解
// ============================================================
sessionRoutes.get('/:id/coach', async (c) => {
  const id = c.req.param('id');
  const itemId = c.req.query('itemId');
  const userAnswer = c.req.query('userAnswer') ?? '';
  const act = getSession(id);
  if (!act) return c.json({ error: 'session not found' }, 404);
  // 找最近一次该 itemId 的 attempt
  const item =
    act.queue.find((q) => q.id === itemId) ??
    (() => {
      const last = [...act.session.attempts].reverse().find((a) => a.itemId === itemId);
      return last ? act.queue.find((q) => q.id === last.itemId) : undefined;
    })();
  if (!item) return c.json({ error: 'item not found in session' }, 404);

  const stream = await streamCoachExplanation({ item, userAnswer });

  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');

  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of stream.textStream) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
          }
          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
        } catch (err) {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`),
          );
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    },
  );
});

// ============================================================
// 结束会话
// ============================================================
sessionRoutes.post('/:id/finish', async (c) => {
  const id = c.req.param('id');
  const session = await finishSession(id);
  if (!session) return c.json({ error: 'session not found' }, 404);

  // 可选自动 commit
  if (process.env.AUTO_COMMIT === '1') {
    try {
      const { execSync } = await import('node:child_process');
      execSync(`git add data && git commit -m "session ${session.id}" --allow-empty`, { stdio: 'ignore' });
    } catch {
      // 忽略 git 失败（首次 commit 等场景）
    }
  }

  return c.json({
    session,
    summary: summarize(session.attempts),
  });
});

// ============================================================
// helpers
// ============================================================

// 不要把 distractors 之外的"答案"暴露给前端（en2cn/cn2en/cloze 题面里）
// 但 phonetics 可以一并下发，前端展示
function sanitizeForClient(it: Item) {
  // 翻译题不发 answer.en（防止用户作弊）
  if (it.type === 'translate') {
    const { answer: _, ...rest } = it;
    return rest;
  }
  return it;
}

async function applyAndPersist(
  itemId: string,
  score: ReviewScore,
  item: Item,
  feedback?: string,
): Promise<void> {
  // FSRS 更新
  const map = await readSchedule();
  const prev = map[itemId];
  if (prev) {
    await upsertScheduleEntry(itemId, applyReview(prev, score));
  }
  // item.stats 更新
  await updateItem(itemId, {
    stats: {
      attempts: item.stats.attempts + 1,
      correct: item.stats.correct + (score >= 2 ? 1 : 0),
      lastScore: score,
    },
  });
}

function summarize(attempts: Array<{ score: 0 | 1 | 2 | 3 }>) {
  const total = attempts.length;
  const good = attempts.filter((a) => a.score >= 2).length;
  return {
    total,
    correct: good,
    accuracy: total ? Math.round((good / total) * 100) : 0,
  };
}
