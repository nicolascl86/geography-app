# 🌍 Globetrotter: Geography Quiz

A fast, no-install geography quiz for the browser. Four quiz types, three difficulty levels, streak scoring and saved personal bests.

| Mode | Question |
|---|---|
| 🏛️ Capitals | "What is the capital of Bhutan?" |
| 🚩 Flags | Identify the country from its flag |
| 🗺️ Continents | "Which continent is Suriname in?" |
| 👥 Population | Pick the more populous of two countries |
| 🎲 Mixed bag | A random mix of all four |

**Difficulty:** *Easy* uses only well-known countries. *Medium* adds the next tier. *Hard* uses all ~130 countries, and the wrong answers come from the **same continent** (Riga vs Tallinn, not Riga vs Tokyo).

**Scoring:** 100 points per correct answer × difficulty (1× / 1.5× / 2×), plus +20 per answer in a streak (capped at +100).

## Run it

No build step, no dependencies.

```bash
npm start          # or: python3 -m http.server 8000
# open http://localhost:8000
```

> It has to be served over `http://`. Double-clicking `index.html` won't work, because browsers block ES modules on `file://`.

```bash
npm test           # unit tests (Node 20+, uses the built-in test runner)
```

## Deploy (free)

GitHub → **Settings → Pages → Deploy from branch → `main` / root**. Done.

## How it's built

```
index.html        Screens (home / quiz / results) as plain HTML
src/data.js       The facts: countries, capitals, continents, populations, difficulty tier
src/quiz.js       Pure game logic: build rounds, pick wrong answers, score. No DOM.
src/app.js        UI layer: renders screens, handles clicks and keys, saves best scores
src/style.css     Styling (light + dark mode)
tests/            Node tests for the data and the quiz logic
```

The rule is that **`quiz.js` never touches the page**. That keeps the game rules testable without a browser (the tests generate thousands of random rounds to check for duplicate options, wrong answer keys and so on). It also means a new quiz type is mostly a new builder function in one file.

### Data decisions worth knowing
- **Transcontinental countries** (Russia, Türkiye, Cyprus, the Caucasus) have `continent: null`. They still appear in the capitals, flags and population quizzes, but never in "Which continent?" questions, because the quiz shouldn't be arguable.
- **Populations** are rounded ~2024 estimates. Population questions only pair countries that differ by at least 30% (`MIN_POP_RATIO`), so the rounding can never flip an answer.
- **Flags** load from [flagcdn.com](https://flagcdn.com). If that's unreachable, the app falls back to emoji flags.

## Ideas for v2
- Click-the-map mode (SVG world map)
- Timed / "sudden death" mode
- Daily challenge (same 10 questions for everyone, seeded by date)
- Localisation (Greek 🇬🇷)
