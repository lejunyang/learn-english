import 'dotenv/config';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// ============================================================
// 多 Provider 支持
// MODEL_PROVIDER = anthropic (默认) | openai-compatible
//
// anthropic:
//   ANTHROPIC_BASE_URL=https://xxx  (可选，默认 https://api.anthropic.com)
//   ANTHROPIC_API_KEY=sk-ant-xxx
//
// openai-compatible（覆盖 OpenAI / DeepSeek / 通义千问 / Ollama / OpenRouter / vLLM ……）:
//   OPENAI_BASE_URL=https://xxx        (必填)
//   OPENAI_API_KEY=sk-xxx               (本地模型可随便填)
//
// 模型 id 由各套 env 统一：
//   MODEL_GENERATOR / MODEL_GRADER / MODEL_COACH
// ============================================================

const provider = (process.env.MODEL_PROVIDER || 'anthropic').toLowerCase();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let buildGenerator: () => any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let buildGrader: () => any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let buildCoach: () => any;

const sharedModelIds = {
  generator: process.env.MODEL_GENERATOR || 'claude-sonnet-4-6',
  grader: process.env.MODEL_GRADER || 'claude-haiku-4-5-20251001',
  coach: process.env.MODEL_COACH || 'claude-haiku-4-5-20251001',
};

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
  buildGenerator = () => client(sharedModelIds.generator);
  buildGrader = () => client(sharedModelIds.grader);
  buildCoach = () => client(sharedModelIds.coach);
} else {
  // 默认 anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[mastra] ANTHROPIC_API_KEY not set — model calls will fail.');
  }
  const baseURL = process.env.ANTHROPIC_BASE_URL || undefined;
  const anthropic = createAnthropic({
    apiKey: apiKey ?? 'missing',
    ...(baseURL ? { baseURL } : {}),
  });
  buildGenerator = () => anthropic(sharedModelIds.generator);
  buildGrader = () => anthropic(sharedModelIds.grader);
  buildCoach = () => anthropic(sharedModelIds.coach);
}

export const models = {
  generator: buildGenerator,
  grader: buildGrader,
  coach: buildCoach,
};

export const MODEL_IDS = sharedModelIds;