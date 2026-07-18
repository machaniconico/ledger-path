"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  scoreJournalEntry,
  type EntryLine,
  type ReasonCode,
  type ScoreResult,
} from "../lib/scoring";
import {
  ALL_ACCOUNTS,
  CATEGORIES,
  categoryLabel,
  questions,
  type CategoryKey,
  type Difficulty,
  type Question,
} from "../lib/questions";

type SavedState = {
  nickname: string;
  dailyMinutes: number;
  completed: string[];
  review: string[];
};

type SaveStatus = "pending" | "saved" | "error";
type CategoryFilter = CategoryKey | "all";

const STORAGE_KEY = "ledger-path-state-v1";
const INITIAL_ENTRY_LINES = 4;
const MIN_ENTRY_LINES = 2;
const MAX_ENTRY_LINES = 8;

const allowedDailyMinutes = new Set([5, 10, 15, 30]);
const validQuestionIds = new Set(questions.map((question) => question.id));
const questionById = new Map(questions.map((question) => [question.id, question]));
const questionsByCategory = new Map(
  CATEGORIES.map((category) => [
    category.key,
    questions.filter((question) => question.category === category.key),
  ]),
);
const maxCategorySize = Math.max(
  ...CATEGORIES.map((category) => questionsByCategory.get(category.key)?.length ?? 0),
);
const crossCategoryQuestions = Array.from({ length: maxCategorySize }).flatMap((_, index) =>
  CATEGORIES.flatMap((category) => questionsByCategory.get(category.key)?.[index] ?? []),
);
const mockQuestionIds = new Set(["q1", "q2", "q3"]);
const mockQuestions = questions.filter((question) => mockQuestionIds.has(question.id));

const difficultyLabels: Record<Difficulty, string> = {
  basic: "基礎",
  standard: "標準",
  advanced: "応用",
};

function parseSavedState(raw: string): SavedState | null {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  const cleanIds = (input: unknown) =>
    Array.isArray(input)
      ? [...new Set(input.filter((id): id is string => typeof id === "string" && validQuestionIds.has(id)))]
      : [];
  const minutes =
    typeof candidate.dailyMinutes === "number" && allowedDailyMinutes.has(candidate.dailyMinutes)
      ? candidate.dailyMinutes
      : 15;

  return {
    nickname: typeof candidate.nickname === "string" ? candidate.nickname.slice(0, 20) : "",
    dailyMinutes: minutes,
    completed: cleanIds(candidate.completed),
    review: cleanIds(candidate.review),
  };
}

const reasonMessages: Record<ReasonCode, string> = {
  correct: "正解です。借方と貸方が正しく一致しています。",
  unanswered: "未入力の項目があります。勘定科目と金額を確認しましょう。",
  unbalanced: "借方と貸方の合計が一致していません。まず合計額を確認しましょう。",
  account: "勘定科目が異なります。何が増え、何が減ったかを整理しましょう。",
  amount: "金額が異なります。取引の総額と内訳を確認しましょう。",
  side: "借方と貸方が逆です。資産・費用の増加は借方から考えましょう。",
};

const blankLine = (index: number): EntryLine => ({
  side: index % 2 === 0 ? "debit" : "credit",
  account: "",
  amount: "",
});

const blankLines = (): EntryLine[] =>
  Array.from({ length: INITIAL_ENTRY_LINES }, (_, index) => blankLine(index));

function formatAnswer(lines: EntryLine[]) {
  return lines
    .map(
      (line) =>
        `${line.side === "debit" ? "借方" : "貸方"} ${line.account} ${BigInt(line.amount).toLocaleString("ja-JP")}円`,
    )
    .join(" ／ ");
}

export default function LedgerPathApp() {
  const [hydrated, setHydrated] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [nickname, setNickname] = useState("");
  const [dailyMinutes, setDailyMinutes] = useState(15);
  const [completed, setCompleted] = useState<string[]>([]);
  const [review, setReview] = useState<string[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [lines, setLines] = useState<EntryLine[]>(blankLines);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [mockMode, setMockMode] = useState(false);
  const [mockAnswers, setMockAnswers] = useState<boolean[]>([]);
  const [mockFinished, setMockFinished] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("pending");
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);
  const mockResultHeadingRef = useRef<HTMLHeadingElement>(null);

  const question = questions[questionIndex] ?? questions[0];
  const completedSet = useMemo(() => new Set(completed), [completed]);
  const filteredQuestions = useMemo(
    () =>
      activeCategory === "all"
        ? questions
        : questionsByCategory.get(activeCategory) ?? [],
    [activeCategory],
  );
  const categoryStats = useMemo(
    () =>
      CATEGORIES.map((category) => {
        const categoryQuestions = questionsByCategory.get(category.key) ?? [];
        const completedCount = categoryQuestions.filter((item) => completedSet.has(item.id)).length;
        return {
          ...category,
          questions: categoryQuestions,
          completedCount,
          progress: Math.round((completedCount / categoryQuestions.length) * 100),
        };
      }),
    [completedSet],
  );
  const progress = Math.round((completed.length / questions.length) * 100);
  const greetingName = nickname.trim() || "学習者";
  const mockQuestionIndex = mockQuestions.findIndex((item) => item.id === question.id);
  const filteredQuestionIndex = filteredQuestions.findIndex((item) => item.id === question.id);

  useEffect(() => {
    const restoreTask = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = parseSavedState(raw);
          if (!saved) throw new Error("invalid saved state");
          setNickname(saved.nickname);
          setDailyMinutes(saved.dailyMinutes);
          setCompleted(saved.completed);
          setReview(saved.review);
        } else {
          setOnboarding(true);
        }
      } catch {
        setOnboarding(true);
      }
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(restoreTask);
  }, []);

  useEffect(() => {
    if (!hydrated || onboarding) return;
    const saved: SavedState = {
      nickname,
      dailyMinutes,
      completed,
      review,
    };
    const saveTask = window.setTimeout(() => {
      setSaveStatus("pending");
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 0);
    return () => window.clearTimeout(saveTask);
  }, [hydrated, onboarding, nickname, dailyMinutes, completed, review]);

  useEffect(() => {
    if (!hydrated || !onboarding) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [hydrated, onboarding]);

  const recommended = useMemo(() => {
    const reviewQuestion = review
      .map((id) => questionById.get(id))
      .find((item): item is Question => Boolean(item));
    const incompleteQuestion = crossCategoryQuestions.find(
      (item) => !completedSet.has(item.id),
    );
    return reviewQuestion ?? incompleteQuestion ?? crossCategoryQuestions[0] ?? questions[0];
  }, [completedSet, review]);

  function selectQuestion(id: string) {
    const selectedQuestion = questionById.get(id);
    if (!selectedQuestion) return;

    setQuestionIndex(questions.indexOf(selectedQuestion));
    setLines(blankLines());
    setResult(null);
    setHintOpen(false);
    if (mockMode) {
      setMockMode(false);
      setMockFinished(false);
      setMockAnswers([]);
    }
    focusPracticeQuestion();
  }

  function scrollToPractice() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById("practice")
      ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }

  function focusPracticeQuestion() {
    requestAnimationFrame(() => {
      questionHeadingRef.current?.focus({ preventScroll: true });
      scrollToPractice();
    });
  }

  function focusMockResult() {
    requestAnimationFrame(() => {
      mockResultHeadingRef.current?.focus({ preventScroll: true });
      scrollToPractice();
    });
  }

  function submitAnswer(event: FormEvent) {
    event.preventDefault();
    const scored = scoreJournalEntry(lines, question.expected);

    if (mockMode) {
      const nextAnswers = [...mockAnswers, scored.correct];
      setMockAnswers(nextAnswers);
      if (mockQuestionIndex === mockQuestions.length - 1) {
        setMockFinished(true);
        focusMockResult();
      } else {
        const nextQuestion = mockQuestions[mockQuestionIndex + 1] ?? mockQuestions[0];
        setQuestionIndex(questions.indexOf(nextQuestion));
        setLines(blankLines());
        focusPracticeQuestion();
      }
      return;
    }

    setResult(scored);
    if (scored.correct) {
      setCompleted((items) =>
        items.includes(question.id) ? items : [...items, question.id],
      );
      setReview((items) => items.filter((id) => id !== question.id));
    } else {
      setReview((items) =>
        items.includes(question.id) ? items : [...items, question.id],
      );
    }
  }

  function moveNext() {
    const sequence = filteredQuestionIndex >= 0 ? filteredQuestions : questions;
    const currentIndex = sequence.findIndex((item) => item.id === question.id);
    const nextQuestion = sequence[(currentIndex + 1) % sequence.length] ?? questions[0];
    setQuestionIndex(questions.indexOf(nextQuestion));
    setLines(blankLines());
    setResult(null);
    setHintOpen(false);
    focusPracticeQuestion();
  }

  function startMock() {
    const firstMockQuestion = mockQuestions[0];
    setMockMode(true);
    setMockFinished(false);
    setMockAnswers([]);
    setActiveCategory("all");
    setQuestionIndex(questions.indexOf(firstMockQuestion));
    setLines(blankLines());
    setResult(null);
    setHintOpen(false);
    focusPracticeQuestion();
  }

  function exitMock() {
    setMockMode(false);
    setMockFinished(false);
    setMockAnswers([]);
    setQuestionIndex(0);
    setLines(blankLines());
    setResult(null);
    setHintOpen(false);
    focusPracticeQuestion();
  }

  function resetData() {
    if (!window.confirm("この端末に保存した学習進捗をリセットしますか？")) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // State is still reset in memory when browser storage is unavailable.
    }
    setNickname("");
    setDailyMinutes(15);
    setCompleted([]);
    setReview([]);
    setActiveCategory("all");
    setMockMode(false);
    setMockFinished(false);
    setMockAnswers([]);
    setQuestionIndex(0);
    setLines(blankLines());
    setResult(null);
    setHintOpen(false);
    setSaveStatus("pending");
    setOnboarding(true);
  }

  function finishOnboarding(event: FormEvent) {
    event.preventDefault();
    setOnboarding(false);
  }

  function updateLine(index: number, patch: Partial<EntryLine>) {
    setLines((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function addLine() {
    setLines((items) =>
      items.length >= MAX_ENTRY_LINES
        ? items
        : [...items, blankLine(items.length)],
    );
  }

  function removeLine() {
    setLines((items) =>
      items.length <= MIN_ENTRY_LINES ? items : items.slice(0, -1),
    );
  }

  function trapDialogFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'input, select, button, [href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("disabled"));
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        本文へ移動
      </a>
      <header className="site-header">
        <a className="brand" href="#today" aria-label="Ledger Path ホーム">
          <span className="brand-mark" aria-hidden="true">LP</span>
          <span>
            <strong>Ledger Path</strong>
            <small>日商簿記3級パイロット</small>
          </span>
        </a>
        <nav aria-label="メインナビゲーション">
          <a href="#today">今日</a>
          <a href="#curriculum">カリキュラム</a>
          <a href="#review">復習</a>
          <a href="#mock">模試</a>
        </nav>
        <div className="header-tools">
          <span
            className={`save-status ${saveStatus === "error" ? "is-error" : ""}`}
            role="status"
            aria-live="polite"
          >
            {saveStatus === "saved"
              ? "✓ 保存済み（この端末）"
              : saveStatus === "error"
                ? "! 保存できませんでした"
                : "この端末に保存"}
          </span>
          <button className="text-button header-reset" type="button" onClick={resetData}>
            学習データをリセット
          </button>
        </div>
      </header>

      <main id="main-content">
        <section className="hero ledger-grid" id="today" aria-labelledby="today-title">
          <div className="hero-copy">
            <p className="eyebrow">2026年度版・独自学習スコア</p>
            <h1 id="today-title">
              {greetingName}さん、<br />今日も一仕訳。
            </h1>
            <p className="hero-lead">
              合格までの道筋を、小さな演習に分けて。今日は約{dailyMinutes}分で終わる内容です。
            </p>
            <button className="primary-button" type="button" onClick={() => selectQuestion(recommended.id)}>
              今日の学習を始める
              <span aria-hidden="true">→</span>
            </button>
          </div>

          <aside className="today-card" aria-label="今日のおすすめ">
            <div className="card-kicker">
              <span>今日のおすすめ</span>
              <span>約 {Math.min(dailyMinutes, 10)} 分</span>
            </div>
            <p className="task-number">仕訳演習 {recommended.id.slice(1).padStart(2, "0")}</p>
            <span className="category-badge">{categoryLabel(recommended.category)}</span>
            <h2>{recommended.label}</h2>
            <p>
              {review.includes(recommended.id)
                ? "前回つまずいた問題です。記憶が新しいうちに解き直しましょう。"
                : "基本の型を押さえると、この後の決算整理が理解しやすくなります。"}
            </p>
            <div className="progress-row">
              <span>パイロット進捗</span>
              <strong>{progress}%</strong>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="パイロット進捗"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <small>{completed.length} / {questions.length} 問完了</small>
          </aside>
        </section>

        <section className="practice-section" id="practice" aria-labelledby="practice-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">PRACTICE</p>
              <h2 id="practice-title">仕訳トレーニング</h2>
            </div>
            <span className="step-chip">
              {mockMode
                ? `模試モード　${Math.max(mockQuestionIndex, 0) + 1} / ${mockQuestions.length}`
                : `練習モード　${filteredQuestionIndex >= 0 ? filteredQuestionIndex + 1 : questionIndex + 1} / ${filteredQuestionIndex >= 0 ? filteredQuestions.length : questions.length}`}
            </span>
          </div>

          {mockFinished ? (
            <div className="mock-result" role="status">
              <p className="eyebrow">模試結果</p>
              <h3 ref={mockResultHeadingRef} tabIndex={-1}>
                {mockAnswers.filter(Boolean).length} / {mockQuestions.length} 問正解
              </h3>
              <p>この結果はLedger Path独自の練習指標です。合格を保証するものではありません。</p>
              <button className="primary-button" type="button" onClick={exitMock}>模試を終了する</button>
            </div>
          ) : (
            <div className="practice-layout">
              <article className="question-card">
                <div className="question-meta">
                  <p className="question-label">問題 {question.id.slice(1).padStart(2, "0")}</p>
                  <span className="category-badge">{categoryLabel(question.category)}</span>
                </div>
                <h3 ref={questionHeadingRef} tabIndex={-1}>{question.label}</h3>
                <p className="question-prompt">{question.prompt}</p>
                {!mockMode && (
                  <div className="hint-block">
                    <button
                      className="hint-button"
                      type="button"
                      aria-expanded={hintOpen}
                      aria-controls="hint-text"
                      onClick={() => setHintOpen((value) => !value)}
                    >
                      {hintOpen ? "ヒントを閉じる" : "ヒントを見る"}
                    </button>
                    {hintOpen && <p id="hint-text">手がかり：{question.hint}</p>}
                  </div>
                )}
              </article>

              <form
                className="entry-card"
                aria-describedby="entry-instruction"
                onSubmit={submitAnswer}
              >
                <p className="entry-instruction" id="entry-instruction">
                  各行の借方・貸方を選び、勘定科目と金額を入力してください。行数は2〜8行で調整できます。
                </p>
                <div className="entry-head" aria-hidden="true">
                  <span>区分</span><span>勘定科目</span><span>金額</span>
                </div>
                {lines.map((line, index) => (
                  <div className="entry-row" key={index}>
                    <label className="side-field">
                      <span className="sr-only">仕訳行{index + 1}の区分</span>
                      <select
                        className={`side-select ${line.side}`}
                        value={line.side}
                        onChange={(event) =>
                          updateLine(index, {
                            side: event.target.value === "credit" ? "credit" : "debit",
                          })
                        }
                      >
                        <option value="debit">借方</option>
                        <option value="credit">貸方</option>
                      </select>
                    </label>
                    <label>
                      <span className="sr-only">仕訳行{index + 1}の勘定科目</span>
                      <select
                        value={line.account}
                        onChange={(event) =>
                          updateLine(index, { account: event.target.value })
                        }
                      >
                        <option value="">選択してください</option>
                        {ALL_ACCOUNTS.map((account) => <option key={account}>{account}</option>)}
                      </select>
                    </label>
                    <label className="amount-field">
                      <span className="sr-only">仕訳行{index + 1}の金額</span>
                      <span aria-hidden="true">¥</span>
                      <input
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="0"
                        value={line.amount}
                        onChange={(event) =>
                          updateLine(index, { amount: event.target.value })
                        }
                      />
                    </label>
                  </div>
                ))}

                <div className="line-controls" aria-label="仕訳行の増減">
                  <button
                    className="line-button"
                    type="button"
                    onClick={removeLine}
                    disabled={lines.length <= MIN_ENTRY_LINES}
                  >
                    行を削除
                  </button>
                  <span className="line-count" role="status" aria-live="polite">
                    現在 {lines.length} 行
                  </span>
                  <button
                    className="line-button"
                    type="button"
                    onClick={addLine}
                    disabled={lines.length >= MAX_ENTRY_LINES}
                  >
                    行を追加
                  </button>
                </div>

                {result && !mockMode && (
                  <div className={`feedback ${result.correct ? "is-correct" : "is-wrong"}`} role="status" aria-live="polite">
                    <strong>{result.correct ? "正解" : "要確認"}</strong>
                    <p>{reasonMessages[result.reason]}</p>
                    <p className="answer-line"><b>正答：</b>{formatAnswer(question.expected)}</p>
                    <p>{question.explanation}</p>
                  </div>
                )}

                <div className="form-actions">
                  {result && !result.correct && !mockMode ? (
                    <button className="secondary-button" type="button" onClick={() => setResult(null)}>
                      もう一度解く
                    </button>
                  ) : (
                    <button className="primary-button" type="submit">
                      {mockMode ? "解答を記録して次へ" : "答え合わせ"}
                    </button>
                  )}
                  {result?.correct && !mockMode && (
                    <button className="secondary-button" type="button" onClick={moveNext}>
                      次の問題へ
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}
        </section>

        <section className="content-section" id="curriculum" aria-labelledby="curriculum-title">
          <div className="section-heading">
            <div><p className="eyebrow">CURRICULUM</p><h2 id="curriculum-title">カテゴリから選ぶ</h2></div>
            <p>{CATEGORIES.length}カテゴリ・全{questions.length}問から、強化したい論点を選んで練習できます。</p>
          </div>
          <div className="category-grid" role="group" aria-label="問題カテゴリ">
            <button
              className={`category-card ${activeCategory === "all" ? "is-active" : ""}`}
              type="button"
              aria-pressed={activeCategory === "all"}
              aria-controls="question-bank-list"
              onClick={() => setActiveCategory("all")}
            >
              <span className="category-card-head">
                <strong>すべてのカテゴリ</strong>
                <small>{activeCategory === "all" ? "選択中 · " : ""}{completed.length} / {questions.length} 問</small>
              </span>
              <span className="category-summary">全範囲をカテゴリ横断で練習</span>
              <span className="category-progress" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </span>
            </button>
            {categoryStats.map((category) => {
              const active = activeCategory === category.key;
              return (
                <button
                  className={`category-card ${active ? "is-active" : ""}`}
                  type="button"
                  key={category.key}
                  aria-pressed={active}
                  aria-controls="question-bank-list"
                  onClick={() => setActiveCategory(category.key)}
                >
                  <span className="category-card-head">
                    <strong>{category.label}</strong>
                    <small>{active ? "選択中 · " : ""}{category.completedCount} / {category.questions.length} 問</small>
                  </span>
                  <span className="category-summary">{category.summary}</span>
                  <span className="category-progress" aria-hidden="true">
                    <span style={{ width: `${category.progress}%` }} />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="question-bank">
            <div className="question-bank-heading">
              <div>
                <p className="eyebrow">QUESTION BANK</p>
                <h3 id="question-bank-title">
                  {activeCategory === "all" ? "全カテゴリ" : categoryLabel(activeCategory)}の問題一覧
                </h3>
              </div>
              <span className="count-badge">{filteredQuestions.length} 問</span>
            </div>
            <p className="bank-summary" role="status" aria-live="polite">
              {activeCategory === "all"
                ? `全${questions.length}問を表示中です。`
                : `${categoryLabel(activeCategory)}の${filteredQuestions.length}問を表示中です。`}
              問題を選ぶと練習欄へ移動します。
            </p>
            <div
              className="question-picker"
              id="question-bank-list"
              aria-labelledby="question-bank-title"
            >
              {filteredQuestions.map((item) => {
                const isCompleted = completedSet.has(item.id);
                const needsReview = review.includes(item.id);
                const isCurrent = question.id === item.id && !mockMode;
                return (
                  <button
                    className={`question-picker-card ${isCurrent ? "is-current" : ""}`}
                    type="button"
                    key={item.id}
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() => selectQuestion(item.id)}
                  >
                    <span className="question-picker-meta">
                      <span className="category-badge">{categoryLabel(item.category)}</span>
                      <span>{difficultyLabels[item.difficulty]}</span>
                    </span>
                    <strong>{item.label}</strong>
                    <small>
                      {needsReview ? "要復習" : isCompleted ? "完了済み" : "未完了"}
                      <span aria-hidden="true">　→</span>
                    </small>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="content-section review-section" id="review" aria-labelledby="review-title">
          <div className="section-heading">
            <div><p className="eyebrow">REVIEW</p><h2 id="review-title">復習キュー</h2></div>
            <span className="count-badge">{review.length} 問</span>
          </div>
          {review.length ? (
            <div className="review-list">
              {review.map((id) => {
                const item = questionById.get(id);
                if (!item) return null;
                return (
                  <button type="button" key={id} onClick={() => selectQuestion(id)}>
                    <span><small>要復習 · {categoryLabel(item.category)}</small><strong>{item.label}</strong></span>
                    <span>解き直す →</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="empty-state">復習待ちの問題はありません。間違えた問題はここに自動で追加されます。</p>
          )}
        </section>

        <section className="mock-section" id="mock" aria-labelledby="mock-title">
          <div>
            <p className="eyebrow light">MOCK EXAM</p>
            <h2 id="mock-title">60分ミニ模試</h2>
            <p>{mockQuestions.length}問のオリジナル問題で、ヒントや即時解説に頼らず実力を確認します。</p>
          </div>
          <div className="mock-meta"><span><b>{String(mockQuestions.length).padStart(2, "0")}</b> 問</span><span><b>60</b> 分想定</span></div>
          {mockMode ? (
            <button className="ivory-button" type="button" onClick={exitMock}>模試モードを終了</button>
          ) : (
            <button className="ivory-button" type="button" onClick={startMock}>模試を始める</button>
          )}
        </section>
      </main>

      <footer>
        <div className="brand footer-brand"><span className="brand-mark" aria-hidden="true">LP</span><strong>Ledger Path</strong></div>
        <p>本サービスは独立した非公式の学習パイロットです。日本商工会議所とは関係がなく、合格を保証するものではありません。問題・解説・学習スコアは独自作成です。</p>
        <small>© 2026 Ledger Path Pilot</small>
      </footer>

      {hydrated && onboarding && (
        <div className="modal-backdrop">
          <div
            className="onboarding-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
            aria-describedby="welcome-description"
            onKeyDown={trapDialogFocus}
          >
            <p className="eyebrow">WELCOME</p>
            <h2 id="welcome-title">学習のペースを決めましょう</h2>
            <p id="welcome-description">あとからリセットできます。ニックネームは入力しなくても始められます。</p>
            <form onSubmit={finishOnboarding}>
              <label htmlFor="nickname">ニックネーム <small>任意</small></label>
              <input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="例：はる" maxLength={20} autoFocus />
              <label htmlFor="daily-minutes">1日の学習時間</label>
              <select id="daily-minutes" value={dailyMinutes} onChange={(event) => setDailyMinutes(Number(event.target.value))}>
                <option value={5}>5分</option><option value={10}>10分</option><option value={15}>15分</option><option value={30}>30分</option>
              </select>
              <button className="primary-button" type="submit">Ledger Pathを始める</button>
            </form>
            <small className="privacy-note">入力内容と進捗は、このブラウザ内にのみ保存されます。</small>
          </div>
        </div>
      )}
    </div>
  );
}
