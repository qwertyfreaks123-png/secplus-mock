// Scoring for the Security+ mock exam. No DOM; runs in browser and Node.

export const PASS_SCALED = 750;

/** The answer key used for scoring, honouring settings.useSuggested. */
export function correctAnswer(q, settings) {
  return settings && settings.useSuggested && q.suggested_answer ? q.suggested_answer : q.answer;
}

/** Exact letter-set equality; empty or missing response is never correct. */
export function isCorrect(response, correct) {
  if (!Array.isArray(response) || !Array.isArray(correct)) return false;
  const r = new Set(response);
  const c = new Set(correct);
  if (r.size === 0 || c.size === 0 || r.size !== c.size) return false;
  for (const x of r) if (!c.has(x)) return false;
  return true;
}

/** Amendment 10.2: answer key disputed, either answer accepted. */
export function isAmbiguous(q) {
  const flags = q && Array.isArray(q.flags) ? q.flags : [];
  return flags.some((f) => typeof f === "string" && f.toLowerCase().includes("treat as ambiguous"));
}

/** All letter arrays that count as correct (source first for ambiguous questions). */
export function acceptedAnswers(q, settings) {
  if (isAmbiguous(q) && q.suggested_answer) return [q.answer, q.suggested_answer];
  return [correctAnswer(q, settings)];
}

/** Percent (0-100) to estimated CompTIA scale 100-900, integer. */
export function toScaled(percent) {
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  const v = p < 83 ? 100 + (650 * p) / 83 : 750 + (150 * (p - 83)) / 17;
  return Math.round(v);
}

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

function timeUsed(attempt, paper, now) {
  if (typeof attempt.elapsedSec === "number" && isFinite(attempt.elapsedSec)) {
    return Math.max(0, Math.round(attempt.elapsedSec));
  }
  const duration = Number(paper.durationSec) || 0;
  if (duration > 0 && typeof attempt.remainingSec === "number") {
    return Math.max(0, Math.round(duration - attempt.remainingSec));
  }
  const started = Date.parse(attempt.startedAt);
  return isFinite(started) ? Math.max(0, Math.round((now - started) / 1000)) : 0;
}

/** Turn a finished Attempt into a Result (SPEC sections 5, 6, 10.5). */
export function scoreAttempt(attempt, bankById, settings) {
  const paper = attempt.paper || {};
  const responses = attempt.responses || {};
  const lookup = (id) => (bankById instanceof Map ? bankById.get(id) : bankById && bankById[id]);
  const now = Date.now();

  let totalMarks = 0;
  let earnedMarks = 0;
  const byDomain = {};
  const missed = new Set();
  const perQuestion = [];

  for (const id of paper.questionIds || []) {
    const q = lookup(id);
    if (!q) continue;
    const marks = typeof q.marks === "number" ? q.marks : 1;
    const response = Array.isArray(responses[id]) ? responses[id].slice() : [];
    const key = correctAnswer(q, settings);
    const accepted = acceptedAnswers(q, settings);
    const ok = accepted.some((a) => isCorrect(response, a));

    totalMarks += marks;
    if (ok) earnedMarks += marks;
    const d = String(q.domain);
    if (!byDomain[d]) byDomain[d] = { correct: 0, total: 0, percent: 0 };
    byDomain[d].total += marks;
    if (ok) byDomain[d].correct += marks;
    if (!ok && q.objective) missed.add(String(q.objective));

    perQuestion.push({
      id,
      response,
      correctAnswer: key.slice(),
      isCorrect: ok,
      usedSuggested: !!(settings && settings.useSuggested && q.suggested_answer),
      ambiguous: isAmbiguous(q),
      acceptedAnswers: accepted.map((a) => a.slice()),
    });
  }

  for (const d of Object.keys(byDomain)) byDomain[d].percent = pct(byDomain[d].correct, byDomain[d].total);
  const rawPercent = totalMarks > 0 ? (earnedMarks / totalMarks) * 100 : 0;
  const scaled = toScaled(rawPercent);

  return {
    id: `r_${now}_${randomSuffix()}`,
    paperId: paper.id,
    mode: paper.mode,
    title: paper.title,
    submittedAt: new Date(now).toISOString(),
    timeUsedSec: timeUsed(attempt, paper, now),
    totalMarks,
    earnedMarks,
    percent: pct(earnedMarks, totalMarks),
    scaled,
    passed: scaled >= PASS_SCALED,
    byDomain,
    missedObjectives: [...missed].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    flaggedIds: Array.isArray(attempt.flagged) ? attempt.flagged.slice() : [],
    perQuestion,
  };
}
