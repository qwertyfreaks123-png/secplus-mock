import { test, describe, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  DOMAIN_WEIGHTS, DOMAIN_NAMES, quotas, generatePaper, availableCounts, isExcluded, excludedIds,
} from "../js/engine/paper.js";
import {
  correctAnswer, isCorrect, toScaled, PASS_SCALED, scoreAttempt, isAmbiguous, acceptedAnswers,
} from "../js/engine/score.js";
import * as storage from "../js/engine/storage.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOMAIN_SIZES = { 1: 64, 2: 86, 3: 72, 4: 136, 5: 59 };
const FULL_QUOTAS = { 1: 10, 2: 19, 3: 15, 4: 24, 5: 17 };
const AMBIG_FLAG = "Independent reviewer accepted the source answer; treat as ambiguous.";

// ---------- synthetic bank ----------
function makeBank(sizes = DOMAIN_SIZES) {
  const bank = [];
  let n = 0;
  for (const d of [1, 2, 3, 4, 5]) {
    for (let i = 0; i < (sizes[d] || 0); i++) {
      n++;
      const id = "Q" + String(n).padStart(3, "0");
      const multi = n % 7 === 0;
      bank.push({
        id,
        domain: d,
        objective: `${d}.${(i % 9) + 1}`,
        type: multi ? "multi" : "single",
        question: `Question ${id}`,
        options: multi ? { A: "a", B: "b", C: "c", D: "d", E: "e" } : { A: "a", B: "b", C: "c", D: "d" },
        answer: multi ? ["A", "C"] : ["B"],
        marks: 1,
        difficulty: "medium",
        explanation: "",
        suggested_answer: null,
        flags: [],
      });
    }
  }
  return bank;
}

// 417-question bank with two excluded, one ambiguous and one disputed question.
function specialBank() {
  const bank = makeBank();
  const byId = Object.fromEntries(bank.map((q) => [q.id, q]));
  byId.Q010.flags = ["duplicate_of: Q344", "Near-duplicate note."];
  byId.Q020.flags = ["Missing exhibit: the source omits the log."];
  Object.assign(byId.Q100, { type: "single", answer: ["A"], suggested_answer: ["B"],
    flags: ["Possible wrong answer: something.", AMBIG_FLAG] });
  Object.assign(byId.Q101, { type: "single", answer: ["C"], suggested_answer: ["D"],
    flags: ["Possible wrong answer: something else."] });
  return bank;
}

const countByDomain = (ids, bank) => {
  const byId = Object.fromEntries(bank.map((q) => [q.id, q]));
  const out = {};
  for (const id of ids) out[byId[id].domain] = (out[byId[id].domain] || 0) + 1;
  return out;
};
const toById = (bank) => Object.fromEntries(bank.map((q) => [q.id, q]));
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// ---------- quotas ----------
describe("quotas", () => {
  test("85 across all domains is exact", () => {
    assert.deepEqual(quotas(85), { 1: 10, 2: 19, 3: 15, 4: 24, 5: 17 });
  });
  test("always sums to count for many counts and domain subsets", () => {
    const subsets = [[1, 2, 3, 4, 5], [1], [5], [1, 2], [2, 4], [1, 3, 5], [2, 3, 4, 5]];
    for (const ds of subsets) {
      for (let c = 0; c <= 200; c++) {
        const q = quotas(c, ds);
        assert.equal(sum(q), c, `count ${c} domains ${ds}`);
        assert.deepEqual(Object.keys(q).map(Number).sort(), [...ds].sort());
      }
    }
  });
  test("single domain gets everything; weights and names exported", () => {
    assert.deepEqual(quotas(10, [3]), { 3: 10 });
    assert.deepEqual(DOMAIN_WEIGHTS, { 1: 0.12, 2: 0.22, 3: 0.18, 4: 0.28, 5: 0.2 });
    assert.equal(DOMAIN_NAMES[4], "Security Operations");
    assert.equal(Object.keys(DOMAIN_NAMES).length, 5);
  });
});

// ---------- scaled score ----------
describe("toScaled", () => {
  test("anchor points", () => {
    assert.equal(toScaled(0), 100);
    assert.equal(toScaled(83), 750);
    assert.equal(toScaled(100), 900);
    assert.equal(PASS_SCALED, 750);
  });
  test("one value in each segment", () => {
    assert.equal(toScaled(41.5), 425); // 100 + 650 * 0.5
    assert.equal(toScaled(91.5), 825); // 750 + 150 * 0.5
    assert.equal(toScaled(50), Math.round(100 + (650 * 50) / 83));
    assert.ok(Number.isInteger(toScaled(77.7)));
  });
});

// ---------- answer checking ----------
describe("answers", () => {
  test("multi-select is all or nothing, order and duplicates irrelevant", () => {
    assert.equal(isCorrect(["A", "C"], ["A", "C"]), true);
    assert.equal(isCorrect(["C", "A"], ["A", "C"]), true);
    assert.equal(isCorrect(["A", "A", "C"], ["A", "C"]), true);
    assert.equal(isCorrect(["A"], ["A", "C"]), false);
    assert.equal(isCorrect(["A", "C", "D"], ["A", "C"]), false);
    assert.equal(isCorrect(["A", "D"], ["A", "C"]), false);
  });
  test("empty or missing response is wrong", () => {
    assert.equal(isCorrect([], ["A"]), false);
    assert.equal(isCorrect(undefined, ["A"]), false);
    assert.equal(isCorrect(null, ["A"]), false);
  });
  test("useSuggested switches the correct answer", () => {
    const q = { answer: ["C"], suggested_answer: ["D"], flags: [] };
    assert.deepEqual(correctAnswer(q, { useSuggested: true }), ["D"]);
    assert.deepEqual(correctAnswer(q, { useSuggested: false }), ["C"]);
    const plain = { answer: ["B"], suggested_answer: null, flags: [] };
    assert.deepEqual(correctAnswer(plain, { useSuggested: true }), ["B"]);
  });
  test("isAmbiguous and acceptedAnswers", () => {
    const amb = { answer: ["A"], suggested_answer: ["B"], flags: ["x", "... TREAT AS AMBIGUOUS."] };
    const disp = { answer: ["C"], suggested_answer: ["D"], flags: ["Possible wrong answer"] };
    assert.equal(isAmbiguous(amb), true);
    assert.equal(isAmbiguous(disp), false);
    assert.equal(isAmbiguous({ answer: ["A"] }), false);
    assert.deepEqual(acceptedAnswers(amb, { useSuggested: false }), [["A"], ["B"]]);
    assert.deepEqual(acceptedAnswers(amb, { useSuggested: true }), [["A"], ["B"]]);
    assert.deepEqual(acceptedAnswers(disp, { useSuggested: true }), [["D"]]);
    assert.deepEqual(acceptedAnswers(disp, { useSuggested: false }), [["C"]]);
    const ambNoSuggestion = { answer: ["A"], suggested_answer: null, flags: [AMBIG_FLAG] };
    assert.deepEqual(acceptedAnswers(ambNoSuggestion, { useSuggested: true }), [["A"]]);
  });
});

// ---------- generatePaper ----------
describe("generatePaper", () => {
  const bank = makeBank();

  test("synthetic bank has 417 questions", () => assert.equal(bank.length, 417));

  test("full paper: 85 unique questions, exact quotas, fixed duration, defaults", () => {
    for (let i = 0; i < 10; i++) {
      const p = generatePaper(bank, { mode: "full", durationSec: 60 }, {}, { shuffleOptions: false });
      assert.equal(p.questionIds.length, 85);
      assert.equal(new Set(p.questionIds).size, 85);
      assert.deepEqual(countByDomain(p.questionIds, bank), FULL_QUOTAS);
      assert.equal(p.durationSec, 4800);
      assert.equal(p.mode, "full");
      assert.equal(p.title, "Full mock exam");
      assert.equal(p.optionOrder, null);
      assert.match(p.id, /^p_\d+_[a-z0-9]+$/);
      assert.equal(new Date(p.createdAt).toISOString(), p.createdAt);
    }
  });

  test("custom paper meets quotas over chosen domains and keeps caller duration", () => {
    const p = generatePaper(bank, { mode: "custom", count: 30, domains: [2, 4], durationSec: 0 }, {}, {});
    assert.equal(p.questionIds.length, 30);
    assert.equal(new Set(p.questionIds).size, 30);
    assert.deepEqual(countByDomain(p.questionIds, bank), quotas(30, [2, 4]));
    assert.equal(p.durationSec, 0);
    assert.equal(p.title, "Custom test");
    const t = generatePaper(bank, { mode: "custom", count: 10, domains: [1], durationSec: 600, title: "Mine" });
    assert.equal(t.durationSec, 600);
    assert.equal(t.title, "Mine");
    assert.deepEqual(countByDomain(t.questionIds, bank), { 1: 10 });
  });

  test("question order is mixed across domains", () => {
    const p = generatePaper(bank, { mode: "full", seed: 7 });
    const domains = p.questionIds.map((id) => toById(bank)[id].domain);
    const sorted = [...domains].sort((a, b) => a - b);
    assert.notDeepEqual(domains, sorted);
  });

  test("short domain: takes all it has and fills the rest by weight", () => {
    const small = makeBank({ 1: 64, 2: 86, 3: 72, 4: 136, 5: 5 });
    const p = generatePaper(small, { mode: "full", seed: 1 });
    assert.equal(p.questionIds.length, 85);
    assert.equal(new Set(p.questionIds).size, 85);
    // shortfall 12 split over 1-4 by weight: quotas(12,[1,2,3,4]) = {1:2,2:3,3:3,4:4}
    assert.deepEqual(countByDomain(p.questionIds, small), { 1: 12, 2: 22, 3: 18, 4: 28, 5: 5 });
  });

  test("short domains cascade when the fill-in domain is also short", () => {
    const small = makeBank({ 1: 11, 2: 86, 3: 72, 4: 136, 5: 5 });
    const p = generatePaper(small, { mode: "full", seed: 2 });
    assert.equal(p.questionIds.length, 85);
    assert.equal(new Set(p.questionIds).size, 85);
    const c = countByDomain(p.questionIds, small);
    assert.equal(c[1], 11);
    assert.equal(c[5], 5);
    assert.ok(c[2] >= 19 && c[3] >= 15 && c[4] >= 24);
  });

  test("pool smaller than count returns everything available", () => {
    const small = makeBank({ 1: 3, 2: 0, 3: 0, 4: 0, 5: 5 });
    const p = generatePaper(small, { mode: "custom", count: 50, domains: [5], durationSec: 0 });
    assert.equal(p.questionIds.length, 5);
    const all = generatePaper(small, { mode: "full" });
    assert.equal(all.questionIds.length, 8);
    assert.equal(new Set(all.questionIds).size, 8);
  });

  test("prefers least-seen questions", () => {
    const d4 = bank.filter((q) => q.domain === 4).map((q) => q.id);
    const seen = {};
    d4.forEach((id, i) => { seen[id] = i < 10 ? 0 : i < 20 ? 1 : 5; });
    delete seen[d4[0]]; // missing counts as 0
    for (let k = 0; k < 10; k++) {
      const p = generatePaper(bank, { mode: "custom", count: 15, domains: [4], durationSec: 0 }, { seen, correct: {} });
      const picked = new Set(p.questionIds);
      for (const id of d4.slice(0, 10)) assert.ok(picked.has(id), `unseen ${id} not picked`);
      for (const id of p.questionIds) assert.ok((seen[id] || 0) <= 1);
    }
  });

  test("random among ties: different papers without a seed", () => {
    const a = generatePaper(bank, { mode: "full" });
    const b = generatePaper(bank, { mode: "full" });
    assert.notDeepEqual([...a.questionIds].sort(), [...b.questionIds].sort());
  });

  test("retry uses exactly the given ids (deduplicated, missing ids dropped)", () => {
    const ids = ["Q005", "Q200", "Q300", "Q005", "Q999"];
    const p = generatePaper(bank, { mode: "retry", questionIds: ids, durationSec: 120 });
    assert.deepEqual([...p.questionIds].sort(), ["Q005", "Q200", "Q300"]);
    assert.equal(p.mode, "retry");
    assert.equal(p.title, "Retry incorrect");
    assert.equal(p.durationSec, 120);
  });

  test("shuffleOptions gives a permutation of the option letters per question", () => {
    const p = generatePaper(bank, { mode: "full" }, {}, { shuffleOptions: true });
    const byId = toById(bank);
    assert.equal(Object.keys(p.optionOrder).length, 85);
    for (const id of p.questionIds) {
      const letters = Object.keys(byId[id].options).sort();
      assert.deepEqual([...p.optionOrder[id]].sort(), letters);
    }
    const off = generatePaper(bank, { mode: "full" }, {}, { shuffleOptions: false });
    assert.equal(off.optionOrder, null);
    assert.equal(generatePaper(bank, { mode: "full" }).optionOrder, null);
  });

  test("seed makes generation deterministic", () => {
    const s = { shuffleOptions: true };
    const a = generatePaper(bank, { mode: "full", seed: 42 }, {}, s);
    const b = generatePaper(bank, { mode: "full", seed: 42 }, {}, s);
    assert.deepEqual(a.questionIds, b.questionIds);
    assert.deepEqual(a.optionOrder, b.optionOrder);
    const c = generatePaper(bank, { mode: "full", seed: 43 }, {}, s);
    assert.notDeepEqual(a.questionIds, c.questionIds);
    const r1 = generatePaper(bank, { mode: "retry", questionIds: ["Q001", "Q002", "Q003", "Q004"], seed: "x" });
    const r2 = generatePaper(bank, { mode: "retry", questionIds: ["Q001", "Q002", "Q003", "Q004"], seed: "x" });
    assert.deepEqual(r1.questionIds, r2.questionIds);
  });

  test("unknown question types are ignored", () => {
    const withPbq = makeBank({ 1: 5, 2: 0, 3: 0, 4: 0, 5: 0 });
    withPbq.push({ id: "P001", domain: 1, objective: "1.1", type: "pbq", options: {}, answer: [], flags: [] });
    for (let i = 0; i < 10; i++) {
      const p = generatePaper(withPbq, { mode: "full" });
      assert.ok(!p.questionIds.includes("P001"));
      assert.equal(p.questionIds.length, 5);
    }
    const r = generatePaper(withPbq, { mode: "retry", questionIds: ["P001", "Q001"] });
    assert.deepEqual(r.questionIds, ["Q001"]);
    assert.deepEqual(availableCounts(withPbq), { 1: 5, 2: 0, 3: 0, 4: 0, 5: 0 });
  });
});

// ---------- exclusions (10.1) ----------
describe("excluded questions", () => {
  const bank = specialBank();

  test("isExcluded and excludedIds", () => {
    const byId = toById(bank);
    assert.equal(isExcluded(byId.Q010), true);
    assert.equal(isExcluded(byId.Q020), true);
    assert.equal(isExcluded(byId.Q100), false);
    assert.equal(isExcluded(byId.Q101), false);
    assert.equal(isExcluded(byId.Q001), false);
    assert.deepEqual(excludedIds(bank), ["Q010", "Q020"]);
  });

  test("availableCounts excludes them", () => {
    assert.deepEqual(availableCounts(bank), { 1: 62, 2: 86, 3: 72, 4: 136, 5: 59 });
    assert.deepEqual(availableCounts(makeBank()), DOMAIN_SIZES);
  });

  test("never appear across 20 papers in every mode", () => {
    for (let i = 0; i < 20; i++) {
      const full = generatePaper(bank, { mode: "full" }, {}, {});
      const custom = generatePaper(bank, { mode: "custom", count: 62, domains: [1], durationSec: 0 }, {}, {});
      const retry = generatePaper(bank, { mode: "retry", questionIds: ["Q010", "Q020", "Q030", "Q100"] }, {}, {});
      for (const p of [full, custom, retry]) {
        assert.ok(!p.questionIds.includes("Q010"));
        assert.ok(!p.questionIds.includes("Q020"));
      }
      assert.equal(full.questionIds.length, 85);
      assert.deepEqual(countByDomain(full.questionIds, bank), FULL_QUOTAS);
      assert.equal(custom.questionIds.length, 62);
      assert.deepEqual([...retry.questionIds].sort(), ["Q030", "Q100"]);
    }
  });

  test("seen stats cannot pull excluded questions in", () => {
    const seen = Object.fromEntries(bank.map((q) => [q.id, 9]));
    seen.Q010 = 0;
    seen.Q020 = 0;
    const p = generatePaper(bank, { mode: "custom", count: 5, domains: [1], durationSec: 0 }, { seen });
    assert.ok(!p.questionIds.includes("Q010") && !p.questionIds.includes("Q020"));
  });
});

// ---------- scoreAttempt ----------
function attemptFor(ids, responses, extra = {}) {
  return {
    paper: { id: "p_1_abc", mode: "custom", title: "Custom test", questionIds: ids, optionOrder: null, durationSec: 0, createdAt: new Date().toISOString() },
    responses,
    flagged: [],
    currentIndex: 0,
    startedAt: new Date(Date.now() - 90_000).toISOString(),
    remainingSec: 0,
    status: "in_progress",
    ...extra,
  };
}

describe("scoreAttempt", () => {
  const bank = specialBank();
  const byId = toById(bank);

  test("ambiguous question accepts either answer regardless of useSuggested", () => {
    for (const useSuggested of [true, false]) {
      for (const resp of [["A"], ["B"]]) {
        const r = scoreAttempt(attemptFor(["Q100"], { Q100: resp }), byId, { useSuggested });
        assert.equal(r.perQuestion[0].isCorrect, true, `useSuggested=${useSuggested} resp=${resp}`);
        assert.equal(r.perQuestion[0].ambiguous, true);
        assert.deepEqual(r.perQuestion[0].acceptedAnswers, [["A"], ["B"]]);
        assert.deepEqual(r.perQuestion[0].correctAnswer, useSuggested ? ["B"] : ["A"]);
        assert.equal(r.perQuestion[0].usedSuggested, useSuggested);
      }
      const wrong = scoreAttempt(attemptFor(["Q100"], { Q100: ["C"] }), byId, { useSuggested });
      assert.equal(wrong.perQuestion[0].isCorrect, false);
    }
  });

  test("non-ambiguous disputed question follows useSuggested only", () => {
    const on = { useSuggested: true };
    const off = { useSuggested: false };
    const s = (resp, settings) => scoreAttempt(attemptFor(["Q101"], { Q101: resp }), byId, settings).perQuestion[0];
    assert.equal(s(["D"], on).isCorrect, true);
    assert.equal(s(["C"], on).isCorrect, false);
    assert.equal(s(["C"], off).isCorrect, true);
    assert.equal(s(["D"], off).isCorrect, false);
    const pq = s(["D"], on);
    assert.equal(pq.ambiguous, false);
    assert.deepEqual(pq.acceptedAnswers, [["D"]]);
    assert.equal(pq.usedSuggested, true);
    assert.equal(s(["D"], off).usedSuggested, false);
    assert.deepEqual(s(["D"], off).acceptedAnswers, [["C"]]);
  });

  test("totals, percent, scaled, byDomain, missed objectives, unanswered wrong", () => {
    // Q001 (d1 single B), Q007 (d1 multi A,C), Q070 (d2 multi), Q071 (d2 single), Q160 (d3 single)
    const ids = ["Q001", "Q007", "Q070", "Q071", "Q160", "NOPE"];
    const responses = { Q001: ["B"], Q007: ["A"], Q070: ["C", "A"], Q071: [] };
    const r = scoreAttempt(attemptFor(ids, responses, { flagged: ["Q071"] }), byId, { useSuggested: true });
    assert.equal(r.perQuestion.length, 5);
    assert.deepEqual(r.perQuestion.map((p) => p.id), ["Q001", "Q007", "Q070", "Q071", "Q160"]);
    assert.deepEqual(r.perQuestion.map((p) => p.isCorrect), [true, false, true, false, false]);
    assert.equal(r.totalMarks, 5);
    assert.equal(r.earnedMarks, 2);
    assert.equal(r.percent, 40);
    assert.equal(r.scaled, toScaled(40));
    assert.equal(r.passed, false);
    assert.deepEqual(r.byDomain, {
      1: { correct: 1, total: 2, percent: 50 },
      2: { correct: 1, total: 2, percent: 50 },
      3: { correct: 0, total: 1, percent: 0 },
    });
    const expectedMissed = [...new Set([byId.Q007.objective, byId.Q071.objective, byId.Q160.objective])].sort();
    assert.deepEqual(r.missedObjectives, expectedMissed);
    assert.deepEqual(r.flaggedIds, ["Q071"]);
    assert.deepEqual(r.perQuestion[3].response, []);
    assert.deepEqual(r.perQuestion[4].response, []);
    assert.equal(r.perQuestion[0].ambiguous, false);
    assert.deepEqual(r.perQuestion[0].acceptedAnswers, [["B"]]);
    assert.match(r.id, /^r_\d+_[a-z0-9]+$/);
    assert.equal(r.paperId, "p_1_abc");
    assert.equal(r.mode, "custom");
    assert.equal(r.title, "Custom test");
    assert.equal(new Date(r.submittedAt).toISOString(), r.submittedAt);
  });

  test("percent has one decimal and pass threshold works", () => {
    const ids = bank.slice(0, 85).map((q) => q.id);
    const responses = {};
    ids.slice(0, 72).forEach((id) => { responses[id] = byId[id].suggested_answer || byId[id].answer; });
    const r = scoreAttempt(attemptFor(ids, responses), byId, { useSuggested: true });
    assert.equal(r.earnedMarks, 72);
    assert.equal(r.percent, 84.7);
    assert.equal(r.scaled, toScaled((72 / 85) * 100));
    assert.equal(r.passed, true);
    assert.ok(r.scaled >= 750);
  });

  test("missed objectives are unique and sorted", () => {
    const mk = (id, objective) => ({ id, domain: 4, objective, type: "single", options: { A: "", B: "" }, answer: ["A"], marks: 1, suggested_answer: null, flags: [] });
    const qs = [mk("X1", "4.9"), mk("X2", "2.4"), mk("X3", "4.9"), mk("X4", "1.1")];
    const r = scoreAttempt(attemptFor(qs.map((q) => q.id), {}), toById(qs), {});
    assert.deepEqual(r.missedObjectives, ["1.1", "2.4", "4.9"]);
  });

  test("timeUsedSec: elapsedSec, then timed duration, then since startedAt", () => {
    const base = attemptFor(["Q001"], {});
    assert.equal(scoreAttempt({ ...base, elapsedSec: 321 }, byId, {}).timeUsedSec, 321);
    const timed = { ...base, paper: { ...base.paper, durationSec: 4800 }, remainingSec: 890 };
    assert.equal(scoreAttempt(timed, byId, {}).timeUsedSec, 3910);
    assert.equal(scoreAttempt({ ...timed, elapsedSec: 12 }, byId, {}).timeUsedSec, 12);
    const untimed = scoreAttempt(base, byId, {}).timeUsedSec;
    assert.ok(untimed >= 89 && untimed <= 92, `got ${untimed}`);
  });

  test("bankById can be a Map", () => {
    const r = scoreAttempt(attemptFor(["Q001"], { Q001: ["B"] }), new Map(Object.entries(byId)), {});
    assert.equal(r.earnedMarks, 1);
  });
});

// ---------- storage ----------
class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}
const throwing = {
  getItem() { throw new Error("denied"); },
  setItem() { throw new Error("denied"); },
  removeItem() { throw new Error("denied"); },
};
const originalLS = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
function setLS(value) {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value });
}
after(() => {
  if (originalLS) Object.defineProperty(globalThis, "localStorage", originalLS);
  else delete globalThis.localStorage;
});

describe("storage with a working localStorage", () => {
  let fake;
  beforeEach(() => { fake = new FakeStorage(); setLS(fake); storage.resetMemoryStore(); });

  test("settings defaults and merge", () => {
    assert.deepEqual(storage.loadSettings(), { useSuggested: true, shuffleOptions: false });
    storage.saveSettings({ shuffleOptions: true });
    assert.deepEqual(storage.loadSettings(), { useSuggested: true, shuffleOptions: true });
    assert.ok(fake.map.has("secplus.v1.settings"));
    fake.setItem("secplus.v1.settings", "{not json");
    assert.deepEqual(storage.loadSettings(), { useSuggested: true, shuffleOptions: false });
  });

  test("in-progress attempt save/load/clear", () => {
    assert.equal(storage.loadInProgress(), null);
    const a = attemptFor(["Q001"], { Q001: ["B"] });
    storage.saveInProgress(a);
    assert.deepEqual(storage.loadInProgress(), a);
    assert.ok(fake.map.has("secplus.v1.inProgress"));
    storage.clearInProgress();
    assert.equal(storage.loadInProgress(), null);
  });

  test("history prepends, caps at 200, getResult", () => {
    assert.deepEqual(storage.loadHistory(), []);
    for (let i = 0; i < 205; i++) storage.addResult({ id: `r_${i}` });
    const h = storage.loadHistory();
    assert.equal(h.length, 200);
    assert.equal(h[0].id, "r_204");
    assert.equal(h[199].id, "r_5");
    assert.deepEqual(storage.getResult("r_100"), { id: "r_100" });
    assert.equal(storage.getResult("r_0"), null);
    assert.equal(storage.getResult("missing"), null);
  });

  test("stats update and reset", () => {
    assert.deepEqual(storage.loadStats(), { seen: {}, correct: {} });
    const result = { perQuestion: [{ id: "Q1", isCorrect: true }, { id: "Q2", isCorrect: false }] };
    storage.updateStats(result);
    storage.updateStats(result);
    assert.deepEqual(storage.loadStats(), { seen: { Q1: 2, Q2: 2 }, correct: { Q1: 2 } });
    storage.resetStats();
    assert.deepEqual(storage.loadStats(), { seen: {}, correct: {} });
  });
});

describe("storage when localStorage throws or is absent", () => {
  beforeEach(() => storage.resetMemoryStore());
  // Nothing throws, and data survives for the current page in memory (SPEC 2:
  // the app must still work without saving).
  const exercise = () => {
    assert.deepEqual(storage.loadSettings(), { useSuggested: true, shuffleOptions: false });
    assert.doesNotThrow(() => storage.saveSettings({ useSuggested: false }));
    assert.deepEqual(storage.loadSettings(), { useSuggested: false, shuffleOptions: false });
    assert.equal(storage.loadInProgress(), null);
    assert.doesNotThrow(() => storage.saveInProgress({ paper: { id: "p1" } }));
    assert.deepEqual(storage.loadInProgress(), { paper: { id: "p1" } });
    assert.doesNotThrow(() => storage.clearInProgress());
    assert.equal(storage.loadInProgress(), null);
    assert.deepEqual(storage.loadHistory(), []);
    assert.doesNotThrow(() => storage.addResult({ id: "r_1" }));
    assert.deepEqual(storage.getResult("r_1"), { id: "r_1" });
    assert.deepEqual(storage.loadStats(), { seen: {}, correct: {} });
    assert.doesNotThrow(() => storage.updateStats({ perQuestion: [{ id: "Q1", isCorrect: true }] }));
    assert.deepEqual(storage.loadStats(), { seen: { Q1: 1 }, correct: { Q1: 1 } });
    assert.doesNotThrow(() => storage.resetStats());
    assert.deepEqual(storage.loadStats(), { seen: {}, correct: {} });
  };
  test("methods throw", () => { setLS(throwing); exercise(); });
  test("accessor throws", () => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
    exercise();
  });
  test("absent", () => { setLS(undefined); exercise(); });
  test("quota error on write keeps the newest value in memory", () => {
    const fake = new FakeStorage();
    fake.setItem("secplus.v1.inProgress", JSON.stringify({ paper: { id: "old" } }));
    fake.setItem = () => { throw new Error("QuotaExceededError"); };
    setLS(fake);
    storage.saveInProgress({ paper: { id: "new" } });
    assert.deepEqual(storage.loadInProgress(), { paper: { id: "new" } });
  });
});

// ---------- real data ----------
describe("real question bank", () => {
  const real = JSON.parse(readFileSync(join(HERE, "..", "..", "data", "secplus-questions.json"), "utf8"));

  test("full paper from real data: 85 unique, exact quotas, no excluded questions", () => {
    assert.deepEqual(excludedIds(real), ["Q080", "Q345"]);
    for (let i = 0; i < 20; i++) {
      const p = generatePaper(real, { mode: "full" }, {}, { useSuggested: true, shuffleOptions: false });
      assert.equal(p.questionIds.length, 85);
      assert.equal(new Set(p.questionIds).size, 85);
      assert.deepEqual(countByDomain(p.questionIds, real), FULL_QUOTAS);
      assert.ok(!p.questionIds.includes("Q080"));
      assert.ok(!p.questionIds.includes("Q345"));
    }
  });
});
