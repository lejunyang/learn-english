/**
 * 把 ECDICT 全量 CSV 转成 data/dict.jsonl。
 *
 * 用法：
 *   1. 下载 ECDICT 完整版到 data/raw/ecdict.csv （63MB）
 *      curl -sL https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv -o data/raw/ecdict.csv
 *   2. pnpm tsx scripts/ingest-ecdict.ts
 *
 * 0 token，纯程序处理。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse';
import { DictEntrySchema, type DictEntry, type Scenario } from '../src/domain/schemas.js';
import { classifyScenarios } from '../src/domain/tags.js';
import { DICT_FILE, readAllDict } from '../src/domain/store.js';

const SRC = path.resolve('data/raw/ecdict.csv');

// tag → difficulty 映射（多个 tag 取最简单的难度）
const TAG_DIFFICULTY: Record<string, 1 | 2 | 3 | 4 | 5> = {
  zk: 1, // 中考
  gk: 2, // 高考
  cet4: 2,
  cet6: 3,
  ky: 4, // 考研
  toefl: 4,
  ielts: 4,
  gre: 5,
};

function inferDifficulty(tag: string, frq: number): 1 | 2 | 3 | 4 | 5 {
  const tags = tag.split(/\s+/).filter(Boolean);
  if (tags.length) {
    let min = 5;
    for (const t of tags) {
      const d = TAG_DIFFICULTY[t];
      if (d !== undefined && d < min) min = d;
    }
    return min as 1 | 2 | 3 | 4 | 5;
  }
  // 没有 tag：按 frq（COCA 频率）粗估
  if (!frq || frq === 0) return 4;
  if (frq <= 2000) return 1;
  if (frq <= 5000) return 2;
  if (frq <= 15000) return 3;
  if (frq <= 40000) return 4;
  return 5;
}

// 解析 translation 字段：按 \n 分行，每行尽量提取 pos 与中文
function parseTranslation(translation: string): Array<{ pos?: string; cn: string[] }> {
  if (!translation) return [];
  const lines = translation
    .replace(/\\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const senses: Array<{ pos?: string; cn: string[] }> = [];
  for (const line of lines) {
    // 跳过明显垃圾行
    if (line.startsWith('[网络]') || line.startsWith('[计]') || line.startsWith('[医]') || line.startsWith('[化]') || line.startsWith('[法]') || line.startsWith('[经]') || line.startsWith('[电]')) continue;

    // 提取词性前缀：n./v./adj./adv./prep./conj./pron./int./art./vt./vi./a./ad. 等
    const posMatch = line.match(/^((?:n|v|adj|adv|prep|conj|pron|int|art|vt|vi|a|ad)\.?)\s+(.+)$/i);
    let pos: string | undefined;
    let body = line;
    if (posMatch) {
      pos = posMatch[1].toLowerCase();
      body = posMatch[2];
    }
    // 中文释义可能用 ；; , 分隔多个
    const cn = body
      .split(/[；;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length < 30); // 太长的可能是例句，扔掉
    if (cn.length === 0) continue;
    senses.push({ pos, cn });
  }
  return senses;
}

// 判断 word 是否值得作为词典条目：
// - 单个英文词或最多 2-3 词的短语
// - 不含中文（误录）
// - 不是纯非英文符号
// - 不是句子（无问号、感叹号、太长）
function isValidLemma(word: string): boolean {
  if (!word) return false;
  if (word.length > 40) return false;
  if (/[一-鿿？！。，；：？]/.test(word)) return false;
  if (/[?!]/.test(word)) return false;
  const tokens = word.trim().split(/\s+/);
  if (tokens.length > 3) return false; // 超过 3 词当句子处理
  // 必须含英文字母
  if (!/[a-zA-Z]/.test(word)) return false;
  return true;
}

async function main() {
  try {
    await fs.access(SRC);
  } catch {
    console.error(`[ingest-ecdict] missing source: ${SRC}`);
    console.error(`  download with: curl -sL https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv -o data/raw/ecdict.csv`);
    process.exit(1);
  }

  // 现有 dict 的 lemma 集合（去重）
  const existing = new Set((await readAllDict()).map((d) => d.lemma.toLowerCase()));
  console.log(`[ingest-ecdict] existing dict entries: ${existing.size}`);

  const parser = (await fs.readFile(SRC)).toString('utf8');
  const records: Array<Record<string, string>> = await new Promise((resolve, reject) => {
    parse(parser, { columns: true, relax_quotes: true, relax_column_count: true, trim: true }, (err, out) => {
      if (err) reject(err);
      else resolve(out);
    });
  });
  console.log(`[ingest-ecdict] parsed ${records.length} rows`);

  let kept = 0;
  let skippedInvalid = 0;
  let skippedDup = 0;
  let skippedNoTranslation = 0;

  // 收集批写出（每 5000 条 flush 一次，省内存）
  const FLUSH_SIZE = 5000;
  let batch: DictEntry[] = [];

  // 先清空目标文件（如果用户希望追加，可以注释下行）
  // 这里我们改为 append 模式，所以只去重不删旧
  for (const row of records) {
    const word = row.word;
    if (!isValidLemma(word)) {
      skippedInvalid++;
      continue;
    }
    const key = word.toLowerCase();
    if (existing.has(key)) {
      skippedDup++;
      continue;
    }
    const senses = parseTranslation(row.translation || '');
    if (senses.length === 0) {
      skippedNoTranslation++;
      continue;
    }

    const frq = parseInt(row.frq || '0', 10) || 0;
    const bnc = parseInt(row.bnc || '0', 10) || 0;
    const tag = row.tag || '';
    const difficulty = inferDifficulty(tag, frq);

    // 为每个 sense 自动打场景标签（基于 cn 释义关键词匹配）
    const sensesWithScenarios = senses.map((s) => {
      const scenarios: Scenario[] = classifyScenarios(undefined, s.cn.join(' '));
      return {
        pos: s.pos,
        cn: s.cn,
        scenarios,
        examples: [],
      };
    });

    // 整词层面也尝试用 lemma 自身做英文关键词匹配
    const wordScenarios = classifyScenarios(word, undefined);
    if (wordScenarios.length) {
      // 把 word 层面的场景合并到每个 sense
      for (const s of sensesWithScenarios) {
        for (const sc of wordScenarios) {
          if (!s.scenarios.includes(sc)) s.scenarios.push(sc);
        }
      }
    }

    const entry: DictEntry = DictEntrySchema.parse({
      lemma: word,
      ipa: row.phonetic ? { any: row.phonetic } : undefined,
      pos: row.pos ? row.pos.split(/\s+/).filter(Boolean) : [],
      tags: tag.split(/\s+/).filter(Boolean),
      frq: frq || undefined,
      bnc: bnc || undefined,
      difficulty,
      senses: sensesWithScenarios,
      exchange: row.exchange || undefined,
      source: 'ecdict',
    });
    batch.push(entry);
    existing.add(key);
    kept++;

    if (batch.length >= FLUSH_SIZE) {
      const lines = batch.map((e) => JSON.stringify(e)).join('\n') + '\n';
      await fs.appendFile(DICT_FILE, lines, 'utf8');
      batch = [];
      if (kept % 50000 === 0) console.log(`[ingest-ecdict] kept ${kept}...`);
    }
  }

  if (batch.length) {
    const lines = batch.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await fs.appendFile(DICT_FILE, lines, 'utf8');
  }

  console.log(`[ingest-ecdict] done.`);
  console.log(`  kept:               ${kept}`);
  console.log(`  skipped invalid:    ${skippedInvalid}`);
  console.log(`  skipped duplicate:  ${skippedDup}`);
  console.log(`  skipped no trans:   ${skippedNoTranslation}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
