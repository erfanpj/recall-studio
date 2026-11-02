/** Pure logic for splits, grading, and storage helpers (importable in Node tests). */

export const ROWS = [
  { id: "A", session: 1, label: "A · session 1" },
  { id: "A", session: 2, label: "A · session 2" },
  { id: "B", session: 1, label: "B · session 1" },
  { id: "B", session: 2, label: "B · session 2" },
  { id: "C", session: 1, label: "C · session 1" },
  { id: "C", session: 2, label: "C · session 2" },
];

/** Row split: first session of each person in train, second in test → every ID overlaps. */
export function rowSplitMembership() {
  const train = [];
  const test = [];
  for (const row of ROWS) {
    const bucket = row.session === 1 ? train : test;
    bucket.push(row);
  }
  return { train, test, overlapIds: overlapParticipantIds(train, test) };
}

/** Person split: A and B entirely in train; C entirely in test → no overlap. */
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
      "You will evaluate on a **brand-new person D** who was never in training. Which split strategy matches that question?",
    choices: [
      "Row split (sessions of the same person can straddle train and test)",
      "Person split (each person stays entirely in one set)",
      "Either split works the same",
      "Shuffle rows without grouping by person",
    ],
    correctIndex: 1,
    missHint:
      "A new person needs every row from known people kept out of the test fold for that person. Person-level grouping prevents train rows from leaking identity patterns into test.",
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
    journal: [],
    practiceRating: null,
  };
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
      feedback: q.missHint,
    });
  }
  return next;
}

export function applyRetry(state, questionId, choiceIndex) {
  const next = structuredClone(state);
  next.retryCorrect[questionId] = gradeChoice(questionId, choiceIndex);
  return next;
}
