// App shell: loads the question bank, builds ctx and runs the hash router.
import * as paper from './engine/paper.js';
import * as score from './engine/score.js';
import * as storage from './engine/storage.js';
import * as home from './ui/home.js';
import * as exam from './ui/exam.js';
import * as results from './ui/results.js';
import * as review from './ui/review.js';

const DATA_URL = '../data/secplus-questions.json';
const SAMPLE_URL = '../data/batches/batch01.json';
const REVIEW_FILTERS = ['all', 'incorrect', 'flagged'];

const root = document.getElementById('app');

async function fetchBank(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`${url}: expected an array of questions`);
  return data;
}

async function loadBank() {
  try {
    return { bank: await fetchBank(DATA_URL), isSample: false };
  } catch (first) {
    try {
      return { bank: await fetchBank(SAMPLE_URL), isSample: true };
    } catch (second) {
      const err = new Error('Could not load the question bank.');
      err.details = [String(first && first.message), String(second && second.message)];
      throw err;
    }
  }
}

function showError(title, lines) {
  const box = document.createElement('div');
  box.className = 'app-error';
  box.setAttribute('role', 'alert');
  const h = document.createElement('h1');
  h.textContent = title;
  box.append(h);
  if (lines && lines.length) {
    const pre = document.createElement('pre');
    pre.textContent = lines.join('\n');
    box.append(pre);
  }
  const p = document.createElement('p');
  p.textContent = 'Serve the repository root with "python3 -m http.server 8000" and open http://localhost:8000/app/.';
  box.append(p);
  root.replaceChildren(box);
}

/** Parse location.hash into { name, params } or null for unknown routes. */
function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '');
  const qIdx = raw.indexOf('?');
  const path = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const query = new URLSearchParams(qIdx >= 0 ? raw.slice(qIdx + 1) : '');
  const parts = path.split('/').filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  const [name, id, extra] = parts;
  if (extra !== undefined) return null;
  if ((name === 'home' || name === 'exam') && id === undefined) return { name, params: {} };
  if (name === 'results' && id) return { name, params: { id } };
  if (name === 'review' && id) {
    const f = query.get('filter');
    return { name, params: { id, filter: REVIEW_FILTERS.includes(f) ? f : 'all' } };
  }
  return null;
}

const SCREENS = { home, exam, results, review };

function start(bank, isSample) {
  const bankById = {};
  for (const q of bank) if (q && typeof q.id === 'string') bankById[q.id] = q;

  let cleanup = null;
  let mountToken = 0;

  const ctx = {
    bank,
    bankById,
    settings: storage.loadSettings(),
    engine: { ...paper, ...score, ...storage },
    isSample,
    navigate(hash) {
      const target = hash.startsWith('#') ? hash : `#${hash}`;
      if (location.hash === target) render();
      else location.hash = target;
    },
  };

  function runCleanup() {
    const fn = cleanup;
    cleanup = null;
    if (typeof fn === 'function') {
      try { fn(); } catch (e) { console.warn('Screen cleanup failed', e); }
    }
  }

  function render() {
    let route = parseHash(location.hash);
    if (!route) {
      history.replaceState(null, '', '#/home');
      route = { name: 'home', params: {} };
    }
    runCleanup();
    const token = ++mountToken;
    root.replaceChildren();
    window.scrollTo(0, 0);
    try {
      const ret = SCREENS[route.name].mount(root, ctx, route.params);
      if (ret && typeof ret.then === 'function') {
        ret.then((fn) => {
          if (typeof fn !== 'function') return;
          if (token === mountToken) cleanup = fn;
          else fn();
        }, (e) => showError('This screen failed to load.', [String(e && e.stack || e)]));
      } else if (typeof ret === 'function') {
        cleanup = ret;
      }
    } catch (e) {
      showError('This screen failed to load.', [String(e && e.stack || e)]);
    }
  }

  window.addEventListener('hashchange', render);
  render();
}

loadBank().then(
  ({ bank, isSample }) => start(bank, isSample),
  (e) => showError(e.message || 'Could not load the question bank.', e.details || [String(e)]),
);
