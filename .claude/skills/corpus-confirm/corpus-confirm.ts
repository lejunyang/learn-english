/**
 * 通用 corpus-confirm 辅助 CLI（0 token，纯 I/O）。
 *
 * 为通用 skill `/corpus-confirm` 服务：让宿主 agent 自己判定句子的
 * difficulty / scenarios / keywords，本脚本只负责"取批"和"回写"。
 *
 * corpus 按 difficulty 分片存储：<dir>/d1.jsonl..d10.jsonl
 *
 * **shard 移动**：若 AI 判定的 difficulty 与当前分片不一致，自动迁移条目。
 *
 * 子命令：
 *
 *   corpus-confirm pending [--dir data/corpus] [--limit 20]
 *     → 打印 JSON 数组到 stdout，每条 {id, en, cn, estimated}
 *     stderr 打印 "pending=N returning=M"
 *
 *   corpus-confirm write [--dir data/corpus] [--input results.json | stdin]
 *     → 把 results 中每条 {id, difficulty, scenarios, keywords, ...} 回填到 aiConfirmed
 *     遍历所有分片定位 id，分片级原子 rename + 分片间自动迁移
 *
 *   corpus-confirm stats [--dir data/corpus]
 *     → 打印 {total, confirmed, pending, untouched}
 *
 * 与项目无强耦合：只依赖 Node 标准库。其它产品（trae 等）只要把
 * 这几个子命令转成等价脚本即可复用同一 skill 协议。
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { createReadStream } from 'node:fs';

const DEFAULT_DIR = 'data/corpus';
const DIFFICULTY_MIN = 1;
const DIFFICULTY_MAX = 10;

interface CliArgs {
  cmd: string;
  dir: string;
  limit?: number;
  input?: string;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || !['pending', 'write', 'stats'].includes(cmd)) {
    console.error('usage: corpus-confirm <pending|write|stats> [--dir <corpus-dir>] [--limit N] [--input <path>]');
    process.exit(2);
  }
  let dir = DEFAULT_DIR;
  let limit: number | undefined;
  let input: string | undefined;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') dir = argv[++i] ?? dir;
    else if (a === '--limit') limit = parseInt(argv[++i] ?? '0', 10) || undefined;
    else if (a === '--input') input = argv[++i];
  }
  return { cmd, dir: path.resolve(dir), limit, input };
}

function shardFiles(dir: string): string[] {
  const out: string[] = [];
  for (let i = DIFFICULTY_MIN; i <= DIFFICULTY_MAX; i++) {
    out.push(path.join(dir, `d${i}.jsonl`));
  }
  return out;
}

function shardPath(dir: string, difficulty: number): string {
  return path.join(dir, `d${clampDifficulty(difficulty)}.jsonl`);
}

function clampDifficulty(d: number): number {
  return Math.max(DIFFICULTY_MIN, Math.min(DIFFICULTY_MAX, Math.round(d)));
}

async function readJsonlIfExists(file: string): Promise<string[]> {
  try {
    await fs.access(file);
  } catch {
    return [];
  }
  const out: string[] = [];
  const rl = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const l of rl) {
    if (l.trim()) out.push(l);
  }
  return out;
}

function safeParse(line: string): any | null {
  try { return JSON.parse(line); } catch { return null; }
}

function needsConfirm(e: any): boolean {
  if (e.aiConfirmed) return false;
  return !!e.estimated;
}

// 计算 post-patch 的 effective difficulty：ai.difficulty ?? est.difficulty ?? 1
function effectiveDifficulty(e: any): number {
  const ai = e.aiConfirmed;
  if (ai && typeof ai.difficulty === 'number') return clampDifficulty(ai.difficulty);
  const est = e.estimated;
  if (est && typeof est.difficulty === 'number') return clampDifficulty(est.difficulty);
  return DIFFICULTY_MIN;
}

async function cmdPending(dir: string, limit?: number) {
  const pending: any[] = [];
  let total = 0;
  for (const f of shardFiles(dir)) {
    const lines = await readJsonlIfExists(f);
    for (const l of lines) {
      const e = safeParse(l);
      if (!e || !needsConfirm(e)) continue;
      total++;
      if (!limit || pending.length < limit) {
        pending.push({ id: e.id, en: e.en, cn: e.cn, estimated: e.estimated });
      }
    }
  }
  console.error(`[corpus-confirm] pending=${total} returning=${pending.length}`);
  process.stdout.write(JSON.stringify(pending, null, 2));
}

async function readInputJson(input?: string): Promise<any[]> {
  let text: string;
  if (input) {
    text = await fs.readFile(path.resolve(input), 'utf8');
  } else {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(Buffer.from(c));
    text = Buffer.concat(chunks).toString('utf8');
  }
  text = text.trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    console.error('[corpus-confirm] write: input must be a JSON array');
    process.exit(1);
  }
  return parsed;
}

async function cmdWrite(dir: string, input?: string) {
  const updates = await readInputJson(input);
  if (updates.length === 0) {
    console.error('[corpus-confirm] write: no updates given, nothing to do');
    return;
  }
  const byId = new Map<string, any>();
  for (const u of updates) {
    if (!u || typeof u.id !== 'string') {
      console.error('[corpus-confirm] write: each update needs an id');
      process.exit(1);
    }
    byId.set(u.id, u);
  }
  const now = new Date().toISOString();
  let patched = 0;
  // 缓冲需要在分片间迁移的条目（key=id → JSON string）
  const moves: Map<string, string> = new Map();

  for (const f of shardFiles(dir)) {
    const lines = await readJsonlIfExists(f);
    if (lines.length === 0) continue;
    let touched = false;
    const outLines: string[] = [];
    for (const l of lines) {
      const e = safeParse(l);
      if (!e || !e.id) { outLines.push(l); continue; }
      const u = byId.get(e.id);
      if (!u) { outLines.push(l); continue; }

      const aiConfirmed: Record<string, unknown> = { confirmedAt: now };
      if (u.difficulty !== undefined) aiConfirmed.difficulty = u.difficulty;
      if (u.scenarios !== undefined) aiConfirmed.scenarios = u.scenarios;
      if (u.keywords !== undefined) aiConfirmed.keywords = u.keywords;
      if (u.model !== undefined) aiConfirmed.model = u.model;
      if (u.notes !== undefined) aiConfirmed.notes = u.notes;
      e.aiConfirmed = aiConfirmed;

      // 判断是否要跨分片迁移
      const newDiff = effectiveDifficulty(e);
      const targetShard = shardPath(dir, newDiff);
      if (targetShard !== f) {
        moves.set(e.id, JSON.stringify(e));
      } else {
        outLines.push(JSON.stringify(e));
      }
      byId.delete(e.id);
      patched++;
      touched = true;
    }
    if (touched) {
      const tmp = `${f}.tmp`;
      await fs.writeFile(tmp, outLines.join('\n') + '\n', 'utf8');
      await fs.rename(tmp, f);
    }
  }

  // 写入迁移到目标分片的条目
  if (moves.size > 0) {
    const byTarget = new Map<string, string[]>();
    for (const [, entryJson] of moves) {
      const e = safeParse(entryJson);
      if (!e) continue;
      const diff = effectiveDifficulty(e);
      const tf = shardPath(dir, diff);
      const arr = byTarget.get(tf) ?? [];
      arr.push(entryJson);
      byTarget.set(tf, arr);
    }
    for (const [tf, lines] of byTarget) {
      await fs.appendFile(tf, lines.join('\n') + '\n', 'utf8');
    }
  }

  const unknown = byId.size;
  console.error(`[corpus-confirm] write: patched=${patched} moved=${moves.size} unknown=${unknown}`);
  console.log(JSON.stringify({ patched, moved: moves.size, unknown }));
}

async function cmdStats(dir: string) {
  let total = 0;
  let confirmed = 0;
  let pending = 0;
  let untouched = 0;
  for (const f of shardFiles(dir)) {
    const lines = await readJsonlIfExists(f);
    for (const l of lines) {
      const e = safeParse(l);
      if (!e) continue;
      total++;
      if (e.aiConfirmed) confirmed++;
      else if (needsConfirm(e)) pending++;
      else untouched++;
    }
  }
  console.log(JSON.stringify({ total, confirmed, pending, untouched }, null, 2));
}

async function main() {
  const { cmd, dir, limit, input } = parseArgs();
  if (cmd === 'pending') await cmdPending(dir, limit);
  else if (cmd === 'write') await cmdWrite(dir, input);
  else if (cmd === 'stats') await cmdStats(dir);
}

main().catch((e) => { console.error(e); process.exit(1); });