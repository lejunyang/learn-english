---
name: record-items
description: 记录用户的单词/句子，写入 dict/corpus，同时标记为“今天已学习”（添加到 items/schedule/index，未来复习时可抽到）。由当前宿主 AI 自己分类、补全，不调任何后端 agent。
---

# record-items —— 记录用户的单词/句子

## 何时使用

当用户说：
- "帮我记录这个单词：..."
- "把这些句子加到我的学习库：..."
- "这些是我今天学的，帮我记下来：..."
- "把这些内容加到复习池：..."

## 调用方式

```
record-items
```

无参数，直接由宿主 AI 解析用户输入、补全信息后调用 `write`。

## 场景推荐

读取 `src/domain/tags.ts` 查看推荐场景列表与场景说明。推荐场景包括：

- 工作、学习、计算机科学与 AI、日常交流、日常生活
- 文化艺术、游戏、旅行、美食、音乐、日用品

优先使用推荐场景 id；如果用户内容明显属于未覆盖的新场景，也可以直接使用新的 kebab-case 场景 id。

## 执行步骤

### 1. 理解用户输入

解析用户给的单词/句子，区分哪些是 dict（单词/短语）、哪些是 corpus（句子）。

输入可能有以下形式：
- 纯英文单词
- 纯英文句子
- 中英文对照
- 多个单词/句子列表

### 2. 补全信息

对每个条目补全以下信息：

**dictEntry (单词/短语)：**
| 字段 | 必填/可选 | 说明 |
| --- | --- | --- |
| `lemma` | 必填 | 英文单词/短语（≤3 词） |
| `ipa` | 必填 | 国际音标，如 `/ˈhæpi/` |
| `pos` | 必填 | 词性，如 `n. / v. / adj.` |
| `difficulty` | 必填 | 1..10 |
| `cn` | 必填 | 中文释义数组，如 `["快乐"]` |
| `definition` | 可选 | 英文简洁释义 |
| `examples` | 可选 | 例句数组，每个例句 `{ en, cn? }` |
| `scenarios` | 可选 | 场景数组，如 `["daily"]` |

**corpusEntry (句子)：**
| 字段 | 必填/可选 | 说明 |
| --- | --- | --- |
| `en` | 必填 | 英文句子 |
| `cn` | 必填 | 中文翻译 |
| `keywords` | 可选 | 1-3 个可挖空的关键词（句中字面出现） |
| `scenarios` | 可选 | 场景数组 |
| `difficulty` | 必填 | 1..10 |

**补充建议：**
- 场景：根据内容判断，也可以省略（脚本会自动分类）
- 难度：1=入门/常用，10=罕见/学术
- 例句：尽量自然，贴近真实对话场景

### 3. 写入数据

先生成 JSON 文件，然后调用脚本：

```bash
pnpm exec tsx .claude/skills/record-items/record-items.ts write --input /tmp/record-results.json
```

### 4. 结果说明

脚本会自动：
- 去重：dict 按 lemma 小写；corpus 按 en 归一化指纹
- 校验：zod 严格校验格式
- 写入：dict/corpus 按 difficulty 分片写入
- 标记已学习：生成 Item/Schedule/Index，due = now

输出 JSON 摘要：
```json
{
  "dictWritten": 3,
  "dictDuplicates": 0,
  "corpusWritten": 2,
  "corpusDuplicates": 0,
  "itemsCreated": 10
}
```

## write 输入格式

```json
{
  "model": "claude-opus-4-7",
  "scenario": "daily",
  "dictEntries": [
    {
      "lemma": "perseverance",
      "ipa": "/ˌpɜːrsəˈvɪərəns/",
      "pos": "n.",
      "difficulty": 6,
      "cn": ["毅力", "坚持不懈"],
      "definition": "steadfastness in doing something despite difficulty or delay",
      "scenarios": ["study"],
      "examples": [
        {
          "en": "Success requires perseverance.",
          "cn": "成功需要毅力。"
        }
      ]
    }
  ],
  "corpusEntries": [
    {
      "en": "It takes perseverance to learn a language well.",
      "cn": "学好一门语言需要毅力。",
      "scenarios": ["study"],
      "difficulty": 4,
      "keywords": ["perseverance", "language"]
    }
  ]
}
```
