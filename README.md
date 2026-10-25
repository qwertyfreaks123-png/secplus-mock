# Security+ SY0-701 mock exam

A personal, static web app for timed Security+ mock exams built from the 417-question bank in `data/secplus-questions.json`. It mimics the Pearson VUE exam screen, scores like CompTIA (scaled 100–900, pass at 750) and ends with a score report plus a full answer review. The full build spec is in `docs/SPEC.md`; choices the spec didn't cover are in `docs/DECISIONS.md`.

## Run locally

No build step and no dependencies.

```sh
python3 -m http.server 8000      # from the repo root
# open http://localhost:8000/app/
node --test app/tests/           # engine tests (Node 18+)
```

Locally there is no password: the middleware only runs on Vercel. Progress, settings and history are saved in your browser's `localStorage` (if storage is blocked the app still works for the open page, it just can't save).

## Hosting and the password

Production is deployed by Vercel from `main` at https://secplus-mock.vercel.app.

- `middleware.js` (Vercel Routing Middleware, Node.js runtime) requires HTTP Basic Auth on every path, including `/data/*`. Your browser shows a login box: type **any username** and the password stored in the Vercel environment variable `SITE_PASSWORD`. The comparison is constant-time.
- If `SITE_PASSWORD` is not set, every request gets `503 Set SITE_PASSWORD in Vercel to unlock this site.` (fail closed).
- To set or change it: Vercel dashboard → project **secplus-mock** → Settings → Environment Variables → `SITE_PASSWORD` for Production and Preview → Save, then Deployments → latest → Redeploy.
- `.vercelignore` keeps the source material (`questions/`, `tools/`, `scripts/`, `docs/`, `data/raw.json`, `data/tags/`, `data/review_answers.json`, `data/*.md`) and the tests out of the deployment entirely. Only `app/`, `data/secplus-questions.json`, `middleware.js` and `vercel.json` ship.
- `vercel.json` redirects `/` to `/app/` and adds security headers (CSP, no framing, no-index, no-cache).

## Screens

- **Home** (`#/home`) — bank stats (total, usable per domain, excluded questions), start a full mock (85 questions, 80 minutes, weighted by the SY0-701 domain split), build a custom test (5–85 questions, chosen domains, timed or untimed), resume an exam in progress, history of past attempts, and settings (use corrected answers for disputed questions, shuffle answer options, reset question stats).
- **Exam** (`#/exam`) — Pearson VUE style: top bar with title, question counter, countdown (red under 5 minutes) and Flag for Review; Previous / Next / Review at the bottom. The in-exam Review grid shows answered, unanswered and flagged questions with All / Flagged / Incomplete filters and End Exam. Keyboard: A–G choose by letter (letters stay with their text even when options are shuffled; F always flags, so use 6 or a click for option F), 1–7 choose by position, ←/→ move, F flags. Progress is saved continuously, so a reload resumes where you were; at 0:00 the exam submits itself.
- **Results** (`#/results/<id>`) — CompTIA-style score report: scaled score, PASS/FAIL, percent, marks, time used, a bar per domain, objectives to review, and buttons to review all / incorrect / flagged, retry the incorrect ones, or go home. The scaled score is an estimate.
- **Review** (`#/review/<id>?filter=all|incorrect|flagged`) — every question in exam order with your answer, the correct answer, explanation, domain and objective, plus an "Answer key note" for questions whose source key was disputed.

## Question bank rules

- Questions flagged `duplicate_of…` or `Missing exhibit` (currently Q345 and Q080) are never used in a paper.
- Questions flagged "treat as ambiguous" (Q300, Q352, Q373) accept either the source or the suggested answer.
- Otherwise "Use corrected answers for disputed questions" decides whether the suggested answer replaces the source key.

## Layout

```
app/            the web app (index.html, css/, js/main.js, js/engine/, js/ui/, tests/)
data/           question bank (secplus-questions.json is what the app loads)
middleware.js   Basic Auth for Vercel
vercel.json     redirect and headers
docs/           SPEC.md and DECISIONS.md (not deployed)
```
