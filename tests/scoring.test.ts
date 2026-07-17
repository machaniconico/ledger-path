import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAmount,
  scoreJournalEntry,
  type EntryLine,
} from "../lib/scoring.ts";

const expected: EntryLine[] = [
  { side: "debit", account: "消耗品費", amount: "24000" },
  { side: "credit", account: "現金", amount: "24000" },
];

test("normalizes full-width, commas, and yen marks deterministically", () => {
  assert.equal(normalizeAmount("￥２４，０００円"), "24000");
  assert.equal(normalizeAmount("00024,000"), "24000");
  assert.equal(normalizeAmount("24.000"), null);
  assert.equal(
    normalizeAmount("９，００７，１９９，２５４，７４０，９９３"),
    "9007199254740993",
  );
});

test("scores normalized entries independent of line order", () => {
  assert.deepEqual(
    scoreJournalEntry(
      [
        { side: "credit", account: " 現 金 ", amount: "24,000" },
        { side: "debit", account: "消耗品費", amount: "２４０００" },
      ],
      expected,
    ),
    { correct: true, reason: "correct" },
  );
});

test("returns stable diagnostic reason codes", () => {
  assert.equal(scoreJournalEntry([], expected).reason, "unanswered");
  assert.equal(
    scoreJournalEntry(
      [
        { side: "debit", account: "消耗品費", amount: "20000" },
        { side: "credit", account: "現金", amount: "24000" },
      ],
      expected,
    ).reason,
    "unbalanced",
  );
  assert.equal(
    scoreJournalEntry(
      [
        { side: "debit", account: "備品", amount: "24000" },
        { side: "credit", account: "現金", amount: "24000" },
      ],
      expected,
    ).reason,
    "account",
  );
  assert.equal(
    scoreJournalEntry(
      [
        { side: "debit", account: "消耗品費", amount: "25000" },
        { side: "credit", account: "現金", amount: "25000" },
      ],
      expected,
    ).reason,
    "amount",
  );
  assert.equal(
    scoreJournalEntry(
      [
        { side: "credit", account: "消耗品費", amount: "24000" },
        { side: "debit", account: "現金", amount: "24000" },
      ],
      expected,
    ).reason,
    "side",
  );
});
