---
name: ingest-corpus
description: 为指定学习场景从零生成词典条目（dict）和句子语料（corpus），写入 data/dict.jsonl 和 data/corpus.jsonl。由当前宿主 AI 自己生成，不调任何后端 agent，可在 Claude Code / Trae / Cursor 等环境复用。
---

# ingest-corpus —— 通用 dict + corpus 生成 skill

## 背景：dict 和 corpus 是什么、为什么需要补

本项目（learn-english）做的是一个本地英语学习应用。它需要两类数据来出题：

- **dict**（`data/dict.jsonl`）：词典。一条 dict 条目 = 一个 lemma 单词/短语 + IPA 音标 + 中文释义 + 难度 + 所属场景。用于出 `en2cn` / `cn2en` 选择题。
- **corpus**（`data/corpus.jsonl`）：句子语料。一条 corpus 记录 = 一个英文句子 + 中文翻译 + 难度 + 场景 + 可挖空的关键词。用于出 `cloze` 完形填空 / `translate` 翻译题。

数据来源分三层：

| 层 | 来源 | 说明 |
| - | --- | --- |
| Tatoeba | `pnpm ingest:tatoeba` | 48k+ 条句子，启发式估算→`estimated`，质量较低。可用 `/corpus-confirm` skill 复核 |
| ECDICT | `pnpm ingest:ecdict` | ~38 万条词典（zk/gk/cet4/cet6/ky/toefl/ielts/gre 标签 + COCA 频率），0 token，开箱即用 |
| **本 skill** | **AI 按场景生成** | 专门为某个具体场景生成高质量的 dict + corpus，直接进 `aiConfirmed`。**本页面就是**【也就是说，生成由当前宿主 AI 自己完成，而非某个固定模型】|

**什么场景需要补？** 每个场景（`transport` / `coding` / `dining` / …）的本地 dict 和 corpus 数量不一。Tatoeba 的 48k 条散在全部语义空间里，某个冷门场景可能只有几十条。如果你发现某个场景每次学习都大量走 AI 生成（因为本地 pool 不够），就需要用本 skill 来补充本地语料了。

使用前可以跑 `plan` 看看"还差多少"：把 `count` 设成一个合理数。

## 与 `/corpus-confirm` 的区别

- `/ingest-corpus`（本 skill）= **"无中生有"**：为指定场景从零生成 dict 条目 + corpus 句子。产物是全新的、直接可用的 `aiConfirmed` 语料。
- `/corpus-confirm` = **"已有的复核"**：拿 Tatoeba 那批启发式估算过的 corpus 一条条审，覆盖 `aiConfirmed`。**不生成新内容**。

两者都遵循同一原则：**不在脚本内 spawn agent**，判定完全交给当前宿主 AI。

## 调用方式

```
/ingest-corpus <scenario> [--count N] [--file-dict <path>] [--file-corpus <path>]
```

- `scenario` 必填。可用场景见下面"可选 scenarios 列表"。
- `--count` 可选，默认 30（30 条 = 约 18 dict + 12 corpus）。建议 30-50，太多 LLM 上下文压力大。
- `--file-dict` / `--file-corpus` 可选，默认 `data/dict.jsonl` / `data/corpus.jsonl`。

## 场景词表

**唯一权威**是 `src/domain/tags.ts` 里的 `SCENARIO_KEYWORDS`（含场景 id、英中关键词），以及 `SCENARIO_INFO`（含 label、所属 group、hint）。当前可用场景：

- 工作: `biz-email, meeting, interview, negotiation, slack`
- 技术: `coding, ai-ml, devops, data, system-design`
- 生活: `shopping, dining, doctor, rent, transport`
- 文化: `movies, idioms, festivals, memes`
- 学术: `paper-writing, academic-talk, reading`
- 旅行: `airport-hotel, directions, complaints`

**如果你不确定某个场景的界定**（比如 `slack` 和 `biz-email` 的边界），直接 `Read src/domain/tags.ts` 里的 SCENARIO_KEYWORDS 和 SCENARIO_INFO 获得准确描述。

## 执行步骤（本仓库）

> 脚本就在本 skill 目录下（`.claude/skills/ingest-corpus/ingest-corpus.ts`），用 `pnpm exec tsx` 直接跑。其它项目复制整个 skill 目录后路径同步即可。

### 1. Plan —— 看看要生成什么、避免什么

```bash
pnpm exec tsx .claude/skills/ingest-corpus/ingest-corpus.ts plan transport --count 30
```

输出 JSON 到 stdout，包含：
- `scenario`, `label`, `group`, `hint`
- `keywordsHint.en / cn`：该场景的关键词提示（参考 `src/domain/tags.ts`）
- `dictCount / corpusCount`：各生成多少条
- `sampleExistingLemmas`：已有 dict lemma 抽样（避免重复）
- `sampleExistingEnKeys`：已有 corpus 英文句子抽样（避免重复）
- `allowedScenarios`：完备的可用场景列表

### 2. AI 生成

读 plan 的输出。然后生成一个 JSON 数组到文件（比如 `/tmp/ic-results.json`）。结构如下（必须完全符合）：

```json
{
  "scenario": "transport",
  "model": "claude-opus-4-7",
  "dictEntries": [
    {
      "lemma": "subway pass",
      "ipa": "/ˈsʌbweɪ pæs/",
      "pos": "n.",
      "cefr": "B1",
      "difficulty": 4,
      "cn": ["地铁通票"],
      "definition": "A ticket allowing unlimited subway rides.",
      "examples": [
        { "en": "I need to buy a monthly subway pass.", "cn": "我需要买一张月票。" }
      ]
    }
  ],
  "corpusEntries": [
    {
      "en": "Where can I buy a subway pass for the week?",
      "cn": "我在哪里可以买一张周票？",
      "keywords": ["subway pass"],
      "difficulty": 4
    }
  ]
}
```

**dictEntries 字段要求：**

| 字段 | 要求 |
| --- | --- |
| `lemma` | 单词或 ≤3 词的短语。必须是该场景的高频/重点词汇 |
| `ipa` | 国际音标（含 / /）。可留空让脚本 fallback，但建议填 |
| `pos` | 词性。`n. / v. / adj. / adv. / prep. / conj.` 等 |
| `cefr` | 可选 `A1/A2/B1/B2/C1/C2` |
| `difficulty` | 1..10。根据词汇生僻度、使用频度客观点评 |
| `cn` | 中文释义数组（同一 lemma 的多个译法） |
| `definition` | 可选。英文简洁释义 |
| `examples` | 可选。1-2 条该场景下的例句，带上中文翻译就更好 |

**corpusEntries 字段要求：**

| 字段 | 要求 |
| --- | --- |
| `en` | 英文句子。该场景下的典型对话/陈述 |
| `cn` | 可选。中文翻译 |
| `keywords` | 句中的 1-3 个可挖空的关键词/短语。**必须是句中字面出现的词**。冠词/代词/be 动词/情态动词不要 |
| `difficulty` | 1..10。参考词汇罕见度、句法复杂度、句长 |

**dict 的质量守则：**
- 扣紧指定场景，不出泛泛通用词。`transport` 场景下的 `"go"` 太宽泛，不如 `"commute"` 精准。
- 不要重复已有 lemma（`plan` 输出的 `sampleExistingLemmas` 给出了已有列表，但只是抽样，你需要靠语义判断：最确定已经有的就别写了，写新的）。
- dict 与 corpus 适度关联（corpus 中可能出现 dict 里的词，但不是必须）。
- 难度分布要拉开梯度（不能全 1 也不能全 10）。

**corpus 的质量守则：**
- 不能跟已有的 corpus 句子撞车（从 `plan` 的 `sampleExistingEnKeys` 可以感受风格和主题，但只有抽样，所以你**不能**直接判定哪些是重复 —— 脚本的 `write` 子命令会在写入时做精确去重，你有两份撞了并不导致数据损坏，只是会被去重丢弃）。
- 句子中文如果有，就写上。
- 句子难度尽量与句中关键词的难度匹配。

### 3. Write —— 去重、校验、落盘

```bash
pnpm exec tsx .claude/skills/ingest-corpus/ingest-corpus.ts write --input /tmp/ic-results.json
```

脚本会：
1. 读取 `data/dict.jsonl` 和 `data/corpus.jsonl` 已有数据做精确去重（lemma 小写 vs en 归一化指纹）
2. 对每个 dictEntry 执行 `classifyScenarios()` 根据释义自动补充场景标签，加上你指定的场景 id
3. 对每个 corpusEntry 执行相同的场景补充
4. 用 zod schema 严格校验每个条目
5. 写入：
   - **dict**: 追加到 `data/dict.jsonl`，`source = "ai-generated:<model>:<date>"`
   - **corpus**: 追加到 `data/corpus.jsonl`，顶层 legacy 空占位，**真值写到 `aiConfirmed`**，`source = "ai-generated:<model>:<date>"`
6. stdout 输出 summary JSON

### 4. 检查结果

```bash
pnpm exec tsx .claude/skills/corpus-confirm/corpus-confirm.ts stats
# 或直接看文件尾几行
tail -5 data/dict.jsonl
tail -5 data/corpus.jsonl
```

## 字段语义（重要）

所有字段见 `src/domain/schemas.ts` 的 `DictEntrySchema` 和 `CorpusEntrySchema`。特别提醒：

- **difficulty**: 1..10，三处（Item/Dict/Corpus）一致。
- **corpus 的 aiConfirmed**: 本 skill 生成的新 corpus 直接写 `aiConfirmed`，不经过 `estimated`。旧 Tatoeba 语料则反之。
- **source**: 格式 `ai-generated:<model>:<date>`，方便审计清理。

## 跨产品适配（Trae / Cursor 等）

本 skill 目录自包含。复制 `.claude/skills/ingest-corpus/` 到目标项目的 `.claude/skills/ingest-corpus/`，然后用 `pnpm exec tsx` 或 `npx tsx` 运行 `ingest-corpus.ts`（需要项目安装了 tsx 或等价 ts runner）。

脚本外部依赖：
- `zod`, `ulid`（npm 包，打包到同一项目或目标项目应已有）  
- `src/domain/schemas.ts` + `src/domain/tags.ts`（项目内模块；跨项目时可把这两个文件的 schema 定义复制过去，或用等价手写校验替换）

核心协议只有两个子命令 ± 文件格式一致，**字段语义保持一致**即可。

## 注意

- 本 skill 会消耗宿主模型 token（生成 30 条大约几 K～几十 K tokens）。
- 写入是 append-only + 自动去重，多次跑不会爆库。
- 不要跨场景大量生成；每个场景 30-60 条就够本地 pool 为 5 分钟学习批量供应了。
- 如果在 plan 中发现 `sampleExistingLemmas` 里已有大量该场景词汇，可以选另一个更缺的场景。