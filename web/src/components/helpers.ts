import type { Item } from '../api';

export function correctOf(it: Item): string {
  return (
    (it.type === 'en2cn' ? it.answer?.cn :
     it.type === 'cn2en' ? it.answer?.en :
     it.answer?.en) ?? ''
  );
}

export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[.,!?;:'"。，！？；：·’‘"「」『』（）\[\]【】—…\-]/g, '').replace(/\s+/g, ' ');
}

export function shuffleWithSeed<T>(arr: T[], seed: string): T[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    h = (h * 9301 + 49297) & 0xffffffff;
    const j = Math.abs(h) % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}