import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MOCK_QUESTION_COUNT,
  selectMockQuestions,
  summarizeMock,
} from "../lib/mock.ts";
import { CATEGORIES, questions, type CategoryKey, type Question } from "../lib/questions.ts";

function question(id: string, category: CategoryKey): Question {
  return {
    id,
    category,
    difficulty: "basic",
    label: id,
    prompt: id,
    hint: id,
    explanation: id,
    expected: [],
  };
}

test("selectMockQuestions is reproducible for a fixed seed and uses the default count", () => {
  const first = selectMockQuestions(questions, { seed: 20260718 });
  const second = selectMockQuestions(questions, { seed: 20260718 });

  assert.equal(first.length, DEFAULT_MOCK_QUESTION_COUNT);
  assert.deepEqual(
    first.map(({ id }) => id),
    second.map(({ id }) => id),
  );
  assert.equal(new Set(first.map(({ category }) => category)).size, CATEGORIES.length);

  selectMockQuestions(questions, { seed: 1 });
  const afterAnotherSeed = selectMockQuestions(questions, { seed: 20260718 });
  assert.deepEqual(
    afterAnotherSeed.map(({ id }) => id),
    first.map(({ id }) => id),
    "selection must not retain random state between calls",
  );
  assert.notDeepEqual(
    selectMockQuestions(questions, { seed: 20260719 }).map(({ id }) => id),
    first.map(({ id }) => id),
  );
});

test("selectMockQuestions does not mutate the bank or select duplicate ids", () => {
  const originalOrder = questions.map(({ id }) => id);
  const selected = selectMockQuestions(questions, { count: 40, seed: "mock-1" });
  const selectedIds = selected.map(({ id }) => id);

  assert.equal(new Set(selectedIds).size, selectedIds.length);
  assert.deepEqual(
    questions.map(({ id }) => id),
    originalOrder,
  );
});

test("selectMockQuestions balances represented categories while inventory permits", () => {
  const bank = (["cash-deposit", "merchandise", "loan"] as const).flatMap((category) =>
    Array.from({ length: 4 }, (_, index) => question(`${category}-${index}`, category)),
  );
  const selected = selectMockQuestions(bank, { count: 8, seed: 7 });
  const counts = new Map<CategoryKey, number>();

  for (const item of selected) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);

  assert.equal(selected.length, 8);
  assert.equal(counts.size, 3);
  assert.ok(Math.max(...counts.values()) - Math.min(...counts.values()) <= 1);

  const skewedBank = [
    ...Array.from({ length: 10 }, (_, index) => question(`cash-${index}`, "cash-deposit")),
    question("goods-only", "merchandise"),
    question("loan-only", "loan"),
  ];
  const skewedSelection = selectMockQuestions(skewedBank, { count: 3, seed: 7 });
  assert.deepEqual(
    new Set(skewedSelection.map(({ category }) => category)),
    new Set<CategoryKey>(["cash-deposit", "merchandise", "loan"]),
  );
});

test("selectMockQuestions caps count at unique inventory and handles empty requests", () => {
  const first = question("one", "cash-deposit");
  const duplicateId = question("one", "merchandise");
  const bank = [first, duplicateId, question("two", "loan")];

  const selected = selectMockQuestions(bank, { count: 99, seed: 3 });
  assert.equal(selected.length, 2);
  assert.deepEqual(new Set(selected.map(({ id }) => id)), new Set(["one", "two"]));

  const wholeBank = selectMockQuestions(questions, {
    count: questions.length + 100,
    seed: 3,
  });
  assert.equal(wholeBank.length, questions.length);
  assert.equal(new Set(wholeBank.map(({ id }) => id)).size, questions.length);
  assert.deepEqual(selectMockQuestions(bank, { count: 0, seed: 3 }), []);
  assert.deepEqual(selectMockQuestions([], { seed: 3 }), []);
});

test("summarizeMock aggregates positional boolean results by category", () => {
  const exam = [
    question("cash-1", "cash-deposit"),
    question("cash-2", "cash-deposit"),
    question("loan-1", "loan"),
  ];

  assert.deepEqual(summarizeMock(exam, [true, false, true]), {
    overall: { correct: 2, total: 3 },
    byCategory: {
      "cash-deposit": { correct: 1, total: 2 },
      loan: { correct: 1, total: 1 },
    },
  });
});

test("summarizeMock matches id results independent of order and ignores unknown ids", () => {
  const exam = [
    question("cash-1", "cash-deposit"),
    question("goods-1", "merchandise"),
    question("goods-2", "merchandise"),
  ];
  const results = [
    { id: "goods-2", correct: true },
    { id: "outside-exam", correct: true },
    { id: "cash-1", correct: false },
  ];

  assert.deepEqual(summarizeMock(exam, results), {
    overall: { correct: 1, total: 3 },
    byCategory: {
      "cash-deposit": { correct: 0, total: 1 },
      merchandise: { correct: 1, total: 2 },
    },
  });
  assert.deepEqual(summarizeMock([], []), { overall: { correct: 0, total: 0 }, byCategory: {} });
});
