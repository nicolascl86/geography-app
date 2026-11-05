// UI layer: renders screens and wires up events. All quiz rules live in quiz.js.

import { buildRound, pointsFor, maxScore, rating } from "./quiz.js";

const $ = (id) => document.getElementById(id);
const flagUrl = (code, w = 320) => `https://flagcdn.com/w${w}/${code}.png`;
// Regional-indicator emoji ("cy" -> 🇨🇾). Fallback only: Windows doesn't render these.
const flagEmoji = (code) => String.fromCodePoint(...[...code.toUpperCase()].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));

// Flag image that degrades to an emoji if the CDN is unreachable (offline, firewall).
function makeFlag(code, width, alt = "") {
  const img = document.createElement("img");
  img.src = flagUrl(code, width);
  img.alt = alt;
  img.className = "flag";
  img.addEventListener("error", () => {
    const span = document.createElement("span");
    span.className = "flag flag-emoji";
    span.textContent = flagEmoji(code);
    span.setAttribute("role", "img");
    span.setAttribute("aria-label", alt || "flag");
    if (!alt) span.setAttribute("aria-hidden", "true");
    img.replaceWith(span);
  }, { once: true });
  return img;
}

const MODE_NAMES = { capitals: "Capitals", flags: "Flags", continents: "Continents", population: "Population", mixed: "Mixed bag" };
const DIFFICULTY_HINTS = {
  easy: "Well-known countries. A gentle warm-up.",
  medium: "Adds countries most people have heard of, but couldn't find on a map.",
  hard: "Every country, with tricky neighbours as the wrong answers.",
};

const state = { mode: null, difficulty: "easy", questions: [], index: 0, score: 0, streak: 0, correct: 0, answers: [] };

// ---------- Persistence (best scores). Storage can be blocked; never let that break the game. ----------
const BEST_KEY = "globetrotter.best.v1";
function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch { return {}; }
}
function saveBest(best) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* ignore */ }
}

// ---------- Screens ----------
function show(screen) {
  for (const s of ["home", "quiz", "results"]) $(`screen-${s}`).hidden = s !== screen;
  window.scrollTo(0, 0);
}

function renderHome() {
  const best = loadBest();
  for (const el of document.querySelectorAll("[data-best]")) {
    const score = best[`${el.dataset.best}:${state.difficulty}`];
    el.textContent = score ? `Best: ${score}` : "";
  }
  for (const btn of document.querySelectorAll("[data-difficulty]")) {
    btn.setAttribute("aria-checked", String(btn.dataset.difficulty === state.difficulty));
  }
  $("difficulty-hint").textContent = DIFFICULTY_HINTS[state.difficulty];
  show("home");
}

function startRound(mode) {
  Object.assign(state, { mode, questions: buildRound(mode, state.difficulty), index: 0, score: 0, streak: 0, correct: 0, answers: [] });
  $("progress").setAttribute("aria-valuemax", state.questions.length);
  show("quiz");
  renderQuestion();
}

function renderQuestion() {
  const q = state.questions[state.index];
  const total = state.questions.length;

  $("counter").textContent = `Question ${state.index + 1} of ${total}`;
  $("progress-fill").style.width = `${(state.index / total) * 100}%`;
  $("progress").setAttribute("aria-valuenow", state.index);
  $("score").textContent = state.score;
  $("streak").textContent = state.streak >= 2 ? `🔥 ${state.streak} in a row` : "";
  $("prompt").textContent = q.prompt;

  // Main flag: large for flag questions, small "context" flag otherwise.
  const wrap = $("flag-wrap");
  wrap.hidden = !q.flag;
  wrap.classList.toggle("compact", q.type !== "flags");
  // Alt text must not give the answer away on flag questions.
  wrap.replaceChildren(...(q.flag ? [makeFlag(q.flag, q.type === "flags" ? 640 : 160, q.type === "flags" ? "Mystery flag" : "")] : []));

  const opts = $("options");
  opts.replaceChildren();
  opts.classList.toggle("pair", q.options.length === 2);
  q.options.forEach((o, i) => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.dataset.index = i;
    if (o.flag) {
      btn.append(makeFlag(o.flag, 320));
    }
    const key = document.createElement("span");
    key.className = "key";
    key.textContent = i + 1;
    const label = document.createElement("span");
    label.textContent = o.label;
    btn.append(key, label);
    btn.addEventListener("click", () => answer(i));
    opts.append(btn);
  });

  $("feedback").hidden = true;
  preloadNext();
}

function preloadNext() {
  const next = state.questions[state.index + 1];
  if (!next) return;
  if (next.flag) new Image().src = flagUrl(next.flag, next.type === "flags" ? 640 : 160);
  for (const o of next.options) if (o.flag) new Image().src = flagUrl(o.flag, 320);
}

function answer(choice) {
  const q = state.questions[state.index];
  if (!$("feedback").hidden) return; // already answered

  const isRight = choice === q.answerIndex;
  let gained = 0;
  if (isRight) {
    state.streak += 1;
    state.correct += 1;
    gained = pointsFor(state.difficulty, state.streak);
    state.score += gained;
  } else {
    state.streak = 0;
  }
  state.answers.push({ q, choice, isRight });

  for (const btn of $("options").children) {
    const i = Number(btn.dataset.index);
    btn.disabled = true;
    if (i === q.answerIndex) btn.classList.add("correct");
    else if (i === choice) btn.classList.add("wrong");
    else btn.classList.add("dim");
  }

  const fb = $("feedback");
  fb.className = `feedback ${isRight ? "good" : "bad"}`;
  $("feedback-text").textContent = isRight ? `Correct! +${gained}. ${q.explanation}` : `Not quite. ${q.explanation}`;
  $("next").textContent = state.index + 1 === state.questions.length ? "See results →" : "Next →";
  fb.hidden = false;
  $("score").textContent = state.score;
  $("next").focus();
}

function next() {
  state.index += 1;
  if (state.index < state.questions.length) renderQuestion();
  else renderResults();
}

function renderResults() {
  const total = state.questions.length;
  $("final-score").textContent = state.score;
  $("result-line").textContent = `${state.correct} / ${total} correct · ${MODE_NAMES[state.mode]} · ${cap(state.difficulty)} · max ${maxScore(state.difficulty, total)}`;
  $("rating").textContent = rating(state.correct, total);

  const best = loadBest();
  const key = `${state.mode}:${state.difficulty}`;
  const isBest = state.score > 0 && state.score > (best[key] || 0);
  if (isBest) { best[key] = state.score; saveBest(best); }
  $("new-best").hidden = !isBest;
  $("toast").hidden = true;

  const list = $("review");
  list.replaceChildren();
  for (const { q, choice, isRight } of state.answers) {
    const li = document.createElement("li");
    const mark = document.createElement("span");
    mark.className = isRight ? "ok" : "no";
    mark.textContent = isRight ? "✓ " : "✗ ";
    const detail = document.createElement("small");
    detail.textContent = isRight ? q.explanation : `You said ${q.options[choice].label}. ${q.explanation}`;
    li.append(mark, q.prompt, detail);
    list.append(li);
  }
  $("review-wrap").open = state.correct < total;
  show("results");
}

async function share() {
  const text = `🌍 I scored ${state.score} (${state.correct}/${state.questions.length}) on Globetrotter: ${MODE_NAMES[state.mode]}, ${cap(state.difficulty)}. Beat that!`;
  const url = location.href.split("#")[0];
  try {
    if (navigator.share) { await navigator.share({ title: "Globetrotter", text, url }); return; }
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast("Copied to clipboard. Go brag.");
  } catch (err) {
    if (err?.name !== "AbortError") toast("Couldn't share. Screenshot it instead!");
  }
}

function toast(msg) {
  $("toast").textContent = msg;
  $("toast").hidden = false;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// ---------- Events ----------
$("modes").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-mode]");
  if (btn) startRound(btn.dataset.mode);
});
$("difficulty").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-difficulty]");
  if (btn) { state.difficulty = btn.dataset.difficulty; renderHome(); }
});
$("next").addEventListener("click", next);
$("quit").addEventListener("click", renderHome);
$("home").addEventListener("click", renderHome);
$("again").addEventListener("click", () => startRound(state.mode));
$("share").addEventListener("click", share);

// Keyboard: 1–4 to answer, Enter/Space handled natively by the focused Next button.
document.addEventListener("keydown", (e) => {
  if ($("screen-quiz").hidden || !$("feedback").hidden) return;
  const n = Number(e.key);
  const q = state.questions[state.index];
  if (n >= 1 && n <= q.options.length) answer(n - 1);
});

renderHome();
