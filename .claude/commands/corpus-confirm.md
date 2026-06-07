---
description: 对 corpus.jsonl 中"有 estimated、无 aiConfirmed"的句子进行 AI 复核，回填 aiConfirmed 字段（不依赖任何特定 LLM agent，由当前对话中的 AI 自己判定）
---

# corpus-confirm —— 通用 corpus 复核 skill

把 `data/corpus.jsonl` 中由本地启发式估出来的 `estimated.{difficulty,scenarios,keywords}` 用 AI 重新复核，结果写入同条目的 `aiConfirmed` 字段。

**与其它 ingest skill 的关键区别**：本 skill 不调用任何后端 agent / 不读 `.env` 模型配置 —— 复核完全由"执行该 skill 的当前 AI（你）"完成。这意味着同样的 skill 可以在 Claude Code、Trae、Cursor 等任何 AI agent 里直接复用，输出质量取决于宿主模型。

## 调用方式

```
/corpus-confirm [count] [--file <path>]
```

- `count` 可选，本轮最多复核多少条，默认 30。建议一次 20-50，多了上下文压力大。
- `--file` 可选，默认 `data/corpus.jsonl`。

## 字段语义（必须严格遵守）

每条结果对象必须包含：

```json
{
  "id": "01HXX...",                // 必须，从 pending 输出原样回填
  "difficulty": 1..10,             // 整数，1=最简单（"I am happy."）, 10=最难（学术/罕用习语）
  "scenarios": ["transport", ...], // 从受控词表中取值（见下方"可选 scenarios 列表"）。空数组表示找不到合适场景，但应尽量给至少 1 个
  "keywords": ["transfer", ...]    // 0-3 个适合做填空/记忆的关键词，必须是句子中实际出现的词或短语（保留原大小写）
}
```

可选字段：
- `model`: 当前宿主模型名（让审计能看到是谁复核的，如 `"claude-opus-4-7"` / `"gpt-5"` / `"trae-default"` 等）
- `notes`: 复核时的简短说明，1 句话以内

## 可选 scenarios 列表

工作: `biz-email, meeting, interview, negotiation, slack`
技术: `coding, ai-ml, devops, data, system-design`
生活: `shopping, dining, doctor, rent, transport`
文化: `movies, idioms, festivals, memes`
学术: `paper-writing, academic-talk, reading`
旅行: `airport-hotel, directions, complaints`

> 不要使用 `workplace / computing / ai / travel / daily / food`（这些是历史兼容值）。

## 执行步骤

1. **取一批待办**（本仓库可直接跑下面命令；其它环境换成等价 I/O 即可）：
   ```bash
   pnpm corpus:confirm pending --limit <count> > /tmp/corpus-pending.json
   ```
   输出是数组 `[{id, en, cn, estimated}, ...]`；stderr 会打印 `pending=N returning=M`。

2. **逐条判定**：读 `/tmp/corpus-pending.json`，对每条 `{en, cn, estimated}`：
   - 重新评估 difficulty（参考词汇罕见度、句法复杂度、长度，不要盲信 estimated）
   - 重新评估 scenarios（关键词法常常漏掉真实语义，比如 `"I'll have the steak medium-rare."` 的真实场景是 `dining`，即使没出现 "menu/order" 字面词）
   - 重新挑 keywords（要适合考核：动词短语、固定搭配、专业名词优先；冠词/代词/be 动词不要）
   - 把判定结果写到一个数组，每条 `{id, difficulty, scenarios, keywords, model?, notes?}`

3. **回写**：
   ```bash
   pnpm corpus:confirm write --input /tmp/corpus-results.json
   ```
   脚本会原子写回 `data/corpus.jsonl`，stdout 打印 `{"patched": N, "unknown": M}`，把数字回显给用户。

4. **再来一轮（可选）**：跑 `pnpm corpus:confirm stats` 查剩余 pending；用户没说停就继续步骤 1。

## 质量守则

- 不要批量"鹦鹉学舌" estimated 的值。estimated 是启发式，本来就常错，复核存在的意义就是修它。
- difficulty 要拉开梯度。如果你给一批里大半都是 5，多半在偷懒。
- 一句话同时属于多个场景（如 `"Let's discuss the budget over lunch."` 同时是 `meeting` + `dining`），可以给多个 scenarios。
- keywords 必须是句子中**字面出现**的词/短语；不要写抽象概念。

## 注意

- 这个 skill 会消耗宿主模型的 token（一条句子约 100-500 tokens）。一次 30 条 = 大约 3K-15K tokens。
- 写回是原子的（先写 `.tmp` 再 rename），中断不会损坏文件。
- 已 `aiConfirmed` 过的条目不会再次出现在 pending 列表里；要重新复核需手动删除该条目的 `aiConfirmed` 字段。
