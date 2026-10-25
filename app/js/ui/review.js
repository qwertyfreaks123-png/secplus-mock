// Answer review (#/review/<id>?filter=all|incorrect|flagged) — Session C.
// See docs/SPEC.md sections 8, 10.2 and 10.5. All bank text goes through textContent.

import { notFound } from './results.js';

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'incorrect', label: 'Incorrect' },
  { key: 'flagged', label: 'Flagged' },
];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

function letters(arr) {
  return Array.isArray(arr) && arr.length ? arr.slice().sort().join(', ') : '—';
}

export function mount(root, ctx, params) {
  const E = ctx.engine;
  const id = params && params.id;
  const r = id ? E.getResult(id) : null;
  if (!r) { notFound(root, 'Result'); return; }

  const filter = FILTERS.some((f) => f.key === (params && params.filter)) ? params.filter : 'all';
  const names = E.DOMAIN_NAMES || {};
  const per = Array.isArray(r.perQuestion) ? r.perQuestion : [];
  const flagged = new Set(r.flaggedIds || []);
  const entries = per.map((pq, i) => ({ pq, num: i + 1 }));
  const lists = {
    all: entries,
    incorrect: entries.filter((e) => !e.pq.isCorrect),
    flagged: entries.filter((e) => flagged.has(e.pq.id)),
  };
  const shown = lists[filter];
  const enc = encodeURIComponent(r.id);

  root.textContent = '';
  const page = el('div', { class: 'container report review' });
  root.append(page);

  page.append(
    el('header', { class: 'rp-header' },
      el('p', {}, el('a', { href: `#/results/${enc}`, class: 'rp-back', text: '← Back to score report' })),
      el('h1', { text: 'Answer review' }),
      el('p', { class: 'rp-muted', text: `${r.title || 'Exam'} — ${r.earnedMarks ?? '?'} of ${r.totalMarks ?? '?'} correct` })),
    el('nav', { class: 'rp-tabs', 'aria-label': 'Filter questions' },
      FILTERS.map((f) => el('a', {
        href: `#/review/${enc}?filter=${f.key}`,
        class: `rp-tab${f.key === filter ? ' rp-tab-active' : ''}`,
        'aria-current': f.key === filter ? 'page' : null,
      }, `${f.label} `, el('span', { class: 'rp-tab-count', text: `(${lists[f.key].length})` })))),
  );

  if (shown.length === 0) {
    const msg = {
      all: 'This result has no questions.',
      incorrect: 'No incorrect answers — every question was answered correctly.',
      flagged: 'No questions were flagged for review in this exam.',
    }[filter];
    page.append(el('p', { class: 'card rp-card rp-empty', text: msg }));
    return;
  }

  const list = el('ol', { class: 'rp-qlist' });
  page.append(list);
  for (const { pq, num } of shown) list.append(renderQuestion(pq, num, ctx, names, flagged.has(pq.id)));
}

function renderQuestion(pq, num, ctx, names, wasFlagged) {
  const q = ctx.bankById && (ctx.bankById instanceof Map ? ctx.bankById.get(pq.id) : ctx.bankById[pq.id]);
  const response = Array.isArray(pq.response) ? pq.response : [];
  const answered = response.length > 0;
  const accepted = Array.isArray(pq.acceptedAnswers) && pq.acceptedAnswers.length
    ? pq.acceptedAnswers
    : [Array.isArray(pq.correctAnswer) ? pq.correctAnswer : []];
  const acceptedSet = new Set(accepted.flat());
  const ambiguous = !!pq.ambiguous;

  const badge = el('span', { class: `rp-badge ${pq.isCorrect ? 'rp-ok' : 'rp-bad'}` },
    el('span', { 'aria-hidden': 'true', text: pq.isCorrect ? '✓ ' : '✗ ' }),
    pq.isCorrect ? 'Correct' : (answered ? 'Incorrect' : 'Unanswered (incorrect)'));

  const head = el('div', { class: 'rp-q-head' },
    el('span', { class: 'rp-q-num', text: `Question ${num}` }),
    badge,
    wasFlagged ? el('span', { class: 'rp-badge rp-flagged' }, el('span', { 'aria-hidden': 'true', text: '⚑ ' }), 'Flagged') : null,
    el('span', { class: 'rp-q-id rp-muted', text: pq.id }));

  const item = el('li', { class: `card rp-card rp-q ${pq.isCorrect ? 'rp-q-ok' : 'rp-q-bad'}`, value: num });
  item.append(head);

  if (!q) {
    item.append(el('p', { class: 'rp-muted', text: `This question (${pq.id}) is no longer in the question bank, so its text cannot be shown. Your answer: ${letters(response)}. Correct answer: ${letters(pq.correctAnswer)}.` }));
    return item;
  }

  item.append(
    el('p', { class: 'rp-meta rp-small' },
      el('span', { text: `Domain ${q.domain}: ${names[q.domain] || ''}` }),
      el('span', { text: `Objective ${q.objective || '—'}` }),
      q.type === 'multi' ? el('span', { text: `Select ${(pq.correctAnswer || []).length}` }) : null),
    el('p', { class: 'rp-qtext', text: q.question || '' }),
  );

  const opts = el('ul', { class: 'rp-options', 'aria-label': 'Answer options' });
  const optLetters = LETTERS.filter((L) => q.options && Object.prototype.hasOwnProperty.call(q.options, L));
  for (const L of optLetters) {
    const chosen = response.includes(L);
    const correct = acceptedSet.has(L);
    const cls = ['rp-opt'];
    if (correct) cls.push('rp-opt-correct');
    if (chosen && !correct) cls.push('rp-opt-wrong');
    if (chosen) cls.push('rp-opt-chosen');
    const tags = el('span', { class: 'rp-opt-tags' });
    if (chosen) tags.append(el('span', { class: `rp-tag ${correct ? 'rp-tag-ok' : 'rp-tag-bad'}`, text: 'Your answer' }));
    if (correct) tags.append(el('span', { class: 'rp-tag rp-tag-ok', text: ambiguous ? '✓ Accepted' : '✓ Correct answer' }));
    const marker = correct ? '✓' : (chosen ? '✗' : '');
    opts.append(el('li', { class: cls.join(' ') },
      el('span', { class: 'rp-opt-mark', 'aria-hidden': 'true', text: marker }),
      el('span', { class: 'rp-opt-letter', text: `${L}.` }),
      el('span', { class: 'rp-opt-text', text: q.options[L] == null ? '' : String(q.options[L]) }),
      tags));
  }
  item.append(opts);

  item.append(el('p', { class: 'rp-answers rp-small' },
    el('span', {}, 'Your answer: ', el('strong', { text: answered ? letters(response) : 'none' })),
    el('span', {}, ambiguous ? 'Accepted: ' : 'Correct answer: ',
      el('strong', { text: ambiguous ? accepted.map(letters).join(' or ') : letters(pq.correctAnswer) }))));

  const flags = Array.isArray(q.flags) ? q.flags : [];
  if (flags.length || ambiguous) {
    const box = el('aside', { class: 'rp-keynote', 'aria-label': 'Answer key note' },
      el('p', { class: 'rp-keynote-title' }, el('span', { 'aria-hidden': 'true', text: '⚠ ' }), 'Answer key note'));
    if (ambiguous) box.append(el('p', { class: 'rp-keynote-strong', text: 'Either answer accepted (answer key disputed)' }));
    if (flags.length) box.append(el('ul', { class: 'rp-keynote-flags' }, flags.map((f) => el('li', { text: String(f) }))));
    const hasSuggested = Array.isArray(q.suggested_answer) && q.suggested_answer.length > 0;
    box.append(el('p', { class: 'rp-small' },
      'Source answer: ', el('strong', { text: letters(q.answer) }),
      ' · Suggested answer: ', el('strong', { text: hasSuggested ? letters(q.suggested_answer) : 'none' })));
    let used;
    if (ambiguous) used = `Scoring accepted both: ${accepted.map(letters).join(' or ')}.`;
    else if (pq.usedSuggested) used = 'Scored using the suggested (corrected) answer.';
    else used = 'Scored using the source answer.';
    box.append(el('p', { class: 'rp-small', text: used }));
    item.append(box);
  }

  if (q.explanation) {
    item.append(el('div', { class: 'rp-explain' },
      el('p', { class: 'rp-explain-title', text: 'Explanation' }),
      el('p', { class: 'rp-explain-text', text: String(q.explanation) })));
  }
  return item;
}
