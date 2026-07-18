/**
 * A completed answer attempt. `at` and `durationMs` are milliseconds.
 *
 * Calendar-based calculations in this module use the device's local date
 * (`Date#getFullYear`, `getMonth`, and `getDate`), never the UTC date. `now`
 * is always injected by the caller so every calculation is deterministic for
 * a fixed timezone.
 */
export type Attempt = {
  questionId: string;
  correct: boolean;
  at: number;
  /** Time spent on this attempt. Used only by minute-based daily goals. */
  durationMs?: number;
};

export type LeitnerBox = 1 | 2 | 3 | 4 | 5;

/**
 * Review intervals by box, measured in local calendar days. A wrong answer is
 * returned to box 1 and is therefore available for review again today.
 */
export const LEITNER_INTERVAL_DAYS: Readonly<Record<LeitnerBox, number>> = {
  1: 0,
  2: 1,
  3: 3,
  4: 7,
  5: 14,
};

export type ReviewItem = {
  questionId: string;
  box: LeitnerBox;
  /** Local midnight at the start of the next review date, as epoch ms. */
  nextReviewAt: number;
  lastAttemptAt: number;
  attemptCount: number;
  due: boolean;
};

/** A local calendar date (`YYYY-MM-DD`) or an instant that falls on that date. */
export type StudyDay = string | number | Date;

export type StreakSource = Iterable<StudyDay | Pick<Attempt, "at">>;

export type DailyGoalUnit = "questions" | "minutes";

export type DailyGoalTarget = {
  unit: DailyGoalUnit;
  amount: number;
};

export type DailyGoalProgressResult = {
  unit: DailyGoalUnit;
  current: number;
  target: number;
  remaining: number;
  /** Goal progress in the inclusive range 0..1. */
  ratio: number;
  completed: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function timestamp(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite epoch-millisecond value`);
  }
  return value;
}

function localDayNumber(value: number): number {
  const date = new Date(timestamp(value, "timestamp"));
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

function localStartOfDay(value: number): number {
  const date = new Date(timestamp(value, "timestamp"));
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addLocalDays(value: number, days: number): number {
  const date = new Date(localStartOfDay(value));
  date.setDate(date.getDate() + days);
  return date.getTime();
}

function dayNumberFromDateString(value: string): number {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) {
    throw new TypeError(`study day must use YYYY-MM-DD format: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`invalid study day: ${value}`);
  }

  return date.getTime() / DAY_MS;
}

function studyDayNumber(value: StudyDay | Pick<Attempt, "at">): number {
  if (typeof value === "string") return dayNumberFromDateString(value);
  if (typeof value === "number") return localDayNumber(value);
  if (value instanceof Date) return localDayNumber(value.getTime());
  return localDayNumber(value.at);
}

function studyInstant(value: StudyDay | Pick<Attempt, "at">): number | null {
  if (typeof value === "string") return null;
  if (typeof value === "number") return timestamp(value, "study instant");
  if (value instanceof Date) return timestamp(value.getTime(), "study instant");
  return timestamp(value.at, "study instant");
}

function promote(box: LeitnerBox): LeitnerBox {
  return Math.min(5, box + 1) as LeitnerBox;
}

/**
 * Builds one SRS state per attempted question and orders it from most urgent to
 * least urgent. Attempts are evaluated chronologically regardless of input
 * order. Correct answers promote one box (up to 5); an incorrect answer resets
 * the question to box 1. Attempts after `now` are ignored.
 *
 * Review dates are local calendar dates. Due items sort first naturally by
 * `nextReviewAt`; ties prefer the lower box, older attempt, then question id.
 */
export function reviewOrder(attempts: readonly Attempt[], now: number): ReviewItem[] {
  const currentTime = timestamp(now, "now");
  const histories = new Map<string, Array<Attempt & { inputIndex: number }>>();

  attempts.forEach((attempt, inputIndex) => {
    const attemptTime = timestamp(attempt.at, "attempt.at");
    if (attemptTime > currentTime) return;

    const history = histories.get(attempt.questionId) ?? [];
    history.push({ ...attempt, at: attemptTime, inputIndex });
    histories.set(attempt.questionId, history);
  });

  const items: ReviewItem[] = [];
  for (const [questionId, history] of histories) {
    history.sort((left, right) => left.at - right.at || left.inputIndex - right.inputIndex);

    let box: LeitnerBox = 1;
    for (const attempt of history) {
      box = attempt.correct ? promote(box) : 1;
    }

    const lastAttemptAt = history[history.length - 1].at;
    const nextReviewAt = addLocalDays(lastAttemptAt, LEITNER_INTERVAL_DAYS[box]);
    items.push({
      questionId,
      box,
      nextReviewAt,
      lastAttemptAt,
      attemptCount: history.length,
      due: nextReviewAt <= currentTime,
    });
  }

  return items.sort(
    (left, right) =>
      left.nextReviewAt - right.nextReviewAt ||
      left.box - right.box ||
      left.lastAttemptAt - right.lastAttemptAt ||
      (left.questionId < right.questionId ? -1 : left.questionId > right.questionId ? 1 : 0),
  );
}

/**
 * Returns the current local-calendar-day learning streak. Duplicate study days
 * count once. A streak studied through yesterday remains active during today;
 * it becomes zero only when neither today nor yesterday was studied.
 */
export function streak(source: StreakSource, now: number): number {
  const currentTime = timestamp(now, "now");
  const today = localDayNumber(currentTime);
  const studiedDays = new Set<number>();

  for (const value of source) {
    const instant = studyInstant(value);
    if (instant !== null && instant > currentTime) continue;

    const day = studyDayNumber(value);
    if (day <= today) studiedDays.add(day);
  }

  let cursor = studiedDays.has(today) ? today : today - 1;
  if (!studiedDays.has(cursor)) return 0;

  let count = 0;
  while (studiedDays.has(cursor)) {
    count += 1;
    cursor -= 1;
  }
  return count;
}

/**
 * Calculates today's progress using the device-local date containing `now`.
 * Question goals count attempts (including retries). Minute goals sum
 * `durationMs` and assign each duration to the local date on which its attempt
 * completed. Future attempts are ignored and missing durations count as zero.
 */
export function dailyGoalProgress(
  attempts: readonly Attempt[],
  target: DailyGoalTarget,
  now: number,
): DailyGoalProgressResult {
  const currentTime = timestamp(now, "now");
  if (!Number.isFinite(target.amount) || target.amount <= 0) {
    throw new RangeError("daily goal amount must be a positive finite number");
  }

  const today = localDayNumber(currentTime);
  const todaysAttempts = attempts.filter((attempt) => {
    const attemptTime = timestamp(attempt.at, "attempt.at");
    return attemptTime <= currentTime && localDayNumber(attemptTime) === today;
  });

  const current =
    target.unit === "questions"
      ? todaysAttempts.length
      : todaysAttempts.reduce((total, attempt) => {
          const duration = attempt.durationMs ?? 0;
          if (!Number.isFinite(duration) || duration < 0) {
            throw new RangeError("attempt.durationMs must be a non-negative finite number");
          }
          return total + duration / 60_000;
        }, 0);

  return {
    unit: target.unit,
    current,
    target: target.amount,
    remaining: Math.max(0, target.amount - current),
    ratio: Math.min(1, current / target.amount),
    completed: current >= target.amount,
  };
}
