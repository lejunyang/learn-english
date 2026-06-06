import { atom } from 'jotai';
import type { Item, TranslationGrade } from '../api';

// ============================================================
// 单题维度的本地状态（切题时复位）
// ============================================================
export type Phase = 'answering' | 'feedback';
export type HintLevel = 'weak' | 'strong';

export const sessionIdAtom = atom<string>('');
export const currentItemAtom = atom<Item | null>(null);
export const indexAtom = atom<number>(0);
export const totalAtom = atom<number>(0);

export const phaseAtom = atom<Phase>('answering');
export const userAnswerAtom = atom<string>('');
export const pickedAtom = atom<string | null>(null);
export const showOptionsAtom = atom<boolean>(false);
export const hintsShownAtom = atom<Array<{ level: HintLevel; text: string }>>([]);
export const gradeAtom = atom<TranslationGrade | null>(null);
export const coachAtom = atom<string>('');
export const submittingAtom = atom<boolean>(false);
export const pendingNextAtom = atom<Item | null>(null);

// 切题动作 —— 复位所有单题状态
export const resetItemStateAtom = atom(null, (_get, set) => {
  set(phaseAtom, 'answering');
  set(userAnswerAtom, '');
  set(pickedAtom, null);
  set(showOptionsAtom, false);
  set(hintsShownAtom, []);
  set(gradeAtom, null);
  set(coachAtom, '');
});

// ============================================================
// 会话整体（页面级）
// ============================================================
export const sessionDoneAtom = atom<boolean>(false);
export const summaryAtom = atom<{ total: number; correct: number; accuracy: number } | null>(
  null,
);
