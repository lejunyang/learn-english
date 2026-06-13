# AGENTS.md

写给 AI agent（Claude Code / Trae / Cursor 等）以及未来回来维护这个项目的我自己看的"工程日志 + 操作手册"。**README 讲怎么用**，本文档讲**为什么是这样、走过哪些路、踩过哪些坑、字段的真实语义、改动时需要注意什么**。

---

## 1. 项目背景

learn-english 是一个**本地、单用户**的英语学习应用。目标：

- 每天用 5-30 分钟做出题练习，覆盖单词、句子、翻译、完形 4 种题型。
- 学习记录、错题、调度全部存在本地 `data/` 目录，可以 git diff、可以备份、可以离线复习。
- 出题尽量**本地拼装**（0 token），本地真的拼不出再让 LLM 补。
- 不绑死单一 LLM。Anthropic 系列、任何兼容 OpenAI Messages API 的 endpoint（DeepSeek、Ollama、OpenRouter、vLLM……）都能切。

非目标：

- 不做多用户 / 不做云同步 / 不做收费版。
- 不做完整 SaaS 接口（auth、配额、计费一律没有）。

---

## 2. 走过的路（重要历史决策）

按时间顺序记录关键选择。改东西前先看看这一节，避免把已经踩过的坑再踩一遍。

### 2.1 早期：纯 AI 出题

最初版本是「用户选场景 → server 调 generator agent → 生成 N 条题目 → 用户答」。问题：

- 每开一次学习要烧几千 ~ 几万 token。
- 同一场景同一模型生成的题很容易撞车（指纹去重命中率高）。
- 拿不到稳定的 IPA 音标。
- distractor 经常是"几个同义词"（详见 2.4）。

→ 决定引入**本地词典 + 本地句子语料**。

### 2.2 词典选 ECDICT

候选：CC-CEDICT / Wiktionary dump / ECDICT。最终选 [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)，原因：

- 单 CSV，77 万条，约 63MB，无外部依赖。
- 自带 `tag`（zk/gk/cet4/cet6/ky/toefl/ielts/gre）、`frq`（COCA 频率）、`bnc` 等元信息 → 0 token 估难度。
- 带英美音标。

`scripts/ingest-ecdict.ts` 把 CSV 转成 `data/dict/d{N}.jsonl`（按 difficulty 分片），按 lemma 唯一去重。

**易错点**：
- `translation` 字段是多行混杂，需要 `parseTranslation` 按词性前缀（n./v./adj./...）和分号切；超过 30 字符的多半是例句而不是中文释义。
- 有些"翻译"是 `[网络] / [医] / [化] / [电]` 这种专业领域前缀，质量很差，直接整行跳过。
- `isValidLemma` 限制：≤40 字符、≤3 词、不含中文/问号/感叹号。再宽容会被各种垃圾条目污染。
- **既无 `frq` 又无 `tag` 的条目直接丢弃**（约 33 万 / 77 万）。这种条目通常是冷僻/无意义的混入，没有任何判定信号，留着只会污染候选池。

### 2.3 句子语料选 Tatoeba

候选：OpenSubtitles（噪声大）、WikiMatrix（学术化）、Tatoeba。最终选 Tatoeba：

- 平行 cmn-eng，质量比电影字幕高很多。
- 完全免费、单文件。

`scripts/ingest-tatoeba.ts` 流程：

1. 三个 `.tsv.bz2` 自动解压（要本机有 `bunzip2`）。
2. 加载 cmn / eng / links 三个 map。
3. 用 `opencc-js` 把繁体转简体（**关键**：Tatoeba 中文相当大比例是繁体，不转换会让前端体验割裂，估算关键词也会错位）。
4. 英文按词数 5-25、中文按字数 5-40 过滤。
5. 已有 `corpus` 分片中的句子做去重（`en.toLowerCase().replace(/\s+/g,' ').trim()` 作为指纹）。
6. 用 `dict` 分片汇总后算 `difficulty`（已知 lemma 难度的上四分位数 + 句长偏置，线性映射到 1..10）。
7. 用 `SCENARIO_KEYWORDS` 字面匹配 `scenarios`。
8. 抽 keywords（≥4 字符、难度 ≥2、最多 3 个）。

**注意**：6/7/8 的产物都写到 `estimated` 里，不写到顶层。这是 2.7 节做的改动，下面会讲为什么。

### 2.4 distractor 质量铁律

早期 AI 生成的题目，distractor 总是出问题：同义词、拼写微改、时态变形、几乎都对。这会让用户在 UI 上无法判断到底选哪个。

`contentGenerator.ts` 的 SYSTEM prompt 现在有一大段**示例驱动的规则**（Good / Bad 案例对照）。改这块时务必保留：

- 同语法形态、长度接近、确定是错的、明显语义不同。
- 禁止同义词 / 拼写微改 / 时态变形 / 全是同一意思的不同说法。

### 2.5 场景词表的演化

最初只有 6 个泛场景：`workplace / computing / ai / travel / daily / food`。
- 太粗。`computing` 同时盖了"代码 / 部署 / AI / 数据"，出题脱靶率高。
- → 拓展为推荐大类 + 二级场景（见 `SCENARIO_INFO`），覆盖工作、学习、计算机科学与 AI、日常交流、日常生活、文化艺术、游戏、旅行、美食、音乐、日用品等。
- → `ScenarioSchema` 改为宽松字符串，`SCENARIOS / SCENARIO_INFO / SCENARIO_KEYWORDS` 只是推荐词表和启发式分类表，不再是严格枚举。
- → 旧值仍保留在 `SCENARIO_INFO.group = 'misc'`，用于读历史数据和迁移期兼容，但新数据优先使用更具体的场景。

AI 复核或生成时可以补充合理新场景；如果某个新场景高频出现，再把它沉淀进 `SCENARIO_INFO` 和 `SCENARIO_KEYWORDS`，这样前端会展示、启发式 ingest 也能命中。

### 2.6 difficulty 从 5 级到 10 级

原来 `z.union([z.literal(1), ..., z.literal(5)])`。问题：

- ECDICT 自带 9 个 tag（zk/gk/cet4/cet6/ky/toefl/ielts/gre 等），强行往 5 级压会损失梯度。
- Tatoeba 句子的复杂度跨度很大（"Hi." 到学术长句），5 级刻度太粗、出题难度集中在 2-3。
- AI 估难度时也总是给出 3，3 几乎成默认值。

→ 改为 `z.number().int().min(1).max(10)`。映射：

| 来源 | 原 1..5 → 新 1..10 |
| --- | --- |
| ECDICT zk | 1 → 1 |
| ECDICT gk | 2 → 3 |
| ECDICT cet4 | 2 → 3 |
| ECDICT cet6 | 3 → 5 |
| ECDICT ky/toefl/ielts | 4 → 7 |
| ECDICT gre | 5 → 9 |
| Tatoeba estimate | 线性映射 `(b-1)*9/4 + 1` + 句长偏置 |

注意旧数据（顶层 difficulty=1..5）仍合法，**不要做迁移**。

### 2.7 CorpusEntry 拆 estimated / aiConfirmed

经过一段使用，发现 Tatoeba ingest 出来的 `difficulty/scenarios/keywords` 错率很高：

- difficulty 被生僻词拉偏；
- scenarios 完全靠字面词命中，语义场景漏判（`"I'll have the steak medium-rare."` → dining 一个字面词都没有）；
- keywords 经常挑到虚词（`let's / would / could`）。

但又不愿意写一个固定 agent 用某个模型批量复核，因为：

- 想在不同 AI agent 环境里复用（Claude Code 的 Opus、Trae 的另一个模型、未来更强的模型）。
- 想让"复核"和"使用什么模型"完全解耦。

最终方案：
- CorpusEntry 加 `estimated`（启发式） + `aiConfirmed`（AI 复核结果）两个可选子对象。
- 顶层 `difficulty/scenarios/keywords` **保留**为 legacy 兼容（48k 老条目不需要重写）。
- 读取一律走 `effectiveCorpus(c)`：`aiConfirmed > estimated > 顶层`。
- 新增 `/corpus-confirm` skill：纯 I/O 后端 + skill 描述，**不调任何后端 agent**，让宿主 AI 自己判定后写回。

参考实现：`.claude/skills/corpus-confirm/corpus-confirm.ts` 三个子命令 `pending / write / stats`。

### 2.8 前端 effort 命名

最初叫"深入程度"（轻松/常规/深入），用户反馈不直观。
→ 改名"模型 effort"，选项"低/中/高"。

### 2.9 dict/corpus 按 difficulty 分片 + dict 加 estimated/aiConfirmed

最初 dict 和 corpus 都是单文件 `data/dict.jsonl`、`data/corpus.jsonl`。问题：

- 单文件 dict ~38MB / corpus ~10MB，git diff 体验差；
- 想跟踪入 git 但太大；
- 出题 `pickDictBy({difficulty: [1,2]})` 每次都要全量读 + 过滤，浪费 IO。

→ 拆为 `data/dict/d{1..10}.jsonl`、`data/corpus/d{1..10}.jsonl` 共 20 个分片：
- 入库时按 `effectiveDict/Corpus(e).difficulty` 决定写哪个分片；
- `pickDictBy/pickCorpusBy` 指定 difficulty 子集时只读对应分片；
- 整个 `data/dict/` 和 `data/corpus/` 都进 git。

同时把 dict 也升级到 corpus 同款双层结构：
- `estimated.{difficulty, scenarios}` — ECDICT tag/frq 推出 + `classifyScenarios` 字面匹配；
- `aiConfirmed.{difficulty, scenarios, model?, notes?}` — `/dict-confirm` skill 写入；
- `effectiveDict(d)` 取 `aiConfirmed > estimated > senses 并集兜底`；
- ECDICT 入库时**既无 frq 又无 tag 的条目直接丢弃**（约 33 万条无判定信号的混入）。

此次也直接清空 dict.jsonl/corpus.jsonl 旧数据重跑 —— 不再保留 legacy 顶层 `difficulty/scenarios/keywords` 字段（schema 不再有这些必填项）。

新增 `/dict-confirm` skill（与 corpus-confirm 完全对称），lemma 级复核。

### 2.10 三个 skill 的统一形态

三个 skill 同住 `.claude/skills/<name>/`，每个目录自包含 `SKILL.md + <name>.ts`：

- `ingest-corpus` —— 为指定场景"无中生有"，AI 生成 dict + corpus
- `corpus-confirm` —— 复核 corpus（句子）的 difficulty / scenarios / keywords
- `dict-confirm` —— 复核 dict（词条）的 difficulty / scenarios（lemma 级）

共同原则：**脚本不 spawn agent**，生成/判定由当前宿主 AI 完成。脚本只做 I/O（plan / pending / write / stats）。这避免了"在哪触发都还是 .env 写死的某个模型在干活"的坑，跨 agent 平台（Claude Code / Trae / Cursor）复用同一协议。

这个值控制 `count = round(minutes * 2 * effortMultiplier)`，effortMultiplier ∈ {0.7, 1.0, 1.5}。不影响题质，只影响数量。

---

## 3. 数据模型字段语义详解

### 3.1 ItemSchema（题目）

```ts
{
  id: ulid,
  type: 'en2cn' | 'cn2en' | 'translate' | 'cloze',
  scenario: Scenario,
  langTags: string[],        // 自由词表，建议 word/phrase/sentence/idiom/...
  difficulty: 1..10,
  prompt: { en?, cn?, cloze? },  // cloze 是含 ___ 的英文句子
  answer: { en?, cn? },
  distractors?: string[],    // 选择题 3 个（translate 题没有）
  hints: { weak: string, strong: string },  // 弱提示 / 强提示，UI 各点一次
  phonetics?: { ipa?, ipaUS?, ipaUK? },     // 仅单词/短语题填
  source: { sessionId, createdAt, model },  // model: 'local:ecdict' / 'local:corpus' / '<llm-id>'
  stats: { attempts, correct, lastScore? }, // lastScore: 0=Again / 1=Hard / 2=Good / 3=Easy
  related: string[],
}
```

### 3.2 DictEntrySchema（词典）

```ts
{
  lemma: string,                       // 词根 / 短语（≤3 词）
  ipa?: { us?, uk?, any? },
  pos: string[],
  cefr?: 'A1'..'C2',
  tags: string[],                      // ECDICT 的 zk/gk/cet4/cet6/ky/toefl/ielts/gre
  frq?: number,                        // COCA 频率排名（越小越高频）
  bnc?: number,
  senses: Array<{                      // 多义项
    pos?: string,
    cn: string[],
    definition?: string,
    scenarios: Scenario[],             // 该义项所属场景（启发式）
    examples: { en, cn? }[],
  }>,

  // difficulty / scenarios 走双层结构（同 corpus）
  estimated?:   { difficulty?, scenarios? },               // ECDICT tag/frq 推出
  aiConfirmed?: { difficulty?, scenarios?, confirmedAt?, model?, notes? },  // /dict-confirm 写回

  exchange?: string,                   // ECDICT 原文（词形变化）
  source: 'ecdict' | 'oxford' | 'ai-generated:<model>:<date>',
}
```

**读取一律走 `effectiveDict(d)`**，返回 `{difficulty, scenarios}`，优先级 `aiConfirmed > estimated > senses 并集兜底`。

### 3.3 CorpusEntrySchema（句子语料）

```ts
{
  id: ulid,
  en: string,
  cn?: string,

  // difficulty/scenarios/keywords 走双层
  estimated?:   { difficulty?, scenarios?, keywords? },               // Tatoeba 启发式估算
  aiConfirmed?: { difficulty?, scenarios?, keywords?, confirmedAt?, model?, notes? },  // /corpus-confirm 写回

  cefr?: string,
  source: string,                      // 'tatoeba' / 'ai-generated:<model>:<date>'
}
```

**读取规则**：永远用 `effectiveCorpus(c)`，返回 `{difficulty, scenarios, keywords}`，优先级 `aiConfirmed > estimated`。

### 3.4 ScheduleEntrySchema（FSRS）

`ts-fsrs` 包装。`state` 枚举：`0=New / 1=Learning / 2=Review / 3=Relearning`。`due` 是下次该出现的 ISO 时间。`reviewPick` workflow 按 `due <= now` 取候选。

### 3.5 SessionSchema

每次学习是一个 Session（mode='new' 或 'review'）。结束时 append 到 `data/sessions/<date>.jsonl`。中途未结束的会话会 dump 到 `data/drafts/<id>.json`（含 `queueIds / cursor` 用于 resume）。

### 3.6 MistakeSchema

翻译题打分 ≤1 时自动追加。`resolved` 表示后续是否被连续答对覆盖（用于"错题本"功能）。

### 3.7 fingerprint

`fingerprintOf(item) = type + '|' + normalize(prompt) + '|' + normalize(answer)`，normalize 把英文小写、去掉非英数中字符。用于跨 session 去重，避免 AI 反复生成同样的题。

---

## 4. 数据处理流水线（Tatoeba 这条最复杂）

```
data/raw/cmn_sentences.tsv.bz2 ─┐
data/raw/eng_sentences.tsv.bz2 ─┼─→ bunzip2 → tsv
data/raw/cmn-eng_links.tsv.bz2 ─┘
                                       │
                                       ▼
                            loadSentences / loadLinks
                                       │
                                       ▼
                       对 cmn → t2s (opencc-js, 'tw'→'cn')
                                       │
                                       ▼
                       qualityCn (5-40 字) / qualityEn (5-25 词)
                                       │
                                       ▼
                       dedup (en.toLowerCase normalized)
                                       │
                                       ▼
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
       classifyScenarios       estimateDifficulty         extractKeywords
       (关键词字面匹配)        (dict 上四分位 + 句长)      (≥4 字符 + 难度≥2)
              │                        │                        │
              └────────────┐  ┌────────┘                        │
                           ▼  ▼                                 │
                    estimated 子对象 ◄───────────────────────────┘
                           │
                           ▼
                    CorpusEntrySchema.parse → appendCorpus()
                                                    │
                                                    ▼
                              按 estimated.difficulty 分片到 data/corpus/d{N}.jsonl
                                                    │
                                                    ▼
                              （后续）/corpus-confirm 让 AI 复核 → 写 aiConfirmed
```

每 5000 条 flush 一次，全量约 48k。

---

## 5. 注意事项 / 不要做的事

### 5.1 数据/schema 改动

- **场景字段是宽松字符串**：不要把它改回 `z.enum(SCENARIOS)`；新场景可以先进入数据，常用后再沉淀到 `SCENARIO_INFO`/`SCENARIO_KEYWORDS`。
- **删字段**：Dict/Corpus 的 `estimated / aiConfirmed` 是核心结构，**不要删**；老数据兼容靠 schema 的 optional/passthrough。
- **加字段**：默认值要在 schema 上用 `.default(...)` 给出，不然老数据 parse 失败。

### 5.2 ingest 脚本

- 全部是 **append-only** + 自带 dedup，多次跑不会爆库。
- ECDICT/Tatoeba 体量大，跑全量约 10-30 秒（看磁盘）。
- 跑前确认 `data/raw/` 下源文件齐全，缺一个就退出。
- `ingest-tatoeba` 会用 `bunzip2`，Windows 上要装 git-bash 或 WSL。

### 5.3 git diff 友好

- JSON 文件用字典序 stringify（`store.ts/stableStringify`），diff 不会乱跳。
- JSONL 文件 append 即可，行内顺序不重要。
- `data/dict/` 和 `data/corpus/` **进 git 跟踪**（按 difficulty 分片后单文件最大约 6MB，可接受）。`data/raw/` 仍 gitignore（原始 bz2/csv 太大）。
- `data/drafts/` 也 gitignore（运行时临时草稿）。

### 5.4 前端样式

- 写样式时优先按移动端宽度检查，不要假设桌面宽度；控件必须能在窄屏容器内收缩。
- 避免固定宽度和会撑开布局的长内容；自定义 `range`、tab、按钮组等控件要确认端点、thumb、间距不会溢出屏幕。

### 5.5 与 LLM 协作

- 出题 / 评分 / 讲解 三类 agent 各用一个模型 id（generator/grader/coach）。**不要**让 generator 兼任评分（一致性偏差），也不要让 coach 出题（速度优先，质量退化）。
- 所有 LLM 输出走 `structuredOutput: { schema }`，schema 失败直接抛，**不要静默 fallback**，否则脏数据会进库。
- 改 prompt 务必加示例。LLM 对抽象规则的执行率远低于"给 Good / Bad 案例"。

### 5.6 三个 skill（/ingest-corpus / /corpus-confirm / /dict-confirm）

- 不要把它们"升级"成内部 agent。存在的全部意义就是**不绑模型**，可在不同 AI agent 平台复用。
- 不要让它们跑全量。corpus-confirm / dict-confirm 每次 30-50 条；ingest-corpus 一次 30-60 条。给宿主 AI 推理空间。
- 已 `aiConfirmed` 的不会再出现在 pending；要强制重判必须手动从对应分片 jsonl 删 `aiConfirmed` 字段（dict 按 lemma，corpus 按 id）。
- dict-confirm / corpus-confirm 写回时会按 aiConfirmed 后的 effective difficulty 自动迁移分片；如果手工改 JSONL，记得保持条目所在 `d{N}.jsonl` 与 effective difficulty 一致。

### 5.7 端口冲突

`PORT=5174`（server）/ `5173`（vite）。如果上次进程没退干净：

```bash
pnpm kill   # 清两个端口
```

---

## 6. 调试 / 排查

- `pnpm typecheck` 是第一道防线。改 schema 后必跑。
- `curl http://localhost:5174/api/health` 看 server 是否起来。
- `curl http://localhost:5174/api/config/scenarios` 验证场景列表。
- 学习时直接看 `data/items.jsonl` 末尾几行就知道这次出了什么题。
- AI 出题失败一般是 schema validation 抛栈 → 看终端 stderr，把 zod 报错粘给 LLM 让它修 prompt。
- `data/drafts/<id>.json` 是中断会话的草稿；resume 走 `Learn.tsx` → server。如果 draft 卡住，直接删那个文件即可重开。

---

## 7. TODO / 未完成

- `web/src/api.ts` 的 `pendingNext` 用模块级变量做暂存，并发不安全。低优先级。
- 评分映射目前只有 0/2（错/对），未提供 hard/easy。简单可用，暂不改。
- 没有"批量重判 aiConfirmed"的工具 —— 如果某次复核的模型很弱，想全部推翻，目前只能手动 jq + 写回。
