// Paper generation for the Security+ mock exam. No DOM; runs in browser and Node.

export const DOMAIN_WEIGHTS = { 1: 0.12, 2: 0.22, 3: 0.18, 4: 0.28, 5: 0.2 };

export const DOMAIN_NAMES = {
  1: "General Security Concepts",
  2: "Threats, Vulnerabilities, and Mitigations",
  3: "Security Architecture",
  4: "Security Operations",
  5: "Security Program Management and Oversight",
};

const ALL_DOMAINS = [1, 2, 3, 4, 5];
const KNOWN_TYPES = new Set(["single", "multi"]);
const FULL_COUNT = 85;
const FULL_DURATION = 4800;
const DEFAULT_TITLES = { full: "Full mock exam", custom: "Custom test", retry: "Retry incorrect" };

// Integer weights (percent) so quota arithmetic is exact.
const INT_WEIGHTS = { 1: 12, 2: 22, 3: 18, 4: 28, 5: 20 };

function normDomains(domains) {
  const list = Array.isArray(domains) && domains.length ? domains : ALL_DOMAINS;
  const out = [];
  for (const d of list) {
    const n = Number(d);
    if (INT_WEIGHTS[n] && !out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/** Split `count` across domains by weight (renormalized), largest remainder. */
export function quotas(count, domains = ALL_DOMAINS) {
  const ds = normDomains(domains);
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const result = {};
  if (!ds.length) return result;
  const total = ds.reduce((s, d) => s + INT_WEIGHTS[d], 0);
  let assigned = 0;
  const rems = [];
  for (const d of ds) {
    const prod = n * INT_WEIGHTS[d];
    const base = Math.floor(prod / total);
    result[String(d)] = base;
    assigned += base;
    rems.push({ d, rem: prod % total });
  }
  rems.sort((a, b) => b.rem - a.rem || INT_WEIGHTS[b.d] - INT_WEIGHTS[a.d] || a.d - b.d);
  for (let i = 0; assigned < n; i++, assigned++) result[String(rems[i % rems.length].d)] += 1;
  return result;
}

/** True when the question must never be used in a paper (amendment 10.1). */
export function isExcluded(q) {
  const flags = q && Array.isArray(q.flags) ? q.flags : [];
  return flags.some(
    (f) => typeof f === "string" && (f.startsWith("duplicate_of") || f.includes("Missing exhibit"))
  );
}

/** Sorted ids of excluded questions. */
export function excludedIds(bank) {
  return (bank || []).filter((q) => q && isExcluded(q)).map((q) => q.id).sort();
}

function isUsable(q) {
  return !!q && KNOWN_TYPES.has(q.type) && !isExcluded(q);
}

/** Usable (known type, not excluded) question counts per domain. */
export function availableCounts(bank) {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const q of bank || []) {
    if (!isUsable(q)) continue;
    const key = String(q.domain);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function hashSeed(seed) {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Least-seen first, random among ties (shuffle then stable sort). */
function orderBySeen(questions, seen, rng) {
  const s = seen || {};
  return shuffle(questions, rng).sort((a, b) => (s[a.id] || 0) - (s[b.id] || 0));
}

function pickByDomain(usable, count, domains, seen, rng) {
  const pools = {};
  for (const d of domains) pools[d] = [];
  for (const q of usable) if (pools[q.domain]) pools[q.domain].push(q);
  for (const d of domains) pools[d] = orderBySeen(pools[d], seen, rng);

  const take = {};
  const want = quotas(count, domains);
  let filled = 0;
  for (const d of domains) {
    take[d] = Math.min(want[String(d)] || 0, pools[d].length);
    filled += take[d];
  }
  // Redistribute any shortfall by weight over domains with spare capacity.
  let shortfall = count - filled;
  while (shortfall > 0) {
    const open = domains.filter((d) => pools[d].length > take[d]);
    if (!open.length) break;
    const extra = quotas(shortfall, open);
    for (const d of open) {
      const add = Math.min(extra[String(d)] || 0, pools[d].length - take[d]);
      take[d] += add;
      shortfall -= add;
    }
  }
  const picked = [];
  for (const d of domains) picked.push(...pools[d].slice(0, take[d]));
  return picked;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

/** Build a Paper. See docs/SPEC.md sections 5, 6 and 10. */
export function generatePaper(bank, opts = {}, stats = {}, settings = {}) {
  const o = opts || {};
  const mode = o.mode === "custom" || o.mode === "retry" ? o.mode : "full";
  const rng = o.seed !== undefined && o.seed !== null ? mulberry32(hashSeed(o.seed)) : Math.random;
  const seen = (stats && stats.seen) || {};
  const usable = (bank || []).filter(isUsable);

  let picked;
  let durationSec;
  if (mode === "retry") {
    const byId = new Map(usable.map((q) => [q.id, q]));
    const ids = [...new Set(Array.isArray(o.questionIds) ? o.questionIds : [])];
    picked = ids.filter((id) => byId.has(id)).map((id) => byId.get(id));
    durationSec = Math.max(0, Math.floor(Number(o.durationSec) || 0));
  } else if (mode === "custom") {
    const count = o.count === undefined || o.count === null ? FULL_COUNT : Math.max(0, Math.floor(Number(o.count) || 0));
    picked = pickByDomain(usable, count, normDomains(o.domains), seen, rng);
    durationSec = Math.max(0, Math.floor(Number(o.durationSec) || 0));
  } else {
    picked = pickByDomain(usable, FULL_COUNT, ALL_DOMAINS, seen, rng);
    durationSec = FULL_DURATION;
  }

  const ordered = shuffle(picked, rng);
  let optionOrder = null;
  if (settings && settings.shuffleOptions) {
    optionOrder = {};
    for (const q of ordered) optionOrder[q.id] = shuffle(Object.keys(q.options || {}).sort(), rng);
  }

  return {
    id: `p_${Date.now()}_${randomSuffix()}`,
    mode,
    title: typeof o.title === "string" && o.title ? o.title : DEFAULT_TITLES[mode],
    questionIds: ordered.map((q) => q.id),
    optionOrder,
    durationSec,
    createdAt: new Date().toISOString(),
  };
}
