import { ulid } from 'ulid';
import { generateItems } from '../agents/contentGenerator.js';
import { existingFingerprints, dedupeGenerated } from '../tools/dedup.js';
import {
  appendItems,
  upsertScheduleEntry,
  upsertIndexEntry,
  fingerprintOf,
  readRecentMistakes,
  pickDictBy,
  pickCorpusBy,
} from '../../domain/store.js';
import { newEntry } from '../../domain/fsrs.js';
import {
  ItemSchema,
  effectiveCorpus,
  effectiveDict,
  type Item,
  type Scenario,
  type DictEntry,
  type CorpusEntry,
  type GeneratedItem,
} from '../../domain/schemas.js';

export interface NewLearningInput {
  scenario: Scenario;
  minutes: number;
  sessionId: string;
  modelId?: string;
  effort?: 'low' | 'medium' | 'high';
  /** AI 占比 0~1。默认 0 = 全本地，1 = 全 AI。本地不足会自动用 AI 补到 count */
  aiRatio?: number;
}

export interface NewLearningOutput {
  created: Item[];
  requested: number;
  localUsed: number;
  aiGenerated: number;
  aiDuplicates: number;
}

/**
 * 新学习 workflow：
 * 1. 估题量 count
 * 2. 本地从 dict/corpus 拼装 (count × (1-aiRatio)) 条
 * 3. 不够 / aiRatio > 0 时再请 AI 生成补足
 * 4. 落盘
 */
export async function runNewLearning(input: NewLearningInput): Promise<NewLearningOutput> {
  const baseCount = Math.max(3, Math.min(40, Math.round(input.minutes * 2)));
  const effortMultiplier = input.effort === 'low' ? 0.7 : input.effort === 'high' ? 1.5 : 1;
  const count = Math.max(3, Math.min(60, Math.round(baseCount * effortMultiplier)));

  const aiRatio = Math.max(0, Math.min(1, input.aiRatio ?? 0));
  const aiTarget = Math.round(count * aiRatio);
  const localTarget = count - aiTarget;

  const fps = await existingFingerprints();

  // ── 本地拼装 ──
  const localItems = await assembleLocalItems({
    scenario: input.scenario,
    desired: localTarget,
    sessionId: input.sessionId,
    fingerprints: fps,
  });
  // 本地实际能给的数量 (≤ localTarget)；不足的部分由 AI 补
  const aiNeeded = count - localItems.length;

  // ── AI 生成（如果需要）──
  let aiCreated: Item[] = [];
  let aiGeneratedCount = 0;
  let aiDupCount = 0;
  if (aiNeeded > 0) {
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
      count: aiNeeded,
      existingFingerprints: Array.from(fps),
      recentMistakes,
      modelId: input.modelId,
    });
    aiGeneratedCount = generated.length;
    const deduped = dedupeGenerated(generated, fps);
    aiDupCount = generated.length - deduped.length;

    const now = new Date().toISOString();
    aiCreated = deduped.map((g) => {
      // 白名单过滤：只取 ItemSchema 接受的字段，去掉 AI 多塞的 fingerprint/id 等
      const clean = {
        type: g.type,
        scenario: g.scenario ?? input.scenario,
        langTags: g.langTags ?? [],
        difficulty: g.difficulty,
        prompt: g.prompt,
        answer: g.answer,
        distractors: g.distractors,
        hints: g.hints,
        phonetics: g.phonetics,
      };
      return ItemSchema.parse({
        ...clean,
        id: ulid(),
        related: [],
        source: { sessionId: input.sessionId, createdAt: now, model },
        stats: { attempts: 0, correct: 0 },
      });
    });
  }

  const full = [...localItems, ...aiCreated];

  if (full.length === 0) {
    return {
      created: [],
      requested: count,
      localUsed: 0,
      aiGenerated: aiGeneratedCount,
      aiDuplicates: aiDupCount,
    };
  }

  await appendItems(full);
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
    localUsed: localItems.length,
    aiGenerated: aiGeneratedCount,
    aiDuplicates: aiDupCount,
  };
}

// ============================================================
// 本地拼装：把 dict/corpus 转成 Item
// ============================================================
async function assembleLocalItems(opts: {
  scenario: Scenario;
  desired: number;
  sessionId: string;
  fingerprints: Set<string>;
}): Promise<Item[]> {
  if (opts.desired <= 0) return [];

  const now = new Date().toISOString();
  const out: Item[] = [];

  // dict 候选：先按 scenario 取，不够则放宽
  let dictPool = await pickDictBy({ scenario: opts.scenario, limit: 500 });
  if (dictPool.length < opts.desired * 0.5) {
    // 场景命中太少 → 用通用高质量词补
    const extra = await pickDictBy({ limit: 500 });
    const seen = new Set(dictPool.map((d) => d.lemma.toLowerCase()));
    for (const d of extra) {
      if (!seen.has(d.lemma.toLowerCase())) dictPool.push(d);
      if (dictPool.length >= 500) break;
    }
  }
  const corpusPool = await pickCorpusBy({ scenario: opts.scenario, limit: 200 });

  // 没有任何本地数据 → 返回空，让 AI 全部接手
  if (dictPool.length === 0 && corpusPool.length === 0) return out;

  // 按类型分配：词典出 en2cn / cn2en（各占 35%），语料出 cloze + translate（各占 15%）
  const target = {
    en2cn: Math.round(opts.desired * 0.35),
    cn2en: Math.round(opts.desired * 0.35),
    cloze: Math.round(opts.desired * 0.15),
    translate: opts.desired - Math.round(opts.desired * 0.85),
  };

  // 打乱
  const dictShuffled = shuffle(dictPool);
  const corpusShuffled = shuffle(corpusPool);
  let dictCursor = 0;
  let corpusCursor = 0;

  // en2cn
  for (let i = 0; i < target.en2cn && dictCursor < dictShuffled.length; ) {
    const d = dictShuffled[dictCursor++];
    if (!d) continue;
    const item = dictToItem(d, 'en2cn', dictPool, opts);
    if (!item) continue;
    if (opts.fingerprints.has(fingerprintOf(item))) continue;
    out.push({ ...item, source: { sessionId: opts.sessionId, createdAt: now, model: 'local:ecdict' } });
    opts.fingerprints.add(fingerprintOf(item));
    i++;
  }
  // cn2en
  for (let i = 0; i < target.cn2en && dictCursor < dictShuffled.length; ) {
    const d = dictShuffled[dictCursor++];
    if (!d) continue;
    const item = dictToItem(d, 'cn2en', dictPool, opts);
    if (!item) continue;
    if (opts.fingerprints.has(fingerprintOf(item))) continue;
    out.push({ ...item, source: { sessionId: opts.sessionId, createdAt: now, model: 'local:ecdict' } });
    opts.fingerprints.add(fingerprintOf(item));
    i++;
  }
  // cloze
  for (let i = 0; i < target.cloze && corpusCursor < corpusShuffled.length; ) {
    const c = corpusShuffled[corpusCursor++];
    if (!c) continue;
    const item = corpusToCloze(c, dictPool, opts);
    if (!item) continue;
    if (opts.fingerprints.has(fingerprintOf(item))) continue;
    out.push({ ...item, source: { sessionId: opts.sessionId, createdAt: now, model: 'local:corpus' } });
    opts.fingerprints.add(fingerprintOf(item));
    i++;
  }
  // translate
  for (let i = 0; i < target.translate && corpusCursor < corpusShuffled.length; ) {
    const c = corpusShuffled[corpusCursor++];
    if (!c) continue;
    const item = corpusToTranslate(c, opts);
    if (!item) continue;
    if (opts.fingerprints.has(fingerprintOf(item))) continue;
    out.push({ ...item, source: { sessionId: opts.sessionId, createdAt: now, model: 'local:corpus' } });
    opts.fingerprints.add(fingerprintOf(item));
    i++;
  }

  return out;
}

// dict → en2cn / cn2en Item
function dictToItem(
  d: DictEntry,
  type: 'en2cn' | 'cn2en',
  pool: DictEntry[],
  opts: { scenario: Scenario; sessionId: string },
): Item | null {
  // 取第一个 sense 的第一个中文释义
  const sense = d.senses[0];
  if (!sense || sense.cn.length === 0) return null;
  const cn = sense.cn[0];
  if (!cn) return null;
  // distractors: 从同 pool 里取 3 个不同 lemma 的对应翻译
  const distractors = pickDistractors(pool, d, type, 3);
  if (distractors.length < 3) return null;

  const promptObj = type === 'en2cn' ? { en: d.lemma } : { cn };
  const answerObj = type === 'en2cn' ? { cn } : { en: d.lemma };

  const draft: GeneratedItem = {
    type,
    scenario: opts.scenario,
    langTags: ['word'],
    difficulty: effectiveDict(d).difficulty,
    prompt: promptObj,
    answer: answerObj,
    distractors,
    hints: {
      weak: sense.pos ? `词性：${sense.pos}` : '类型：单词',
      strong: type === 'en2cn'
        ? `首字母：${cn.slice(0, 1)}`
        : `首字母：${d.lemma.slice(0, 1)}`,
    },
    ...(d.ipa ? { phonetics: { ipa: d.ipa.us || d.ipa.uk || d.ipa.any } } : {}),
    ...(sense.examples && sense.examples.length > 0 ? { examples: sense.examples } : {}),
  };

  return ItemSchema.parse({
    ...draft,
    id: ulid(),
    related: [],
    source: { sessionId: opts.sessionId, createdAt: new Date().toISOString(), model: 'local:ecdict' },
    stats: { attempts: 0, correct: 0 },
  });
}

function pickDistractors(
  pool: DictEntry[],
  exclude: DictEntry,
  type: 'en2cn' | 'cn2en',
  n: number,
): string[] {
  const seen = new Set<string>();
  const excludeKey = (type === 'en2cn' ? exclude.senses[0]?.cn[0] : exclude.lemma)?.toLowerCase() ?? '';
  // 同 pool 取相近难度（10 级粒度下放宽到 ±2）
  const excludeDiff = effectiveDict(exclude).difficulty;
  const candidates = pool.filter(
    (d) => d.lemma.toLowerCase() !== exclude.lemma.toLowerCase() &&
      Math.abs(effectiveDict(d).difficulty - excludeDiff) <= 2,
  );
  const shuffled = shuffle(candidates);
  const out: string[] = [];
  for (const d of shuffled) {
    const txt = type === 'en2cn' ? d.senses[0]?.cn[0] : d.lemma;
    if (!txt) continue;
    const key = txt.toLowerCase();
    if (key === excludeKey || seen.has(key)) continue;
    seen.add(key);
    out.push(txt);
    if (out.length >= n) break;
  }
  return out;
}

// corpus → cloze Item
function corpusToCloze(
  c: CorpusEntry,
  dictPool: DictEntry[],
  opts: { scenario: Scenario; sessionId: string },
): Item | null {
  const eff = effectiveCorpus(c);
  if (!eff.keywords || eff.keywords.length === 0) return null;
  // 选第一个 keyword 挖空
  const target = eff.keywords[0];
  if (!target) return null;
  // 必须在句子里能找到
  const re = new RegExp(`\\b${escapeRegex(target)}\\b`, 'i');
  if (!re.test(c.en)) return null;
  const cloze = c.en.replace(re, '___');

  // distractors: 同词性/同长度的 dict 词
  const distractors = pickDistractorsForCloze(dictPool, target, 3);
  if (distractors.length < 3) return null;

  const draft: GeneratedItem = {
    type: 'cloze',
    scenario: opts.scenario,
    langTags: ['sentence'],
    difficulty: eff.difficulty,
    prompt: { cloze },
    answer: { en: target },
    distractors,
    hints: {
      weak: `首字母：${target.slice(0, 1)}`,
      strong: c.cn ? `中文：${c.cn}` : `长度：${target.length}`,
    },
  };

  return ItemSchema.parse({
    ...draft,
    id: ulid(),
    related: [],
    source: { sessionId: opts.sessionId, createdAt: new Date().toISOString(), model: 'local:corpus' },
    stats: { attempts: 0, correct: 0 },
  });
}

function pickDistractorsForCloze(dictPool: DictEntry[], target: string, n: number): string[] {
  const seen = new Set<string>([target.toLowerCase()]);
  // 长度差 ≤2 的 lemma 优先
  const candidates = dictPool.filter(
    (d) => Math.abs(d.lemma.length - target.length) <= 2 && /^[a-zA-Z]+$/.test(d.lemma),
  );
  const shuffled = shuffle(candidates);
  const out: string[] = [];
  for (const d of shuffled) {
    const key = d.lemma.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d.lemma);
    if (out.length >= n) break;
  }
  return out;
}

// corpus → translate Item
function corpusToTranslate(c: CorpusEntry, opts: { scenario: Scenario; sessionId: string }): Item | null {
  if (!c.cn) return null;
  const eff = effectiveCorpus(c);
  const draft: GeneratedItem = {
    type: 'translate',
    scenario: opts.scenario,
    langTags: ['sentence'],
    difficulty: eff.difficulty,
    prompt: { cn: c.cn },
    answer: { en: c.en },
    hints: {
      weak: `句长约 ${c.en.split(/\s+/).length} 词`,
      strong: `首词：${c.en.split(/\s+/)[0]}`,
    },
  };
  return ItemSchema.parse({
    ...draft,
    id: ulid(),
    related: [],
    source: { sessionId: opts.sessionId, createdAt: new Date().toISOString(), model: 'local:corpus' },
    stats: { attempts: 0, correct: 0 },
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
