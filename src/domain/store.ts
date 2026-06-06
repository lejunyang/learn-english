import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ItemSchema,
  ScheduleMapSchema,
  IndexMapSchema,
  SessionSchema,
  DraftSessionSchema,
  MistakeSchema,
  DictEntrySchema,
  CorpusEntrySchema,
  type Item,
  type ScheduleMap,
  type ScheduleEntry,
  type IndexMap,
  type IndexEntry,
  type Session,
  type Mistake,
  type DictEntry,
  type CorpusEntry,
  type Scenario,
} from './schemas.js';

// ============================================================
// 路径解析
// ============================================================
// 允许通过 LEARN_DATA_DIR 覆盖，默认在仓库根 data/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const DATA_DIR = process.env.LEARN_DATA_DIR
  ? path.resolve(process.env.LEARN_DATA_DIR)
  : path.join(REPO_ROOT, 'data');

export const ITEMS_FILE = path.join(DATA_DIR, 'items.jsonl');
export const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');
export const INDEX_FILE = path.join(DATA_DIR, 'index.json');
export const MISTAKES_FILE = path.join(DATA_DIR, 'mistakes.jsonl');
export const DICT_FILE = path.join(DATA_DIR, 'dict.jsonl');
export const CORPUS_FILE = path.join(DATA_DIR, 'corpus.jsonl');
export const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
export const DRAFTS_DIR = path.join(DATA_DIR, 'drafts');

async function ensureDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  await fs.mkdir(DRAFTS_DIR, { recursive: true });
}

// ============================================================
// 原子写入（先写 .tmp，再 rename），diff 友好
// ============================================================
async function atomicWriteText(file: string, content: string): Promise<void> {
  await ensureDirs();
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, file);
}

// 字典序排序 JSON.stringify
function stableStringify(value: unknown): string {
  return JSON.stringify(value, sortReplacer, 2) + '\n';
}

function sortReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = obj[k];
        return acc;
      }, {});
  }
  return value;
}

async function readJsonIfExists<T>(file: string, fallback: T): Promise<T> {
  try {
    const text = await fs.readFile(file, 'utf8');
    return JSON.parse(text) as T;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return fallback;
    throw e;
  }
}

// ============================================================
// Items (JSONL)
// ============================================================

export async function readAllItems(): Promise<Item[]> {
  try {
    const text = await fs.readFile(ITEMS_FILE, 'utf8');
    return text
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((line, idx) => {
        try {
          return ItemSchema.parse(JSON.parse(line));
        } catch (err) {
          throw new Error(`Invalid item at line ${idx + 1}: ${(err as Error).message}`);
        }
      });
  } catch (e: any) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
}

export async function appendItems(items: Item[]): Promise<void> {
  if (items.length === 0) return;
  await ensureDirs();
  const text =
    items
      .map((it) => JSON.stringify(ItemSchema.parse(it)))
      .join('\n') + '\n';
  await fs.appendFile(ITEMS_FILE, text, 'utf8');
}

// 替换某条 item（整文件重写；item 数量到几千前性能可忽略）
export async function updateItem(id: string, patch: Partial<Item>): Promise<Item | null> {
  const all = await readAllItems();
  const idx = all.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const merged = ItemSchema.parse({ ...all[idx], ...patch });
  all[idx] = merged;
  const text = all.map((it) => JSON.stringify(it)).join('\n') + '\n';
  await atomicWriteText(ITEMS_FILE, text);
  return merged;
}

// ============================================================
// Schedule
// ============================================================

export async function readSchedule(): Promise<ScheduleMap> {
  const raw = await readJsonIfExists<unknown>(SCHEDULE_FILE, {});
  return ScheduleMapSchema.parse(raw);
}

export async function writeSchedule(map: ScheduleMap): Promise<void> {
  ScheduleMapSchema.parse(map);
  await atomicWriteText(SCHEDULE_FILE, stableStringify(map));
}

export async function upsertScheduleEntry(id: string, entry: ScheduleEntry): Promise<void> {
  const map = await readSchedule();
  map[id] = entry;
  await writeSchedule(map);
}

// ============================================================
// Index (派生)
// ============================================================

export async function readIndex(): Promise<IndexMap> {
  const raw = await readJsonIfExists<unknown>(INDEX_FILE, {});
  return IndexMapSchema.parse(raw);
}

export async function writeIndex(map: IndexMap): Promise<void> {
  IndexMapSchema.parse(map);
  await atomicWriteText(INDEX_FILE, stableStringify(map));
}

export async function upsertIndexEntry(id: string, entry: IndexEntry): Promise<void> {
  const map = await readIndex();
  map[id] = entry;
  await writeIndex(map);
}

// 从 items + schedule 重建 index
export async function rebuildIndex(): Promise<IndexMap> {
  const [items, schedule] = await Promise.all([readAllItems(), readSchedule()]);
  const map: IndexMap = {};
  for (const it of items) {
    const sched = schedule[it.id];
    map[it.id] = {
      type: it.type,
      scenario: it.scenario,
      langTags: it.langTags,
      due: sched?.due,
      lastScore: it.stats.lastScore,
      attempts: it.stats.attempts,
      fingerprint: fingerprintOf(it),
    };
  }
  await writeIndex(map);
  return map;
}

// 规范化指纹：用于去重
export function fingerprintOf(it: Pick<Item, 'type' | 'prompt' | 'answer'>): string {
  const key = [
    it.type,
    (it.prompt.en ?? it.prompt.cn ?? it.prompt.cloze ?? '').toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ''),
    (it.answer.en ?? it.answer.cn ?? '').toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ''),
  ].join('|');
  return key;
}

// ============================================================
// Sessions (按天 JSONL)
// ============================================================

function sessionFileFor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return path.join(SESSIONS_DIR, `${y}-${m}-${d}.jsonl`);
}

export async function appendSession(session: Session): Promise<void> {
  await ensureDirs();
  const file = sessionFileFor(new Date(session.startedAt));
  const line = JSON.stringify(SessionSchema.parse(session)) + '\n';
  await fs.appendFile(file, line, 'utf8');
}

// 保存草稿（覆盖式，便于 resume）—— 允许额外字段（queueIds/cursor）
export async function saveDraftSession(session: Session): Promise<void> {
  await ensureDirs();
  const file = path.join(DRAFTS_DIR, `${session.id}.json`);
  await atomicWriteText(file, stableStringify(DraftSessionSchema.parse(session)));
}

export async function loadDraftSession(id: string): Promise<Session | null> {
  const file = path.join(DRAFTS_DIR, `${id}.json`);
  const raw = await readJsonIfExists<unknown | null>(file, null);
  if (raw === null) return null;
  return DraftSessionSchema.parse(raw) as Session;
}

export async function deleteDraftSession(id: string): Promise<void> {
  const file = path.join(DRAFTS_DIR, `${id}.json`);
  try {
    await fs.unlink(file);
  } catch (e: any) {
    if (e?.code !== 'ENOENT') throw e;
  }
}

// ============================================================
// Mistakes (错题本, JSONL append-only)
// ============================================================

export async function appendMistake(mistake: Mistake): Promise<void> {
  await ensureDirs();
  const line = JSON.stringify(MistakeSchema.parse(mistake)) + '\n';
  await fs.appendFile(MISTAKES_FILE, line, 'utf8');
}

export async function readAllMistakes(): Promise<Mistake[]> {
  try {
    const text = await fs.readFile(MISTAKES_FILE, 'utf8');
    return text
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((line, idx) => {
        try {
          return MistakeSchema.parse(JSON.parse(line));
        } catch (err) {
          throw new Error(`Invalid mistake at line ${idx + 1}: ${(err as Error).message}`);
        }
      });
  } catch (e: any) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
}

/**
 * 取最近 N 天未解决的错题（按出现时间倒序）
 */
export async function readRecentMistakes(opts: { days?: number; limit?: number } = {}): Promise<Mistake[]> {
  const days = opts.days ?? 30;
  const limit = opts.limit ?? 20;
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  const all = await readAllMistakes();
  return all
    .filter((m) => !m.resolved && new Date(m.occurredAt).getTime() >= cutoff)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, limit);
}

/**
 * 标记某个 itemId 关联的错题为已解决（用户连续答对后调用）
 */
export async function resolveMistakesForItem(itemId: string): Promise<number> {
  const all = await readAllMistakes();
  let changed = 0;
  for (const m of all) {
    if (m.itemId === itemId && !m.resolved) {
      m.resolved = true;
      changed++;
    }
  }
  if (changed === 0) return 0;
  const text = all.map((m) => JSON.stringify(m)).join('\n') + '\n';
  await atomicWriteText(MISTAKES_FILE, text);
  return changed;
}

// ============================================================
// Dictionary (JSONL, lemma 唯一)
// ============================================================

export async function readAllDict(): Promise<DictEntry[]> {
  try {
    const text = await fs.readFile(DICT_FILE, 'utf8');
    return text
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((line, idx) => {
        try {
          return DictEntrySchema.parse(JSON.parse(line));
        } catch (err) {
          throw new Error(`Invalid dict at line ${idx + 1}: ${(err as Error).message}`);
        }
      });
  } catch (e: any) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
}

export async function appendDict(entries: DictEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await ensureDirs();
  const text = entries.map((e) => JSON.stringify(DictEntrySchema.parse(e))).join('\n') + '\n';
  await fs.appendFile(DICT_FILE, text, 'utf8');
}

/**
 * 内存索引：lemma 小写 → DictEntry。给出题 / dedup 用。
 * 调用方应在请求开始时构建一次，session 内复用。
 */
export async function buildDictIndex(): Promise<Map<string, DictEntry>> {
  const all = await readAllDict();
  return new Map(all.map((e) => [e.lemma.toLowerCase(), e]));
}

/**
 * 按场景 + 难度过滤 dict 条目（候选池）。
 * 默认只取有学术 tag（cet4/cet6/ky/toefl/ielts/gre/zk/gk）的词条，
 * 这些是经过筛选的高质量词汇；按 difficulty 升序（先易后难）。
 */
export async function pickDictBy(opts: {
  scenario?: Scenario;
  difficulty?: number[];
  limit?: number;
  /** 是否仅取带学术 tag 的词条（默认 true）。设为 false 则不过滤 */
  taggedOnly?: boolean;
}): Promise<DictEntry[]> {
  const all = await readAllDict();
  const taggedOnly = opts.taggedOnly !== false;
  const filtered = all.filter((e) => {
    if (taggedOnly && (!e.tags || e.tags.length === 0)) return false;
    if (opts.difficulty && !opts.difficulty.includes(e.difficulty)) return false;
    if (opts.scenario) {
      const hit = e.senses.some((s) => s.scenarios.includes(opts.scenario as Scenario));
      if (!hit) return false;
    }
    return true;
  });
  filtered.sort((a, b) => {
    // 先按 difficulty 升序
    if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
    // 同难度按 frq 升序（高频优先）
    const af = a.frq ?? Number.MAX_SAFE_INTEGER;
    const bf = b.frq ?? Number.MAX_SAFE_INTEGER;
    return af - bf;
  });
  return opts.limit ? filtered.slice(0, opts.limit) : filtered;
}

// ============================================================
// Corpus (JSONL)
// ============================================================

export async function readAllCorpus(): Promise<CorpusEntry[]> {
  try {
    const text = await fs.readFile(CORPUS_FILE, 'utf8');
    return text
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((line, idx) => {
        try {
          return CorpusEntrySchema.parse(JSON.parse(line));
        } catch (err) {
          throw new Error(`Invalid corpus at line ${idx + 1}: ${(err as Error).message}`);
        }
      });
  } catch (e: any) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
}

export async function appendCorpus(entries: CorpusEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await ensureDirs();
  const text = entries.map((e) => JSON.stringify(CorpusEntrySchema.parse(e))).join('\n') + '\n';
  await fs.appendFile(CORPUS_FILE, text, 'utf8');
}

export async function pickCorpusBy(opts: {
  scenario?: Scenario;
  difficulty?: number[];
  limit?: number;
}): Promise<CorpusEntry[]> {
  const all = await readAllCorpus();
  const limit = opts.limit ?? Infinity;
  const out: CorpusEntry[] = [];
  for (const e of all) {
    if (opts.difficulty && !opts.difficulty.includes(e.difficulty)) continue;
    if (opts.scenario && !e.scenarios.includes(opts.scenario)) continue;
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}
