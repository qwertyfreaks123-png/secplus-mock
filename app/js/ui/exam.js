// Exam screen (#/exam): Pearson VUE style question view, in-exam review grid,
// wall-clock timer, autosave and submit. Bank text is only ever set via textContent.

const KNOWN_TYPES = new Set(['single', 'multi']);
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
const SAVE_EVERY_MS = 5000;
const TICK_MS = 250;
const WARN_UNDER_SEC = 300;

/** Small DOM builder. Strings become text nodes; never parses HTML. */
function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === undefined || c === null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function formatClock(totalSec) {
  const s = Math.max(0, Math.ceil(totalSec - 1e-9));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function countWord(n) {
  const w = COUNT_WORDS[n] || String(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export function mount(root, ctx) {
  const E = ctx.engine;
  const attempt = E.loadInProgress();
  if (!attempt || !attempt.paper || (attempt.status && attempt.status !== 'in_progress')) {
    ctx.navigate('#/home');
    return undefined;
  }

  const paper = attempt.paper;
  if (!attempt.responses || typeof attempt.responses !== 'object') attempt.responses = {};
  if (!Array.isArray(attempt.flagged)) attempt.flagged = [];

  const ids = (paper.questionIds || []).filter((id) => {
    const q = ctx.bankById[id];
    return q && KNOWN_TYPES.has(q.type);
  });

  if (ids.length === 0) {
    root.append(h('div', { class: 'container' },
      h('div', { class: 'card' },
        h('h1', { text: 'This exam has no questions' }),
        h('p', { text: 'None of the questions in the saved exam exist in the current question bank.' }),
        h('button', {
          class: 'btn btn-primary', type: 'button',
          onclick: () => { E.clearInProgress(); ctx.navigate('#/home'); },
        }, 'Discard it and go home'))));
    return undefined;
  }

  // ---------- state ----------
  let index = Math.min(Math.max(Number(attempt.currentIndex) | 0, 0), ids.length - 1);
  let view = 'question'; // 'question' | 'review'
  let reviewFilter = 'all'; // 'all' | 'flagged' | 'incomplete'
  let submitted = false;
  const timed = Number(paper.durationSec) > 0;
  let remaining = timed
    ? (Number.isFinite(Number(attempt.remainingSec)) ? Math.max(0, Number(attempt.remainingSec)) : Number(paper.durationSec))
    : 0;
  let elapsed = Number.isFinite(Number(attempt.elapsedSec))
    ? Math.max(0, Number(attempt.elapsedSec))
    : (timed ? Math.max(0, Number(paper.durationSec) - remaining) : 0);
  let lastTick = Date.now();
  let lastSave = 0;
  let timerId = null;

  const flaggedSet = new Set(attempt.flagged);
  const question = (i) => ctx.bankById[ids[i]];
  const responseOf = (id) => (Array.isArray(attempt.responses[id]) ? attempt.responses[id] : []);
  const requiredCount = (q) => {
    if (q.type !== 'multi') return 1;
    const key = E.correctAnswer(q, ctx.settings);
    return Math.max(1, Array.isArray(key) ? key.length : 1);
  };
  const isComplete = (i) => {
    const q = question(i);
    return responseOf(ids[i]).length >= requiredCount(q);
  };
  const displayOrder = (q) => {
    const own = Object.keys(q.options || {}).filter((k) => LETTERS.includes(k)).sort();
    const shuffled = paper.optionOrder && Array.isArray(paper.optionOrder[q.id]) ? paper.optionOrder[q.id] : null;
    if (!shuffled) return own;
    const ordered = shuffled.filter((k) => own.includes(k));
    for (const k of own) if (!ordered.includes(k)) ordered.push(k);
    return ordered;
  };

  // ---------- persistence ----------
  function syncTime() {
    attempt.elapsedSec = Math.floor(elapsed);
    if (timed) attempt.remainingSec = Math.max(0, Math.ceil(remaining - 1e-9));
  }
  function save() {
    if (submitted) return;
    attempt.currentIndex = index;
    attempt.flagged = ids.filter((id) => flaggedSet.has(id))
      .concat([...flaggedSet].filter((id) => !ids.includes(id)));
    syncTime();
    E.saveInProgress(attempt);
    lastSave = Date.now();
  }

  // ---------- skeleton ----------
  const titleEl = h('div', { class: 'exam-title' }, paper.title || 'Security+ Mock Exam');
  const timerValue = h('span', { class: 'exam-timer-value' });
  const timerEl = h('div', { class: 'exam-timer', role: 'timer', 'aria-label': 'Time remaining' },
    h('span', { class: 'exam-timer-label' }, 'Time remaining'), ' ', timerValue);
  if (!timed) timerEl.hidden = true;
  const progressEl = h('div', { class: 'exam-progress', 'aria-live': 'polite' });
  const flagBtn = h('button', { class: 'flag-toggle', type: 'button', 'aria-pressed': 'false', onclick: toggleFlag },
    h('span', { class: 'flag-icon', 'aria-hidden': 'true' }, '⚑'), ' Flag for Review');

  const top = h('header', { class: 'exam-top' },
    h('div', { class: 'exam-top-inner' },
      h('div', { class: 'exam-top-row' }, titleEl, timerEl),
      h('div', { class: 'exam-top-row' }, progressEl, flagBtn)));

  const content = h('div', { class: 'exam-content' });
  const main = h('main', { class: 'exam-main' }, content);

  const prevBtn = h('button', { class: 'btn exam-nav', type: 'button', onclick: goPrev }, '← Previous');
  const reviewBtn = h('button', { class: 'btn exam-nav', type: 'button', onclick: openReview }, 'Review');
  const nextBtn = h('button', { class: 'btn btn-primary exam-nav', type: 'button', onclick: goNext }, 'Next →');
  const backBtn = h('button', { class: 'btn exam-nav', type: 'button', onclick: () => showQuestion(index) }, 'Return to Question');
  const endBtn = h('button', { class: 'btn btn-primary exam-nav exam-end', type: 'button', onclick: confirmEnd }, 'End Exam');
  const bottom = h('footer', { class: 'exam-bottom' },
    h('div', { class: 'exam-bottom-inner' }, prevBtn, reviewBtn, backBtn, nextBtn, endBtn));

  const dialog = h('dialog', { class: 'exam-dialog', 'aria-labelledby': 'exam-dialog-title' });

  const shell = h('div', { class: 'exam' }, top, main, bottom, dialog);
  root.append(shell);
  document.body.classList.add('in-exam');

  // ---------- rendering ----------
  let optionButtons = [];
  let errorEl = null;

  function render() {
    content.replaceChildren();
    optionButtons = [];
    if (view === 'question') renderQuestion();
    else renderReview();
    if (errorEl) content.prepend(errorEl);
    updateChrome();
  }

  function updateChrome() {
    const inQuestion = view === 'question';
    progressEl.textContent = inQuestion
      ? `Question ${index + 1} of ${ids.length}`
      : `Review — ${ids.length} questions`;
    flagBtn.hidden = !inQuestion;
    const flagged = flaggedSet.has(ids[index]);
    flagBtn.setAttribute('aria-pressed', String(flagged));
    flagBtn.classList.toggle('is-on', flagged);
    prevBtn.hidden = !inQuestion;
    reviewBtn.hidden = !inQuestion;
    nextBtn.hidden = !inQuestion;
    backBtn.hidden = inQuestion;
    endBtn.hidden = inQuestion;
    prevBtn.disabled = index === 0;
    updateTimer();
  }

  function updateTimer() {
    if (!timed) return;
    timerValue.textContent = formatClock(remaining);
    timerEl.classList.toggle('is-low', remaining < WARN_UNDER_SEC);
  }

  function renderQuestion() {
    const q = question(index);
    const multi = q.type === 'multi';
    const need = requiredCount(q);
    const order = displayOrder(q);

    content.append(h('p', { class: 'q-text', id: 'q-text' }, String(q.question ?? '')));
    if (multi) content.append(h('p', { class: 'q-instruction' }, `Select ${countWord(need).toLowerCase()}.`));

    const group = h('div', {
      class: `options ${multi ? 'is-multi' : 'is-single'}`,
      role: multi ? 'group' : 'radiogroup',
      'aria-labelledby': 'q-text',
    });
    order.forEach((letter, pos) => {
      const btn = h('button', {
        class: 'option', type: 'button', role: multi ? 'checkbox' : 'radio',
        'data-letter': letter, 'aria-checked': 'false',
        onclick: () => choose(letter),
      },
      h('span', { class: 'option-mark', 'aria-hidden': 'true' }),
      h('span', { class: 'option-letter' }, `${letter}.`),
      h('span', { class: 'option-text' }, String(q.options[letter] ?? '')));
      optionButtons.push(btn);
      group.append(btn);
    });
    content.append(group);
    content.append(h('p', { class: 'kbd-hint' },
      'Keys: A–G or 1–7 select · ← → move · F flag'));
    updateOptions();
  }

  function updateOptions() {
    if (view !== 'question') return;
    const q = question(index);
    const chosen = responseOf(ids[index]);
    const need = requiredCount(q);
    const full = q.type === 'multi' && chosen.length >= need;
    for (const btn of optionButtons) {
      const on = chosen.includes(btn.dataset.letter);
      btn.setAttribute('aria-checked', String(on));
      btn.classList.toggle('is-selected', on);
      const block = full && !on;
      btn.classList.toggle('is-blocked', block);
      if (block) btn.setAttribute('aria-disabled', 'true');
      else btn.removeAttribute('aria-disabled');
    }
  }

  function renderReview() {
    const counts = { answered: 0, incomplete: 0, flagged: 0 };
    ids.forEach((id, i) => {
      if (isComplete(i)) counts.answered += 1; else counts.incomplete += 1;
      if (flaggedSet.has(id)) counts.flagged += 1;
    });

    content.append(h('h1', { class: 'review-title' }, 'Review Questions'));
    content.append(h('p', { class: 'review-summary' },
      `${counts.answered} answered · ${counts.incomplete} incomplete · ${counts.flagged} flagged`));

    const filters = [
      ['all', `All (${ids.length})`],
      ['flagged', `Flagged (${counts.flagged})`],
      ['incomplete', `Incomplete (${counts.incomplete})`],
    ];
    content.append(h('div', { class: 'review-filters', role: 'group', 'aria-label': 'Filter questions' },
      filters.map(([key, label]) => h('button', {
        type: 'button', class: `review-filter${reviewFilter === key ? ' is-active' : ''}`,
        'aria-pressed': String(reviewFilter === key),
        onclick: () => { reviewFilter = key; render(); },
      }, label))));

    content.append(h('div', { class: 'review-legend', 'aria-hidden': 'true' },
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch is-answered' }), 'Answered'),
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch is-incomplete' }), 'Incomplete'),
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch is-flagged' }, '⚑'), 'Flagged')));

    const grid = h('div', { class: 'review-grid' });
    let shown = 0;
    ids.forEach((id, i) => {
      const done = isComplete(i);
      const flagged = flaggedSet.has(id);
      if (reviewFilter === 'flagged' && !flagged) return;
      if (reviewFilter === 'incomplete' && done) return;
      shown += 1;
      const state = [done ? 'answered' : 'incomplete', flagged ? 'flagged' : null].filter(Boolean).join(', ');
      grid.append(h('button', {
        type: 'button',
        class: `review-cell ${done ? 'is-answered' : 'is-incomplete'}${flagged ? ' is-flagged' : ''}${i === index ? ' is-current' : ''}`,
        'aria-label': `Question ${i + 1}, ${state}`,
        onclick: () => showQuestion(i),
      }, String(i + 1), flagged ? h('span', { class: 'cell-flag', 'aria-hidden': 'true' }, '⚑') : null));
    });
    content.append(shown ? grid : h('p', { class: 'review-empty' }, 'No questions match this filter.'));
  }

  // ---------- actions ----------
  function choose(letter) {
    if (submitted || view !== 'question') return;
    const q = question(index);
    const id = ids[index];
    if (!Object.prototype.hasOwnProperty.call(q.options || {}, letter)) return;
    const current = responseOf(id);
    let next;
    if (q.type === 'multi') {
      if (current.includes(letter)) next = current.filter((l) => l !== letter);
      else if (current.length < requiredCount(q)) next = [...current, letter].sort();
      else return; // limit reached: deselect something first
    } else {
      if (current.length === 1 && current[0] === letter) return;
      next = [letter];
    }
    attempt.responses[id] = next;
    updateOptions();
    save();
  }

  function chooseByPosition(pos) {
    const btn = optionButtons[pos];
    if (btn) choose(btn.dataset.letter);
  }

  function toggleFlag() {
    if (submitted || view !== 'question') return;
    const id = ids[index];
    if (flaggedSet.has(id)) flaggedSet.delete(id); else flaggedSet.add(id);
    updateChrome();
    save();
  }

  function showQuestion(i) {
    index = Math.min(Math.max(i, 0), ids.length - 1);
    view = 'question';
    render();
    save();
    window.scrollTo(0, 0);
  }

  function goPrev() { if (index > 0) showQuestion(index - 1); }
  function goNext() {
    if (index < ids.length - 1) showQuestion(index + 1);
    else openReview();
  }
  function openReview() {
    view = 'review';
    render();
    save();
    window.scrollTo(0, 0);
  }

  function confirmEnd() {
    if (submitted) return;
    let incomplete = 0;
    let flagged = 0;
    ids.forEach((id, i) => {
      if (!isComplete(i)) incomplete += 1;
      if (flaggedSet.has(id)) flagged += 1;
    });
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    if (typeof dialog.showModal !== 'function') {
      if (window.confirm(`End the exam? You have ${plural(incomplete, 'unanswered question')} and ${plural(flagged, 'flagged question')}.`)) submit();
      return;
    }
    const cancel = h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Return to Exam');
    const confirm = h('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: () => { dialog.close(); submit(); },
    }, 'End Exam');
    dialog.replaceChildren(
      h('h2', { id: 'exam-dialog-title' }, 'End the exam?'),
      h('ul', { class: 'exam-dialog-counts' },
        h('li', { class: incomplete ? 'is-warn' : '' }, `${plural(incomplete, 'unanswered question')}`),
        h('li', { class: flagged ? 'is-flag' : '' }, `${plural(flagged, 'flagged question')}`)),
      h('p', { text: 'Once you end the exam you cannot change your answers. Unanswered questions are scored as incorrect.' }),
      h('div', { class: 'exam-dialog-actions' }, cancel, confirm));
    dialog.showModal();
    cancel.focus();
  }

  function submit() {
    if (submitted) return;
    tick(true);
    save();
    submitted = true;
    stopTimer();
    if (dialog.open) dialog.close();
    try {
      const result = E.scoreAttempt(attempt, ctx.bankById, ctx.settings);
      E.addResult(result);
      E.updateStats(result);
      E.clearInProgress();
      ctx.navigate(`#/results/${encodeURIComponent(result.id)}`);
    } catch (err) {
      submitted = false;
      errorEl = h('div', { class: 'banner exam-error', role: 'alert' },
        `Could not submit the exam: ${err && err.message ? err.message : err}. Your answers are still saved; try End Exam again.`);
      render();
    }
  }

  // ---------- timer ----------
  function tick(noSubmit) {
    if (submitted) return;
    const now = Date.now();
    const delta = (now - lastTick) / 1000;
    lastTick = now;
    if (delta > 0) {
      elapsed += delta;
      if (timed) remaining = Math.max(0, remaining - delta);
    }
    syncTime();
    updateTimer();
    if (noSubmit === true) return;
    if (timed && remaining <= 0) { submit(); return; }
    if (now - lastSave >= SAVE_EVERY_MS) save();
  }
  function startTimer() {
    lastTick = Date.now();
    timerId = setInterval(tick, TICK_MS);
  }
  function stopTimer() {
    if (timerId !== null) clearInterval(timerId);
    timerId = null;
  }

  // ---------- keyboard ----------
  function onKey(e) {
    if (submitted || e.defaultPrevented) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (dialog.open) return;
    const key = e.key;
    if (view === 'review') {
      if (key === 'Escape') { e.preventDefault(); showQuestion(index); }
      return;
    }
    if (key === 'ArrowLeft') { e.preventDefault(); goPrev(); return; }
    if (key === 'ArrowRight') { e.preventDefault(); goNext(); return; }
    if (e.repeat || key.length !== 1) return;
    const up = key.toUpperCase();
    if (up === 'F') { e.preventDefault(); toggleFlag(); return; }
    // Letters keep their original option letter (SPEC 6), even when shuffled;
    // 1–7 pick by displayed position.
    if (LETTERS.includes(up)) { e.preventDefault(); choose(up); return; }
    if (key >= '1' && key <= '7') { e.preventDefault(); chooseByPosition(Number(key) - 1); }
  }

  function onHide() {
    if (document.visibilityState === 'hidden') { tick(true); save(); }
  }
  function onPageHide() { tick(true); save(); }

  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);

  render();
  save();
  if (timed && remaining <= 0) submit();
  else startTimer();

  return function cleanup() {
    if (!submitted) { tick(true); save(); }
    stopTimer();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
    document.body.classList.remove('in-exam');
    if (dialog.open) dialog.close();
  };
}
