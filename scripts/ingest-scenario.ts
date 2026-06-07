/**
 * 调 AI 为指定场景批量生成 dict + corpus 条目，写入本地。
 *
 * 用法：
 *   pnpm ingest:scenario <scenario> [count]
 *   pnpm ingest:scenario devops 50
 *
 * 0 输入 → 提示
 */
import 'dotenv/config';
import { ulid } from 'ulid';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { models, modelById, MODEL_IDS } from '../src/mastra/provider.js';
import {
  DictEntrySchema,
  CorpusEntrySchema,
  SCENARIOS,
  type DictEntry,
  type CorpusEntry,
  type Scenario,
} from '../src/domain/schemas.js';
import { SCENARIO_LABELS, classifyScenarios } from '../src/domain/tags.js';
import {
  appendDict,
  appendCorpus,
  readAllDict,
  readAllCorpus,
} from '../src/domain/store.js';

const SCENARIO_ARG = process.argv[2];
const COUNT_ARG = parseInt(process.argv[3] ?? '30', 10) || 30;
const MODEL_ARG = process.argv[4] || MODEL_IDS.generator;

if (!SCENARIO_ARG) {
  console.error('usage: pnpm ingest:scenario <scenario> [count] [model]');
  console.error('  available scenarios:', SCENARIOS.filter((s) => !['workplace','computing','ai','travel','daily','food'].includes(s)).join(', '));
  process.exit(1);
}

if (!(SCENARIOS as readonly string[]).includes(SCENARIO_ARG)) {
  console.error(`unknown scenario: ${SCENARIO_ARG}`);
  process.exit(1);
}
const scenario = SCENARIO_ARG as Scenario;

// AI 输出 schema —— 一次同时产 dict 和 corpus
const PayloadSchema = z.object({
  dictEntries: z
    .array(
      z.object({
        lemma: z.string(),
        ipa: z.string().optional(),
        pos: z.string().optional(),
        cefr: z.string().optional(),
        difficulty: z.number().int().min(1).max(10),
        cn: z.array(z.string()).min(1),
        definition: z.string().optional(),
        examples: z
          .array(z.object({ en: z.string(), cn: z.string().optional() }))
          .default([]),
      }),
    )
    .default([]),
  corpusEntries: z
    .array(
      z.object({
        en: z.string(),
        cn: z.string().optional(),
        keywords: z.array(z.string()).default([]),
        difficulty: z.number().int().min(1).max(10),
      }),
    )
    .default([]),
});

const agent = new Agent({
  id: 'scenarioCorpusBuilder',
  name: 'scenarioCorpusBuilder',
  description: '为指定场景批量生成英语词典和句子语料',
  instructions: `你是英语场景语料库构建助手。

任务：为指定场景一次性生成 dict 词典条目 + corpus 句子语料。

**dict 条目**：场景常用的单词/短语，每条包含：
- lemma: 单词或短语 (≤3 词)
- ipa: 国际音标（含 / /）
- pos: 词性 (n. / v. / adj. ...)
- cefr: A1/A2/B1/B2/C1/C2
- difficulty: 1=入门 ~ 10=高级（10 级粒度，1 最简单，10 最难）
- cn: 中文释义数组（同一 sense 的多个译法）
- definition: 简洁英文释义
- examples: 1-2 条 { en, cn } 例句

**corpus 句子**：场景下的典型对话/陈述句，每条包含：
- en: 英文句子
- cn: 中文翻译
- keywords: 句中可挖空的关键词/短语（1-3 个）
- difficulty: 1-10

**质量要求**：
1. 紧扣指定场景，不出泛泛通用句
2. dict 与 corpus 适度关联（corpus 关键词可能出现在 dict 里）
3. 难度分布有梯度（不全 1 也不全 5）
4. 不要重复已有指纹

**JSON 输出契约**：最外层 \`{ "dictEntries": [...], "corpusEntries": [...] }\`。`,
  model: models.generator(),
});

async function main() {
  // 现有指纹
  const dictExisting = new Set((await readAllDict()).map((d) => d.lemma.toLowerCase()));
  const corpusExisting = new Set((await readAllCorpus()).map((c) => c.en.toLowerCase().replace(/\s+/g, ' ').trim()));

  // 按 count 拆：词条占 60%，句子占 40%
  const dictCount = Math.round(COUNT_ARG * 0.6);
  const corpusCount = COUNT_ARG - dictCount;

  console.log(`[ingest-scenario] scenario=${scenario} (${SCENARIO_LABELS[scenario]})`);
  console.log(`[ingest-scenario] requesting dict=${dictCount} corpus=${corpusCount}`);
  console.log(`[ingest-scenario] model=${MODEL_ARG}`);

  const fpHint = dictExisting.size > 0
    ? `\n\n已有 dict lemma (避免重复，仅显示 50 个): ${Array.from(dictExisting).slice(0, 50).join(', ')}`
    : '';

  const prompt = `场景: ${SCENARIO_LABELS[scenario]} (${scenario})
请生成：
- dict 条目: ${dictCount} 条
- corpus 句子: ${corpusCount} 条

严格按 JSON schema 输出。${fpHint}`;

  const t0 = Date.now();
  const res = await agent.generate(prompt, {
    structuredOutput: { schema: PayloadSchema },
    ...(MODEL_ARG !== MODEL_IDS.generator ? { model: modelById(MODEL_ARG) } : {}),
  });
  const obj = (res as unknown as { object?: z.infer<typeof PayloadSchema> }).object;
  if (!obj) {
    console.error('[ingest-scenario] AI returned no parseable object');
    process.exit(1);
  }

  console.log(`[ingest-scenario] ai responded in ${Date.now() - t0}ms`);
  console.log(`  raw dict: ${obj.dictEntries.length}, raw corpus: ${obj.corpusEntries.length}`);

  // dedup + 转 schema
  const newDict: DictEntry[] = [];
  let dictDup = 0;
  for (const d of obj.dictEntries) {
    const key = d.lemma.toLowerCase();
    if (dictExisting.has(key)) { dictDup++; continue; }
    dictExisting.add(key);
    const sceneFromWord = classifyScenarios(d.lemma, d.cn.join(' '));
    const finalScenarios = Array.from(new Set([scenario, ...sceneFromWord]));
    newDict.push(
      DictEntrySchema.parse({
        lemma: d.lemma,
        ipa: d.ipa ? { any: d.ipa } : undefined,
        pos: d.pos ? [d.pos] : [],
        cefr: d.cefr,
        difficulty: d.difficulty,
        senses: [
          {
            pos: d.pos,
            cn: d.cn,
            definition: d.definition,
            scenarios: finalScenarios,
            examples: d.examples,
          },
        ],
        source: `ai-generated:${MODEL_ARG}:${new Date().toISOString().slice(0, 10)}`,
      }),
    );
  }

  const newCorpus: CorpusEntry[] = [];
  let corpusDup = 0;
  for (const c of obj.corpusEntries) {
    const key = c.en.toLowerCase().replace(/\s+/g, ' ').trim();
    if (corpusExisting.has(key)) { corpusDup++; continue; }
    corpusExisting.add(key);
    const sceneFromSent = classifyScenarios(c.en, c.cn);
    const finalScenarios = Array.from(new Set([scenario, ...sceneFromSent]));
    newCorpus.push(
      CorpusEntrySchema.parse({
        id: ulid(),
        en: c.en,
        cn: c.cn,
        // 顶层 legacy 字段留空，估算值与权威值都放到 aiConfirmed（这是 AI 直接生成的）
        keywords: [],
        scenarios: [],
        difficulty: 1,
        aiConfirmed: {
          difficulty: c.difficulty,
          scenarios: finalScenarios,
          keywords: c.keywords,
          confirmedAt: new Date().toISOString(),
          model: MODEL_ARG,
        },
        source: `ai-generated:${MODEL_ARG}:${new Date().toISOString().slice(0, 10)}`,
      }),
    );
  }

  await appendDict(newDict);
  await appendCorpus(newCorpus);

  console.log(`[ingest-scenario] done.`);
  console.log(`  dict written: ${newDict.length} (dup: ${dictDup})`);
  console.log(`  corpus written: ${newCorpus.length} (dup: ${corpusDup})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
