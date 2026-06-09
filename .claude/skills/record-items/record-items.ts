/**
 * record-items skill 的纯 I/O 后端。0 token。
 *
 * 一个子命令：
 *
 *   record-items write --input <results.json>
 *
 * 功能：
 *   - 接收 AI 生成的 {dictEntries:[...], corpusEntries:[...]}
 *   - 去重（dict: lemma 小写；corpus: en 归一化指纹）
 *   - zod 校验
 *   - 写入 data/dict/d{N}.jsonl 和 data/corpus/d{N}.jsonl
 *   - 同时将条目转换为 Item/Schedule/Index，标记为“今天已学习”
 *
 * 不调用任何 LLM —— 分类/补全/生成完全由宿主 AI 负责。
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { ulid } from 'ulid';
import {
  DictEntrySchema,
  CorpusEntrySchema,
  ItemSchema,
  effectiveDict,
  effectiveCorpus,
  type DictEntry,
  type CorpusEntry,
  type Item,
  type Scenario,
  type ScheduleEntry,
} from '../../../src/domain/schemas.js';
import { newEntry } from '../../../src/domain/fsrs.js';
import {
  classifyScenarios,
} from '../../../src/domain/tags.js';
import {
  appendDict,
  appendCorpus,
  readAllDict,
  readAllCorpus,
  appendItems,
  upsertScheduleEntry,
  upsertIndexEntry,
  fingerprintOf,
} from '../../../src/domain/store.js';

interface Args {
  cmd: 'write';
  input?: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const cmd = argv[0] as Args['cmd'];
  if (!cmd || cmd !== 'write') {
    console.error('usage: record-items write --input <results.json>');
    process.exit(2);
  }
  const out: Args = { cmd };
  let i = 1;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') out.input = argv[++i];
  }
  return out;
}

function normalizeEnKey(en: string): string {
  return en.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ============================================================
// write
// ============================================================

interface WriteInput {
  model?: string; // 写到 source 与 aiConfirmed.model
  scenario?: string; // 可选，默认 fallback scenario
  dictEntries?: Array<{
    lemma: string;
    ipa?: string;
    pos?: string;
    cefr?: string;
    difficulty: number;
    cn: string[];
    definition?: string;
    examples?: Array<{ en: string; cn?: string }>;
    scenarios?: string[];
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
  const defaultScenario = payload.scenario || 'daily';
  const model = payload.model || 'unknown-host';
  const dateTag = new Date().toISOString().slice(0, 10);
  const source = `user-recorded:${model}:${dateTag}`;

  // 读取现有数据用于去重
  const existingDict = await readAllDict();
  const existingCorpus = await readAllCorpus();
  const dictExisting = new Set<string>(existingDict.map((d) => d.lemma.toLowerCase()));
  const corpusExisting = new Set<string>(existingCorpus.map((c) => normalizeEnKey(c.en)));

  // 处理 dict 条目
  const newDict: DictEntry[] = [];
  let dictDup = 0;
  for (const d of payload.dictEntries ?? []) {
    const key = d.lemma.toLowerCase();
    if (dictExisting.has(key)) { dictDup++; continue; }
    dictExisting.add(key);
    const sceneFromWord = classifyScenarios(d.lemma, d.cn.join(' '));
    const finalScenarios = Array.from(new Set([
      ...(d.scenarios || []),
      ...sceneFromWord,
    ])).length > 0
      ? Array.from(new Set([...(d.scenarios || []), ...sceneFromWord]))
      : [defaultScenario];
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
              scenarios: finalScenarios as Scenario[],
              examples: d.examples ?? [],
            },
          ],
          aiConfirmed: {
            difficulty: d.difficulty,
            scenarios: finalScenarios as Scenario[],
            confirmedAt: new Date().toISOString(),
            model,
          },
          source,
        }),
      );
    } catch (e) {
      console.error(`[record-items] dict zod fail for "${d.lemma}": ${(e as Error).message}`);
    }
  }

  // 处理 corpus 条目
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
      ...explicit,
      ...sceneFromSent,
    ])).length > 0
      ? Array.from(new Set([...explicit, ...sceneFromSent]))
      : [defaultScenario];
    try {
      newCorpus.push(
        CorpusEntrySchema.parse({
          id: ulid(),
          en: c.en,
          cn: c.cn,
          aiConfirmed: {
            difficulty: c.difficulty,
            scenarios: finalScenarios as Scenario[],
            keywords: c.keywords ?? [],
            confirmedAt: now,
            model,
          },
          source,
        }),
      );
    } catch (e) {
      console.error(`[record-items] corpus zod fail for "${c.en}": ${(e as Error).message}`);
    }
  }

  // 写入 dict/corpus
  await appendDict(newDict);
  await appendCorpus(newCorpus);

  // 转换为 Item 并写入 Items/Schedule/Index（标记为“今天已学习”）
  const items: Item[] = [];
  const pseudoSessionId = ulid();
  const pseudoCreatedAt = new Date().toISOString();

  // dict 转 en2cn 和 cn2en items
  for (const d of newDict) {
    const eff = effectiveDict(d);
    const sense = d.senses[0];
    if (!sense || sense.cn.length === 0) continue;
    const cnText = sense.cn[0];
    if (!cnText) continue;

    // en2cn
    try {
      const en2cnItem = ItemSchema.parse({
        id: ulid(),
        type: 'en2cn',
        scenario: (eff.scenarios[0] || defaultScenario) as Scenario,
        langTags: ['word'],
        difficulty: eff.difficulty,
        prompt: { en: d.lemma },
        answer: { cn: cnText },
        distractors: [],
        hints: {
          weak: sense.pos ? `词性：${sense.pos}` : '类型：单词',
          strong: `首字母：${cnText.slice(0, 1)}`,
        },
        phonetics: d.ipa ? { ipa: d.ipa.us || d.ipa.uk || d.ipa.any || '' } : undefined,
        examples: sense.examples,
        userNote: d.userNote,
        sourceRef: d.lemma,
        related: [],
        source: {
          sessionId: pseudoSessionId,
          createdAt: pseudoCreatedAt,
          model: 'record-items',
        },
        stats: {
          attempts: 0,
          correct: 0,
        },
      });
      items.push(en2cnItem);
    } catch (e) {
      console.error(`[record-items] en2cn item fail for "${d.lemma}": ${(e as Error).message}`);
    }

    // cn2en
    try {
      const cn2enItem = ItemSchema.parse({
        id: ulid(),
        type: 'cn2en',
        scenario: (eff.scenarios[0] || defaultScenario) as Scenario,
        langTags: ['word'],
        difficulty: eff.difficulty,
        prompt: { cn: cnText },
        answer: { en: d.lemma },
        distractors: [],
        hints: {
          weak: sense.pos ? `词性：${sense.pos}` : '类型：单词',
          strong: `首字母：${d.lemma.slice(0, 1)}`,
        },
        phonetics: d.ipa ? { ipa: d.ipa.us || d.ipa.uk || d.ipa.any || '' } : undefined,
        examples: sense.examples,
        userNote: d.userNote,
        sourceRef: d.lemma,
        related: [],
        source: {
          sessionId: pseudoSessionId,
          createdAt: pseudoCreatedAt,
          model: 'record-items',
        },
        stats: {
          attempts: 0,
          correct: 0,
        },
      });
      items.push(cn2enItem);
    } catch (e) {
      console.error(`[record-items] cn2en item fail for "${d.lemma}": ${(e as Error).message}`);
    }
  }

  // corpus 转 cloze 和 translate items
  for (const c of newCorpus) {
    const eff = effectiveCorpus(c);

    // cloze（如果有 keywords）
    if (eff.keywords && eff.keywords.length > 0) {
      const target = eff.keywords[0];
      if (target) {
        const re = new RegExp(`\\b${escapeRegex(target)}\\b`, 'i');
        if (re.test(c.en)) {
          try {
            const clozeItem = ItemSchema.parse({
              id: ulid(),
              type: 'cloze',
              scenario: (eff.scenarios[0] || defaultScenario) as Scenario,
              langTags: ['sentence'],
              difficulty: eff.difficulty,
              prompt: { cloze: c.en.replace(re, '___') },
              answer: { en: target },
              distractors: [],
              hints: {
                weak: `首字母：${target.slice(0, 1)}`,
                strong: c.cn ? `中文：${c.cn}` : `长度：${target.length}`,
              },
              userNote: c.userNote,
              sourceRef: c.id,
              related: [],
              source: {
                sessionId: pseudoSessionId,
                createdAt: pseudoCreatedAt,
                model: 'record-items',
              },
              stats: {
                attempts: 0,
                correct: 0,
              },
            });
            items.push(clozeItem);
          } catch (e) {
            console.error(`[record-items] cloze item fail for "${c.en}": ${(e as Error).message}`);
          }
        }
      }
    }

    // translate（如果有中文）
    if (c.cn) {
      try {
        const translateItem = ItemSchema.parse({
          id: ulid(),
          type: 'translate',
          scenario: (eff.scenarios[0] || defaultScenario) as Scenario,
          langTags: ['sentence'],
          difficulty: eff.difficulty,
          prompt: { cn: c.cn },
          answer: { en: c.en },
          hints: {
            weak: `句长约 ${c.en.split(/\s+/).length} 词`,
            strong: `首词：${c.en.split(/\s+/)[0]}`,
          },
          userNote: c.userNote,
          sourceRef: c.id,
          related: [],
          source: {
            sessionId: pseudoSessionId,
            createdAt: pseudoCreatedAt,
            model: 'record-items',
          },
          stats: {
            attempts: 0,
            correct: 0,
          },
        });
        items.push(translateItem);
      } catch (e) {
        console.error(`[record-items] translate item fail for "${c.en}": ${(e as Error).message}`);
      }
    }
  }

  // 写入 Items/Schedule/Index
  await appendItems(items);
  const sched = newEntry();
  for (const it of items) {
    await upsertScheduleEntry(it.id, sched);
    await upsertIndexEntry(it.id, {
      type: it.type,
      scenario: it.scenario,
      langTags: it.langTags,
      due: sched.due || new Date().toISOString(),
      attempts: 0,
      fingerprint: fingerprintOf(it),
    });
  }

  const summary = {
    dictWritten: newDict.length,
    dictDuplicates: dictDup,
    corpusWritten: newCorpus.length,
    corpusDuplicates: corpusDup,
    itemsCreated: items.length,
  };
  console.error(`[record-items] ${JSON.stringify(summary)}`);
  console.log(JSON.stringify(summary));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// main
// ============================================================

async function main() {
  const args = parseArgs();
  if (args.cmd === 'write') await cmdWrite(args);
}

main().catch((e) => { console.error(e); process.exit(1); });
