import { readAllItems, fingerprintOf } from '../../domain/store.js';
import type { GeneratedItem } from '../../domain/schemas.js';

/**
 * 取所有现有 item 的指纹集合，供生成时去重。
 */
export async function existingFingerprints(): Promise<Set<string>> {
  const items = await readAllItems();
  return new Set(items.map((it) => fingerprintOf(it)));
}

/**
 * 过滤掉已存在指纹的生成项。
 */
export function dedupeGenerated(
  generated: GeneratedItem[],
  existing: Set<string>,
): GeneratedItem[] {
  const seenInBatch = new Set<string>();
  const out: GeneratedItem[] = [];
  for (const g of generated) {
    const fp = fingerprintOf(g);
    if (existing.has(fp) || seenInBatch.has(fp)) continue;
    seenInBatch.add(fp);
    out.push(g);
  }
  return out;
}
