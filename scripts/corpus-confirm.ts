/**
 * 通用 corpus-confirm 辅助 CLI（0 token，纯 I/O）。
 *
 * 为通用 skill `/corpus-confirm` 服务：让宿主 agent 自己判定句子的
 * difficulty / scenarios / keywords，本脚本只负责"取批"和"回写"。
 *
 * 子命令：
 *
 *   pnpm tsx scripts/corpus-confirm.ts pending [--file data/corpus.jsonl] [--limit 20]
 *     → 打印 JSON 数组到 stdout，每条 {id, en, cn, estimated}
 *     stderr 会打印 "remaining: N" 让 agent 决定是否继续
 *
 *   pnpm tsx scripts/corpus-confirm.ts write [--file data/corpus.jsonl] --input results.json
 *     → 把 results 中每条 {id, difficulty, scenarios, keywords} 回填到 aiConfirmed
 *     原子写入（先写 .tmp 再 rename），保留其它字段不变
 *
 *   pnpm tsx scripts/corpus-confirm.ts stats [--file data/corpus.jsonl]
 *     → 打印 总数 / 已 confirmed / 待 confirm / 既无 estimated 也无 aiConfirmed 的数量
 *
 * 与项目无强耦合：只依赖 Node 标准库。其它产品（trae 等）只要把这两个
 * 子命令转成等价的脚本即可复用同一 skill 协议。
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { createReadStream } from 'node:fs';

interface CliArgs {
  cmd: string;
  file: string;
  limit?: number;
  input?: string;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || !['pending', 'write', 'stats'].includes(cmd)) {
    console.error('usage: corpus-confirm <pending|write|stats> [--file <path>] [--limit N] [--input <path>]');
    process.exit(2);
  }
  let file = 'data/corpus.jsonl';
  let limit: number | undefined;
  let input: string | undefined;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') file = argv[++i] ?? file;
    else if (a === '--limit') limit = parseInt(argv[++i] ?? '0', 10) || undefined;
    else if (a === '--input') input = argv[++i];
  }
  return { cmd, file: path.resolve(file), limit, input };
}

async function readJsonlLines(file: string): Promise<string[]> {
  try {
    await fs.access(file);
  } catch {
    console.error(`[corpus-confirm] file not found: ${file}`);
    process.exit(1);
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
  // 有 estimated 字段（新数据），或者顶层有 legacy 估算字段（老数据）都算待复核
  if (e.estimated) return true;
  const hasLegacy =
    typeof e.difficulty === 'number' ||
    (Array.isArray(e.scenarios) && e.scenarios.length > 0) ||
    (Array.isArray(e.keywords) && e.keywords.length > 0);
  return hasLegacy;
}

async function cmdPending(file: string, limit?: number) {
  const lines = await readJsonlLines(file);
  const pending: any[] = [];
  let total = 0;
  for (const l of lines) {
    const e = safeParse(l);
    if (!e) continue;
    if (needsConfirm(e)) {
      total++;
      if (!limit || pending.length < limit) {
        const estimated = e.estimated ?? {
          difficulty: typeof e.difficulty === 'number' ? e.difficulty : undefined,
          scenarios: Array.isArray(e.scenarios) ? e.scenarios : undefined,
          keywords: Array.isArray(e.keywords) ? e.keywords : undefined,
        };
        pending.push({ id: e.id, en: e.en, cn: e.cn, estimated });
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
    // stdin
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

async function cmdWrite(file: string, input?: string) {
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
  const lines = await readJsonlLines(file);
  const now = new Date().toISOString();
  let patched = 0;
  let unknown = 0;
  const outLines: string[] = [];
  for (const l of lines) {
    const e = safeParse(l);
    if (!e || !e.id) { outLines.push(l); continue; }
    const u = byId.get(e.id);
    if (!u) { outLines.push(l); continue; }
    const aiConfirmed: Record<string, unknown> = {
      confirmedAt: now,
    };
    if (u.difficulty !== undefined) aiConfirmed.difficulty = u.difficulty;
    if (u.scenarios !== undefined) aiConfirmed.scenarios = u.scenarios;
    if (u.keywords !== undefined) aiConfirmed.keywords = u.keywords;
    if (u.model !== undefined) aiConfirmed.model = u.model;
    if (u.notes !== undefined) aiConfirmed.notes = u.notes;
    e.aiConfirmed = aiConfirmed;
    outLines.push(JSON.stringify(e));
    byId.delete(e.id);
    patched++;
  }
  for (const _ of byId) unknown++;

  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, outLines.join('\n') + '\n', 'utf8');
  await fs.rename(tmp, file);

  console.error(`[corpus-confirm] write: patched=${patched} unknown=${unknown}`);
  console.log(JSON.stringify({ patched, unknown }));
}

async function cmdStats(file: string) {
  const lines = await readJsonlLines(file);
  let total = 0;
  let confirmed = 0;
  let pending = 0;
  let untouched = 0;
  for (const l of lines) {
    const e = safeParse(l);
    if (!e) continue;
    total++;
    if (e.aiConfirmed) confirmed++;
    else if (needsConfirm(e)) pending++;
    else untouched++;
  }
  console.log(JSON.stringify({ total, confirmed, pending, untouched }, null, 2));
}

async function main() {
  const { cmd, file, limit, input } = parseArgs();
  if (cmd === 'pending') await cmdPending(file, limit);
  else if (cmd === 'write') await cmdWrite(file, input);
  else if (cmd === 'stats') await cmdStats(file);
}

main().catch((e) => { console.error(e); process.exit(1); });
