import 'dotenv/config';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// ============================================================
// 多 Provider 支持
// MODEL_PROVIDER = anthropic (默认) | openai-compatible
//
// anthropic:
//   ANTHROPIC_BASE_URL=https://xxx
//   ANTHROPIC_API_KEY=sk-ant-xxx
//
// openai-compatible（火山方舟 / OpenAI / DeepSeek / 通义千问 / Ollama / OpenRouter / vLLM ……）:
//   OPENAI_BASE_URL=https://xxx        (必填)
//   OPENAI_API_KEY=sk-xxx
//
// 默认模型 id：
//   MODEL_GENERATOR / MODEL_GRADER / MODEL_COACH
//
// 允许用户在前端选择的模型 id 列表（逗号分隔）：
//   MODELS_ALLOWED=deepseek-v4-pro,deepseek-v4-flash
// ============================================================

const provider = (process.env.MODEL_PROVIDER || 'anthropic').toLowerCase();

// 单一工厂：把 model id → ai-sdk LanguageModel
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let buildModel: (id: string) => any;

if (provider === 'openai-compatible') {
  const baseURL = process.env.OPENAI_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!baseURL) {
    console.warn('[mastra] OPENAI_BASE_URL not set — openai-compatible calls will fail.');
  }
  const client = createOpenAICompatible({
    baseURL: baseURL ?? 'http://localhost:11434/v1',
    apiKey: apiKey ?? 'sk-missing',
    name: 'openai-compatible',
  });
  buildModel = (id: string) => client(id);
} else {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[mastra] ANTHROPIC_API_KEY not set — model calls will fail.');
  }
  const baseURL = process.env.ANTHROPIC_BASE_URL || undefined;
  const anthropic = createAnthropic({
    apiKey: apiKey ?? 'missing',
    ...(baseURL ? { baseURL } : {}),
  });
  buildModel = (id: string) => anthropic(id);
}

export const MODEL_IDS = {
  generator: process.env.MODEL_GENERATOR || 'claude-sonnet-4-6',
  grader: process.env.MODEL_GRADER || 'claude-haiku-4-5-20251001',
  coach: process.env.MODEL_COACH || 'claude-haiku-4-5-20251001',
} as const;

// 便捷调用：默认 id 的模型工厂
export const models = {
  generator: () => buildModel(MODEL_IDS.generator),
  grader: () => buildModel(MODEL_IDS.grader),
  coach: () => buildModel(MODEL_IDS.coach),
};

// 按任意 id 构造（业务层在请求里临时指定模型时调用）
export function modelById(id: string) {
  return buildModel(id);
}

// 前端可选模型列表 —— 默认就放当前默认 generator/grader 两个
export const ALLOWED_MODELS: string[] = (process.env.MODELS_ALLOWED ?? `${MODEL_IDS.generator},${MODEL_IDS.grader}`)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
