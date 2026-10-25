# Decisions

Choices not covered by docs/SPEC.md. Append only.

## Lead

- Amendment 10.5 defines exact engine exports and Result fields for exclusions and ambiguous answers so all screens code against the same names.

## Engine

- `quotas` uses integer percent weights (12/22/18/28/20) so the largest-remainder split is exact (no float drift); remainder ties go to the heavier domain, then the lower domain number. Unknown domain numbers in `domains` are ignored; an empty/missing list means all five.
- Shortfall fill: a short domain gives all its usable questions; the shortfall is split over the other selected domains with spare capacity via `quotas(shortfall, openDomains)`, capped by capacity, repeated until filled or the pool runs out (then the paper is simply shorter).
- Least-seen preference is per domain: candidates are shuffled with the paper RNG, then stably sorted by `stats.seen` (missing = 0).
- `opts.seed` (number or string) is hashed (FNV-1a) into mulberry32; without it `Math.random` is used. Paper/Result ids always use `Math.random`, so seeded papers share questions/order but not ids.
- Retry papers are deduplicated, drop ids that are unknown, excluded or of unknown type, and are shuffled like the other modes. Retry/custom `durationSec` is the caller's value (non-number → 0); full is always 4800. Custom `count` missing → 85.
- `scoreAttempt`: `scaled` is computed from the unrounded percent (`earned/total*100`); `percent` (overall and per domain) is rounded to one decimal. `byDomain` totals are in marks. `missedObjectives` is sorted with a numeric-aware compare (so "4.9" comes before "4.10"). `flaggedIds` is a copy of `attempt.flagged`. `bankById` may be a plain object or a Map. `timeUsedSec` is never negative.
- `updateStats` and `addResult` return the new stats / history (extra, harmless). `loadStats` always returns `{ seen: {}, correct: {} }`-shaped objects. Invalid JSON in storage is treated as missing.
- Node 22 (the container's version) does not accept a directory for `node --test app/tests/` (it tries to load it as a module and fails). `node --test` (no args, from repo root) and `node --test 'app/tests/*.test.mjs'` both run the suite; on Node 23+ the directory form may work. Lead may want to adjust the documented command.

## Lead (integration)

- Node 22 treats `node --test app/tests/` as a module path, not a directory. `app/tests/package.json` (`"main": "engine.test.mjs"`) makes the documented command run the suite; `node --test` from the repo root also works.

## Exam shell

- Sample-data banner: main.js does not render a global banner; only home shows it (when `ctx.isSample`), so it never appears twice. The exam screen shows none.
- Router: `#/home` and `#/exam` → `{}`; `#/results/<id>` → `{ id }`; `#/review/<id>?filter=` → `{ id, filter }` (all|incorrect|flagged, else "all"). Path segments are URI-decoded. Empty, unknown or malformed hashes are replaced (history.replaceState, no extra history entry) with `#/home`. `ctx.navigate(hash)` sets `location.hash`; navigating to the current hash re-renders. A screen's returned cleanup runs before the next mount; the page scrolls to top on every route change. A screen whose mount throws shows a readable error in #app.
- bankById is a plain object (`bankById[id]`), keyed by every record in the bank (unknown types included).
- If both data files fail to load, #app shows the two fetch errors plus how to serve the app.
- Option labels shown in the exam are the DISPLAYED position letters (A, B, C… top to bottom), and keyboard A–G (and 1–7) pick by displayed position. Responses store the original option letters, so shuffling never changes scoring/review.
- Key conflict: F is both "flag" and the 6th option (14 questions have 6–7 options). F always toggles the flag; the 6th/7th options can be picked with keys 6/7 (or 1–7 for any option) or by click. Keys are ignored when Ctrl/Alt/Meta/Shift is held, when focus is in a text field, while the End Exam dialog is open, and on the in-exam review screen (where Escape returns to the question).
- Options are `<button role="radio|checkbox">` rather than native inputs so ←/→ never change a native radio selection.
- Single choice cannot be deselected (as on Pearson VUE); multi choice allows at most `correctAnswer(q, ctx.settings).length` selections — further options are greyed (aria-disabled) until one is unticked. A multi with fewer than the required selections counts as "Incomplete"/unanswered in the review grid and the End Exam dialog.
- "Next" on the last question opens the in-exam Review screen. The current view (question vs review) is not persisted; reload returns to the question at `currentIndex`.
- Timer: wall-clock deltas every 250 ms; `remainingSec` is stored rounded up and `elapsedSec` rounded down. Saved on every change, every 5 s, on tab hide and on pagehide. Time while the page is closed is not counted (reload resumes with the saved remaining time). A resumed attempt with 0 s left submits immediately.
- Questions in the paper whose id is missing from the bank or whose type is unknown are skipped in the exam ("Question n of N" counts only shown ones); `currentIndex` indexes that filtered list (identical to `paper.questionIds` in practice).
- Flagged ids are saved in exam order. Submit failures (e.g. scoreAttempt throws) show an in-page error and keep the attempt saved; the double-submit guard is a `submitted` flag.
- Extra CSS variables beyond the shared list (exam only): `--topbar-bg`, `--topbar-text`, `--topbar-muted`, `--focus`. base.css also adds `.visually-hidden` and a global `[hidden] { display: none !important; }`.

## Report screens

- All report classes are prefixed `rp-` (report.css) to avoid clashing with base/exam CSS; `.container`, `.card`, `.banner`, `.btn*` from base.css are reused.
- Custom test: count is clamped to 5..min(85, usable questions in the checked domains) on change; if fewer than 5 are usable the minimum drops to that number. Start is disabled with an inline message when no domain is checked or none are usable. Paper title is "Custom test (N questions)".
- Home "Excluded: N" lists the ids inline in small text and in a `title` tooltip.
- Resume card shows title, current question, answered count and minutes left (or "untimed"), plus a Discard button (confirm) that calls `clearInProgress()`.
- History "Questions" column uses `perQuestion.length` (falls back to `totalMarks`). Rows are focusable (`tabindex=0`, role=link) and open on click, Enter or Space.
- Settings take effect immediately via `Object.assign(ctx.settings, …)` + `saveSettings`. `useSuggested` is read at scoring time, so it also affects an exam already in progress; `shuffleOptions` affects new papers only.
- Results page: shows a 100–900 scale bar with the 750 mark, domain labels as "N.0 Name", and counts on the Review buttons. Retry incorrect uses the lead's retry paper; if the engine returns an empty paper (all incorrect ids excluded/missing) an alert is shown.
- Review: correct/accepted options get a green solid border + "✓ Correct answer"/"✓ Accepted" tag; a wrong pick gets a red dashed border + "✗" + "Your answer" tag. Unanswered questions are badged "Unanswered (incorrect)". The "Answer key note" box appears when the bank question has flags or the result entry is `ambiguous`; for ambiguous entries every letter in `acceptedAnswers` is marked accepted. Question number = 1-based position in `perQuestion` (exam order).
- Unknown result id on results/review renders "Result not found" with a link home (shared `notFound` helper exported from results.js).
- QA follow-ups (lead):
  - Storage: every write is mirrored in memory; reads fall back to it when localStorage is unavailable or a write to that key failed (quota). Exams, results and review then work for the current page without saving (SPEC 2). `resetMemoryStore()` is exported for tests.
  - Shuffled options keep their original letters (SPEC 6: "letters stay attached to their text"), overriding the Exam shell choice of display-position labels. A–G pick the option with that letter; 1–7 pick by displayed position; F still always flags.
  - Added `--flag-contrast` and darkened light-mode `--flag` to #a35200 so flagged text/buttons reach 4.5:1 in both themes.
  - The `data/batches/batch01.json` fallback named in SPEC 2 does not exist; per 10.3 it stays a safety net only, and the app shows a clear error if both loads fail.
  - Multi questions whose source key has one letter but whose stem says "Select two" (Q330, Q347, Q350, Q359, Q391) allow one selection when "Use corrected answers" is off, per 10.5.
  - `.vercelignore` also excludes `data/*.md`, `app/tests/` and README.md; vercel.json adds CSP (`'self'` only, inline styles allowed), X-Frame-Options DENY, nosniff, no-referrer and noindex.
