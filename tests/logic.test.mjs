import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  rowSplitMembership,
  personSplitMembership,
  QUESTIONS,
  gradeChoice,
  applyFirstAnswer,
  applyRetry,
  scoreFirstAttempts,
  emptyState,
  sanitizeState,
  STORAGE_KEY,
} from "../logic.js";

describe("splits", () => {
  it("row split overlaps all three IDs", () => {
    assert.deepEqual(rowSplitMembership().overlapIds, ["A", "B", "C"]);
  });

  it("person split has empty overlap", () => {
    assert.deepEqual(personSplitMembership().overlapIds, []);
  });
});

describe("grading and persistence shape", () => {
  it("locks first attempt in state", () => {
    let s = applyFirstAnswer(emptyState(), "q1", 0);
    s = applyFirstAnswer(s, "q1", 1);
    assert.equal(s.firstAttempts.q1, 0);
  });

  it("stores retry choice index", () => {
    let s = applyFirstAnswer(emptyState(), "q1", 0);
    s = applyRetry(s, "q1", 1);
    assert.equal(s.retryChoices.q1, 1);
    assert.equal(s.retryCorrect.q1, true);
  });

  it("reset-shaped empty clears practice", () => {
    let s = emptyState();
    s.practiceRevealed = true;
    s.practiceRating = "matched";
    s = emptyState();
    assert.equal(s.practiceRevealed, false);
    assert.equal(s.practiceRating, null);
  });

  it("sanitize recovers invalid blobs", () => {
    const s = sanitizeState({ firstAttempts: { q1: 99 }, journal: [{ questionId: "q1", feedback: "x" }] });
    assert.equal(s.firstAttempts.q1, null);
    assert.equal(s.journal.length, 1);
  });

  it("q3 mentions person D test-only framing", () => {
    const q3 = QUESTIONS.find((q) => q.id === "q3");
    assert.match(q3.prompt, /test only/i);
  });
});

describe("storage key", () => {
  it("is app-specific", () => {
    assert.match(STORAGE_KEY, /^recall-studio-independent/);
  });
});
