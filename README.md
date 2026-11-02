# Recall Studio (independent exercise)

Original browser demo about **train/test splits when measurements repeat the same fictional participant**. This is a new portfolio exercise—not a recovered historical product.

## Problem

Repeated rows from the same person can leak into both train and test. The demo shows six toy rows (A/B/C × two sessions) under a **row split** and a **person split**, then asks five fixed multiple-choice questions. First attempts are scored once; retries and self-rated practice are separate.

## One-minute walkthrough

1. Open the demo and read both split tables plus the ID overlap lists.
2. Answer the five questions — your first choice locks for scoring.
3. If you miss, read the journal hint and try the retry block (retry does not change the first-attempt score).
4. Optionally self-rate the model explanation under Practice.
5. Reload to confirm progress persists; use **Reset this demo** to clear only this app’s storage key.

## Tests

```bash
npm test
npm run verify:demo
```

`npm test` runs deterministic split and grading logic. `verify:demo` serves the demo under the future Pages path `/recall-studio/demo/` and checks overlap text plus a sample answer flow in headless Chrome/Edge.

## Engineering decision

**First-attempt answers are immutable in state** so interviewers can trust the displayed score; retries and practice ratings live in parallel fields instead of overwriting history.

## Limitation

No model is trained—only split membership and quiz logic. The exercise does not generalize to every real dataset layout.

## Local preview

Serve the parent folder so the URL includes the subdirectory:

```bash
python -m http.server 8801 --directory ..
# open http://127.0.0.1:8801/recall-studio-independent/demo/
```

(Future GitHub Pages project site: `/recall-studio/demo/` relative to the owner site root.)
