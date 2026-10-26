# Security+ Mock Exam App — Build Spec

This file is the single source of truth for everyone building the app. Every session reads it first. If something here is unclear or missing, make the most reasonable choice, write it down in `docs/DECISIONS.md` in your PR, and keep going. Do not silently change the interfaces below.

## 1. Goal

A personal web app for taking timed Security+ SY0-701 mock exams from the question bank in `data/secplus-questions.json`. It should feel like the real Pearson VUE exam screen, score like the plan below, and show a CompTIA-style score report plus a full answer review.

Basic and solid beats fancy. No accounts, no server, no build step.

## 2. Tech rules

- Plain HTML, CSS and JavaScript ES modules. No framework, no bundler, no npm dependencies for the app itself.
- Runs as static files. Local run: `python3 -m http.server 8000` from the repo root, then open `http://localhost:8000/app/`.
- Data is loaded with `fetch('../data/secplus-questions.json')`. If that file is missing (it is still being generated), fall back to `../data/batches/batch01.json` and show a small "sample data" banner.
- All saving uses `localStorage`, wrapped in try/catch. The app must still work (without saving) if storage is unavailable.
- Engine tests run with Node's built-in runner: `node --test app/tests/`.
- Works on a laptop screen first; must not break on a phone-width screen.

## 3. File layout and ownership

Each session owns only its files. Never edit another session's files; if you need a change there, note it in `docs/DECISIONS.md`.

```
app/
  index.html              Session B
  css/base.css            Session B   (colors, fonts, layout, buttons)
  css/exam.css            Session B
  css/report.css          Session C
  js/main.js              Session B   (loads data, router, ctx)
  js/engine/paper.js      Session A
  js/engine/score.js      Session A
  js/engine/storage.js    Session A
  js/ui/exam.js           Session B
  js/ui/home.js           Session C
  js/ui/results.js        Session C
  js/ui/review.js         Session C
  tests/engine.test.mjs   Session A
docs/DECISIONS.md         everyone (append only)
```

## 4. Question data (read only)

`data/secplus-questions.json` is an array of records like:

```json
{
  "id": "Q001",
  "domain": 4,
  "objective": "4.9",
  "type": "single",
  "question": "…",
  "options": { "A": "…", "B": "…", "C": "…", "D": "…" },
  "answer": ["D"],
  "marks": 1,
  "difficulty": "medium",
  "explanation": "…",
  "suggested_answer": null,
  "flags": []
}
```

- `type` is `"single"` or `"multi"`. For `"multi"`, the number of correct answers is `answer.length` (or `suggested_answer.length` when that is used).
- Options can go from A up to G.
- `suggested_answer` is non-null when the source key looked wrong. `flags` explains why.
- There are no PBQs in this bank. Code should ignore any record whose type it doesn't know, so PBQs can be added later.

Domain names:
1 General Security Concepts · 2 Threats, Vulnerabilities, and Mitigations · 3 Security Architecture · 4 Security Operations · 5 Security Program Management and Oversight

## 5. Shared data shapes

```js
// Settings (storage key "secplus.v1.settings")
{ useSuggested: true, shuffleOptions: false }

// Paper — what to ask
{
  id: "p_<timestamp>_<random>",
  mode: "full" | "custom" | "retry",
  title: "Full mock exam",
  questionIds: ["Q012", "Q233", …],     // in the order they will be shown
  optionOrder: { "Q012": ["C","A","D","B"] } | null,  // only when shuffleOptions is on
  durationSec: 4800,                    // 0 = untimed
  createdAt: "<ISO date>"
}

// Attempt — an exam in progress (storage key "secplus.v1.inProgress")
{
  paper: Paper,
  responses: { "Q012": ["B"], … },      // missing or [] = unanswered
  flagged: ["Q233"],                    // "flag for review" marks
  currentIndex: 0,
  startedAt: "<ISO>",
  remainingSec: 4800,
  status: "in_progress"
}

// Result — a finished attempt (stored in "secplus.v1.history", newest first, max 200)
{
  id: "r_<timestamp>_<random>",
  paperId, mode, title,
  submittedAt: "<ISO>",
  timeUsedSec: 3910,
  totalMarks: 85, earnedMarks: 72,
  percent: 84.7,                        // one decimal
  scaled: 769,                          // integer 100–900
  passed: true,                         // scaled >= 750
  byDomain: { "1": { correct: 8, total: 10, percent: 80.0 }, … },
  missedObjectives: ["2.4", "4.6"],     // unique, sorted
  flaggedIds: ["Q233"],                 // what was flagged when submitted
  perQuestion: [
    { id: "Q012", response: ["B"], correctAnswer: ["B"], isCorrect: true, usedSuggested: false }
  ]
}

// Stats (storage key "secplus.v1.stats")
{ seen: { "Q012": 3 }, correct: { "Q012": 2 } }
```

## 6. Engine (Session A) — exact exports

`js/engine/paper.js`
- `DOMAIN_WEIGHTS = { 1: 0.12, 2: 0.22, 3: 0.18, 4: 0.28, 5: 0.20 }`
- `DOMAIN_NAMES` — the names from section 4.
- `quotas(count, domains = [1,2,3,4,5])` → `{ "1": n, … }`. Split `count` across the given domains by their weights, renormalized, using the largest-remainder method so the total is exactly `count`. For 85 across all domains this must give `{1:10, 2:19, 3:15, 4:24, 5:17}`.
- `generatePaper(bank, opts, stats, settings)` → `Paper`
  - `opts`: `{ mode, count, domains, durationSec, questionIds, title }`
  - `mode "full"`: 85 questions, all domains, `durationSec` 4800 (80 min).
  - `mode "custom"`: `count` questions from `domains`; `durationSec` given by the caller (0 = untimed).
  - `mode "retry"`: exactly `questionIds` (used for "retry incorrect").
  - Pick questions per domain to meet the quotas, preferring the least-seen questions (`stats.seen`), random among ties. If a domain does not have enough questions, take what it has and fill the rest from other domains by weight; never repeat a question within a paper.
  - Shuffle the final question order so domains are mixed, as on the real exam.
  - If `settings.shuffleOptions`, set `optionOrder` per question to a shuffled list of its option letters; otherwise `optionOrder` is null. Letters stay attached to their text; only display order changes.
  - Accept an optional `opts.seed` for deterministic tests.
- `availableCounts(bank)` → `{ "1": n, … }`

`js/engine/score.js`
- `correctAnswer(q, settings)` → `settings.useSuggested && q.suggested_answer ? q.suggested_answer : q.answer`
- `isCorrect(response, correct)` → true only when the two letter sets are exactly equal (multi-select is all or nothing).
- `toScaled(percent)` → integer. 0% → 100, 83% → 750, 100% → 900, linear between those points: below 83: `100 + 650 * p / 83`; from 83: `750 + 150 * (p - 83) / 17`. Round to the nearest integer.
- `PASS_SCALED = 750`
- `scoreAttempt(attempt, bankById, settings)` → `Result`. Each question is worth its `marks` (1). Unanswered = wrong.

`js/engine/storage.js`
- Key prefix `secplus.v1.`. All functions fail safely (return defaults) if storage throws.
- `loadSettings()`, `saveSettings(s)`
- `loadInProgress()` → Attempt | null, `saveInProgress(a)`, `clearInProgress()`
- `loadHistory()` → Result[], `addResult(r)` (prepend, cap 200), `getResult(id)`
- `loadStats()`, `updateStats(result)` (increments `seen` for every question and `correct` for correct ones), `resetStats()`

`tests/engine.test.mjs` must cover at least: `quotas(85)` exact values; quotas always sum to count; `toScaled` at 0, 83, 100 and one value in each segment; multi-select all-or-nothing; `useSuggested` switching the correct answer; `generatePaper` never repeats a question, meets quotas on a synthetic bank of 417, falls back correctly when a domain is short, and prefers unseen questions.

## 7. App shell and exam screen (Session B)

`index.html` loads the CSS files and `js/main.js` as a module, with one `<div id="app">`.

`js/main.js`
- Loads the bank (with the fallback in section 2), builds `bankById`, loads settings.
- Hash router: `#/home`, `#/exam`, `#/results/<resultId>`, `#/review/<resultId>?filter=all|incorrect|flagged`. Unknown routes go to `#/home`.
- Calls the matching screen's `mount(root, ctx, params)`. If a screen returns a function, call it as cleanup before mounting the next screen (to stop timers).
- `ctx = { bank, bankById, settings, engine: { …paper, …score, …storage }, navigate(hash), isSample }`
- If there is an exam in progress and the user opens `#/home`, home shows a Resume button (Session C); `#/exam` resumes it.

Screen modules export `mount(root, ctx, params)`:
- `ui/exam.js` (B) — `#/exam`
- `ui/home.js`, `ui/results.js`, `ui/review.js` (C)

Exam screen — copy the Pearson VUE layout:
- Top bar: exam title, "Question 12 of 85", time remaining (mm:ss; turns red under 5 minutes; hidden when untimed), "Flag for Review" toggle.
- Middle: question text, then options. Single → radio-style choices. Multi → checkboxes with a note like "Select two." and no more than the required number selectable.
- Bottom bar: Previous, Next, Review.
- Review screen (inside the exam, not the results review): a grid of all question numbers showing answered / unanswered / flagged, with filters All, Flagged, Incomplete; clicking a number jumps to it; an "End Exam" button.
- "End Exam" asks for confirmation and shows how many are unanswered and flagged.
- No right/wrong feedback during the exam.
- Keyboard: A–G pick options, ←/→ previous/next, F flag.
- Save the attempt to storage on every change and every 5 seconds of the timer, so a page reload resumes exactly where it was.
- At 0:00, submit automatically.
- Submit: `scoreAttempt` → `addResult` → `updateStats` → `clearInProgress` → `navigate('#/results/<id>')`.

Visual style: calm, high-contrast, exam-like. Light background, one accent color, big readable text (question text at least 18px), generous spacing. Define colors as CSS variables in `base.css` and support dark mode with `prefers-color-scheme`.

## 8. Home, results and review (Session C)

Home (`#/home`):
- Title, and a "sample data" banner when `ctx.isSample`.
- Bank stats: total questions and count per domain.
- "Start full mock exam" — 85 questions, 80 minutes.
- "Custom test" — choose number of questions (5–85), domains (checkboxes, default all), timed (minutes scale as count × 80/85, rounded) or untimed.
- "Resume exam" when one is in progress; starting a new exam while one exists asks for confirmation and discards the old one.
- History table: date, mode, questions, scaled score, PASS/FAIL, percent; clicking a row opens its results.
- Settings: "Use corrected answers for disputed questions" (`useSuggested`, default on), "Shuffle answer options" (default off), "Reset question stats".
- Starting any exam: `generatePaper` → save a new Attempt with `saveInProgress` → `navigate('#/exam')`.

Results (`#/results/<id>`) — styled like a CompTIA score report:
- Scaled score out of 900, big PASS or FAIL against 750, percent and marks, time used.
- A bar per domain with percent and correct/total.
- "Objectives to review": the missed objectives list, like the real report.
- Buttons: Review all, Review incorrect, Review flagged, Retry incorrect (makes a `mode: "retry"` paper from the incorrect ids), Back to home.
- A one-line note that the scaled score is an estimate, since CompTIA's real formula is not public.

Review (`#/review/<id>?filter=…`):
- Each question in exam order: question text, options with the user's choice and the correct answer clearly marked, correct/incorrect badge, explanation, domain and objective.
- If the question has `flags`, show them in a small "Answer key note" box, including the source answer vs suggested answer, and which one was used for scoring (`usedSuggested`).
- Filter tabs: All, Incorrect, Flagged.

## 9. Done means

- `node --test app/tests/` passes.
- The app loads, runs a full 85-question exam end to end, survives a page reload mid-exam, auto-submits at 0:00 (test with a 1-minute custom exam), and shows correct results and review.
- No errors in the browser console.
- `docs/DECISIONS.md` lists any choice not covered by this spec.

## 10. Amendments

These override earlier sections where they differ.

### 10.1 Excluded questions
The paper generator must never use a question whose `flags` include an entry starting with `"duplicate_of"` or containing `"Missing exhibit"` (currently Q345 and Q080). This applies to every mode, including `retry` (excluded ids are silently dropped). Show the excluded count on the home screen's bank stats.

### 10.2 Ambiguous questions
If a question's `flags` contain an entry including `"treat as ambiguous"` (case-insensitive), accept EITHER the source `answer` or the `suggested_answer` as correct, regardless of the `useSuggested` setting. The review screen says "Either answer accepted (answer key disputed)" for these questions.

### 10.3 Data fallback
The real data file now exists, so the sample fallback in section 2 is only a safety net.

### 10.4 Hosting
Hosting is Vercel (section 11), not just local.

### 10.5 Engine additions (exact exports, needed by 10.1 and 10.2)
Added to `js/engine/paper.js`:
- `isExcluded(q)` → boolean, per 10.1.
- `excludedIds(bank)` → sorted array of excluded question ids (e.g. `["Q080", "Q345"]`).
- `availableCounts(bank)` counts only usable questions (known type and not excluded), per domain.

Added to `js/engine/score.js`:
- `isAmbiguous(q)` → boolean, per 10.2.
- `acceptedAnswers(q, settings)` → array of letter arrays. Normally `[correctAnswer(q, settings)]`; for an ambiguous question with a `suggested_answer`, `[q.answer, q.suggested_answer]` (source first).
- `scoreAttempt` marks a question correct when the response equals ANY accepted answer.

Each `Result.perQuestion` entry gains two fields (existing fields unchanged):
`{ id, response, correctAnswer, isCorrect, usedSuggested, ambiguous: boolean, acceptedAnswers: [[...], ...] }`
- `correctAnswer` stays `correctAnswer(q, settings)`; `usedSuggested` stays "the suggested answer was the one used as `correctAnswer`".
- On the exam screen, the number of selections allowed for a multi question is `correctAnswer(q, ctx.settings).length`.

## 11. Hosting and security

The site is deployed on Vercel from `main` at https://secplus-mock.vercel.app and must NOT be publicly readable.

- `middleware.js` at the repo root is Vercel Routing Middleware (runtime `nodejs`, no framework). It requires HTTP Basic Auth on EVERY path, including `/data/*`. The password is compared against the environment variable `SITE_PASSWORD` (any username accepted) using a constant-time comparison. If `SITE_PASSWORD` is not set, it fails closed with 503 and the message "Set SITE_PASSWORD in Vercel to unlock this site."
- `.vercelignore` keeps source material out of the deployment: `questions/`, `tools/`, `scripts/`, `data/raw.json`, `data/tags/`, `data/review_answers.json`, `docs/`.
- `/` redirects to `/app/`.
- `SITE_PASSWORD` is set on the Vercel project for Production and Preview.

### 10.6 Real exam timing (overrides sections 6, 8 and 9)
The real SY0-701 exam is a maximum of 90 questions in 90 minutes (pass 750 on 100–900; domain weights 12/22/18/28/20 as in section 6). Because this bank has no PBQs, the full mock uses the maximum:
- `mode "full"`: 90 questions, `durationSec` 5400 (90 min). `quotas(90)` = `{1:11, 2:20, 3:16, 4:25, 5:18}`. `quotas(85)` must still give `{1:10, 2:19, 3:15, 4:24, 5:17}`.
- Custom test: 5–90 questions; timed minutes = count (the real exam pace of one minute per question). Retry incorrect uses the same pace.
