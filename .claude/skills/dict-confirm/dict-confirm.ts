/**
 * 通用 dict-confirm 辅助 CLI（0 token，纯 I/O）。
 *
 * 为通用 skill `/dict-confirm` 服务：让宿主 agent 自己复核 dict 词条
 * 的 difficulty / scenarios（lemma 级），脚本只负责"取批"和"回写"。
 *
 * dict 按 difficulty 分片：<dir>/d1.jsonl..d10.jsonl
 *
 * 复核粒度：**lemma 级**。AI 一次看 lemma + 所有 senses 的中文释义合并；
 * 写到 entry.aiConfirmed.{difficulty, scenarios}（顶层）。
 *
 * 子命令：
 *
 *   dict-confirm pending [--dir data/dict] [--limit 30]
 *     → JSON 数组到 stdout：[{lemma, ipa, pos, sensesCn, estimated, tags?, frq?}]
 *     stderr: pending=N returning=M
 *
 *   dict-confirm write [--dir data/dict] [--input results.json | stdin]
 *     → 数组：[{lemma, difficulty, scenarios, model?, notes?}]
 *     按 lemma 在所有分片中定位，分片级原子写
 *
 *   dict-confirm stats [--dir data/dict]
 *     → {total, confirmed, pending, untouched}
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { createReadStream } from 'node:fs';

const DEFAULT_DIR = 'data/dict';
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
    console.error('usage: dict-confirm <pending|write|stats> [--dir <dict-dir>] [--limit N] [--input <path>]');
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

function summarizeEntry(e: any) {
  // 把每个 sense 的中文释义压缩成 "[pos] cn1;cn2" 形式，AI 看着省 token
  const sensesCn = (e.senses ?? []).map((s: any) => {
    const pos = s.pos ? `[${s.pos}] ` : '';
    return pos + (s.cn ?? []).join('; ');
  });
  return {
    lemma: e.lemma,
    ipa: e.ipa?.us ?? e.ipa?.uk ?? e.ipa?.any,
    pos: e.pos,
    cefr: e.cefr,
    tags: e.tags,
    frq: e.frq,
    sensesCn,
    estimated: e.estimated,
  };
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
        pending.push(summarizeEntry(e));
      }
    }
  }
  console.error(`[dict-confirm] pending=${total} returning=${pending.length}`);
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
    console.error('[dict-confirm] write: input must be a JSON array');
    process.exit(1);
  }
  return parsed;
}

async function cmdWrite(dir: string, input?: string) {
  const updates = await readInputJson(input);
  if (updates.length === 0) {
    console.error('[dict-confirm] write: no updates given, nothing to do');
    return;
  }
  const byLemma = new Map<string, any>();
  for (const u of updates) {
    if (!u || typeof u.lemma !== 'string') {
      console.error('[dict-confirm] write: each update needs a lemma');
      process.exit(1);
    }
    byLemma.set(u.lemma.toLowerCase(), u);
  }
  const now = new Date().toISOString();
  let patched = 0;
  for (const f of shardFiles(dir)) {
    const lines = await readJsonlIfExists(f);
    if (lines.length === 0) continue;
    let touched = false;
    const outLines: string[] = [];
    for (const l of lines) {
      const e = safeParse(l);
      if (!e || typeof e.lemma !== 'string') { outLines.push(l); continue; }
      const u = byLemma.get(e.lemma.toLowerCase());
      if (!u) { outLines.push(l); continue; }
      const aiConfirmed: Record<string, unknown> = { confirmedAt: now };
      if (u.difficulty !== undefined) aiConfirmed.difficulty = u.difficulty;
      if (u.scenarios !== undefined) aiConfirmed.scenarios = u.scenarios;
      if (u.model !== undefined) aiConfirmed.model = u.model;
      if (u.notes !== undefined) aiConfirmed.notes = u.notes;
      e.aiConfirmed = aiConfirmed;
      outLines.push(JSON.stringify(e));
      byLemma.delete(e.lemma.toLowerCase());
      patched++;
      touched = true;
    }
    if (touched) {
      const tmp = `${f}.tmp`;
      await fs.writeFile(tmp, outLines.join('\n') + '\n', 'utf8');
      await fs.rename(tmp, f);
    }
  }
  const unknown = byLemma.size;
  console.error(`[dict-confirm] write: patched=${patched} unknown=${unknown}`);
  console.log(JSON.stringify({ patched, unknown }));
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
