---
description: 为指定学习场景批量生成 dict 词典 + corpus 句子语料，写入 data/dict.jsonl 和 data/corpus.jsonl
---

# 补充语料 (ingest-corpus)

用户用法：
```
/ingest-corpus <scenario> [count] [model]
```

- `scenario` 必填，必须是已支持的场景 id（如 `devops` / `coding` / `dining` 等）。完整列表见 `src/domain/schemas.ts` 的 `SCENARIOS`，或运行 `curl http://localhost:5174/api/config/scenarios`。
- `count` 可选，默认 30（30 条 = 18 dict + 12 corpus）。建议 30-100 之间，太多 LLM 容易截断。
- `model` 可选，默认用 `.env` 里的 `MODEL_GENERATOR`。

## 执行步骤

1. **解析用户输入**：从用户消息中提取 scenario / count / model。如果用户没说 scenario，反问让用户从列表选。
2. **跑脚本**：
   ```bash
   pnpm ingest:scenario <scenario> <count> [model]
   ```
3. **报告结果**：脚本会打印 `dict written: N (dup: M)` 和 `corpus written: N (dup: M)`，把这两行回显给用户。
4. 如果写入数远低于请求数（例如 dup 太多），建议用户：
   - 换个 model 试试
   - 或减小 count
   - 或换个 scenario

## 注意

- 这个 skill 会消耗 API token（一次调用大约几 K-几十 K tokens）。
- 写入的数据带 `source: ai-generated:<model>:<date>`，方便日后审计/清理。
- 不要在 dict/corpus 已经很大（>10000 条）的场景反复跑，效益递减。
