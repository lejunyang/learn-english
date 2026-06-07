/**
 * ingest-corpus skill 的纯 I/O 后端。0 token。
 *
 * 两个子命令：
 *
 *   plan <scenario> [--count N] [--file-dict <path>] [--file-corpus <path>]
 *     → 输出 JSON 到 stdout，告诉宿主 AI：
 *        - 该场景的 label/英中关键词提示
 *        - 期望生成多少 dict / corpus 条
 *        - 已存在的 lemma 与 en 指纹（避免重复）
 *        - 允许的 scenarios 列表
 *
 *   write --input <results.json> [--file-dict <path>] [--file-corpus <path>]
 *     → 接受 AI 生成的 {dictEntries:[...], corpusEntries:[...]}，去重 + zod 校验 + 落盘
 *        dict 追加到 data/dict.jsonl
 *        corpus 追加到 data/corpus.jsonl，{difficulty,scenarios,keywords} 写到 aiConfirmed
 *
 * 不调用任何 LLM —— 生成完全由宿主 AI（执行本 skill 的当前对话）负责。
 *
 * 该脚本依赖项目内的 zod schema（src/domain/schemas.ts、src/domain/tags.ts）。
 * 移植到其它项目时可以：
 *   (a) 复制 schemas/tags 这两个文件过去，或
 *   (b) 把下面的 *.parse(...) 改成手写 JSON 校验，保留字段语义一致即可。
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

const DEFAULT_DICT_FILE = path.resolve('data/dict.jsonl');
const DEFAULT_CORPUS_FILE = path.resolve('data/corpus.jsonl');
const DEFAULT_COUNT = 30;
const DICT_RATIO = 0.6; // 60% dict / 40% corpus

interface Args {
  cmd: 'plan' | 'write';
  scenario?: string;
  count: number;
  dictFile: string;
  corpusFile: string;
  input?: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const cmd = argv[0] as Args['cmd'];
  if (!cmd || !['plan', 'write'].includes(cmd)) {
    console.error('usage:');
    console.error('  ingest-corpus plan <scenario> [--count N] [--file-dict <path>] [--file-corpus <path>]');
    console.error('  ingest-corpus write --input <results.json> [--file-dict <path>] [--file-corpus <path>]');
    process.exit(2);
  }
  const out: Args = {
    cmd,
    count: DEFAULT_COUNT,
    dictFile: DEFAULT_DICT_FILE,
    corpusFile: DEFAULT_CORPUS_FILE,
  };
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
    else if (a === '--file-dict') out.dictFile = path.resolve(argv[++i] ?? DEFAULT_DICT_FILE);
    else if (a === '--file-corpus') out.corpusFile = path.resolve(argv[++i] ?? DEFAULT_CORPUS_FILE);
    else if (a === '--input') out.input = argv[++i];
  }
  return out;
}

async function readLines(file: string): Promise<string[]> {
  try {
    const text = await fs.readFile(file, 'utf8');
    return text.split('\n').filter((l) => l.trim().length > 0);
  } catch (e: any) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
}

function safeParse(line: string): any | null {
  try { return JSON.parse(line); } catch { return null; }
}

function normalizeEnKey(en: string): string {
  return en.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ─────────────────────────── plan ───────────────────────────

async function cmdPlan(args: Args) {
  const scenario = args.scenario!;
  if (!(SCENARIOS as readonly string[]).includes(scenario)) {
    console.error(`unknown scenario: ${scenario}`);
    console.error('  allowed:', allowedScenarios().join(', '));
    process.exit(1);
  }
  const dictCount = Math.round(args.count * DICT_RATIO);
  const corpusCount = args.count - dictCount;

  const dictLines = await readLines(args.dictFile);
  const corpusLines = await readLines(args.corpusFile);

  const existingLemmas: string[] = [];
  for (const l of dictLines) {
    const e = safeParse(l);
    if (e?.lemma) existingLemmas.push(String(e.lemma).toLowerCase());
  }
  const existingEnKeys: string[] = [];
  for (const l of corpusLines) {
    const e = safeParse(l);
    if (e?.en) existingEnKeys.push(normalizeEnKey(e.en));
  }

  // 抽样：随机取 50 条让 AI 避免重复，避免提示词太大
  const sampleLemmas = sampleK(existingLemmas, 50);
  const sampleEn = sampleK(existingEnKeys, 50);

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
    sampleExistingLemmas: sampleLemmas,
    sampleExistingEnKeys: sampleEn,
    allowedScenarios: allowedScenarios(),
  };
  process.stdout.write(JSON.stringify(plan, null, 2));
}

function allowedScenarios(): string[] {
  const legacy = new Set(['workplace', 'computing', 'ai', 'travel', 'daily', 'food']);
  return (SCENARIOS as readonly string[]).filter((s) => !legacy.has(s));
}

function sampleK<T>(arr: T[], k: number): T[] {
  if (arr.length <= k) return arr.slice();
  const out = new Set<number>();
  while (out.size < k) out.add(Math.floor(Math.random() * arr.length));
  return Array.from(out).map((i) => arr[i] as T);
}

// ─────────────────────────── write ──────────────────────────

interface WriteInput {
  scenario?: string;        // 可选，缺省时不强制把 scenario 加进 dict/corpus 的 scenarios
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

  // 已有指纹
  const dictLines = await readLines(args.dictFile);
  const corpusLines = await readLines(args.corpusFile);
  const dictExisting = new Set<string>();
  for (const l of dictLines) {
    const e = safeParse(l);
    if (e?.lemma) dictExisting.add(String(e.lemma).toLowerCase());
  }
  const corpusExisting = new Set<string>();
  for (const l of corpusLines) {
    const e = safeParse(l);
    if (e?.en) corpusExisting.add(normalizeEnKey(e.en));
  }

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
    ]));
    try {
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
              examples: d.examples ?? [],
            },
          ],
          source,
        }),
      );
    } catch (e) {
      console.error(`[ingest-corpus] dict zod fail for "${d.lemma}": ${(e as Error).message}`);
    }
  }

  // corpus —— 写入 aiConfirmed（顶层 legacy 字段留空占位）
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
    ]));
    try {
      newCorpus.push(
        CorpusEntrySchema.parse({
          id: ulid(),
          en: c.en,
          cn: c.cn,
          keywords: [],
          scenarios: [],
          difficulty: 1,
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

  if (newDict.length) {
    const text = newDict.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await fs.appendFile(args.dictFile, text, 'utf8');
  }
  if (newCorpus.length) {
    const text = newCorpus.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await fs.appendFile(args.corpusFile, text, 'utf8');
  }

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
