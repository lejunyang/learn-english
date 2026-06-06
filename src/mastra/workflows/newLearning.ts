import { ulid } from 'ulid';
import { generateItems } from '../agents/contentGenerator.js';
import { existingFingerprints, dedupeGenerated } from '../tools/dedup.js';
import {
  appendItems,
  upsertScheduleEntry,
  upsertIndexEntry,
  fingerprintOf,
  readRecentMistakes,
} from '../../domain/store.js';
import { newEntry } from '../../domain/fsrs.js';
import { ItemSchema, type Item, type Scenario } from '../../domain/schemas.js';

export interface NewLearningInput {
  scenario: Scenario;
  minutes: number;
  sessionId: string;
}

export interface NewLearningOutput {
  created: Item[];
  requested: number;
  generated: number;
  duplicates: number;
}

/**
 * 新学习 workflow：估题量 → 取指纹 → 生成 → 校验 → 去重 → 持久化（items + schedule + index）
 */
export async function runNewLearning(input: NewLearningInput): Promise<NewLearningOutput> {
  // ~30 秒/题估算
  const count = Math.max(3, Math.min(40, Math.round(input.minutes * 2)));

  const fps = await existingFingerprints();
  const fpList = Array.from(fps);

  // 取该场景下用户最近常错的表达，让生成器针对性出题
  const allRecent = await readRecentMistakes({ days: 30, limit: 50 });
  const recentMistakes = allRecent
    .filter((m) => !m.scenario || m.scenario === input.scenario)
    .slice(0, 10)
    .map((m) => ({
      prompt: m.prompt,
      correctAnswer: m.correctAnswer,
      userAnswer: m.userAnswer,
      suggestion: m.suggestion,
    }));

  const { items: generated, model } = await generateItems({
    scenario: input.scenario,
    count,
    existingFingerprints: fpList,
    recentMistakes,
  });

  const deduped = dedupeGenerated(generated, fps);

  const now = new Date().toISOString();
  const full: Item[] = deduped.map((g) =>
    ItemSchema.parse({
      ...g,
      scenario: g.scenario ?? input.scenario, // 模型可能没填
      id: ulid(),
      related: [],
      source: { sessionId: input.sessionId, createdAt: now, model },
      stats: { attempts: 0, correct: 0 },
    }),
  );

  if (full.length === 0) {
    return { created: [], requested: count, generated: generated.length, duplicates: generated.length };
  }

  await appendItems(full);

  // 给每条新建一个 schedule（due=now，立即可学）+ index
  for (const it of full) {
    await upsertScheduleEntry(it.id, newEntry());
    await upsertIndexEntry(it.id, {
      type: it.type,
      scenario: it.scenario,
      langTags: it.langTags,
      due: new Date().toISOString(),
      attempts: 0,
      fingerprint: fingerprintOf(it),
    });
  }

  return {
    created: full,
    requested: count,
    generated: generated.length,
    duplicates: generated.length - deduped.length,
  };
}
