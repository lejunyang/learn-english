---
name: dict-confirm
description: 对 data/dict/ 中尚未经 AI 审核的词条（来源 ECDICT，启发式估算了 difficulty 和 scenarios）做语义复核，重新评估难度与场景、生成示例例句，结果写入 lemma 级 aiConfirmed 字段。由当前宿主 AI 自己判定，不调任何后端 agent，可在 Claude Code / Trae / Cursor 等环境复用。
---

# dict-confirm —— 通用 dict 复核 skill

## 背景：dict 是什么、为什么需要复核

本项目（learn-english）做的是一个本地英语学习应用。`data/dict/d{1..10}.jsonl` 是词典数据，按 difficulty 分片存储；每条 dict 记录 = 一个 lemma 单词/短语 + IPA 音标 + 中文释义（多 sense） + 难度 + 所属场景。用于出 `en2cn / cn2en` 题。

```jsonc
{
  "lemma": "transfer",
  "ipa": { "any": "/trænsˈfɜːr/" },
  "pos": ["v.", "n."],
  "tags": ["cet4", "ielts"],            // ECDICT 自带标签
  "frq": 1234,                          // COCA 频率排名
  "senses": [
    { "pos": "v.", "cn": ["转移","调动"], "scenarios": ["transport"] },
    { "pos": "n.", "cn": ["转账"],         "scenarios": ["data"] }
  ],
  "estimated": { "difficulty": 5, "scenarios": ["transport","data"] },
  "aiConfirmed": { ... }                // 本 skill 写回的 AI 复核结果
}
```

dict 主要来源：

1. **ECDICT**（`pnpm ingest:ecdict`）—— ~38 万条条目，自带 zk/gk/cet4/cet6/ky/toefl/ielts/gre 标签 + COCA 频率。难度按 tag 表 + frq 阈值估算，scenarios 用 `SCENARIO_KEYWORDS` 字面匹配每个 sense 的中文释义。这些都写到 `estimated`。**没有 frq 也没有 tag 的词条被丢弃**，因为没有判定信号。
2. **`/ingest-corpus` skill** —— AI 为特定场景生成的，直接写 `aiConfirmed`，不需要本 skill 复核。

**ECDICT 启发式的问题**：
- difficulty 完全依赖 ECDICT 标签或 COCA 频率，对一些多义词（核心义简单、引申义罕用）粒度太粗；
- scenarios 靠字面词匹配，漏判很多（`"deploy"` 中文里写"部署、调遣"，关键词表里没有"调遣"就只命中 devops、漏掉 system-design）；
- examples 大部分为空，偶有杂乱的例句但无中文，格式不统一。

**本 skill 的作用**：让懂语义的 AI（当前宿主）逐条复核，把准确的 `{difficulty, scenarios, examples}` 写到 lemma 级 `aiConfirmed`。读取端通过 `effectiveDict()` 优先取 `aiConfirmed`。

## 与其它 skill 的区别

| skill | 干什么 | 数据来源 |
| --- | --- | --- |
| `/ingest-corpus` | **无中生有**：AI 为某场景生成新的 dict + corpus | 完全 AI 生成 |
| `/corpus-confirm` | 复核 **corpus**（句子）的 difficulty/scenarios/keywords | Tatoeba 启发式条目 |
| `/dict-confirm`（本 skill） | 复核 **dict**（词条）的 difficulty/scenarios/examples | ECDICT 启发式条目 |

三者都遵循同一原则：**不在脚本内 spawn agent**，判定完全交给当前宿主 AI。脚本只做 I/O。

## 调用方式

```
/dict-confirm [count] [--dir <dict-dir>]
```

- `count` 可选，本轮最多复核多少条，默认 30。建议 20-50。
- `--dir` 可选，默认 `data/dict`。

## 复核粒度：lemma 级

AI 一次看到一个 lemma + 它**全部 senses 的中文释义合并**，给出整个 lemma 层面的 `{difficulty, scenarios, examples}`：

- **difficulty** 取这个 lemma "最常用义" 的难度（核心义简单 → 整体也算简单；罕用引申义不要把整词拉高）
- **scenarios** 是所有 sense 场景的并集（要去重）
- **examples** 是 2-3 条该 lemma 在真实场景中的用法例句（最好是不同 sense 各展示一次）

## 字段语义

每条结果对象：

```json
{
  "lemma": "transfer",
  "difficulty": 4,
  "scenarios": ["transport", "data"],
  "examples": [
    [{"en": "You need to transfer at Central Station.", "cn": "你需要在中央车站换乘。"}],
    [{"en": "I'll make a bank transfer.", "cn": "我要做一笔银行转账。"}]
  ],
  "model": "claude-opus-4-7"
}
```

必填字段：
- `lemma`: 必须，从 pending 输出原样回填
- `difficulty`: 1..10 整数
- `scenarios`: 受控词表；空数组表示不属于任何已知场景
- `examples`: 二维数组，`examples[i]` 对应 `senses[i]` 的例句。每条 `{en, cn?}`。可以不填所有 sense，只填你想补的

可选字段：
- `model`: 当前宿主模型名，便于审计
- `notes`: 1 句话以内说明

## examples 质量守则

- 例句必须是该 lemma 的真实用法，**不能是套模板**（如总是 "I need to ..."）
- 尽量覆盖不同词性 / 不同义项（`transfer` 可以是动词"转接"、名词"转账"）
- 例句场景要与你填的 `scenarios` 匹配（transport 场景的例句用交通上下文）
- 中文翻译贴切自然，不直译
- 当前 ECDICT 数据里 senses 的 examples 全部是空数组，所以不需要担心复读问题
- 如果这个 lemma 很难造句（比如罕见术语 `mitochondrial`），降低要求，1 条也行

## examples 的用途

教材例句会回填到对应 `senses[i].examples`。在出题系统中，被用作：
- 用户点击"查看例句"时展示的内容（含发音）
- 出 `cloze` 或 `en2cn` 题时的辅助语境

所以例句质量直接决定出题质量。

## 场景词表

**唯一权威**是 `src/domain/tags.ts` 里的 `SCENARIO_KEYWORDS / SCENARIO_INFO`。当前可用：

- 工作: `biz-email, meeting, interview, negotiation, slack`
- 技术: `coding, ai-ml, devops, data, system-design`
- 生活: `shopping, dining, doctor, rent, transport`
- 文化: `movies, idioms, festivals, memes`
- 学术: `paper-writing, academic-talk, reading`
- 旅行: `airport-hotel, directions, complaints`

> 绝不要用 `workplace / computing / ai / travel / daily / food`（历史兼容值）。

不确定场景边界时直接 `Read src/domain/tags.ts`。

## 重要：分片自动迁移

如果 AI 判定的 `difficulty` 与当前条目所处的分片**不一致**，脚本会自动做两件事：

1. **从旧分片删除**该条目（原子写回旧分片，不含此条）
2. **追加到新分片**（`d{N}.jsonl`，按新 difficulty）

之后 `write` 的输出会包含 `moved` 字段：

```json
{"patched": 30, "moved": 8, "unknown": 0}
```

`moved=8` 表示有 8 条被跨分片迁移。这是预期行为 —— 被迁到更高/更低分级是复核的重要产出。

如果旧分片里没有留下任何条目（全部迁走了），该分片文件不会被删除（会变成空文件 `d{N}.jsonl`，空行）。这是无害的。

## 执行步骤（本仓库）

> 脚本就在本 skill 目录下（`.claude/skills/dict-confirm/dict-confirm.ts`）。

1. **取一批待办**：
   ```bash
   pnpm exec tsx .claude/skills/dict-confirm/dict-confirm.ts pending --limit <count> > /tmp/dict-pending.json
   ```
   输出形如：
   ```json
   [
     {
       "lemma": "transfer",
       "ipa": "/trænsˈfɜːr/",
       "pos": ["v.","n."],
       "tags": ["cet4","ielts"],
       "sensesCn": ["[v.] 转移; 调动", "[n.] 转账"],
       "estimated": { "difficulty": 5, "scenarios": ["transport","data"] }
     }
   ]
   ```

2. **逐条判定**：对每条 `{lemma, sensesCn, estimated}` 重新评估难度、场景、并给出例句。
   sensesCn 的顺序对应 senses[i]，你的 examples 也要按此顺序写回。写到 `/tmp/dict-results.json`：

   ```json
   [{
     "lemma": "transfer",
     "difficulty": 4,
     "scenarios": ["transport", "data"],
     "examples": [
       [{"en": "You need to transfer at Central Station.", "cn": "你需要在中央车站换乘。"}],
       [{"en": "I'll make a bank transfer.", "cn": "我要做一笔银行转账。"}]
     ],
     "model": "claude-opus-4-7"
   }]
   ```

   `examples` 是二维数组：`examples[0]`（对应 sense[0] `[v.] 转移`）和 `examples[1]`（对应 sense[1] `[n.] 转账`）。如果你只给了一个 sense 写例句、另一个不写，把另一个的数组留空即可。

3. **回写**：
   ```bash
   pnpm exec tsx .claude/skills/dict-confirm/dict-confirm.ts write --input /tmp/dict-results.json
   ```
   遍历 d1.jsonl..d10.jsonl 按 lemma 定位，分片级原子写。若 difficulty 变动则自动迁移分片。
   stdout 打印 `{"patched": N, "moved": M, "unknown": U}`。

4. **看进度**：
   ```bash
   pnpm exec tsx .claude/skills/dict-confirm/dict-confirm.ts stats
   # { total, confirmed, pending, untouched }
   ```

## 跨产品适配

本 skill 只依赖两个原子能力：
- "给我下一批 pending 的 dict 条目" → `dict-confirm pending`
- "把我判定好的结果写回去" → `dict-confirm write`

整个 skill 目录是自包含的：复制 `.claude/skills/dict-confirm/` 到任何 Node 项目，安装 tsx（或用 `npx tsx`、或先 tsc 编一下）即可。脚本只依赖 Node 标准库。

## 质量守则

- 不要把 estimated 的值原封不动复读。estimated 是启发式，错率高，复核存在意义就是修。
- difficulty 要拉开梯度。一批里大半都标 5 多半是偷懒。
- 对于词组 / 短语 lemma（`take off / get along / make sense`），别按字面词难度算；按"该短语整体常用度"算。
- **examples 不能简单复读已有的 ECDICT 例句**；判断好就保留，不好就换。
- scenarios 给少不给错。3-5 个真贴的比 8 个泛贴的有用。
- 罕见专业词（`mitochondrial`、`heuristic`）：difficulty 9-10 没问题，但 scenarios 要给出**主用场景**（`reading` / `ai-ml` 等），别空着。

## 注意

- 单条 dict 大约 50-200 tokens（比 corpus 短）。一次 30 条 = 大约 1.5K-6K tokens。
- 写回是分片级原子的（先写 `.tmp` 再 rename），中断不会损坏文件。
- 已 `aiConfirmed` 过的不会再出现在 pending 列表；强制重判需手动从 jsonl 删除该词条的 `aiConfirmed` 字段。