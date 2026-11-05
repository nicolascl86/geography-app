import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNTRIES, CONTINENTS } from "../src/data.js";
import { buildRound, poolFor, pointsFor, MODES, MIN_POP_RATIO, formatPop } from "../src/quiz.js";

// Deterministic RNG (mulberry32) so failures are reproducible.
function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("dataset is well-formed", () => {
  const codes = new Set();
  for (const c of COUNTRIES) {
    assert.match(c.code, /^[a-z]{2}$/, c.name);
    assert.ok(!codes.has(c.code), `duplicate code ${c.code}`);
    codes.add(c.code);
    assert.ok(c.name && c.capital, c.code);
    assert.ok(c.continent === null || CONTINENTS.includes(c.continent), `${c.name} continent`);
    assert.ok(c.pop > 0, `${c.name} pop`);
    assert.ok([1, 2, 3].includes(c.tier), `${c.name} tier`);
  }
});

test("difficulty pools grow with difficulty", () => {
  const e = poolFor("easy").length, m = poolFor("medium").length, h = poolFor("hard").length;
  assert.ok(e >= 25 && e < m && m < h && h === COUNTRIES.length);
});

for (const mode of MODES) {
  for (const difficulty of ["easy", "medium", "hard"]) {
    test(`${mode}/${difficulty}: rounds are valid across many seeds`, () => {
      for (let seed = 1; seed <= 200; seed++) {
        const round = buildRound(mode, difficulty, { rng: seeded(seed) });
        assert.equal(round.length, 10);
        for (const q of round) {
          const labels = q.options.map((o) => o.label);
          assert.equal(new Set(labels).size, labels.length, `duplicate options: ${labels}`);
          assert.equal(q.options.filter((o) => o.correct).length, 1);
          assert.ok(q.options[q.answerIndex].correct);
          assert.equal(q.options.length, q.type === "population" ? 2 : 4);
        }
      }
    });
  }
}

test("continent questions never use transcontinental countries", () => {
  const ambiguous = COUNTRIES.filter((c) => !c.continent).map((c) => c.name);
  for (let seed = 1; seed <= 200; seed++) {
    for (const q of buildRound("continents", "hard", { rng: seeded(seed) })) {
      assert.ok(!ambiguous.some((n) => q.prompt.includes(n)), q.prompt);
    }
  }
});

test("population pairs always differ by the minimum ratio", () => {
  const byName = Object.fromEntries(COUNTRIES.map((c) => [c.name, c]));
  for (let seed = 1; seed <= 200; seed++) {
    for (const q of buildRound("population", "hard", { rng: seeded(seed) })) {
      const [a, b] = q.options.map((o) => byName[o.label]);
      assert.ok(Math.max(a.pop, b.pop) / Math.min(a.pop, b.pop) >= MIN_POP_RATIO);
      assert.equal(q.options[q.answerIndex].label, (a.pop > b.pop ? a : b).name);
    }
  }
});

test("no country appears as the subject twice in a round", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const prompts = buildRound("capitals", "easy", { rng: seeded(seed) }).map((q) => q.prompt);
    assert.equal(new Set(prompts).size, prompts.length);
  }
});

test("scoring rewards difficulty and streaks, with a cap", () => {
  assert.equal(pointsFor("easy", 1), 100);
  assert.equal(pointsFor("hard", 1), 200);
  assert.equal(pointsFor("easy", 3), 140);
  assert.equal(pointsFor("easy", 50), 200); // bonus capped at +100
});

test("formatPop", () => {
  assert.equal(formatPop(1440), "1.44 billion");
  assert.equal(formatPop(10.4), "10.4 million");
  assert.equal(formatPop(84), "84 million");
  assert.equal(formatPop(0.39), "390 thousand");
});
