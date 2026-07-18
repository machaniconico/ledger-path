import type { Attempt } from "./progress.ts";
import { CATEGORIES, questions, type CategoryKey } from "./questions.ts";

export type CategoryAccuracyRow = {
  category: CategoryKey;
  correct: number;
  total: number;
  /** Correct attempts divided by total attempts, or null when unattempted. */
  accuracy: number | null;
};

type MutableScore = {
  correct: number;
  total: number;
};

const categoryByQuestionId = new Map(
  questions.map((question) => [question.id, question.category] as const),
);

/**
 * Aggregates every answer attempt by question category in `CATEGORIES` order.
 * Retries count as separate attempts. Unknown question ids are ignored.
 */
export function categoryAccuracy(attempts: readonly Attempt[]): CategoryAccuracyRow[] {
  const scores = new Map<CategoryKey, MutableScore>(
    CATEGORIES.map(({ key }) => [key, { correct: 0, total: 0 }]),
  );

  for (const attempt of attempts) {
    const category = categoryByQuestionId.get(attempt.questionId);
    if (!category) continue;

    const score = scores.get(category);
    if (!score) continue;

    score.total += 1;
    if (attempt.correct) score.correct += 1;
  }

  return CATEGORIES.map(({ key: category }) => {
    const score = scores.get(category)!;
    return {
      category,
      correct: score.correct,
      total: score.total,
      accuracy: score.total === 0 ? null : score.correct / score.total,
    };
  });
}
