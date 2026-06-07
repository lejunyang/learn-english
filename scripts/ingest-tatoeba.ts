/**
 * Tatoeba ingest -> data/corpus.jsonl
 * 0 token。用法: pnpm ingest:tatoeba
 * 需先行下载三个 .bz2 文件至 data/raw/
 */
import { createReadStream, existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { ulid } from 'ulid';
import { CorpusEntrySchema, type CorpusEntry } from '../src/domain/schemas.js';
import { classifyScenarios } from '../src/domain/tags.js';
import { CORPUS_FILE, readAllCorpus } from '../src/domain/store.js';

const RAW = path.resolve('data/raw');
const CMN_TSV = path.join(RAW, 'cmn_sentences.tsv');
const ENG_TSV = path.join(RAW, 'eng_sentences.tsv');
const LINKS_TSV = path.join(RAW, 'cmn-eng_links.tsv');
const MIN_EN_W = 5;
const MAX_EN_W = 25;
const MIN_CN = 5;
const MAX_CN = 40;
const FLUSH = 5000;

function x(bz2, tsv) {
  if (existsSync(tsv)) return;
  if (!existsSync(bz2)) { console.error('missing', bz2); process.exit(1); }
  console.log('decompress', path.basename(bz2));
  const r = spawnSync('bunzip2', ['-k', bz2], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('bunzip2 failed'); process.exit(1); }
}

async function loadSentences(file) {
  const map = new Map();
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const l of rl) {
    const t1 = l.indexOf('\t');
    if (t1 < 0) continue;
    const t2 = l.indexOf('\t', t1 + 1);
    if (t2 < 0) continue;
    const id = parseInt(l.slice(0, t1), 10);
    if (!id) continue;
    const text = l.slice(t2 + 1).trim();
    if (text) map.set(id, text);
  }
  return map;
}

async function loadLinks(file) {
  const map = new Map();
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const l of rl) {
    const t = l.indexOf('\t');
    if (t < 0) continue;
    const a = parseInt(l.slice(0, t), 10);
    const b = parseInt(l.slice(t + 1), 10);
    if (!a || !b) continue;
    const arr = map.get(a) || [];
    arr.push(b);
    map.set(a, arr);
  }
  return map;
}

function qualityEn(s) {
  const w = s.trim().split(/\s+/).filter(Boolean).length;
  return w >= MIN_EN_W && w <= MAX_EN_W && /^[A-Za-z]/.test(s) && !/https?:\/\//.test(s);
}

function qualityCn(s) {
  const cjk = s.match(/[一-鿿]/g);
  return cjk ? cjk.length >= MIN_CN && cjk.length <= MAX_CN : false;
}

function estimateDifficulty(en, dictIndex) {
  const tokens = en.toLowerCase().replace(/[^a-z'\s-]/g, ' ').split(/\s+/).filter((t) => t.length >= 3);
  let max = 0;
  for (const t of tokens) {
    const d = dictIndex.get(t);
    if (d && d.difficulty > max) max = d.difficulty;
  }
  if (max === 0) {
    const w = en.trim().split(/\s+/).length;
    if (w <= 8) return 1;
    if (w <= 14) return 2;
    if (w <= 20) return 3;
    return 4;
  }
  return max;
}

function extractKeywords(en, dictIndex) {
  const tokens = en.toLowerCase().replace(/[^a-z'\s-]/g, ' ').split(/\s+/).filter((t) => t.length >= 4);
  const seen = new Set();
  const out = [];
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    const d = dictIndex.get(t);
    if (!d || d.difficulty < 2) continue;
    out.push(t);
    if (out.length >= 3) break;
  }
  return out;
}

async function buildDictLite() {
  const map = new Map();
  const file = path.resolve('data/dict.jsonl');
  if (!existsSync(file)) {
    console.warn('[ingest-tatoeba] no data/dict.jsonl, difficulty coarse');
    return map;
  }
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const l of rl) {
    if (!l.trim()) continue;
    try {
      const d = JSON.parse(l);
      map.set(d.lemma.toLowerCase(), { difficulty: d.difficulty });
    } catch {}
  }
  return map;
}

async function main() {
  x(path.join(RAW, 'cmn_sentences.tsv.bz2'), CMN_TSV);
  x(path.join(RAW, 'eng_sentences.tsv.bz2'), ENG_TSV);
  x(path.join(RAW, 'cmn-eng_links.tsv.bz2'), LINKS_TSV);

  console.log('[ingest-tatoeba] loading dict index...');
  const dictIndex = await buildDictLite();
  console.log(`  dict lemmas: ${dictIndex.size}`);

  console.log('[ingest-tatoeba] loading cmn sentences...');
  const cmn = await loadSentences(CMN_TSV);
  console.log(`  cmn: ${cmn.size}`);

  console.log('[ingest-tatoeba] loading eng sentences...');
  const eng = await loadSentences(ENG_TSV);
  console.log(`  eng: ${eng.size}`);

  console.log('[ingest-tatoeba] loading links...');
  const links = await loadLinks(LINKS_TSV);
  console.log(`  cmn->eng pairs: ${links.size}`);

  const existing = new Set();
  for (const c of await readAllCorpus()) {
    existing.add(c.en.toLowerCase().replace(/\s+/g, ' ').trim());
  }
  console.log(`  existing corpus: ${existing.size}`);

  let kept = 0;
  let skipBadEn = 0;
  let skipBadCn = 0;
  let skipDup = 0;
  let skipNoLink = 0;
  let batch = [];

  for (const [cmnId, engIds] of links) {
    const cn = cmn.get(cmnId);
    if (!cn || !qualityCn(cn)) { skipBadCn++; continue; }

    let picked = null;
    for (const eid of engIds) {
      const e = eng.get(eid);
      if (e && qualityEn(e)) { picked = e; break; }
    }
    if (!picked) { skipNoLink++; continue; }

    const key = picked.toLowerCase().replace(/\s+/g, ' ').trim();
    if (existing.has(key)) { skipDup++; continue; }
    existing.add(key);

    const scenarios = classifyScenarios(picked, cn);
    const difficulty = estimateDifficulty(picked, dictIndex);
    const keywords = extractKeywords(picked, dictIndex);

    const entry = CorpusEntrySchema.parse({
      id: ulid(),
      en: picked,
      cn,
      keywords,
      scenarios,
      difficulty,
      source: 'tatoeba',
    });
    batch.push(entry);
    kept++;

    if (batch.length >= FLUSH) {
      await fs.appendFile(CORPUS_FILE, batch.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
      batch = [];
      console.log(`[ingest-tatoeba] kept ${kept}...`);
    }
  }

  if (batch.length) {
    await fs.appendFile(CORPUS_FILE, batch.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  }

  console.log(`[ingest-tatoeba] done.`);
  console.log(`  kept:         ${kept}`);
  console.log(`  skipBadCn:    ${skipBadCn}`);
  console.log(`  skipBadEn:    ${skipBadEn}`);
  console.log(`  skipDup:      ${skipDup}`);
  console.log(`  skipNoLink:   ${skipNoLink}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
