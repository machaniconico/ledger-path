export type Side = "debit" | "credit";

export type EntryLine = {
  side: Side;
  account: string;
  amount: string;
};

export type ReasonCode =
  | "correct"
  | "unanswered"
  | "unbalanced"
  | "account"
  | "amount"
  | "side";

export type ScoreResult = {
  correct: boolean;
  reason: ReasonCode;
};

export function normalizeAccount(value: string): string {
  return value.normalize("NFKC").replace(/[\s　]/g, "").toLowerCase();
}

export function normalizeAmount(value: string): string | null {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\s　,，￥¥円]/g, "");

  if (!/^\d+$/.test(normalized)) return null;
  return BigInt(normalized).toString();
}

function compact(lines: EntryLine[]) {
  return lines
    .filter((line) => line.account.trim() || line.amount.trim())
    .map((line) => ({
      side: line.side,
      account: normalizeAccount(line.account),
      amount: normalizeAmount(line.amount),
    }));
}

function signature(line: ReturnType<typeof compact>[number], includeSide = true) {
  return `${includeSide ? `${line.side}:` : ""}${line.account}:${line.amount}`;
}

export function scoreJournalEntry(
  submitted: EntryLine[],
  expected: EntryLine[],
): ScoreResult {
  const actual = compact(submitted);
  const answer = compact(expected);

  if (
    actual.length === 0 ||
    actual.some((line) => !line.account || line.amount === null)
  ) {
    return { correct: false, reason: "unanswered" };
  }

  const debitTotal = actual
    .filter((line) => line.side === "debit")
    .reduce((sum, line) => sum + BigInt(line.amount!), 0n);
  const creditTotal = actual
    .filter((line) => line.side === "credit")
    .reduce((sum, line) => sum + BigInt(line.amount!), 0n);

  if (debitTotal !== creditTotal) {
    return { correct: false, reason: "unbalanced" };
  }

  const sorted = (lines: typeof actual, includeSide = true) =>
    lines.map((line) => signature(line, includeSide)).sort().join("|");

  if (sorted(actual) === sorted(answer)) {
    return { correct: true, reason: "correct" };
  }

  if (sorted(actual, false) === sorted(answer, false)) {
    return { correct: false, reason: "side" };
  }

  const actualAccounts = actual.map((line) => `${line.side}:${line.account}`).sort();
  const answerAccounts = answer.map((line) => `${line.side}:${line.account}`).sort();
  if (actualAccounts.join("|") !== answerAccounts.join("|")) {
    return { correct: false, reason: "account" };
  }

  return { correct: false, reason: "amount" };
}
