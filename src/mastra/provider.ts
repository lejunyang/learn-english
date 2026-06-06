import 'dotenv/config';
import { createAnthropic } from '@ai-sdk/anthropic';

// ============================================================
// 从环境变量构造 Anthropic provider —— base URL/token 均可配
// ============================================================
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  // 不立刻抛错，允许 typecheck / lint 在没有 key 的环境跑；
  // 真正调用模型时再失败。
  // eslint-disable-next-line no-console
  console.warn('[mastra] ANTHROPIC_API_KEY not set — model calls will fail.');
}

const baseURL = process.env.ANTHROPIC_BASE_URL || undefined;

export const anthropic = createAnthropic({
  apiKey: apiKey ?? 'missing',
  ...(baseURL ? { baseURL } : {}),
});

// 模型 id（可被环境变量覆盖）
export const MODEL_IDS = {
  generator: process.env.MODEL_GENERATOR || 'claude-sonnet-4-6',
  grader: process.env.MODEL_GRADER || 'claude-haiku-4-5-20251001',
  coach: process.env.MODEL_COACH || 'claude-haiku-4-5-20251001',
} as const;

export const models = {
  generator: () => anthropic(MODEL_IDS.generator),
  grader: () => anthropic(MODEL_IDS.grader),
  coach: () => anthropic(MODEL_IDS.coach),
};
