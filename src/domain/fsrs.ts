import { fsrs, generatorParameters, createEmptyCard, Rating, State, type Card, type Grade } from 'ts-fsrs';
import type { ScheduleEntry } from './schemas.js';

// 0=again(忘记) / 1=hard / 2=good / 3=easy
export type ReviewScore = 0 | 1 | 2 | 3;

const SCORE_TO_RATING: Record<ReviewScore, Grade> = {
  0: Rating.Again as Grade,
  1: Rating.Hard as Grade,
  2: Rating.Good as Grade,
  3: Rating.Easy as Grade,
};

const f = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9 }));

export function newEntry(now: Date = new Date()): ScheduleEntry {
  const card = createEmptyCard(now);
  return cardToEntry(card);
}

export function applyReview(
  entry: ScheduleEntry,
  score: ReviewScore,
  now: Date = new Date(),
): ScheduleEntry {
  const card = entryToCard(entry);
  const result = f.next(card, now, SCORE_TO_RATING[score]);
  return cardToEntry(result.card);
}

function cardToEntry(card: Card): ScheduleEntry {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due.toISOString(),
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.last_review ? card.last_review.toISOString() : undefined,
    state: card.state as number,
  };
}

function entryToCard(entry: ScheduleEntry): Card {
  return {
    due: new Date(entry.due),
    stability: entry.stability,
    difficulty: entry.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: entry.reps,
    lapses: entry.lapses,
    state: entry.state as State,
    last_review: entry.lastReview ? new Date(entry.lastReview) : undefined,
  };
}

// 是否到期
export function isDue(entry: ScheduleEntry, at: Date = new Date()): boolean {
  return new Date(entry.due).getTime() <= at.getTime();
}

// overdue 程度（毫秒），越大越紧迫
export function overdueMs(entry: ScheduleEntry, at: Date = new Date()): number {
  return at.getTime() - new Date(entry.due).getTime();
}
