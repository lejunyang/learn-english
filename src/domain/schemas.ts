import { z } from 'zod';

// ============================================================
// 受控词表 —— 见 src/domain/tags.ts
// ============================================================
export const SCENARIOS = [
  // 旧值（向后兼容历史 items.jsonl）
  'workplace', 'computing', 'ai', 'travel', 'daily', 'food',
  // ── 工作 ──
  'biz-email', 'meeting', 'interview', 'negotiation', 'slack',
  // ── 技术 ──
  'coding', 'ai-ml', 'devops', 'data', 'system-design',
  // ── 生活 ──
  'shopping', 'dining', 'doctor', 'rent', 'transport',
  // ── 文化 ──
  'movies', 'idioms', 'festivals', 'memes',
  // ── 学术 ──
  'paper-writing', 'academic-talk', 'reading',
  // ── 旅行 ──
  'airport-hotel', 'directions', 'complaints',
] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const ITEM_TYPES = ['en2cn', 'cn2en', 'translate', 'cloze'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

// ============================================================
// Item
// ============================================================
export const PhoneticsSchema = z
  .object({
    ipa: z.string().optional(),
    ipaUS: z.string().optional(),
    ipaUK: z.string().optional(),
  })
  .strict();

export const PromptSchema = z
  .object({
    en: z.string().optional(),
    cn: z.string().optional(),
    cloze: z.string().optional(), // 含 ___ 占位
  })
  .strict();

export const AnswerSchema = z
  .object({
    en: z.string().optional(),
    cn: z.string().optional(),
  })
  .strict();

export const HintsSchema = z
  .object({
    weak: z.string(), // 类别/首字母/词性
    strong: z.string(), // 接近答案
  })
  .strict();

export const ItemStatsSchema = z
  .object({
    attempts: z.number().int().nonnegative().default(0),
    correct: z.number().int().nonnegative().default(0),
    lastScore: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  })
  .strict();

export const ItemSourceSchema = z
  .object({
    sessionId: z.string(),
    createdAt: z.string(), // ISO
    model: z.string(),
  })
  .strict();

export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 10;
const DifficultySchema = z.number().int().min(DIFFICULTY_MIN).max(DIFFICULTY_MAX);

export const ItemSchema = z
  .object({
    id: z.string(), // ulid
    type: z.enum(ITEM_TYPES),
    scenario: z.enum(SCENARIOS),
    langTags: z.array(z.string()).default([]),
    difficulty: DifficultySchema,

    prompt: PromptSchema,
    answer: AnswerSchema,
    distractors: z.array(z.string()).optional(),
    hints: HintsSchema,
    phonetics: PhoneticsSchema.optional(),

    related: z.array(z.string()).default([]),
    source: ItemSourceSchema,
    stats: ItemStatsSchema.default({ attempts: 0, correct: 0 }),
  })
  .strict();

export type Item = z.infer<typeof ItemSchema>;

// AI 生成时的精简 schema —— 不含 id/source/stats/related，由后端填充
// scenario 也设为可选：调用方已指定场景，模型不必每条重复
export const GeneratedItemSchema = ItemSchema.omit({
  id: true,
  source: true,
  stats: true,
  related: true,
  scenario: true,
})
  .extend({ scenario: z.enum(SCENARIOS).optional() })
  .passthrough(); // 容忍模型偶尔多塞字段（id、fingerprint 等）
export type GeneratedItem = z.infer<typeof GeneratedItemSchema>;

// ============================================================
// Schedule (FSRS)
// ============================================================
export const ScheduleEntrySchema = z
  .object({
    stability: z.number(),
    difficulty: z.number(),
    due: z.string(), // ISO
    reps: z.number().int().nonnegative(),
    lapses: z.number().int().nonnegative(),
    lastReview: z.string().optional(), // ISO
    state: z.number().int(), // ts-fsrs State enum (0=New,1=Learning,2=Review,3=Relearning)
  })
  .strict();
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>;

export const ScheduleMapSchema = z.record(z.string(), ScheduleEntrySchema);
export type ScheduleMap = z.infer<typeof ScheduleMapSchema>;

// ============================================================
// Session
// ============================================================
export const HintLevelSchema = z.enum(['none', 'weak', 'strong']);
export type HintLevel = z.infer<typeof HintLevelSchema>;

export const AttemptSchema = z
  .object({
    itemId: z.string(),
    type: z.enum(ITEM_TYPES),
    userAnswer: z.string(),
    score: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    usedHint: HintLevelSchema,
    durationMs: z.number().int().nonnegative(),
    feedback: z.string().optional(),
  })
  .strict();
export type Attempt = z.infer<typeof AttemptSchema>;

export const SessionModeSchema = z.enum(['new', 'review']);
export type SessionMode = z.infer<typeof SessionModeSchema>;

export const SessionSchema = z
  .object({
    id: z.string(),
    startedAt: z.string(),
    finishedAt: z.string().optional(),
    mode: SessionModeSchema,
    scenario: z.enum(SCENARIOS).optional(),
    plannedMinutes: z.number().int().positive(),
    attempts: z.array(AttemptSchema).default([]),
  })
  .strict();
export type Session = z.infer<typeof SessionSchema>;

// 草稿：允许额外字段（如 __learnDraft 存 queueIds/cursor 用于重启恢复）
export const DraftSessionSchema = SessionSchema.passthrough();

// ============================================================
// Index (派生)
// ============================================================
export const IndexEntrySchema = z
  .object({
    type: z.enum(ITEM_TYPES),
    scenario: z.enum(SCENARIOS),
    langTags: z.array(z.string()),
    due: z.string().optional(),
    lastScore: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
    attempts: z.number().int().nonnegative(),
    fingerprint: z.string(), // 用于去重
  })
  .strict();
export type IndexEntry = z.infer<typeof IndexEntrySchema>;

export const IndexMapSchema = z.record(z.string(), IndexEntrySchema);
export type IndexMap = z.infer<typeof IndexMapSchema>;

// ============================================================
// 评分细分（翻译题）
// ============================================================
export const TranslationGradeSchema = z
  .object({
    score: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    semantic: z.number().int().min(0).max(2),
    grammar: z.number().int().min(0).max(2),
    naturalness: z.number().int().min(0).max(2),
    feedback: z.string(),
  })
  .passthrough();
export type TranslationGrade = z.infer<typeof TranslationGradeSchema>;

// ============================================================
// 错题本（mistakes）—— 翻译题低分自动追加
// ============================================================
export const MistakeSchema = z
  .object({
    id: z.string(), // ulid
    itemId: z.string(),
    type: z.enum(ITEM_TYPES),
    scenario: z.enum(SCENARIOS).optional(),
    prompt: z.string(), // 题面文本（cn / en / cloze 任一）
    correctAnswer: z.string(), // 参考答案
    userAnswer: z.string(),
    suggestion: z.string().optional(), // AI 反馈
    score: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    occurredAt: z.string(), // ISO
    resolved: z.boolean().default(false), // 后续连续答对 2 次后置 true
  })
  .strict();
export type Mistake = z.infer<typeof MistakeSchema>;

// ============================================================
// Dictionary / Corpus —— 本地大语料库
// ============================================================

// 一个 sense（义项）
export const DictSenseSchema = z
  .object({
    pos: z.string().optional(), // n. / v. / adj. ...
    cn: z.array(z.string()).default([]), // 该 sense 的中文释义（可多个）
    definition: z.string().optional(), // 英文释义
    scenarios: z.array(z.enum(SCENARIOS)).default([]),
    examples: z
      .array(
        z.object({
          en: z.string(),
          cn: z.string().optional(),
        }),
      )
      .default([]),
  })
  .passthrough();
export type DictSense = z.infer<typeof DictSenseSchema>;

export const DictEntrySchema = z
  .object({
    lemma: z.string(), // 词根/单词
    ipa: z
      .object({
        us: z.string().optional(),
        uk: z.string().optional(),
        any: z.string().optional(), // ECDICT 只给一个时塞这里
      })
      .optional(),
    pos: z.array(z.string()).default([]),
    cefr: z.string().optional(), // A1/A2/B1/B2/C1/C2 (Oxford 5000)
    tags: z.array(z.string()).default([]), // cet4/cet6/ky/toefl/ielts/gre/zk/gk
    frq: z.number().int().optional(), // COCA 频率排名 (越小越高频)
    bnc: z.number().int().optional(),
    difficulty: DifficultySchema,
    senses: z.array(DictSenseSchema).default([]),
    exchange: z.string().optional(), // ECDICT 词形变化原文
    source: z.string(), // ecdict / oxford / ai-generated:xxx
  })
  .passthrough();
export type DictEntry = z.infer<typeof DictEntrySchema>;

// CorpusEntry 评估字段：difficulty / scenarios / keywords
// 拆成 estimated（启发式/规则估计）和 aiConfirmed（AI 复核后写回）两层。
// 读路径优先级：aiConfirmed > estimated > 顶层 legacy 字段
export const CorpusJudgementSchema = z
  .object({
    difficulty: DifficultySchema.optional(),
    scenarios: z.array(z.enum(SCENARIOS)).optional(),
    keywords: z.array(z.string()).optional(),
    confirmedAt: z.string().optional(), // ISO，仅 aiConfirmed 用
    model: z.string().optional(),       // 仅 aiConfirmed 用
  })
  .passthrough();
export type CorpusJudgement = z.infer<typeof CorpusJudgementSchema>;

export const CorpusEntrySchema = z
  .object({
    id: z.string(), // ulid
    en: z.string(),
    cn: z.string().optional(), // 中文翻译（可能没有）
    // 顶层 keywords/scenarios/difficulty 保留为向后兼容老数据，新增数据建议写进 estimated
    keywords: z.array(z.string()).default([]),
    scenarios: z.array(z.enum(SCENARIOS)).default([]),
    difficulty: DifficultySchema,
    estimated: CorpusJudgementSchema.optional(),
    aiConfirmed: CorpusJudgementSchema.optional(),
    cefr: z.string().optional(),
    source: z.string(),
  })
  .passthrough();
export type CorpusEntry = z.infer<typeof CorpusEntrySchema>;

/**
 * 取得 corpus entry 的有效字段：优先 aiConfirmed → estimated → 顶层 legacy。
 */
export function effectiveCorpus(c: CorpusEntry): {
  difficulty: number;
  scenarios: Scenario[];
  keywords: string[];
} {
  const ai = c.aiConfirmed ?? {};
  const est = c.estimated ?? {};
  return {
    difficulty: ai.difficulty ?? est.difficulty ?? c.difficulty,
    scenarios: (ai.scenarios ?? est.scenarios ?? c.scenarios) as Scenario[],
    keywords: ai.keywords ?? est.keywords ?? c.keywords,
  };
}
