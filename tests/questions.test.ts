import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_ACCOUNTS,
  CATEGORIES,
  questions,
  questionsByCategory,
  getQuestion,
} from "../lib/questions.ts";
import { normalizeAmount, scoreJournalEntry } from "../lib/scoring.ts";

const accountSet = new Set(ALL_ACCOUNTS);

test("bank has a meaningful number of questions", () => {
  assert.ok(questions.length >= 30, `expected >= 30 questions, got ${questions.length}`);
});

test("question ids are unique", () => {
  const ids = questions.map((question) => question.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate question id detected");
});

test("every question balances (debit total === credit total)", () => {
  for (const question of questions) {
    let debit = 0n;
    let credit = 0n;
    for (const line of question.expected) {
      const normalized = normalizeAmount(line.amount);
      assert.notEqual(normalized, null, `${question.id}: amount "${line.amount}" is not numeric`);
      const value = BigInt(normalized!);
      if (line.side === "debit") debit += value;
      else credit += value;
    }
    assert.equal(debit, credit, `${question.id}: debit ${debit} !== credit ${credit}`);
  }
});

test("every expected account exists in ALL_ACCOUNTS", () => {
  for (const question of questions) {
    for (const line of question.expected) {
      assert.ok(
        accountSet.has(line.account),
        `${question.id}: account "${line.account}" missing from ALL_ACCOUNTS`,
      );
    }
  }
});

test("ALL_ACCOUNTS has no duplicates", () => {
  assert.equal(new Set(ALL_ACCOUNTS).size, ALL_ACCOUNTS.length, "duplicate account in ALL_ACCOUNTS");
});

test("each question scores itself as correct via scoreJournalEntry", () => {
  for (const question of questions) {
    const result = scoreJournalEntry(question.expected, question.expected);
    assert.deepEqual(
      result,
      { correct: true, reason: "correct" },
      `${question.id}: expected entry does not self-score as correct (${result.reason})`,
    );
  }
});

test("every question has non-empty label, prompt, hint and explanation", () => {
  for (const question of questions) {
    for (const field of ["label", "prompt", "hint", "explanation"] as const) {
      assert.ok(
        typeof question[field] === "string" && question[field].trim().length > 0,
        `${question.id}: ${field} is empty`,
      );
    }
    assert.ok(question.expected.length >= 2, `${question.id}: expected needs >= 2 lines`);
  }
});

test("every category is represented by at least one question", () => {
  for (const category of CATEGORIES) {
    const inCategory = questionsByCategory(category.key);
    assert.ok(inCategory.length >= 1, `category ${category.key} has no questions`);
  }
});

test("every question references a category that exists", () => {
  const keys = new Set(CATEGORIES.map((category) => category.key));
  for (const question of questions) {
    assert.ok(keys.has(question.category), `${question.id}: unknown category ${question.category}`);
  }
});

test("getQuestion resolves known ids and rejects unknown ones", () => {
  assert.equal(getQuestion(questions[0].id)?.id, questions[0].id);
  assert.equal(getQuestion("does-not-exist"), undefined);
});
