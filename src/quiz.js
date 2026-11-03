// Pure quiz logic — no DOM access, so it can be unit-tested in Node.
// Randomness is injected (`rng`) so tests can be deterministic.

import { COUNTRIES, CONTINENTS } from "./data.js";

export const MODES = ["capitals", "flags", "continents", "population", "mixed"];
export const DIFFICULTIES = { easy: 1, medium: 2, hard: 3 };
export const ROUND_LENGTH = 10;
export const OPTION_COUNT = 4;
// Population data is approximate, so only compare countries that differ clearly.
export const MIN_POP_RATIO = 1.3;

// "the Netherlands", "the United Kingdom" — but "France".
export const withThe = (c, capitalise = false) => (c.the ? (capitalise ? "The " : "the ") : "") + c.name;

const MULTIPLIER = { easy: 1, medium: 1.5, hard: 2 };

export function shuffle(items, rng = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function poolFor(difficulty, countries = COUNTRIES) {
  const maxTier = DIFFICULTIES[difficulty];
  if (!maxTier) throw new Error(`Unknown difficulty: ${difficulty}`);
  return countries.filter((c) => c.tier <= maxTier);
}

// Pick `count` wrong answers. On Hard, prefer same-continent distractors
// (Riga vs Tallinn is harder than Riga vs Tokyo).
function pickDistractors(answer, pool, getLabel, count, difficulty, rng) {
  const correctLabel = getLabel(answer);
  const seen = new Set([correctLabel]);
  const candidates = pool.filter((c) => c.code !== answer.code);
  const ordered =
    difficulty === "hard" && answer.continent
      ? [
          ...shuffle(candidates.filter((c) => c.continent === answer.continent), rng),
          ...shuffle(candidates.filter((c) => c.continent !== answer.continent), rng),
        ]
      : shuffle(candidates, rng);

  const out = [];
  for (const c of ordered) {
    const label = getLabel(c);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(c);
    if (out.length === count) break;
  }
  return out;
}

function multipleChoice({ type, prompt, answer, pool, getLabel, withFlags, difficulty, rng, flag, explanation }) {
  const distractors = pickDistractors(answer, pool, getLabel, OPTION_COUNT - 1, difficulty, rng);
  const options = shuffle([answer, ...distractors], rng).map((c) => ({
    label: getLabel(c),
    flag: withFlags ? c.code : null,
    correct: c.code === answer.code,
  }));
  return { type, prompt, flag, options, answerIndex: options.findIndex((o) => o.correct), explanation };
}

const builders = {
  capitals(country, pool, difficulty, rng) {
    return multipleChoice({
      type: "capitals",
      prompt: `What is the capital of ${withThe(country)}?`,
      answer: country,
      pool,
      getLabel: (c) => c.capital,
      withFlags: false,
      difficulty,
      rng,
      flag: country.code,
      explanation: `The capital of ${withThe(country)} is ${country.capital}.`,
    });
  },

  flags(country, pool, difficulty, rng) {
    return multipleChoice({
      type: "flags",
      prompt: "Which country does this flag belong to?",
      answer: country,
      pool,
      getLabel: (c) => c.name,
      withFlags: false,
      difficulty,
      rng,
      flag: country.code,
      explanation: `That's the flag of ${withThe(country)}.`,
    });
  },

  continents(country, _pool, _difficulty, rng) {
    const wrong = shuffle(CONTINENTS.filter((c) => c !== country.continent), rng).slice(0, OPTION_COUNT - 1);
    const options = shuffle([country.continent, ...wrong], rng).map((label) => ({
      label,
      flag: null,
      correct: label === country.continent,
    }));
    return {
      type: "continents",
      prompt: `Which continent is ${withThe(country)} in?`,
      flag: country.code,
      options,
      answerIndex: options.findIndex((o) => o.correct),
      explanation: `${withThe(country, true)} is in ${country.continent}.`,
    };
  },

  population(country, pool, _difficulty, rng) {
    const rivals = shuffle(
      pool.filter((c) => {
        if (c.code === country.code) return false;
        const ratio = Math.max(c.pop, country.pop) / Math.min(c.pop, country.pop);
        return ratio >= MIN_POP_RATIO;
      }),
      rng
    );
    const rival = rivals[0];
    if (!rival) return null;
    const pair = shuffle([country, rival], rng);
    const bigger = pair[0].pop > pair[1].pop ? pair[0] : pair[1];
    const options = pair.map((c) => ({ label: c.name, flag: c.code, correct: c.code === bigger.code }));
    return {
      type: "population",
      prompt: "Which country has the larger population?",
      flag: null,
      options,
      answerIndex: options.findIndex((o) => o.correct),
      explanation: `${pair[0].name}: ~${formatPop(pair[0].pop)} · ${pair[1].name}: ~${formatPop(pair[1].pop)}`,
    };
  },
};

export function formatPop(millions) {
  if (millions >= 1000) return `${(millions / 1000).toFixed(2)} billion`;
  if (millions >= 1) return `${Number(millions.toFixed(1))} million`;
  return `${Math.round(millions * 1000)} thousand`;
}

// Build a full round of questions. No country is the subject of two questions in one round.
export function buildRound(mode, difficulty, { rng = Math.random, length = ROUND_LENGTH, countries = COUNTRIES } = {}) {
  if (!MODES.includes(mode)) throw new Error(`Unknown mode: ${mode}`);
  const pool = poolFor(difficulty, countries);
  const singleTypes = MODES.filter((m) => m !== "mixed");
  const questions = [];

  for (const country of shuffle(pool, rng)) {
    if (questions.length === length) break;
    const type = mode === "mixed" ? singleTypes[Math.floor(rng() * singleTypes.length)] : mode;
    if (type === "continents" && !country.continent) continue;
    const q = builders[type](country, pool, difficulty, rng);
    if (q) questions.push(q);
  }
  return questions;
}

// Points for a correct answer: base × difficulty, plus a streak bonus (capped).
export function pointsFor(difficulty, streak) {
  const base = 100 * MULTIPLIER[difficulty];
  const bonus = Math.min(Math.max(streak - 1, 0) * 20, 100);
  return Math.round(base + bonus);
}

export function maxScore(difficulty, length = ROUND_LENGTH) {
  let total = 0;
  for (let s = 1; s <= length; s++) total += pointsFor(difficulty, s);
  return total;
}

export function rating(correct, total) {
  const pct = total ? correct / total : 0;
  if (pct === 1) return "Flawless. Cartographers fear you.";
  if (pct >= 0.8) return "Excellent — seriously well travelled.";
  if (pct >= 0.6) return "Solid. A few more trips and you're there.";
  if (pct >= 0.4) return "Not bad. The atlas is calling.";
  return "Time to spin the globe and try again!";
}
