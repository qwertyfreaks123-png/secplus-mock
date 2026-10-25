// Home screen (#/home) — Session C. See docs/SPEC.md sections 8, 10.1.

const FULL_COUNT = 85;
const FULL_SEC = 4800;
const MIN_COUNT = 5;

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

function minutesFor(count) {
  return Math.round((count * 80) / 85);
}

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const MODE_LABEL = { full: 'Full', custom: 'Custom', retry: 'Retry' };

export function mount(root, ctx, params) {
  const E = ctx.engine;
  const names = E.DOMAIN_NAMES || {};
  const domainKeys = Object.keys(names).map(Number).sort((a, b) => a - b);
  const avail = E.availableCounts(ctx.bank) || {};
  const excluded = E.excludedIds(ctx.bank) || [];
  const totalUsable = domainKeys.reduce((s, d) => s + (avail[d] || 0), 0);

  root.textContent = '';
  const page = el('div', { class: 'container report home' });
  root.append(page);

  // ---------- header ----------
  page.append(
    el('header', { class: 'rp-header' },
      el('h1', { text: 'Security+ SY0-701 Mock Exam' }),
      el('p', { class: 'rp-muted', text: 'Timed practice exams in the style of the Pearson VUE test screen.' }),
    ),
  );
  if (ctx.isSample) {
    page.append(el('div', { class: 'banner rp-banner-warn', role: 'status',
      text: 'Sample data: the full question bank could not be loaded, so only a small sample set is available.' }));
  }

  // ---------- start new exam (shared) ----------
  function startExam(opts) {
    if (E.loadInProgress()) {
      if (!confirm('An exam is already in progress. Starting a new one will discard it. Continue?')) return;
    }
    let paper;
    try {
      paper = E.generatePaper(ctx.bank, opts, E.loadStats(), ctx.settings);
    } catch (err) {
      alert('Could not create the exam: ' + (err && err.message ? err.message : err));
      return;
    }
    if (!paper || !paper.questionIds || paper.questionIds.length === 0) {
      alert('No questions are available for that selection.');
      return;
    }
    E.saveInProgress({
      paper,
      responses: {},
      flagged: [],
      currentIndex: 0,
      startedAt: new Date().toISOString(),
      remainingSec: paper.durationSec,
      elapsedSec: 0,
      status: 'in_progress',
    });
    ctx.navigate('#/exam');
  }

  // ---------- resume ----------
  const inProgress = E.loadInProgress();
  if (inProgress && inProgress.paper) {
    const p = inProgress.paper;
    const total = (p.questionIds || []).length;
    const answered = (p.questionIds || []).filter((id) => {
      const r = inProgress.responses && inProgress.responses[id];
      return Array.isArray(r) && r.length > 0;
    }).length;
    const timeTxt = p.durationSec > 0
      ? `${Math.max(0, Math.ceil((inProgress.remainingSec || 0) / 60))} min left`
      : 'untimed';
    page.append(
      el('section', { class: 'card rp-card rp-resume', 'aria-labelledby': 'rp-resume-h' },
        el('h2', { id: 'rp-resume-h', text: 'Exam in progress' }),
        el('p', {},
          el('strong', { text: p.title || 'Exam' }),
          ` — question ${Math.min(total, (inProgress.currentIndex || 0) + 1)} of ${total}, ${answered} answered, ${timeTxt}.`),
        el('div', { class: 'rp-actions' },
          el('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.navigate('#/exam'), text: 'Resume exam' }),
          el('button', { class: 'btn btn-secondary', type: 'button', text: 'Discard',
            onclick: () => {
              if (!confirm('Discard the exam in progress? Your answers will be lost.')) return;
              E.clearInProgress();
              mount(root, ctx, params);
            } }),
        ),
      ),
    );
  }

  // ---------- full + custom ----------
  const grid = el('div', { class: 'rp-grid' });
  page.append(grid);

  grid.append(
    el('section', { class: 'card rp-card', 'aria-labelledby': 'rp-full-h' },
      el('h2', { id: 'rp-full-h', text: 'Full mock exam' }),
      el('p', { class: 'rp-muted', text: `${FULL_COUNT} questions, ${FULL_SEC / 60} minutes, all five domains weighted like the real exam. Passing score 750 on a 100–900 scale.` }),
      el('div', { class: 'rp-actions' },
        el('button', { class: 'btn btn-primary', type: 'button', text: 'Start full mock exam',
          disabled: totalUsable === 0,
          onclick: () => startExam({ mode: 'full', count: FULL_COUNT, domains: domainKeys.slice(), durationSec: FULL_SEC, title: 'Full mock exam' }) }),
      ),
    ),
  );

  // custom form
  const countInput = el('input', { type: 'number', id: 'rp-count', min: MIN_COUNT, max: FULL_COUNT, step: 1, value: 20, inputmode: 'numeric' });
  const countHint = el('span', { class: 'rp-muted rp-small', id: 'rp-count-hint' });
  countInput.setAttribute('aria-describedby', 'rp-count-hint');
  const domainBoxes = domainKeys.map((d) => {
    const cb = el('input', { type: 'checkbox', value: d, checked: true, id: `rp-dom-${d}` });
    return { d, cb };
  });
  const timedRadio = el('input', { type: 'radio', name: 'rp-timing', value: 'timed', checked: true, id: 'rp-timed' });
  const untimedRadio = el('input', { type: 'radio', name: 'rp-timing', value: 'untimed', id: 'rp-untimed' });
  const minutesOut = el('output', { for: 'rp-count', class: 'rp-minutes' });
  const customErr = el('p', { class: 'rp-error', role: 'alert' });
  const customBtn = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Start custom test' });

  function selectedDomains() {
    return domainBoxes.filter((x) => x.cb.checked).map((x) => x.d);
  }
  function maxCount() {
    const usable = selectedDomains().reduce((s, d) => s + (avail[d] || 0), 0);
    return Math.min(FULL_COUNT, usable);
  }
  function currentCount() {
    const max = maxCount();
    let n = parseInt(countInput.value, 10);
    if (!Number.isFinite(n)) n = MIN_COUNT;
    n = Math.max(MIN_COUNT, Math.min(FULL_COUNT, n));
    if (n > max) n = max;
    return n;
  }
  function refreshCustom() {
    const doms = selectedDomains();
    const max = maxCount();
    countInput.max = String(Math.max(max, 1));
    countInput.min = String(Math.min(MIN_COUNT, Math.max(max, 1)));
    const n = currentCount();
    countHint.textContent = max < 1
      ? 'No questions available for the selected domains'
      : `${Math.min(MIN_COUNT, max)}–${max} available for the selected domains`;
    minutesOut.textContent = !timedRadio.checked ? 'No time limit'
      : max < 1 ? '—'
      : `${minutesFor(Math.max(n, 0))} minutes`;
    let msg = '';
    if (doms.length === 0) msg = 'Select at least one domain.';
    else if (max < 1) msg = 'No usable questions in the selected domains.';
    customErr.textContent = msg;
    customErr.hidden = !msg;
    customBtn.disabled = !!msg;
  }

  countInput.addEventListener('input', refreshCustom);
  countInput.addEventListener('change', () => {
    if (maxCount() >= 1) countInput.value = String(currentCount());
    refreshCustom();
  });
  domainBoxes.forEach((x) => x.cb.addEventListener('change', () => {
    if (maxCount() >= 1) countInput.value = String(currentCount());
    refreshCustom();
  }));
  timedRadio.addEventListener('change', refreshCustom);
  untimedRadio.addEventListener('change', refreshCustom);

  const form = el('form', { class: 'rp-form', novalidate: true,
    onsubmit: (ev) => {
      ev.preventDefault();
      refreshCustom();
      if (customBtn.disabled) return;
      const n = currentCount();
      countInput.value = String(n);
      const doms = selectedDomains();
      const durationSec = timedRadio.checked ? minutesFor(n) * 60 : 0;
      startExam({ mode: 'custom', count: n, domains: doms, durationSec, title: `Custom test (${n} questions)` });
    } },
    el('div', { class: 'rp-field' },
      el('label', { for: 'rp-count', text: 'Number of questions' }),
      countInput,
      countHint,
    ),
    el('fieldset', { class: 'rp-fieldset' },
      el('legend', { text: 'Domains' }),
      domainBoxes.map(({ d, cb }) =>
        el('label', { class: 'rp-check', for: `rp-dom-${d}` }, cb,
          el('span', {}, `${d}. ${names[d]} `, el('span', { class: 'rp-muted', text: `(${avail[d] || 0})` })))),
    ),
    el('fieldset', { class: 'rp-fieldset' },
      el('legend', { text: 'Timing' }),
      el('label', { class: 'rp-check', for: 'rp-timed' }, timedRadio, el('span', { text: 'Timed' })),
      el('label', { class: 'rp-check', for: 'rp-untimed' }, untimedRadio, el('span', { text: 'Untimed' })),
      el('p', { class: 'rp-small' }, 'Time limit: ', minutesOut),
    ),
    customErr,
    el('div', { class: 'rp-actions' }, customBtn),
  );

  grid.append(
    el('section', { class: 'card rp-card', 'aria-labelledby': 'rp-custom-h' },
      el('h2', { id: 'rp-custom-h', text: 'Custom test' }),
      form,
    ),
  );
  refreshCustom();

  // ---------- bank stats ----------
  const statsList = el('ul', { class: 'rp-domain-list' },
    domainKeys.map((d) => el('li', {},
      el('span', { class: 'rp-dnum', text: String(d) }),
      el('span', { class: 'rp-dname', text: names[d] }),
      el('span', { class: 'rp-dcount', text: String(avail[d] || 0) }))));
  const excludedNote = el('p', { class: 'rp-small rp-muted' },
    `Excluded: ${excluded.length}`,
    excluded.length ? ` (${excluded.join(', ')})` : '',
    excluded.length ? ' — duplicates or questions missing an exhibit; never used in exams.' : '');
  if (excluded.length) excludedNote.title = `Excluded question ids: ${excluded.join(', ')}`;
  page.append(
    el('section', { class: 'card rp-card', 'aria-labelledby': 'rp-bank-h' },
      el('h2', { id: 'rp-bank-h', text: 'Question bank' }),
      el('p', {}, el('strong', { text: String(ctx.bank.length) }), ' questions in total, ',
        el('strong', { text: String(totalUsable) }), ' usable. Usable questions per domain:'),
      statsList,
      excludedNote,
    ),
  );

  // ---------- history ----------
  const history = E.loadHistory() || [];
  const histSection = el('section', { class: 'card rp-card', 'aria-labelledby': 'rp-hist-h' },
    el('h2', { id: 'rp-hist-h', text: 'History' }));
  if (history.length === 0) {
    histSection.append(el('p', { class: 'rp-muted', text: 'No finished exams yet. Your results will appear here.' }));
  } else {
    const tbody = el('tbody');
    for (const r of history) {
      const open = () => ctx.navigate(`#/results/${encodeURIComponent(r.id)}`);
      const nq = Array.isArray(r.perQuestion) ? r.perQuestion.length : (r.totalMarks ?? '—');
      const tr = el('tr', { class: 'rp-row-link', tabindex: 0, role: 'link',
        'aria-label': `Open result from ${fmtDate(r.submittedAt)}`,
        onclick: open,
        onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } } },
        el('td', { text: fmtDate(r.submittedAt) }),
        el('td', { text: MODE_LABEL[r.mode] || r.mode || '—' }),
        el('td', { class: 'rp-num', text: String(nq) }),
        el('td', { class: 'rp-num', text: String(r.scaled ?? '—') }),
        el('td', {}, el('span', { class: `rp-pill ${r.passed ? 'rp-pass' : 'rp-fail'}`, text: r.passed ? 'PASS' : 'FAIL' })),
        el('td', { class: 'rp-num', text: typeof r.percent === 'number' ? `${r.percent.toFixed(1)}%` : '—' }),
      );
      tbody.append(tr);
    }
    histSection.append(el('div', { class: 'rp-table-wrap' },
      el('table', { class: 'rp-table' },
        el('thead', {}, el('tr', {},
          ['Date', 'Mode', 'Questions', 'Scaled', 'Result', 'Percent'].map((h, i) =>
            el('th', { scope: 'col', class: i >= 2 && i !== 4 ? 'rp-num' : null, text: h })))),
        tbody)));
  }
  page.append(histSection);

  // ---------- settings ----------
  function settingToggle(key, label, help) {
    const id = `rp-set-${key}`;
    const cb = el('input', { type: 'checkbox', id, checked: !!ctx.settings[key] });
    cb.addEventListener('change', () => {
      Object.assign(ctx.settings, { [key]: cb.checked });
      E.saveSettings(ctx.settings);
    });
    return el('div', { class: 'rp-setting' },
      el('label', { class: 'rp-check', for: id }, cb, el('span', { text: label })),
      help ? el('p', { class: 'rp-small rp-muted', text: help }) : null);
  }
  const resetMsg = el('span', { class: 'rp-small rp-muted', role: 'status' });
  page.append(
    el('section', { class: 'card rp-card', 'aria-labelledby': 'rp-set-h' },
      el('h2', { id: 'rp-set-h', text: 'Settings' }),
      settingToggle('useSuggested', 'Use corrected answers for disputed questions',
        'Where the source answer key looks wrong, score against the corrected answer. Used when an exam is scored.'),
      settingToggle('shuffleOptions', 'Shuffle answer options',
        'Show answer choices in a random order. Applies to new exams.'),
      el('div', { class: 'rp-setting rp-actions' },
        el('button', { class: 'btn btn-secondary', type: 'button', text: 'Reset question stats',
          onclick: () => {
            if (!confirm('Reset question stats? The app will forget which questions you have seen. History is kept.')) return;
            E.resetStats();
            resetMsg.textContent = 'Question stats reset.';
          } }),
        resetMsg),
    ),
  );
}
