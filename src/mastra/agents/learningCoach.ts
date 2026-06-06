import { Agent } from '@mastra/core/agent';
import { models } from '../provider.js';
import type { Item } from '../../domain/schemas.js';

const SYSTEM = `你是英语学习教练。用户刚答错一道题，请用中文给出 3-5 句简短解释：
1. 用户错在哪（如果有用户答案）。
2. 为什么正确答案是这个 —— 给出关键的语义/搭配/语法点。
3. 给一句类似用法的例句。
风格自然、不啰嗦，不要 markdown 列表，写成流畅段落。`;

export const learningCoach = new Agent({
  name: 'learningCoach',
  description: '答错时给出简短中文讲解（流式）。',
  instructions: SYSTEM,
  model: models.coach(),
});

export interface CoachInput {
  item: Item;
  userAnswer?: string;
}

export function buildCoachPrompt(input: CoachInput): string {
  const it = input.item;
  const promptText =
    it.prompt.en ?? it.prompt.cn ?? it.prompt.cloze ?? '(unknown)';
  const answerText = it.answer.en ?? it.answer.cn ?? '(unknown)';
  return `题型：${it.type}
题面：${promptText}
正确答案：${answerText}
用户答案：${input.userAnswer ?? '(未作答)'}

请用中文解释。`;
}

export async function streamCoachExplanation(input: CoachInput) {
  return await learningCoach.stream(buildCoachPrompt(input));
}
