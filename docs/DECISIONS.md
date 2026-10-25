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
