import {
  ROWS,
  QUESTIONS,
  STORAGE_KEY,
  emptyState,
  sanitizeState,
  applyFirstAnswer,
  applyRetry,
  scoreFirstAttempts,
  rowSplitMembership,
  personSplitMembership,
  choiceLabel,
  gradeChoice,
} from "./logic.js";

const $ = (sel, root = document) => root.querySelector(sel);

let state = emptyState();
let storageOk = true;

function storageAvailable() {
  try {
    localStorage.getItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyState();
  return sanitizeState(JSON.parse(raw));
}

function saveState() {
  if (!storageOk) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    storageOk = false;
    showStorageBanner();
  }
}

function showStorageBanner() {
  const el = $("#storageBanner");
  if (el) el.hidden = false;
}

function setForRow(row, kind) {
  const data = kind === "row" ? rowSplitMembership() : personSplitMembership();
  return data.train.some((r) => r.label === row.label) ? "train" : "test";
}

function renderSplitDiagrams() {
  const host = $("#splitDiagrams");
  host.replaceChildren();
  for (const kind of ["row", "person"]) {
    const wrap = document.createElement("div");
    wrap.className = `diagram diagram-${kind}`;
    const title = document.createElement("p");
    title.className = "diagram-title";
    title.textContent = kind === "row" ? "Row split — sessions cross sets" : "Person split — whole IDs stay together";
    wrap.appendChild(title);
    const grid = document.createElement("div");
    grid.className = "participant-grid";
    grid.setAttribute("role", "img");
    grid.setAttribute(
      "aria-label",
      kind === "row"
        ? "Row split: every participant has one train and one test session"
        : "Person split: A and B train only, C test only",
    );
    for (const row of ROWS) {
      const cell = document.createElement("span");
      const set = setForRow(row, kind);
      cell.className = `cell cell-${set}`;
      cell.textContent = `${row.id}${row.session}`;
      cell.title = `${row.label} — ${set === "train" ? "Train" : "Test"}`;
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    host.appendChild(wrap);
  }
}

function renderSplits() {
  const row = rowSplitMembership();
  const person = personSplitMembership();
  for (const kind of ["row", "person"]) {
    const data = kind === "row" ? row : person;
    const tbody = $(`#split-${kind} tbody`);
    tbody.replaceChildren();
    for (const r of ROWS) {
      const tr = document.createElement("tr");
      const set = setForRow(r, kind);
      const setLabel = set === "train" ? "Train" : "Test";
      tr.innerHTML = `
        <td><span class="id-chip">${r.id}</span> session ${r.session}</td>
        <td><span class="set set-${set}"><span class="set-icon" aria-hidden="true">${set === "train" ? "▣" : "▢"}</span> ${setLabel}</span></td>`;
      tbody.appendChild(tr);
    }
    $(`#overlap-${kind}`).textContent =
      data.overlapIds.length === 0 ? "None" : data.overlapIds.join(", ");
    $(`#train-ids-${kind}`).textContent = [...new Set(data.train.map((x) => x.id))].sort().join(", ");
    $(`#test-ids-${kind}`).textContent = [...new Set(data.test.map((x) => x.id))].sort().join(", ");
  }
}

function renderScore() {
  const { correct, answered, total } = scoreFirstAttempts(state.firstAttempts);
  $("#scoreLine").textContent = `First-attempt score: ${correct} / ${total} (${answered} answered)`;
}

function renderJournal() {
  const list = $("#journalList");
  list.replaceChildren();
  if (state.journal.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No misses yet — your first wrong answers will appear here with a short hint.";
    li.className = "empty";
    list.appendChild(li);
    return;
  }
  for (const entry of state.journal) {
    const q = QUESTIONS.find((x) => x.id === entry.questionId);
    const li = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = q.prompt.replace(/\*\*/g, "");
    li.appendChild(title);
    const picked = document.createElement("p");
    picked.textContent = `Your first pick: ${entry.firstWrongLabel || choiceLabel(entry.questionId, entry.firstWrongChoice)}`;
    li.appendChild(picked);
    const hint = document.createElement("p");
    hint.textContent = entry.feedback;
    li.appendChild(hint);
    list.appendChild(li);
  }
}

function renderQuestions() {
  const host = $("#questions");
  host.replaceChildren();
  QUESTIONS.forEach((q, qi) => {
    const field = document.createElement("fieldset");
    field.className = "question";
    field.dataset.questionId = q.id;
    const legend = document.createElement("legend");
    legend.textContent = `Question ${qi + 1}`;
    field.appendChild(legend);
    const p = document.createElement("p");
    p.innerHTML = q.prompt.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    field.appendChild(p);
    const firstIdx = state.firstAttempts[q.id];
    const locked = firstIdx !== null;
    const retryChoice = state.retryChoices[q.id];
    q.choices.forEach((choice, ci) => {
      const id = `${q.id}-c${ci}`;
      const label = document.createElement("label");
      label.className = "choice";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = q.id;
      input.id = id;
      input.value = String(ci);
      input.disabled = locked;
      if (locked && firstIdx === ci) input.checked = true;
      if (!locked) {
        input.addEventListener("change", () => {
          state = applyFirstAnswer(state, q.id, ci);
          saveState();
          renderAll();
          const status = field.querySelector(".status-first");
          status?.focus();
        });
      }
      label.appendChild(input);
      label.appendChild(document.createTextNode(choice));
      field.appendChild(label);
    });
    const status = document.createElement("p");
    status.className = "status status-first";
    status.tabIndex = -1;
    if (firstIdx === null) status.textContent = "Unanswered on first attempt.";
    else if (gradeChoice(q.id, firstIdx)) status.textContent = "First attempt: correct.";
    else status.textContent = `First attempt: incorrect — locked to “${choiceLabel(q.id, firstIdx)}”.`;
    field.appendChild(status);

    if (locked && !gradeChoice(q.id, firstIdx)) {
      const retryField = document.createElement("div");
      retryField.className = "retry";
      const retryLead = document.createElement("p");
      retryLead.innerHTML = "<strong>Try again</strong> (does not change your first-attempt score)";
      retryField.appendChild(retryLead);
      q.choices.forEach((choice, ci) => {
        const rid = `${q.id}-retry-${ci}`;
        const label = document.createElement("label");
        label.className = "choice";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `${q.id}-retry`;
        input.id = rid;
        input.value = String(ci);
        if (retryChoice === ci) input.checked = true;
        input.addEventListener("change", () => {
          state = applyRetry(state, q.id, ci);
          saveState();
          renderAll();
          retryField.querySelector(".status-retry")?.focus();
        });
        label.appendChild(input);
        label.appendChild(document.createTextNode(choice));
        retryField.appendChild(label);
      });
      const retryStatus = document.createElement("p");
      retryStatus.className = "status status-retry";
      retryStatus.tabIndex = -1;
      if (retryChoice === null) retryStatus.textContent = "Retry not recorded yet.";
      else if (state.retryCorrect[q.id]) retryStatus.textContent = "Retry: correct.";
      else retryStatus.textContent = `Retry: still incorrect — you chose “${choiceLabel(q.id, retryChoice)}”.`;
      retryField.appendChild(retryStatus);
      field.appendChild(retryField);
    }
    host.appendChild(field);
  });
}

function renderPractice() {
  const explanation = $("#practiceExplanation");
  const rating = $("#practiceRating");
  explanation.hidden = !state.practiceRevealed;
  rating.hidden = !state.practiceRevealed;
  rating.querySelectorAll("input").forEach((inp) => {
    inp.checked = state.practiceRating === inp.value;
  });
  $("#revealPracticeBtn").hidden = state.practiceRevealed;
}

function renderAll() {
  renderSplitDiagrams();
  renderSplits();
  renderQuestions();
  renderScore();
  renderJournal();
  renderPractice();
}

function bindPractice() {
  $("#revealPracticeBtn").addEventListener("click", () => {
    state.practiceRevealed = true;
    saveState();
    renderPractice();
    $("#practiceExplanation")?.focus();
  });
  $("#practiceRating").addEventListener("change", (ev) => {
    if (ev.target.name === "selfRate") {
      state.practiceRating = ev.target.value;
      saveState();
    }
  });
}

function bindReset() {
  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("Reset this lesson? Scores, journal, and practice notes will clear.")) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    state = emptyState();
    storageOk = true;
    $("#storageBanner").hidden = true;
    renderAll();
    $("#intro-heading")?.focus();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.documentElement.dataset.storageUnavailable === "1") {
    storageOk = false;
    state = emptyState();
    showStorageBanner();
  } else {
    storageOk = storageAvailable();
    state = storageOk ? loadState() : emptyState();
    if (!storageOk) showStorageBanner();
  }
  renderAll();
  bindPractice();
  bindReset();
});
