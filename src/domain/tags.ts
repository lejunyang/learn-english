import { SCENARIOS, type Scenario } from './schemas.js';

export { SCENARIOS };
export type { Scenario };

// 场景中文展示名
export const SCENARIO_LABELS: Record<Scenario, string> = {
  workplace: '职场',
  computing: '计算机',
  ai: 'AI',
  travel: '旅游',
  daily: '日常交流',
  food: '美食',
};

// 语言学标签：自由词表，仅作建议，AI 可扩展
export const SUGGESTED_LANG_TAGS = [
  'idiom', // 俚语
  'phrasal-verb', // 短语动词
  'collocation', // 固定搭配
  'preposition', // 介词用法
  'tense', // 时态
  'word', // 单词
  'phrase', // 短语
  'sentence', // 句子
  'formal',
  'informal',
] as const;
