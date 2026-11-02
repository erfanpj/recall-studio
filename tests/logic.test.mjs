import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  rowSplitMembership,
  personSplitMembership,
  QUESTIONS,
  gradeChoice,
  applyFirstAnswer,
  scoreFirstAttempts,
  emptyState,
  STORAGE_KEY,
} from "../demo/logic.js";

describe("splits", () => {
  it("row split overlaps all three IDs", () => {
    const { overlapIds } = rowSplitMembership();
    assert.deepEqual(overlapIds, ["A", "B", "C"]);
  });

  it("person split has empty overlap", () => {
    const { overlapIds } = personSplitMembership();
    assert.deepEqual(overlapIds, []);
  });
});

describe("grading", () => {
  it("has five questions with deterministic keys", () => {
    assert.equal(QUESTIONS.length, 5);
    assert.ok(gradeChoice("q3", 1));
    assert.ok(!gradeChoice("q3", 0));
  });

  it("records first attempt once and scores separately from retry", () => {
    let s = emptyState();
    s = applyFirstAnswer(s, "q1", 0);
    assert.equal(s.firstAttempts.q1, 0);
    s = applyFirstAnswer(s, "q1", 1);
    assert.equal(s.firstAttempts.q1, 0);
    const { correct, answered } = scoreFirstAttempts(s.firstAttempts);
    assert.equal(answered, 1);
    assert.equal(correct, 0);
  });

  it("journal entry on first miss", () => {
    let s = applyFirstAnswer(emptyState(), "q2", 2);
    assert.equal(s.journal.length, 1);
    assert.match(s.journal[0].feedback, /Person split/);
  });
});

describe("storage key", () => {
  it("is app-specific", () => {
    assert.match(STORAGE_KEY, /^recall-studio-independent/);
  });
});
