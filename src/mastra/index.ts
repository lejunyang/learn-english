// Mastra 实例聚合 —— agents/tools/workflows 在各自模块定义，这里只做总装。
// 单独运行的 server 也可以直接 import 各 agent，不走 Mastra 容器。
import { Mastra } from '@mastra/core';
// 占位：随后 import agents & workflows 在 #5/#6 任务中接入
// import { contentGenerator } from './agents/contentGenerator.js';
// import { translationGrader } from './agents/translationGrader.js';
// import { learningCoach } from './agents/learningCoach.js';

export const mastra = new Mastra({
  // agents: { contentGenerator, translationGrader, learningCoach },
  // workflows: { ... }
});
