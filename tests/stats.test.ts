import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { Attempt } from "../lib/progress.ts";
import { CATEGORIES } from "../lib/questions.ts";
import { categoryAccuracy } from "../lib/stats.ts";

const attempt = (questionId: string, correct: boolean, at: number): Attempt => ({
  questionId,
  correct,
  at,
});

test("categoryAccuracy aggregates attempts and retries by category", () => {
  const result = categoryAccuracy([
    attempt("q1", true, 1),
    attempt("q1", false, 2),
    attempt("q8", true, 3),
  ]);

  assert.deepEqual(result.map(({ category }) => category), CATEGORIES.map(({ key }) => key));
  assert.deepEqual(
    result.find(({ category }) => category === "cash-deposit"),
    { category: "cash-deposit", correct: 1, total: 2, accuracy: 0.5 },
  );
  assert.deepEqual(
    result.find(({ category }) => category === "merchandise"),
    { category: "merchandise", correct: 1, total: 1, accuracy: 1 },
  );
});

test("categoryAccuracy reports every unattempted category without treating it as zero percent", () => {
  assert.deepEqual(
    categoryAccuracy([]),
    CATEGORIES.map(({ key: category }) => ({
      category,
      correct: 0,
      total: 0,
      accuracy: null,
    })),
  );
});

test("categoryAccuracy ignores unknown questions, is order independent, and does not mutate input", () => {
  const attempts = [
    attempt("q8", false, 30),
    attempt("unknown-question", true, 20),
    attempt("q1", true, 10),
  ];
  const snapshot = structuredClone(attempts);

  const forward = categoryAccuracy(attempts);
  const reversed = categoryAccuracy([...attempts].reverse());

  assert.deepEqual(forward, reversed);
  assert.deepEqual(attempts, snapshot);
  assert.equal(forward.reduce((total, row) => total + row.total, 0), 2);
});

test("app exposes streak and accessible category performance UI", async () => {
  const client = await readFile(
    new URL("../app/LedgerPathApp.tsx", import.meta.url),
    "utf8",
  );

  assert.match(client, /連続学習日数/);
  assert.match(client, /id="stats"/);
  assert.match(client, /aria-label="カテゴリ別正答率"/);
});
