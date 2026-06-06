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

export const ItemSchema = z
  .object({
    id: z.string(), // ulid
    type: z.enum(ITEM_TYPES),
    scenario: z.enum(SCENARIOS),
    langTags: z.array(z.string()).default([]),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),

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
