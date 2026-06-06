import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { models, MODEL_IDS } from '../provider.js';
import { GeneratedItemSchema, SCENARIOS, type Scenario, type GeneratedItem } from '../../domain/schemas.js';
import { SCENARIO_LABELS, SUGGESTED_LANG_TAGS } from '../../domain/tags.js';

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
1. distractors（迷惑选项）必须与答案同词性、长度接近、属同一语义场；不得包含正确答案。
2. hints.weak = 弱提示（类别/词性/首字母/中文释义大类）；hints.strong = 强提示（接近答案但不直给）。
3. 单词或短语题（answer.en 为 ≤3 个英文 token）必须填写 phonetics.ipa（IPA 国际音标，含 / /）；句子题留空。
4. 每题打 langTags（自由词表，建议参考：${SUGGESTED_LANG_TAGS.join(', ')}）。
5. difficulty: 1=基础常用, 3=中等, 5=罕见/复杂。按场景受众估计。
6. 不要重复已有指纹列出的题目（同 prompt+answer 视为重复）。

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
  // 题型分布建议（可选）：{en2cn: 0.3, cn2en: 0.3, translate: 0.2, cloze: 0.2}
  typeMix?: Partial<Record<GeneratedItem['type'], number>>;
}): Promise<{ items: GeneratedItem[]; model: string }> {
  const mix = opts.typeMix ?? { en2cn: 0.35, cn2en: 0.35, translate: 0.15, cloze: 0.15 };
  const dist = Object.entries(mix)
    .map(([t, p]) => `${t}≈${Math.round(p * opts.count)}`)
    .join(', ');

  const fpHint = opts.existingFingerprints.length
    ? `\n\n已有指纹（避免重复）：\n${opts.existingFingerprints.slice(0, 300).join('\n')}`
    : '';

  const prompt = `场景：${SCENARIO_LABELS[opts.scenario]}（${opts.scenario}）
请生成 ${opts.count} 条题目。

**JSON 输出契约**：最外层是 \`{ "items": [...] }\`，items 是题目数组，每条题目按 schema 字段填写。**严禁**用 "questions" 等其他键名。

题型分布建议：${dist}。${fpHint}`;

  const res = await agent.generate(prompt, {
    structuredOutput: { schema: GenerationResultSchema },
  });
  const obj = (res as unknown as { object?: { items: GeneratedItem[] } }).object;
  const items = obj?.items ?? [];
  return { items, model: MODEL_IDS.generator };
}

export { GenerationResultSchema };
