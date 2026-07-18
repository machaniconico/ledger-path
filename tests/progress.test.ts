import assert from "node:assert/strict";
import test from "node:test";
import {
  dailyGoalProgress,
  reviewOrder,
  streak,
  type Attempt,
} from "../lib/progress.ts";

// Pin a non-UTC device timezone so UTC-date implementations fail these tests.
process.env.TZ = "Asia/Tokyo";

const localTime = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
) => new Date(year, month - 1, day, hour, minute).getTime();

const attempt = (
  questionId: string,
  correct: boolean,
  at: number,
  durationMs?: number,
): Attempt => ({ questionId, correct, at, durationMs });

test("reviewOrder promotes, resets, and prioritizes due reviews", () => {
  const now = localTime(2026, 7, 20, 12);
  const attempts = [
    attempt("future", true, localTime(2026, 7, 20, 10)),
    attempt("reset", false, localTime(2026, 7, 18, 10)),
    attempt("promoted", true, localTime(2026, 7, 17, 10)),
    attempt("reset", true, localTime(2026, 7, 16, 10)),
    // Deliberately out of order: history must be sorted by timestamp first.
    attempt("promoted", true, localTime(2026, 7, 15, 10)),
    attempt("reset", true, localTime(2026, 7, 14, 10)),
  ];

  const result = reviewOrder(attempts, now);

  assert.deepEqual(
    result.map(({ questionId, box, nextReviewAt, due }) => ({
      questionId,
      box,
      nextReviewAt,
      due,
    })),
    [
      {
        questionId: "reset",
        box: 1,
        nextReviewAt: localTime(2026, 7, 18),
        due: true,
      },
      {
        questionId: "promoted",
        box: 3,
        nextReviewAt: localTime(2026, 7, 20),
        due: true,
      },
      {
        questionId: "future",
        box: 2,
        nextReviewAt: localTime(2026, 7, 21),
        due: false,
      },
    ],
  );
  assert.equal(result[0].attemptCount, 3);
});

test("reviewOrder uses local midnight across a day boundary", () => {
  const result = reviewOrder(
    [attempt("q1", true, localTime(2026, 7, 17, 23, 59))],
    localTime(2026, 7, 18, 0, 1),
  );

  assert.equal(result[0].nextReviewAt, localTime(2026, 7, 18));
  assert.equal(result[0].due, true);
});

test("reviewOrder ignores future attempts and handles empty input", () => {
  const now = localTime(2026, 7, 18, 12);
  assert.deepEqual(reviewOrder([], now), []);
  assert.deepEqual(
    reviewOrder([attempt("q1", false, now + 1)], now),
    [],
  );
});

test("streak counts distinct consecutive local days from attempts", () => {
  const now = localTime(2026, 7, 18, 0, 15);
  const attempts = [
    attempt("q1", true, localTime(2026, 7, 18, 0, 5)),
    attempt("q2", false, localTime(2026, 7, 18, 0, 10)),
    attempt("q3", true, localTime(2026, 7, 17, 23, 55)),
    attempt("q4", true, localTime(2026, 7, 16, 12)),
  ];

  assert.equal(streak(attempts, now), 3);
  assert.equal(streak([attempt("future", true, now + 1)], now), 0);
});

test("streak accepts date sets, keeps yesterday active, and detects a break", () => {
  const now = localTime(2026, 7, 18, 9);

  assert.equal(streak(new Set(["2026-07-17", "2026-07-16", "2026-07-16"]), now), 2);
  assert.equal(streak(["2026-07-18", "2026-07-16", "2026-07-15"], now), 1);
  assert.equal(streak(["2026-07-16", "2026-07-15"], now), 0);
  assert.equal(streak([], now), 0);
});

test("dailyGoalProgress counts only today's completed attempts", () => {
  const now = localTime(2026, 7, 18, 0, 15);
  const attempts = [
    attempt("previous-day", true, localTime(2026, 7, 17, 23, 59)),
    attempt("retry", false, localTime(2026, 7, 18, 0, 1)),
    attempt("retry", true, localTime(2026, 7, 18, 0, 10)),
    attempt("not-yet", true, localTime(2026, 7, 18, 0, 16)),
  ];

  assert.deepEqual(dailyGoalProgress(attempts, { unit: "questions", amount: 2 }, now), {
    unit: "questions",
    current: 2,
    target: 2,
    remaining: 0,
    ratio: 1,
    completed: true,
  });
});

test("dailyGoalProgress sums minutes and handles empty input", () => {
  const now = localTime(2026, 7, 18, 12);
  const attempts = [
    attempt("q1", true, localTime(2026, 7, 18, 9), 4 * 60_000),
    attempt("q2", false, localTime(2026, 7, 18, 10), 3 * 60_000),
    attempt("old", true, localTime(2026, 7, 17, 23, 59), 20 * 60_000),
  ];

  assert.deepEqual(dailyGoalProgress(attempts, { unit: "minutes", amount: 10 }, now), {
    unit: "minutes",
    current: 7,
    target: 10,
    remaining: 3,
    ratio: 0.7,
    completed: false,
  });
  assert.deepEqual(dailyGoalProgress([], { unit: "questions", amount: 5 }, now), {
    unit: "questions",
    current: 0,
    target: 5,
    remaining: 5,
    ratio: 0,
    completed: false,
  });
});
