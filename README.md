# learn-english

本地英语学习应用。技术栈：**Node + Mastra (LLM 编排) + Hono + React**。所有学习数据落到本地 `data/` 目录（JSON / JSONL，diff 友好），可随 git 一起跟踪。

## 设计取向

- **以本地数据为主、AI 为补**。一次启动学习时，先从本地词典 + 句子语料拼装题目，本地拼不出的部分才用 LLM 现生成。这样既省 token、又便于复习/审计。
- **文件即数据库**。`data/items.jsonl`（题目）+ `data/schedule.json`（FSRS 调度）+ `data/sessions/*.jsonl`（每天会话）+ `data/mistakes.jsonl`（错题本）+ `data/dict.jsonl`（词典）+ `data/corpus.jsonl`（句子语料）。
- **AI 提供商可换**。`@ai-sdk/anthropic` 与 `@ai-sdk/openai-compatible` 同时可用，通过 `.env` 切换。

## 快速开始

```bash
pnpm install
cp .env.example .env          # 填入 ANTHROPIC_API_KEY（或 OPENAI_* 那一组）
pnpm dev                      # 同时启动 server (:5174) + web (:5173)
```

打开 http://localhost:5173，选场景、模型 effort、时长，开始学习。

> 首次跑不需要本地语料就能跑（会走全 AI 路径）。但要把 token 用量压下来，请先做下面的 **本地语料初始化**。

## 本地语料初始化（一次性 / 可重复）

### 1. ECDICT 词典（约 77 万条，0 token）

```bash
curl -sL https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv \
  -o data/raw/ecdict.csv
pnpm ingest:ecdict
# → data/dict.jsonl
```

### 2. Tatoeba 中英平行句对（约 48k 条入库，0 token）

需要先手动下载（[Tatoeba 下载页](https://tatoeba.org/en/downloads)）三个文件到 `data/raw/`：

```
data/raw/cmn_sentences.tsv.bz2
data/raw/eng_sentences.tsv.bz2
data/raw/cmn-eng_links.tsv.bz2
```

然后：

```bash
pnpm ingest:tatoeba
# → 解压、繁→简、质量过滤、查 dict 估算难度/关键词、按关键词词表估场景
# → 写入 data/corpus.jsonl 的 estimated 字段
```

### 3. 场景级 AI 批生成（可选，按需）

```
/ingest-corpus
```

这是一个**通用 skill**，让当前宿主 AI（Claude Code / Trae / Cursor 等）自己为指定场景生成 dict + corpus，结果直接进 `aiConfirmed`。详见 `.claude/skills/ingest-corpus/SKILL.md`。

### 4. 用 AI 复核 Tatoeba 入库的句子（推荐）

Tatoeba 入库时是用关键词词表 + 词频做**启发式**估算（`estimated` 字段）。质量不高。可以让你正在用的 AI agent 调用通用 skill：

```
/corpus-confirm
```

它会从 `data/corpus.jsonl` 取出尚未 `aiConfirmed` 的条目，让当前 AI 重新评估难度/场景/关键词，结果写回 `aiConfirmed`。详见 `.claude/skills/corpus-confirm/SKILL.md`。

读路径优先级是 `aiConfirmed > estimated > 顶层 legacy`，所以复核越多，题库质量越高。

## 目录结构

```
src/
  domain/                 业务无 IO 内核
    schemas.ts            zod schema（Item/Dict/Corpus/Session/Mistake/...）
    store.ts              文件读写（原子写、字典序 stringify，diff 友好）
    fsrs.ts               间隔重复调度（ts-fsrs 封装）
    tags.ts               场景词表 + 场景关键词（用于启发式分类）
  mastra/
    provider.ts           anthropic / openai-compatible 切换
    agents/
      contentGenerator    新学习时让 AI 生成题目
      translationGrader   翻译题打分
      learningCoach       答错后流式讲解
    workflows/
      newLearning         本地拼装 + AI 补足 → 写 items/schedule
      reviewPick          按 due 时间挑复习题
    tools/                dedup / itemStore / scheduler
  server/
    index.ts              Hono server，端口 5174
    routes/
      config              暴露场景列表 / 模型列表
      session             start / answer / grade-translation / coach SSE / finish
      items               读题、改题
      stats               学习统计
    sessionManager.ts     in-memory 会话队列
web/
  src/                    Vite + React 单页前端
    pages/                Home / Learn / Stats
    components/Quiz       4 种题型 UI + 音标 + 流式讲解
scripts/
  ingest-ecdict.ts        ECDICT → dict.jsonl
  ingest-tatoeba.ts       Tatoeba → corpus.jsonl（含繁→简、启发式估算→estimated）
  kill-ports.mjs          清掉端口占用
data/
  dict.jsonl              词典（gitignored）
  corpus.jsonl            句子语料（gitignored）
  items.jsonl             已出过的题
  schedule.json           FSRS 调度
  index.json              派生索引（用于快速查询）
  sessions/<YYYY-MM-DD>.jsonl  按天的会话记录
  mistakes.jsonl          错题本（翻译题低分自动追加）
  drafts/                 中途未结束会话的草稿（用于 resume）
  raw/                    ingest 用的原始下载文件（gitignored）
.claude/
  skills/
    ingest-corpus/        通用 skill：为指定场景从零生成 dict + corpus（宿主 AI 生成、本地脚本写盘）
      SKILL.md
      ingest-corpus.ts
    corpus-confirm/       通用 skill：复核 Tatoeba 启发式估算的 corpus（宿主 AI 判定、本地脚本写盘）
      SKILL.md
      corpus-confirm.ts
```

## 题型

| type | 说明 | 数据来源 |
| --- | --- | --- |
| `en2cn` | 给英文（词/句）选中文 | 词典 / AI |
| `cn2en` | 给中文选英文 | 词典 / AI |
| `translate` | 给中文，用户手写英文翻译，AI 评分 | 句子语料 / AI |
| `cloze` | 完形填空（句中挖一个关键词） | 句子语料 / AI |

## 关键字段速查

- **difficulty**: `1..10` 整数。1 = 基础常用（"I am happy."），10 = 罕用/复杂学术或习语。三处一致：`ItemSchema / DictEntrySchema / CorpusEntrySchema`。
- **scenarios**: 受控词表，见 `src/domain/tags.ts` 的 `SCENARIOS / SCENARIO_INFO / SCENARIO_KEYWORDS`。新加场景要 4 处同步（schema 元组、SCENARIO_INFO、SCENARIO_KEYWORDS、可选 ingest 脚本）。
- **CorpusEntry 的 estimated / aiConfirmed**: 启发式估算结果 vs AI 复核结果。读取通过 `effectiveCorpus()` 走优先级：`aiConfirmed > estimated > 顶层 legacy`。
- **fingerprint** (`store.ts/fingerprintOf`): `type + prompt + answer` 的规范化拼接，用于去重。

## 常用脚本

```bash
pnpm dev                    # 起 server + web
pnpm dev:server             # 仅 server
pnpm dev:web                # 仅 web
pnpm build                  # 同时构建
pnpm typecheck              # tsc --noEmit
pnpm kill                   # 清 5173/5174 端口占用

pnpm ingest:ecdict          # ECDICT → dict.jsonl
pnpm ingest:tatoeba         # Tatoeba → corpus.jsonl

# 下面两个是 skill，用 pnpm exec tsx 直接调脚本；更建议在 AI agent 里 /ingest-corpus 或 /corpus-confirm 触发
pnpm exec tsx .claude/skills/ingest-corpus/ingest-corpus.ts plan <scenario> --count 30
pnpm exec tsx .claude/skills/corpus-confirm/corpus-confirm.ts stats
```

## 环境变量

见 `.env.example`：

- `MODEL_PROVIDER`：`anthropic` 或 `openai-compatible`
- `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL`
- `OPENAI_API_KEY` / `OPENAI_BASE_URL`（compatibility 模式，可对接 DeepSeek / Ollama / OpenRouter / vLLM 等）
- `MODEL_GENERATOR / MODEL_GRADER / MODEL_COACH`：分别为出题、评分、讲解的模型 id
- `MODELS_ALLOWED`：前端模型下拉允许的列表（逗号分隔）
- `PORT`：server 端口，默认 5174
- `AUTO_COMMIT=1`：会话结束自动 `git commit` 本次产生的 data 改动

## 更多

- 项目沿革、踩坑记录、字段语义、AI 配合的注意事项：见 [AGENTS.md](./AGENTS.md)。
