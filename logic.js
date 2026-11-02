/** Pure logic for splits, grading, and storage helpers (importable in Node tests). */

export const ROWS = [
  { id: "A", session: 1, label: "A · session 1" },
  { id: "A", session: 2, label: "A · session 2" },
  { id: "B", session: 1, label: "B · session 1" },
  { id: "B", session: 2, label: "B · session 2" },
  { id: "C", session: 1, label: "C · session 1" },
  { id: "C", session: 2, label: "C · session 2" },
];

export function rowSplitMembership() {
  const train = [];
  const test = [];
  for (const row of ROWS) {
    const bucket = row.session === 1 ? train : test;
    bucket.push(row);
  }
  return { train, test, overlapIds: overlapParticipantIds(train, test) };
}

export function personSplitMembership() {
  const train = [];
  const test = [];
  for (const row of ROWS) {
    if (row.id === "C") test.push(row);
    else train.push(row);
  }
  return { train, test, overlapIds: overlapParticipantIds(train, test) };
}

export function overlapParticipantIds(trainRows, testRows) {
  const trainIds = new Set(trainRows.map((r) => r.id));
  const testIds = new Set(testRows.map((r) => r.id));
  return [...trainIds].filter((id) => testIds.has(id)).sort();
}

export const QUESTIONS = [
  {
    id: "q1",
    prompt: "Under the **row split**, which participant IDs have at least one row in train and at least one row in test?",
    choices: ["None", "A, B, and C", "Only C", "Only A and B"],
    correctIndex: 1,
    missHint:
      "In the row split, session 1 of each person is train and session 2 is test. Every ID (A, B, C) appears in both sets.",
  },
  {
    id: "q2",
    prompt: "Under the **person split**, how many participant IDs appear in both train and test?",
    choices: ["Zero", "One", "Two", "Three"],
    correctIndex: 0,
    missHint:
      "Person split keeps all of A and B in train and all of C in test. No ID is split across sets, so overlap is empty.",
  },
  {
    id: "q3",
    prompt:
      "Person **D** arrives with two new sessions and must never appear in training. Both of D's rows belong in **test only**. Which split strategy matches that evaluation?",
    choices: [
      "Row split (sessions of the same person can straddle train and test)",
      "Person split (each person stays entirely in one set)",
      "Either split works the same",
      "Shuffle rows without grouping by person",
    ],
    correctIndex: 1,
    missHint:
      "Keep every row from a participant in one set. For a new person D, place both sessions in test and keep D out of train entirely—person-level grouping supports that; row splits do not.",
  },
  {
    id: "q4",
    prompt: "Why can a row split **look optimistic** when rows repeat the same participant?",
    choices: [
      "Train rows are always noisier",
      "The model can memorize person-specific patterns that also appear in test rows from the same ID",
      "Test rows have fewer features",
      "Person split removes all training data",
    ],
    correctIndex: 1,
    missHint:
      "If the same ID appears in both sets, the model may learn quirks of that ID rather than general patterns, so test scores can be misleadingly high.",
  },
  {
    id: "q5",
    prompt: "Which evaluation question does the **row split** best illustrate (even if it is the wrong choice for new people)?",
    choices: [
      "Will the model work on a new participant never seen before?",
      "Does performance hold on another session from participants already represented in training?",
      "Is the dataset free of duplicate images?",
      "Can we skip validation entirely?",
    ],
    correctIndex: 1,
    missHint:
      "Row split mixes sessions from the same people across sets. That mirrors asking about another session from someone already present—not a wholly new person.",
  },
];

export function choiceLabel(questionId, choiceIndex) {
  const q = QUESTIONS.find((x) => x.id === questionId);
  if (!q || choiceIndex === null || choiceIndex === undefined) return "";
  return q.choices[choiceIndex] ?? "";
}

export function gradeChoice(questionId, choiceIndex) {
  const q = QUESTIONS.find((x) => x.id === questionId);
  if (!q) throw new Error(`unknown question ${questionId}`);
  return choiceIndex === q.correctIndex;
}

export function scoreFirstAttempts(firstAttempts) {
  let correct = 0;
  let answered = 0;
  for (const q of QUESTIONS) {
    const idx = firstAttempts[q.id];
    if (idx === null || idx === undefined) continue;
    answered += 1;
    if (gradeChoice(q.id, idx)) correct += 1;
  }
  return { correct, answered, total: QUESTIONS.length };
}

export const STORAGE_KEY = "recall-studio-independent-demo-v1";

export function emptyState() {
  return {
    firstAttempts: Object.fromEntries(QUESTIONS.map((q) => [q.id, null])),
    retryCorrect: Object.fromEntries(QUESTIONS.map((q) => [q.id, null])),
    retryChoices: Object.fromEntries(QUESTIONS.map((q) => [q.id, null])),
    journal: [],
    practiceRating: null,
    practiceRevealed: false,
  };
}

export function sanitizeState(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  try {
    for (const q of QUESTIONS) {
      const fa = raw.firstAttempts?.[q.id];
      if (typeof fa === "number" && fa >= 0 && fa < q.choices.length) {
        base.firstAttempts[q.id] = fa;
      }
      const rc = raw.retryChoices?.[q.id];
      if (typeof rc === "number" && rc >= 0 && rc < q.choices.length) {
        base.retryChoices[q.id] = rc;
        base.retryCorrect[q.id] = gradeChoice(q.id, rc);
      }
    }
    if (Array.isArray(raw.journal)) {
      base.journal = raw.journal.filter(
        (e) =>
          e &&
          typeof e.questionId === "string" &&
          typeof e.feedback === "string" &&
          QUESTIONS.some((q) => q.id === e.questionId),
      );
    }
    if (raw.practiceRating === "matched" || raw.practiceRating === "partly" || raw.practiceRating === "off") {
      base.practiceRating = raw.practiceRating;
    }
    base.practiceRevealed = Boolean(raw.practiceRevealed);
  } catch {
    return emptyState();
  }
  return base;
}

export function applyFirstAnswer(state, questionId, choiceIndex) {
  const next = structuredClone(state);
  if (next.firstAttempts[questionId] !== null) return next;
  next.firstAttempts[questionId] = choiceIndex;
  if (!gradeChoice(questionId, choiceIndex)) {
    const q = QUESTIONS.find((x) => x.id === questionId);
    next.journal.push({
      questionId,
      firstWrongChoice: choiceIndex,
      firstWrongLabel: choiceLabel(questionId, choiceIndex),
      feedback: q.missHint,
    });
  }
  return next;
}

export function applyRetry(state, questionId, choiceIndex) {
  const next = structuredClone(state);
  next.retryChoices[questionId] = choiceIndex;
  next.retryCorrect[questionId] = gradeChoice(questionId, choiceIndex);
  return next;
}

/** Future GitHub Pages project site path prefix (repo erfanpj/recall-studio). */
export const PAGES_PATH_PREFIX = "/recall-studio";
