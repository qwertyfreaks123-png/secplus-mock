// localStorage persistence. Every function fails safely and returns defaults.

const PREFIX = "secplus.v1.";
const KEYS = {
  settings: PREFIX + "settings",
  inProgress: PREFIX + "inProgress",
  history: PREFIX + "history",
  stats: PREFIX + "stats",
};
const HISTORY_CAP = 200;
const DEFAULT_SETTINGS = { useSuggested: true, shuffleOptions: false };

function store() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

// In-memory copy of every write. Reads fall back to it when storage is
// unavailable or the last write to that key failed (e.g. quota), so the app
// keeps working for the current page without saving.
const memory = new Map();
const unsaved = new Set();

function parse(raw) {
  try {
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function read(key) {
  if (unsaved.has(key)) return parse(memory.get(key));
  let raw;
  try {
    const s = store();
    if (!s) throw new Error("no storage");
    raw = s.getItem(key);
  } catch {
    return parse(memory.get(key));
  }
  return parse(raw);
}

function write(key, value) {
  let raw;
  try {
    raw = JSON.stringify(value);
  } catch {
    return false;
  }
  memory.set(key, raw);
  try {
    const s = store();
    if (!s) throw new Error("no storage");
    s.setItem(key, raw);
    unsaved.delete(key);
    return true;
  } catch {
    unsaved.add(key);
    return false;
  }
}

function remove(key) {
  memory.delete(key);
  unsaved.delete(key);
  try {
    const s = store();
    if (s) s.removeItem(key);
  } catch {
    /* ignore */
  }
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function loadSettings() {
  const stored = read(KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(isObj(stored) ? stored : {}) };
}

export function saveSettings(s) {
  return write(KEYS.settings, s);
}

export function loadInProgress() {
  const a = read(KEYS.inProgress);
  return isObj(a) ? a : null;
}

export function saveInProgress(a) {
  return write(KEYS.inProgress, a);
}

export function clearInProgress() {
  remove(KEYS.inProgress);
}

export function loadHistory() {
  const h = read(KEYS.history);
  return Array.isArray(h) ? h : [];
}

export function addResult(r) {
  const history = [r, ...loadHistory()].slice(0, HISTORY_CAP);
  write(KEYS.history, history);
  return history;
}

export function getResult(id) {
  return loadHistory().find((r) => r && r.id === id) || null;
}

export function loadStats() {
  const s = read(KEYS.stats);
  return {
    seen: isObj(s) && isObj(s.seen) ? s.seen : {},
    correct: isObj(s) && isObj(s.correct) ? s.correct : {},
  };
}

export function updateStats(result) {
  const stats = loadStats();
  for (const pq of (result && result.perQuestion) || []) {
    stats.seen[pq.id] = (stats.seen[pq.id] || 0) + 1;
    if (pq.isCorrect) stats.correct[pq.id] = (stats.correct[pq.id] || 0) + 1;
  }
  write(KEYS.stats, stats);
  return stats;
}

export function resetStats() {
  remove(KEYS.stats);
}

// Clears the in-memory fallback (used by tests).
export function resetMemoryStore() {
  memory.clear();
  unsaved.clear();
}
