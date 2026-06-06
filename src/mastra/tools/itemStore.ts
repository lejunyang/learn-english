import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ulid } from 'ulid';
import {
  readAllItems,
  appendItems,
  updateItem,
  fingerprintOf,
  rebuildIndex,
} from '../../domain/store.js';
import {
  ItemSchema,
  GeneratedItemSchema,
  type Item,
  type Scenario,
  SCENARIOS,
  ITEM_TYPES,
} from '../../domain/schemas.js';

// ============================================================
// search —— 按场景/标签/关键字筛
// ============================================================
export const searchItemsTool = createTool({
  id: 'itemStore.search',
  description: '搜索本地学习项。可按场景、语言学标签、题型或关键字过滤。',
  inputSchema: z.object({
    scenario: z.enum(SCENARIOS).optional(),
    type: z.enum(ITEM_TYPES).optional(),
    tags: z.array(z.string()).optional(),
    query: z.string().optional(),
    limit: z.number().int().positive().max(500).default(50),
  }),
  outputSchema: z.object({
    items: z.array(ItemSchema),
    total: z.number().int().nonnegative(),
  }),
  execute: async ({ context }) => {
    const all = await readAllItems();
    const q = context.query?.toLowerCase();
    const filtered = all.filter((it) => {
      if (context.scenario && it.scenario !== context.scenario) return false;
      if (context.type && it.type !== context.type) return false;
      if (context.tags && !context.tags.every((t) => it.langTags.includes(t))) return false;
      if (q) {
        const hay = [it.prompt.en, it.prompt.cn, it.prompt.cloze, it.answer.en, it.answer.cn]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return { items: filtered.slice(0, context.limit), total: filtered.length };
  },
});

// ============================================================
// create —— 批量插入（外层走 dedup 后再调）
// ============================================================
export const createItemsTool = createTool({
  id: 'itemStore.create',
  description: '将生成的学习项批量写入本地。调用方应先用 dedup 过滤后再调本工具。',
  inputSchema: z.object({
    sessionId: z.string(),
    model: z.string(),
    items: z.array(GeneratedItemSchema),
  }),
  outputSchema: z.object({
    created: z.array(ItemSchema),
  }),
  execute: async ({ context }) => {
    const now = new Date().toISOString();
    const full: Item[] = context.items.map((g) =>
      ItemSchema.parse({
        ...g,
        id: ulid(),
        related: [],
        source: { sessionId: context.sessionId, createdAt: now, model: context.model },
        stats: { attempts: 0, correct: 0 },
      }),
    );
    await appendItems(full);
    return { created: full };
  },
});

// ============================================================
// update
// ============================================================
export const updateItemTool = createTool({
  id: 'itemStore.update',
  description: '更新某条学习项（合并 patch）。',
  inputSchema: z.object({
    id: z.string(),
    patch: z.record(z.string(), z.unknown()),
  }),
  outputSchema: z.object({
    item: ItemSchema.nullable(),
  }),
  execute: async ({ context }) => {
    const item = await updateItem(context.id, context.patch as Partial<Item>);
    return { item };
  },
});

// ============================================================
// rebuildIndex
// ============================================================
export const rebuildIndexTool = createTool({
  id: 'itemStore.rebuildIndex',
  description: '从 items + schedule 重建派生索引。',
  inputSchema: z.object({}),
  outputSchema: z.object({ count: z.number().int().nonnegative() }),
  execute: async () => {
    const map = await rebuildIndex();
    return { count: Object.keys(map).length };
  },
});

// 导出指纹工具，给 workflow 直接使用（非 Mastra tool）
export { fingerprintOf };
