// Results screen (#/results/<id>) — Session C. See docs/SPEC.md section 8.

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

function fmtDuration(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function notFound(root, what) {
  root.textContent = '';
  root.append(el('div', { class: 'container report' },
    el('section', { class: 'card rp-card rp-notfound' },
      el('h1', { text: `${what} not found` }),
      el('p', { text: 'This result may have been removed, or the link is wrong.' }),
      el('p', {}, el('a', { href: '#/home', class: 'btn btn-primary', text: 'Back to home' })))));
}

export function mount(root, ctx, params) {
  const E = ctx.engine;
  const id = params && params.id;
  const r = id ? E.getResult(id) : null;
  if (!r) { notFound(root, 'Result'); return; }

  const names = E.DOMAIN_NAMES || {};
  const passScaled = E.PASS_SCALED ?? 750;
  const per = Array.isArray(r.perQuestion) ? r.perQuestion : [];
  const incorrectIds = per.filter((q) => !q.isCorrect).map((q) => q.id);
  const flagged = new Set(r.flaggedIds || []);
  const flaggedCount = per.filter((q) => flagged.has(q.id)).length;

  root.textContent = '';
  const page = el('div', { class: 'container report results' });
  root.append(page);

  // ---------- score report header ----------
  const scaled = Number(r.scaled) || 0;
  const pct = Math.max(0, Math.min(100, ((scaled - 100) / 800) * 100));
  const passPct = ((passScaled - 100) / 800) * 100;

  page.append(
    el('section', { class: 'card rp-card rp-report', 'aria-labelledby': 'rp-rep-h' },
      el('div', { class: 'rp-report-head' },
        el('div', {},
          el('p', { class: 'rp-eyebrow', text: 'Examination score report' }),
          el('h1', { id: 'rp-rep-h', text: 'CompTIA Security+ (SY0-701) mock' }),
          el('p', { class: 'rp-muted', text: r.title || '' })),
        el('div', { class: `rp-verdict ${r.passed ? 'rp-pass' : 'rp-fail'}`, role: 'status' },
          el('span', { class: 'rp-verdict-icon', 'aria-hidden': 'true', text: r.passed ? '✓' : '✗' }),
          el('span', { text: r.passed ? 'PASS' : 'FAIL' })),
      ),
      el('dl', { class: 'rp-facts' },
        el('div', {}, el('dt', { text: 'Your score' }),
          el('dd', {}, el('span', { class: 'rp-scaled', text: String(scaled) }), el('span', { class: 'rp-muted', text: ' / 900' }))),
        el('div', {}, el('dt', { text: 'Passing score' }), el('dd', { text: `${passScaled}` })),
        el('div', {}, el('dt', { text: 'Percent correct' }),
          el('dd', { text: `${typeof r.percent === 'number' ? r.percent.toFixed(1) : '—'}%` })),
        el('div', {}, el('dt', { text: 'Marks' }), el('dd', { text: `${r.earnedMarks ?? '—'} of ${r.totalMarks ?? '—'}` })),
        el('div', {}, el('dt', { text: 'Time used' }), el('dd', { text: fmtDuration(r.timeUsedSec) })),
        el('div', {}, el('dt', { text: 'Date' }), el('dd', { text: fmtDate(r.submittedAt) })),
      ),
      el('div', { class: 'rp-scale', 'aria-hidden': 'true' },
        el('div', { class: 'rp-scale-track' },
          el('div', { class: `rp-scale-fill ${r.passed ? 'rp-pass-bg' : 'rp-fail-bg'}`, style: `width:${pct}%` }),
          el('div', { class: 'rp-scale-mark', style: `left:${passPct}%` })),
        el('div', { class: 'rp-scale-labels' },
          el('span', { text: '100' }), el('span', { class: 'rp-scale-pass', style: `left:${passPct}%`, text: `${passScaled}` }), el('span', { text: '900' }))),
      el('p', { class: 'rp-small rp-muted rp-note',
        text: 'The scaled score is an estimate: CompTIA does not publish its scoring formula, so this app maps percent correct onto the 100–900 scale with 83% ≈ 750.' }),
    ),
  );

  // ---------- domains ----------
  const domKeys = Object.keys(r.byDomain || {}).sort((a, b) => Number(a) - Number(b));
  page.append(
    el('section', { class: 'card rp-card', 'aria-labelledby': 'rp-dom-h' },
      el('h2', { id: 'rp-dom-h', text: 'Performance by domain' }),
      domKeys.length === 0 ? el('p', { class: 'rp-muted', text: 'No domain data.' }) :
        el('ul', { class: 'rp-bars' },
          domKeys.map((k) => {
            const d = r.byDomain[k] || {};
            const p = typeof d.percent === 'number' ? d.percent : 0;
            return el('li', { class: 'rp-bar' },
              el('div', { class: 'rp-bar-label' },
                el('span', { class: 'rp-bar-name', text: `${k}.0 ${names[k] || 'Domain ' + k}` }),
                el('span', { class: 'rp-bar-val', text: `${p.toFixed(1)}% (${d.correct ?? 0}/${d.total ?? 0})` })),
              el('div', { class: 'rp-bar-track', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': p,
                'aria-label': `Domain ${k} ${names[k] || ''}: ${p.toFixed(1)} percent` },
                el('div', { class: 'rp-bar-fill', style: `width:${Math.max(0, Math.min(100, p))}%` })));
          })),
    ),
  );

  // ---------- objectives ----------
  const missed = Array.isArray(r.missedObjectives) ? r.missedObjectives : [];
  page.append(
    el('section', { class: 'card rp-card', 'aria-labelledby': 'rp-obj-h' },
      el('h2', { id: 'rp-obj-h', text: 'Objectives to review' }),
      el('p', { class: 'rp-small rp-muted', text: 'Exam objectives where you missed at least one question.' }),
      missed.length === 0 ? el('p', { text: 'None' }) :
        el('ul', { class: 'rp-objectives' }, missed.map((o) => el('li', { text: o }))),
    ),
  );

  // ---------- actions ----------
  const enc = encodeURIComponent(r.id);
  function retryIncorrect() {
    if (incorrectIds.length === 0) return;
    if (E.loadInProgress()) {
      if (!confirm('An exam is already in progress. Starting a new one will discard it. Continue?')) return;
    }
    const n = incorrectIds.length;
    let paper;
    try {
      paper = E.generatePaper(ctx.bank, {
        mode: 'retry', questionIds: incorrectIds.slice(), title: 'Retry incorrect',
        durationSec: n * 60, // real exam pace: 90 questions in 90 minutes
      }, E.loadStats(), ctx.settings);
    } catch (err) {
      alert('Could not create the retry exam: ' + (err && err.message ? err.message : err));
      return;
    }
    if (!paper || !paper.questionIds || paper.questionIds.length === 0) {
      alert('None of the incorrect questions are still available in the bank.');
      return;
    }
    E.saveInProgress({
      paper, responses: {}, flagged: [], currentIndex: 0,
      startedAt: new Date().toISOString(), remainingSec: paper.durationSec, elapsedSec: 0, status: 'in_progress',
    });
    ctx.navigate('#/exam');
  }

  page.append(
    el('nav', { class: 'rp-actions rp-result-actions', 'aria-label': 'Result actions' },
      el('a', { class: 'btn btn-primary', href: `#/review/${enc}?filter=all`, text: `Review all (${per.length})` }),
      el('a', { class: 'btn btn-secondary', href: `#/review/${enc}?filter=incorrect`, text: `Review incorrect (${incorrectIds.length})` }),
      el('a', { class: 'btn btn-secondary', href: `#/review/${enc}?filter=flagged`, text: `Review flagged (${flaggedCount})` }),
      el('button', { class: 'btn btn-secondary', type: 'button', disabled: incorrectIds.length === 0,
        title: incorrectIds.length === 0 ? 'No incorrect questions to retry' : null,
        onclick: retryIncorrect, text: `Retry incorrect (${incorrectIds.length})` }),
      el('a', { class: 'btn btn-secondary', href: '#/home', text: 'Back to home' }),
    ),
  );
}
