import type { CategoryKey, Question } from "./questions.ts";

export const DEFAULT_MOCK_QUESTION_COUNT = 15;

export type MockSeed = number | string;

export type SelectMockQuestionsOptions = Readonly<{
  count?: number;
  seed: MockSeed;
}>;

export type MockResult = Readonly<{
  id: string;
  correct: boolean;
}>;

export type MockResults = readonly boolean[] | readonly MockResult[];

export type MockScore = {
  correct: number;
  total: number;
};

export type MockSummary = {
  overall: MockScore;
  byCategory: Partial<Record<CategoryKey, MockScore>>;
};

type CategoryBucket = {
  questions: Question[];
};

function seedToUint32(seed: MockSeed): number {
  if (typeof seed === "number") {
    return Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
  }

  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** A small seeded LCG. Every call returns a value in the range [0, 1). */
function createRandom(seed: MockSeed): () => number {
  let state = seedToUint32(seed);

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffle<T>(values: T[], random: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

function normalizeCount(count: number | undefined, inventory: number): number {
  const requested = count ?? DEFAULT_MOCK_QUESTION_COUNT;
  if (Number.isNaN(requested) || requested <= 0) return 0;
  if (requested === Number.POSITIVE_INFINITY) return inventory;
  return Math.min(Math.floor(requested), inventory);
}

/**
 * Selects a seeded, category-balanced set of mock-exam questions.
 *
 * Question ids are treated as the identity of a bank item. Duplicate ids in the
 * input are ignored after their first occurrence, and the input array is never
 * mutated.
 */
export function selectMockQuestions(
  bank: readonly Question[],
  options: SelectMockQuestionsOptions,
): Question[] {
  const uniqueQuestions: Question[] = [];
  const seenIds = new Set<string>();

  for (const question of bank) {
    if (seenIds.has(question.id)) continue;
    seenIds.add(question.id);
    uniqueQuestions.push(question);
  }

  const targetCount = normalizeCount(options.count, uniqueQuestions.length);
  if (targetCount === 0) return [];

  const bucketsByCategory = new Map<CategoryKey, CategoryBucket>();
  for (const question of uniqueQuestions) {
    const bucket = bucketsByCategory.get(question.category);
    if (bucket) {
      bucket.questions.push(question);
    } else {
      bucketsByCategory.set(question.category, {
        questions: [question],
      });
    }
  }

  const random = createRandom(options.seed);
  const buckets = [...bucketsByCategory.values()];
  for (const bucket of buckets) shuffle(bucket.questions, random);

  const selected: Question[] = [];
  while (selected.length < targetCount) {
    const activeBuckets = buckets.filter((bucket) => bucket.questions.length > 0);
    shuffle(activeBuckets, random);

    for (const bucket of activeBuckets) {
      const question = bucket.questions.pop();
      if (question) selected.push(question);
      if (selected.length === targetCount) break;
    }
  }

  return selected;
}

function resultsById(results: readonly MockResult[]): Map<string, boolean> {
  const byId = new Map<string, boolean>();
  for (const result of results) byId.set(result.id, result.correct);
  return byId;
}

/**
 * Summarizes every supplied question. Missing results count as incorrect and
 * result ids that do not occur in `questions` are ignored.
 */
export function summarizeMock(questions: readonly Question[], results: MockResults): MockSummary {
  const usesPositions = results.length > 0 && typeof results[0] === "boolean";
  const keyedResults = usesPositions ? undefined : resultsById(results as readonly MockResult[]);
  const byCategory: Partial<Record<CategoryKey, MockScore>> = {};
  let correct = 0;

  questions.forEach((question, index) => {
    const isCorrect = usesPositions
      ? (results as readonly boolean[])[index] === true
      : keyedResults?.get(question.id) === true;
    const categoryScore = byCategory[question.category] ?? { correct: 0, total: 0 };

    categoryScore.total += 1;
    if (isCorrect) {
      categoryScore.correct += 1;
      correct += 1;
    }
    byCategory[question.category] = categoryScore;
  });

  return {
    overall: { correct, total: questions.length },
    byCategory,
  };
}
