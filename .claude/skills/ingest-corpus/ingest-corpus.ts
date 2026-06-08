/**
 * ingest-corpus skill 的纯 I/O 后端。0 token。
 *
 * 两个子命令：
 *
 *   plan <scenario> [--count N]
 *     → 输出 JSON 到 stdout，告诉宿主 AI：
 *        - 该场景的 label/英中关键词提示
 *        - 期望生成多少 dict / corpus 条
 *        - 已存在的 lemma 与 en 指纹（抽样，避免重复）
 *        - 允许的 scenarios 列表
 *
 *   write --input <results.json>
 *     → 接受 AI 生成的 {dictEntries:[...], corpusEntries:[...]}，去重 + zod 校验 + 落盘
 *        dict 追加到 data/dict/d{N}.jsonl（按 effectiveDict.difficulty 分片）
 *        corpus 追加到 data/corpus/d{N}.jsonl（按 effectiveCorpus.difficulty 分片）
 *        difficulty/scenarios 写到 aiConfirmed
 *
 * 不调用任何 LLM —— 生成完全由宿主 AI（执行本 skill 的当前对话）负责。
 *
 * 该脚本依赖项目内的 zod schema + store 分片读写
 * （src/domain/schemas.ts, src/domain/store.ts, src/domain/tags.ts）。
 * 移植到其它项目时把 store / schemas / tags 三个文件一并复制即可。
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { ulid } from 'ulid';
import {
  DictEntrySchema,
  CorpusEntrySchema,
  SCENARIOS,
  type DictEntry,
  type CorpusEntry,
  type Scenario,
} from '../../../src/domain/schemas.js';
import {
  SCENARIO_INFO,
  SCENARIO_KEYWORDS,
  classifyScenarios,
} from '../../../src/domain/tags.js';
import {
  appendDict,
  appendCorpus,
  readAllDict,
  readAllCorpus,
} from '../../../src/domain/store.js';

const DEFAULT_COUNT = 30;
const DICT_RATIO = 0.6; // 60% dict / 40% corpus
const SAMPLE_K = 50;

interface Args {
  cmd: 'plan' | 'write';
  scenario?: string;
  count: number;
  input?: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const cmd = argv[0] as Args['cmd'];
  if (!cmd || !['plan', 'write'].includes(cmd)) {
    console.error('usage:');
    console.error('  ingest-corpus plan <scenario> [--count N]');
    console.error('  ingest-corpus write --input <results.json>');
    process.exit(2);
  }
  const out: Args = { cmd, count: DEFAULT_COUNT };
  let i = 1;
  if (cmd === 'plan') {
    if (!argv[1] || argv[1].startsWith('--')) {
      console.error('plan: <scenario> is required');
      process.exit(2);
    }
    out.scenario = argv[1];
    i = 2;
  }
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--count') out.count = parseInt(argv[++i] ?? '', 10) || DEFAULT_COUNT;
    else if (a === '--input') out.input = argv[++i];
  }
  return out;
}

function normalizeEnKey(en: string): string {
  return en.toLowerCase().replace(/\s+/g, ' ').trim();
}

function suggestedScenarios(): string[] {
  const legacy = new Set(['workplace', 'computing', 'ai', 'travel', 'daily', 'food', 'slack']);
  return (SCENARIOS as readonly string[]).filter((s) => !legacy.has(s));
}

function sampleK<T>(arr: T[], k: number): T[] {
  if (arr.length <= k) return arr.slice();
  const out = new Set<number>();
  while (out.size < k) out.add(Math.floor(Math.random() * arr.length));
  return Array.from(out).map((i) => arr[i] as T);
}

// ─────────────────────────── plan ───────────────────────────

async function cmdPlan(args: Args) {
  const scenario = args.scenario!;
  const dictCount = Math.round(args.count * DICT_RATIO);
  const corpusCount = args.count - dictCount;

  const existingDict = await readAllDict();
  const existingCorpus = await readAllCorpus();

  const existingLemmas = existingDict.map((d) => d.lemma.toLowerCase());
  const existingEnKeys = existingCorpus.map((c) => normalizeEnKey(c.en));

  const info = SCENARIO_INFO[scenario as Scenario];
  const kws = SCENARIO_KEYWORDS[scenario as Scenario];

  const plan = {
    scenario,
    label: info?.label,
    group: info?.group,
    hint: info?.hint,
    keywordsHint: { en: kws?.en ?? [], cn: kws?.cn ?? [] },
    dictCount,
    corpusCount,
    existingLemmasCount: existingLemmas.length,
    existingCorpusCount: existingEnKeys.length,
    sampleExistingLemmas: sampleK(existingLemmas, SAMPLE_K),
    sampleExistingEnKeys: sampleK(existingEnKeys, SAMPLE_K),
    suggestedScenarios: suggestedScenarios(),
  };
  process.stdout.write(JSON.stringify(plan, null, 2));
}

// ─────────────────────────── write ──────────────────────────

interface WriteInput {
  scenario?: string;        // 可选；写到 dict/corpus 的 scenarios 中
  model?: string;           // 写到 source 与 aiConfirmed.model
  dictEntries?: Array<{
    lemma: string;
    ipa?: string;
    pos?: string;
    cefr?: string;
    difficulty: number;
    cn: string[];
    definition?: string;
    examples?: Array<{ en: string; cn?: string }>;
  }>;
  corpusEntries?: Array<{
    en: string;
    cn?: string;
    keywords?: string[];
    scenarios?: string[];
    difficulty: number;
  }>;
}

async function cmdWrite(args: Args) {
  if (!args.input) {
    console.error('write: --input <results.json> is required');
    process.exit(2);
  }
  const raw = await fs.readFile(path.resolve(args.input), 'utf8');
  const payload = JSON.parse(raw) as WriteInput;
  const scenario = payload.scenario as Scenario | undefined;
  const model = payload.model ?? 'unknown-host';
  const dateTag = new Date().toISOString().slice(0, 10);
  const source = `ai-generated:${model}:${dateTag}`;

  // 已有指纹（跨所有分片）
  const existingDict = await readAllDict();
  const existingCorpus = await readAllCorpus();
  const dictExisting = new Set<string>(existingDict.map((d) => d.lemma.toLowerCase()));
  const corpusExisting = new Set<string>(existingCorpus.map((c) => normalizeEnKey(c.en)));

  // dict
  const newDict: DictEntry[] = [];
  let dictDup = 0;
  for (const d of payload.dictEntries ?? []) {
    const key = d.lemma.toLowerCase();
    if (dictExisting.has(key)) { dictDup++; continue; }
    dictExisting.add(key);
    const sceneFromWord = classifyScenarios(d.lemma, d.cn.join(' '));
    const finalScenarios = Array.from(new Set([
      ...(scenario ? [scenario] : []),
      ...sceneFromWord,
    ])) as Scenario[];
    try {
      newDict.push(
        DictEntrySchema.parse({
          lemma: d.lemma,
          ipa: d.ipa ? { any: d.ipa } : undefined,
          pos: d.pos ? [d.pos] : [],
          cefr: d.cefr,
          senses: [
            {
              pos: d.pos,
              cn: d.cn,
              definition: d.definition,
              scenarios: finalScenarios,
              examples: d.examples ?? [],
            },
          ],
          aiConfirmed: {
            difficulty: d.difficulty,
            scenarios: finalScenarios,
            confirmedAt: new Date().toISOString(),
            model,
          },
          source,
        }),
      );
    } catch (e) {
      console.error(`[ingest-corpus] dict zod fail for "${d.lemma}": ${(e as Error).message}`);
    }
  }

  // corpus
  const newCorpus: CorpusEntry[] = [];
  let corpusDup = 0;
  const now = new Date().toISOString();
  for (const c of payload.corpusEntries ?? []) {
    const key = normalizeEnKey(c.en);
    if (corpusExisting.has(key)) { corpusDup++; continue; }
    corpusExisting.add(key);
    const sceneFromSent = classifyScenarios(c.en, c.cn);
    const explicit = (c.scenarios ?? []) as Scenario[];
    const finalScenarios = Array.from(new Set([
      ...(scenario ? [scenario] : []),
      ...explicit,
      ...sceneFromSent,
    ])) as Scenario[];
    try {
      newCorpus.push(
        CorpusEntrySchema.parse({
          id: ulid(),
          en: c.en,
          cn: c.cn,
          aiConfirmed: {
            difficulty: c.difficulty,
            scenarios: finalScenarios,
            keywords: c.keywords ?? [],
            confirmedAt: now,
            model,
          },
          source,
        }),
      );
    } catch (e) {
      console.error(`[ingest-corpus] corpus zod fail for "${c.en}": ${(e as Error).message}`);
    }
  }

  await appendDict(newDict);
  await appendCorpus(newCorpus);

  const summary = {
    dictWritten: newDict.length,
    dictDuplicates: dictDup,
    corpusWritten: newCorpus.length,
    corpusDuplicates: corpusDup,
  };
  console.error(`[ingest-corpus] ${JSON.stringify(summary)}`);
  console.log(JSON.stringify(summary));
}

// ─────────────────────────── main ───────────────────────────

async function main() {
  const args = parseArgs();
  if (args.cmd === 'plan') await cmdPlan(args);
  else if (args.cmd === 'write') await cmdWrite(args);
}

main().catch((e) => { console.error(e); process.exit(1); });
