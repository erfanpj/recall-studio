import {
  ROWS,
  QUESTIONS,
  STORAGE_KEY,
  emptyState,
  applyFirstAnswer,
  applyRetry,
  scoreFirstAttempts,
  rowSplitMembership,
  personSplitMembership,
} from "./logic.js";

const $ = (sel, root = document) => root.querySelector(sel);

let state = emptyState();
let storageOk = true;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch {
    storageOk = false;
    return emptyState();
  }
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

function membershipLabel(row, kind) {
  const { train, test } = kind === "row" ? rowSplitMembership() : personSplitMembership();
  const inTrain = train.some((r) => r.label === row.label);
  return inTrain ? "Train" : "Test";
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
      const set = membershipLabel(r, kind);
      tr.innerHTML = `
        <td><span class="id-chip">${r.id}</span> session ${r.session}</td>
        <td><span class="set set-${set.toLowerCase()}"><span class="set-icon" aria-hidden="true">${set === "Train" ? "▣" : "▢"}</span> ${set}</span></td>`;
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
    li.innerHTML = `<strong>${q.prompt.replace(/\*\*/g, "")}</strong><p>${entry.feedback}</p>`;
    list.appendChild(li);
  }
}

function renderQuestions() {
  const host = $("#questions");
  host.replaceChildren();
  QUESTIONS.forEach((q, qi) => {
    const field = document.createElement("fieldset");
    field.className = "question";
    const legend = document.createElement("legend");
    legend.innerHTML = `Question ${qi + 1}`;
    field.appendChild(legend);
    const p = document.createElement("p");
    p.innerHTML = q.prompt.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    field.appendChild(p);
    const firstIdx = state.firstAttempts[q.id];
    const retry = state.retryCorrect[q.id];
    q.choices.forEach((choice, ci) => {
      const id = `${q.id}-c${ci}`;
      const label = document.createElement("label");
      label.className = "choice";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = q.id;
      input.id = id;
      input.value = String(ci);
      if (firstIdx === ci) input.checked = true;
      input.addEventListener("change", () => {
        if (state.firstAttempts[q.id] === null) {
          state = applyFirstAnswer(state, q.id, ci);
          saveState();
          renderAll();
        }
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(choice));
      field.appendChild(label);
    });
    const status = document.createElement("p");
    status.className = "status";
    if (firstIdx === null) status.textContent = "Unanswered on first attempt.";
    else if (gradeFirst(q.id, firstIdx)) status.textContent = "First attempt: correct.";
    else status.textContent = "First attempt: incorrect (see journal).";
    field.appendChild(status);

    if (firstIdx !== null && !gradeFirst(q.id, firstIdx)) {
      const retryField = document.createElement("div");
      retryField.className = "retry";
      retryField.innerHTML = "<p><strong>Retry</strong> (does not change first-attempt score)</p>";
      q.choices.forEach((choice, ci) => {
        const rid = `${q.id}-retry-${ci}`;
        const label = document.createElement("label");
        label.className = "choice";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `${q.id}-retry`;
        input.id = rid;
        input.value = String(ci);
        input.addEventListener("change", () => {
          state = applyRetry(state, q.id, ci);
          saveState();
          renderAll();
        });
        label.appendChild(input);
        label.appendChild(document.createTextNode(choice));
        retryField.appendChild(label);
      });
      const retryStatus = document.createElement("p");
      retryStatus.className = "status";
      if (retry === null) retryStatus.textContent = "Retry not recorded yet.";
      else retryStatus.textContent = retry ? "Retry: correct." : "Retry: still incorrect.";
      retryField.appendChild(retryStatus);
      field.appendChild(retryField);
    }
    host.appendChild(field);
  });
}

function gradeFirst(qid, idx) {
  const q = QUESTIONS.find((x) => x.id === qid);
  return idx === q.correctIndex;
}

function renderPractice() {
  const box = $("#practiceRating");
  if (state.practiceRating) {
    box.querySelectorAll("input").forEach((inp) => {
      inp.checked = inp.value === state.practiceRating;
    });
  }
}

function renderAll() {
  renderSplits();
  renderQuestions();
  renderScore();
  renderJournal();
  renderPractice();
}

function bindPractice() {
  $("#practiceRating").addEventListener("change", (ev) => {
    if (ev.target.name === "selfRate") {
      state.practiceRating = ev.target.value;
      saveState();
    }
  });
}

function bindReset() {
  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("Reset this demo only? Scores, journal, and practice rating will clear.")) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    state = emptyState();
    storageOk = true;
    renderAll();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  state = loadState();
  if (!storageOk) showStorageBanner();
  renderAll();
  bindPractice();
  bindReset();
});
