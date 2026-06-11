import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { models, modelById, MODEL_IDS } from '../provider.js';
import { GeneratedItemSchema, type Scenario, type GeneratedItem } from '../../domain/schemas.js';
import { scenarioLabel, SUGGESTED_LANG_TAGS } from '../../domain/tags.js';

// ============================================================
// 系统提示词 —— 把质量约束写死
// ============================================================
const SYSTEM = `你是一个英语学习题目生成助手。

**输出契约**：必须严格遵循结构化输出 schema，不得输出额外文本。

**题型规则**：
- en2cn: 给英文（单词/短语/句子）问中文。prompt.en 必填，answer.cn 必填，distractors 必填(3个中文)。
- cn2en: 给中文问英文。prompt.cn 必填，answer.en 必填，distractors 必填(3个英文)。
- translate: 给中文句子，用户手动输入英文翻译。prompt.cn 必填，answer.en 给出参考译文。无 distractors。
- cloze: 完形填空。prompt.cloze 是含 ___ 的英文句子，answer.en 是填入的词/短语，distractors 3 个同词性候选。

**质量约束**：
1. hints.weak = 弱提示（类别/词性/首字母/中文释义大类）；hints.strong = 强提示（接近答案但不直给）。
2. 单词或短语题（answer.en 为 ≤3 个英文 token）必须填写 phonetics.ipa（IPA 国际音标，含 / /）；句子题留空。
3. 每题打 langTags（自由词表，建议参考：${SUGGESTED_LANG_TAGS.join(', ')}）。
4. difficulty: 1=基础常用, 5=中等, 10=罕见/复杂。按场景受众估计（10 级粒度，1 最简单，10 最难）。
5. 不要重复已有指纹列出的题目（同 prompt+answer 视为重复）。

**distractors（迷惑选项）质量铁律 —— 极其重要**：

✅ 合格的干扰项必须满足全部条件：
- 在语法形态上与正确答案一致（动词配动词、名词配名词、形容词配形容词、过去式配过去式）
- 长度与正确答案接近（差距 ≤50%）
- 在该语境下**确定是错的**，意思与正确答案**明显不同**
- 是该领域用户可能听过、不算太冷门的词

❌ 绝对禁止：
- 同义词或近义词（"happy" vs "joyful" → 用户会困惑哪个才对）
- 拼写微改（"receive" vs "recieve" → 这是拼写题不是理解题）
- 把正确答案稍作变形（"go" vs "going" vs "goes" 同时出现）
- 几乎都是对的（"please help me" vs "could you help me" vs "can you help me"）

**Good / Bad 示例**

题面: "umbrella" → 正确答案: "雨伞"
- ✅ 好的 distractors: ["雨衣", "拐杖", "帽子"]  ← 都是物品、都是雨天/穿戴相关但意思明确不同
- ❌ 差的 distractors: ["雨具", "遮雨工具", "挡雨的东西"]  ← 都几乎对

题面: "我请客" → 正确答案: "It's on me"
- ✅ 好的 distractors: ["I'm broke", "Let's split it", "Pay your own"]  ← 都是关于结账的表达但意思明确不同
- ❌ 差的 distractors: ["It's my treat", "I'll pay", "I got this"]  ← 全是"我请客"的同义表达

cloze: "I ___ to the gym every morning." → 正确: "go"
- ✅ 好的 distractors: ["eat", "sleep", "drive"]  ← 同为动词原形，但语义明确不通
- ❌ 差的 distractors: ["went", "goes", "going"]  ← 仅时态/形态差别，语法题不是理解题

**风格**：
- en2cn / cn2en 题面要简洁，answer 给出最常用译法。
- translate 题面 cn 长度 8-25 字；参考译文使用地道英文。
- cloze 题面去除目标词后保留完整句子（含标点），仅一个 ___。`;

// 单次返回多条 item 的 schema
const GenerationResultSchema = z.object({
  items: z.array(GeneratedItemSchema).min(1),
});

const agent = new Agent({
  id: 'contentGenerator',
  name: 'contentGenerator',
  description: '为指定场景批量生成英语学习题目（含 IPA、distractors、hints）。',
  instructions: SYSTEM,
  model: models.generator(),
});

export const contentGenerator = agent;

// 直接调用入口 —— 业务层用这个
export async function generateItems(opts: {
  scenario: Scenario;
  count: number;
  existingFingerprints: string[];
  // 题型分布建议（可选）
  typeMix?: Partial<Record<GeneratedItem['type'], number>>;
  // 用户最近常错的表达
  recentMistakes?: Array<{ prompt: string; correctAnswer: string; userAnswer: string; suggestion?: string }>;
  // 临时覆盖模型 id（来自前端 session 选择）
  modelId?: string;
  difficultyMin?: number;
  difficultyMax?: number;
}): Promise<{ items: GeneratedItem[]; model: string }> {
  const mix = opts.typeMix ?? { en2cn: 0.35, cn2en: 0.35, translate: 0.15, cloze: 0.15 };
  const dist = Object.entries(mix)
    .map(([t, p]) => `${t}≈${Math.round(p * opts.count)}`)
    .join(', ');

  const fpHint = opts.existingFingerprints.length
    ? `\n\n已有指纹（避免重复）：\n${opts.existingFingerprints.slice(0, 300).join('\n')}`
    : '';

  const mistakeHint = opts.recentMistakes && opts.recentMistakes.length
    ? `\n\n**用户最近常错的表达（请针对性出一些相关练习，覆盖同样的考点但用不同的题面，帮助用户巩固）**：\n${opts.recentMistakes
        .slice(0, 10)
        .map((m, i) => `${i + 1}. 题面="${m.prompt}" 参考="${m.correctAnswer}" 用户答="${m.userAnswer}"${m.suggestion ? ` 反馈="${m.suggestion}"` : ''}`)
        .join('\n')}`
    : '';

  const difficultyMin = opts.difficultyMin ?? 1;
  const difficultyMax = opts.difficultyMax ?? 10;
  const difficultyHint = difficultyMin !== 1 || difficultyMax !== 10
    ? `\n\n难度范围：只生成 difficulty 在 ${difficultyMin}~${difficultyMax} 之间的题目。`
    : '';

  const prompt = `场景：${scenarioLabel(opts.scenario)}（${opts.scenario}）
请生成 ${opts.count} 条题目。

**JSON 输出契约**：最外层是 \`{ "items": [...] }\`，items 是题目数组，每条题目按 schema 字段填写。**严禁**用 "questions" 或其他键名。

题型分布建议：${dist}。${difficultyHint}${mistakeHint}${fpHint}`;

  const usedModelId = opts.modelId || MODEL_IDS.generator;
  const res = await agent.generate(prompt, {
    structuredOutput: { schema: GenerationResultSchema },
    ...(opts.modelId ? { model: modelById(opts.modelId) } : {}),
  });
  const obj = (res as unknown as { object?: { items: GeneratedItem[] } }).object;
  const items = obj?.items ?? [];
  return { items, model: usedModelId };
}

export { GenerationResultSchema };
