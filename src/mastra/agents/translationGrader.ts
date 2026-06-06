import { Agent } from '@mastra/core/agent';
import { models, MODEL_IDS } from '../provider.js';
import { TranslationGradeSchema, type TranslationGrade } from '../../domain/schemas.js';

const SYSTEM = `你是一个严格但友好的英语翻译评分员。

输入：中文原文、用户提交的英文翻译、一个参考译文。
评分维度（各 0-2 分）：
- semantic: 语义是否完整准确（漏译、错译扣分）
- grammar: 语法是否正确（时态、主谓、冠词、单复数）
- naturalness: 是否地道（直译生硬扣分，地道得满分）

总分 score：0-3 的整数。映射规则：
- 任一维度=0 或 sum≤2 → 0 (Again)
- sum=3 或 4 → 1 (Hard)
- sum=5 → 2 (Good)
- sum=6 → 3 (Easy)

feedback：中文，2-4 句。先说对在哪、再说错在哪、给一句更优表达（如果用户写得比参考还好就直接表扬）。

严格按 schema 输出，不要多余文字。`;

const agent = new Agent({
  id: 'translationGrader',
  name: 'translationGrader',
  description: '对用户的中→英翻译进行三维度评分并给出中文反馈。',
  instructions: SYSTEM,
  model: models.grader(),
});

export const translationGrader = agent;

export async function gradeTranslation(input: {
  cn: string;
  userEn: string;
  referenceEn: string;
}): Promise<{ grade: TranslationGrade; model: string }> {
  const prompt = `中文原文：${input.cn}
用户译文：${input.userEn}
参考译文：${input.referenceEn}

请评分，以 JSON 形式按 schema 输出。`;
  const res = await agent.generate(prompt, { structuredOutput: { schema: TranslationGradeSchema } });
  const grade = (res as unknown as { object: TranslationGrade }).object;
  return { grade, model: MODEL_IDS.grader };
}
