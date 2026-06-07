---
name: corpus-confirm
description: 对 corpus.jsonl 中尚未经 AI 审核的句子（来源于 Tatoeba 等启发式标注的语料）做语义复核，重新评估难度、场景、关键词，结果写入 aiConfirmed 字段。由当前宿主 AI 自己判定，不调任何后端 agent，可在 Claude Code / Trae / Cursor 等环境复用。
---

# corpus-confirm —— 通用 corpus 复核 skill

## 背景：corpus 是什么、为什么需要复核

本项目（learn-english）做的是一个本地英语学习应用。它需要大量可挖空、可让用户翻译、可拿来出选择题的**英文句子库**，这就是 `data/corpus.jsonl`。每条 corpus 记录长这样（关键字段）：

```jsonc
{
  "id": "01HXXXXX...",
  "en": "I'll have to transfer at the next station.",
  "cn": "我得在下一站换乘。",
  "source": "tatoeba",          // 句子的来源：tatoeba / ai-generated:<model>:<date> 等
  "estimated":   { "difficulty": 4, "scenarios": ["transport"], "keywords": ["transfer"] },
  "aiConfirmed": { ... }         // 复核后写入；本 skill 的产物
}
```

句子主要来自两条管线：

1. **Tatoeba**（48k+ 条）—— 一个免费的 cmn-eng 平行语料库。`pnpm ingest:tatoeba` 把它转成 `corpus.jsonl`，配合 ECDICT 词典做启发式估算：用句中**已知 lemma 难度的上四分位数**估 `difficulty`，用关键词词表（见 `src/domain/tags.ts` 的 `SCENARIO_KEYWORDS`）匹配出 `scenarios`，提取 ≥4 字符且难度 ≥2 的非重复词做 `keywords`。这些值都放到 `estimated`。
2. **AI 场景批生成** —— `/ingest-corpus` skill 让宿主 AI 直接给某个场景生成 dict + corpus；这条路径产出的语料直接落到 `aiConfirmed`，因为本身就是 AI 生成的。

**问题在第一条路径**。启发式有几个典型失败：
- difficulty 被生僻专有名词或单一难词拉偏；
- scenarios 完全靠英中关键词字面匹配，语义场景（比如 `"I'd like a window seat please."` 真实场景是 `airport-hotel`，但句中没有 "airport / flight / window seat" 这种字面词时就会漏判）；
- keywords 经常挑到 `let's / would / could` 这种不适合考核的虚词。

**本 skill 的作用**：让一个真正读得懂句子的 AI（也就是当前在调用本 skill 的你）逐条复核，把更准确的 `{difficulty, scenarios, keywords}` 写入 `aiConfirmed`。读取端会优先使用 `aiConfirmed > estimated > 顶层 legacy 字段`（见 `src/domain/schemas.ts` 的 `effectiveCorpus()`），所以已 confirm 的语料质量直接决定出题质量。

## 与项目内其它 ingest skill 的关键区别

`/ingest-corpus` 是**"无中生有"**：根据指定场景从零生成 dict + corpus 条目，结果直接进 `aiConfirmed`。
`/corpus-confirm`（本 skill）是**"已有的复核"**：拿 Tatoeba 那批启发式估算过的 corpus 一条条审，覆盖 `aiConfirmed`。

两者都遵循同一原则：**不在脚本内 spawn agent**，判定完全交给当前宿主 AI。脚本只做 I/O —— 这样既能在 Claude Code、Trae、Cursor 等任何 agent 里直接复用，输出质量也直接取决于宿主模型本身。这避免了"不管在哪触发，最终都是 .env 写死的某个模型在干活"那种坑。

## 调用方式

```
/corpus-confirm [count] [--file <path>]
```

- `count` 可选，本轮最多复核多少条，默认 30。建议一次 20-50，多了上下文压力大、判定质量会下降。
- `--file` 可选，默认 `data/corpus.jsonl`。

## 字段语义（必须严格遵守）

每条结果对象必须包含：

```json
{
  "id": "01HXX...",                // 必须，从 pending 输出原样回填
  "difficulty": 1..10,             // 整数。1 = 入门（"I am happy."）；10 = 罕用/学术/复杂习语
  "scenarios": ["transport", ...], // 受控词表中取值；空数组表示找不到合适场景（详见下一节）
  "keywords": ["transfer", ...]    // 0-3 个适合做填空/记忆的关键词，必须是句子中"字面出现"的词或短语（保留原大小写）
}
```

可选字段：
- `model`: 当前宿主模型名（如 `"claude-opus-4-7"` / `"gpt-5"` / `"trae-default"`），便于审计
- `notes`: 1 句话以内的简短说明，比如"句中没有任何已支持场景的关键词，建议补 sports 场景"

## 场景词表

**唯一权威**是 `src/domain/tags.ts` 里的 `SCENARIO_KEYWORDS`（含场景 id、英中关键词），以及 `SCENARIO_INFO`（含 label、所属 group、hint）。当前可用的场景 id（按 group 列出）：

- 工作: `biz-email, meeting, interview, negotiation, slack`
- 技术: `coding, ai-ml, devops, data, system-design`
- 生活: `shopping, dining, doctor, rent, transport`
- 文化: `movies, idioms, festivals, memes`
- 学术: `paper-writing, academic-talk, reading`
- 旅行: `airport-hotel, directions, complaints`

> **绝不要**使用 `workplace / computing / ai / travel / daily / food`。这些是历史兼容值，已不在前端展示，新数据写入会让 zod 通过但等于污染语料。

**复核时应该参考 `SCENARIO_KEYWORDS` 来理解每个场景的内涵**（脚本不会把它喂给你；如果你不确定 `slack` 和 `biz-email` 的边界，请直接 `Read` 那个文件）。

## 当一个句子不属于任何已有场景

Tatoeba 里有大量纯生活闲聊、运动、学习、情感表达、宠物、家庭关系等句子，这些**不属于任何当前 30 个场景**。你的处理方式：

1. **先判断是不是真的没有**。比如 `"Don't worry, it'll be fine."` 看起来很泛，但它常出现在 `doctor / complaints / interview` 的安抚语境里 —— 这种情况就标多个场景，或者选最契合的那一个。
2. **如果真的没有**：把 `scenarios` 留空数组 `[]`，并在 `notes` 里写明"建议补 XXX 场景，因为有大量类似句子如 ..."。**不要硬塞**一个不贴切的场景，那样比留空更糟。
3. **当你发现累计很多句子都建议同一个新场景**（例如出现了 ≥10 条"运动 / 健身"相关的句子），就**停下来向用户报告**，告诉他建议补哪个场景 id、label、英中关键词大致是什么，让用户决定是否补充。

### 用户决定补充新场景时需要修改的地方

补一个新场景（假设叫 `sports`，label `运动`，归入 `life` 大类）需要改这 4 个位置，**4 处必须同步**，否则 zod 会失败或前端不展示：

| # | 文件 | 改动 |
| - | --- | --- |
| 1 | `src/domain/schemas.ts` | 在 `SCENARIOS` 元组里追加 `'sports'`（必须放在数组末尾或对应分组注释下，别乱插） |
| 2 | `src/domain/tags.ts` `SCENARIO_INFO` | 添加 `sports: { label: '运动', group: 'life', hint: '健身、跑步、球类、比赛' }` |
| 3 | `src/domain/tags.ts` `SCENARIO_KEYWORDS` | 添加 `sports: { en: ['gym','run','workout','match','team','coach','score',...], cn: ['运动','健身','跑步','比赛','球','教练','得分',...] }`。关键词宁缺毋滥，每个 ≥3 字符 |
| 4 | （无需改动） | `/ingest-corpus` skill 的允许场景列表从 `SCENARIOS` 自动派生 |

改完后用户应该 `pnpm typecheck` 确认编译通过；然后**重新触发本 skill**，新出现在 pending 列表里的句子就可以用这个新场景标了（已经被你 confirm 过的不会重判，除非用户手工清掉 `aiConfirmed`）。

### 给新场景写 SCENARIO_KEYWORDS 的指南

`SCENARIO_KEYWORDS` 的作用是给 Tatoeba 这种**纯文本来源**的句子做最初一轮字面匹配（写到 `estimated.scenarios`）。质量要点：

- 每个英文关键词 ≥3 字符，最好是该场景里"无歧义"的实词（`gym` 比 `play` 好，`play` 可能出现在 movies/meeting 等）。
- 中文关键词至少 2 字符（单字基本一定误命中）。
- 关键词命中即认为场景命中（OR），所以**宽松一点没关系**，aiConfirmed 这一步还会兜底纠正。
- 不要塞 stopword、虚词、过短的词根。

## 执行步骤（本仓库）

> 脚本就在本 skill 目录下（`.claude/skills/corpus-confirm/corpus-confirm.ts`），用 `tsx` 直接跑，不依赖 package.json 的脚本别名。其它项目复制整个 skill 目录后路径同步即可。

1. **取一批待办**：
   ```bash
   pnpm exec tsx .claude/skills/corpus-confirm/corpus-confirm.ts pending --limit <count> > /tmp/corpus-pending.json
   ```
   输出是数组 `[{id, en, cn, estimated}, ...]`；stderr 打印 `pending=N returning=M`。

2. **逐条判定**：读 `/tmp/corpus-pending.json`，对每条 `{en, cn, estimated}`：
   - 重新评估 difficulty（参考词汇罕见度、句法复杂度、长度；不要盲信 estimated）
   - 重新评估 scenarios（参考 `SCENARIO_KEYWORDS`；一句话可以同时属于多个场景）
   - 重新挑 keywords（要适合考核：动词短语、固定搭配、专业名词优先；冠词/代词/be 动词/情态动词不要）
   - 把结果写到一个数组：`[{id, difficulty, scenarios, keywords, model?, notes?}, ...]`，保存到 `/tmp/corpus-results.json`

3. **回写**：
   ```bash
   pnpm exec tsx .claude/skills/corpus-confirm/corpus-confirm.ts write --input /tmp/corpus-results.json
   ```
   原子写回 `data/corpus.jsonl`，stdout 打印 `{"patched": N, "unknown": M}`。把数字告诉用户。

4. **统计 / 决定是否继续**：
   ```bash
   pnpm exec tsx .claude/skills/corpus-confirm/corpus-confirm.ts stats
   # → { total, confirmed, pending, untouched }
   ```
   用户没说停就回到步骤 1。

## 跨产品适配（trae 等）

本 skill 只依赖两个原子能力：
- "给我下一批 pending 的句子" —— 本仓库对应 `pnpm exec tsx .claude/skills/corpus-confirm/corpus-confirm.ts pending`
- "把我判定好的结果写回去" —— 本仓库对应 `pnpm exec tsx .claude/skills/corpus-confirm/corpus-confirm.ts write`

整个 skill 目录是自包含的：复制 `.claude/skills/corpus-confirm/` 到任何 Node 项目，安装 `tsx`（可选，也可先 `tsc` 编一下）即可使用。脚本只依赖 Node 标准库，不依赖项目内任何模块。

任何 AI agent 环境只要能读 `data/corpus.jsonl`、能写一个 JSONL 文件，就能复用本 skill。把上面两条命令换成等价的 Python/Node/Bash 脚本即可，**字段语义和文件位置保持一致**。

## 质量守则

- 不要批量"鹦鹉学舌" estimated 的值。estimated 是启发式，本来就常错，复核存在的意义就是修它。
- difficulty 要拉开梯度。如果你给一批里大半都是 5，多半在偷懒。
- 一句话同时属于多个场景（如 `"Let's discuss the budget over lunch."` 同时是 `meeting` + `dining`），就给多个 scenarios。
- keywords 必须是句子中**字面出现**的词/短语；不要写抽象概念；不要塞 stopword/虚词。
- 找不到合适场景宁可留空 + 在 notes 写明建议，也不要硬塞。

## 注意

- 单条句子大约 100-500 tokens。一次 30 条 = 大约 3K-15K tokens。
- 写回是原子的（先写 `.tmp` 再 rename），中断不会损坏文件。
- 已 `aiConfirmed` 过的条目不会再次出现在 pending 列表里；要强制重判需手动从 jsonl 里删除该条目的 `aiConfirmed` 字段。
