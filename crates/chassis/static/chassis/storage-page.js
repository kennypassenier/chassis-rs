import { api } from './json-api.js';
import { editHtml, fixedBy, levelFor, mbBytes, problemWith } from './storage-budget-form.js';
import { attentionBand, budgetHtml, figureOf, stackSpec, totals } from './storage-budget-html.js';
import { defaultForm, readForm, selectionOf } from './storage-clean-form.js';
import { cleanInner, cleanShell } from './storage-clean-html.js';
import { compactHtml } from './storage-compact-card.js';
import { compactInner, compactShell } from './storage-compact-html.js';
import { levelBadge, size, num } from './storage-format.js';
import { escapeHtml } from './format-text.js';
import { kindRow } from './storage-kinds.js';
import { partsAttacher } from './storage-parts.js';

/* ======================================================================
   storage (kit-storage, 3.11.0)
   The Storage page, built as Kenny approved it in the demo
   research/chassis-storage (formal, 21/10/2026 07:42: the kinds as a
   table, the kind's name typed to confirm). The server draws the frame with
   every card waiting; this block reads /api/kit/storage, fills the budget,
   the empty space and the kinds, and opens two modal dialogs:
     - clean up one kind: choose, read-only preview, typed confirmation,
       one transaction (the server counts again before it deletes);
     - compact the application file (VACUUM), on demand only.
   The figures are never in the page's source: they are read. Sizes are
   decimal and human (1 MB = 1 000 000 bytes), counts keep every digit,
   dates are dd/mm/yyyy HH:mm in Europe/Brussels (UI principles, rule 52).
   Stable control ids for the homelab Live view (docs/DASHBOARD.md):
     storage-open-clean-<kind>  a row's Clean up      storage-band-clean   the warning's button
     storage-open-compact       the card's Compact…
     storage-clean-dialog, -older, -filter-<name>, -reset, -preview,
     -continue, -confirm (the block; the field is inside), -back, -delete,
     -close, -done
     storage-compact-dialog, -run, -cancel, -done
   Starts only where [data-chassis-storage] is.
   ====================================================================== */
const storageRoot = document.querySelector('[data-chassis-storage]');
if (storageRoot) {
  startStorage(storageRoot).catch((error) => console.error('chassis storage page', error));
}

async function startStorage(root) {
  const kp = (name) => import(`../kp/js/${name}.js`);
  const [stackbar, cardState, datatable, flash, overlays] = await Promise.all([kp('stackbar'), kp('card-state'), kp('datatable'), kp('flash'), kp('overlays')]);
  const { setStackbar } = stackbar;
  const { setCardState } = cardState;
  const { dataTable } = datatable;
  const { runFlashButton } = flash;

  const attachParts = partsAttacher(kp);
  const esc = escapeHtml;

  /* ---------------------------------------------------------- the data -- */
  let data = null; // the last GET /api/kit/storage
  const kindById = (id) => data?.kinds.find((k) => k.id === id);

  let draft = null; // { budget, warn } as typed; null when nothing differs from the saved setting
  let formSignature = '';
  const settingOf = () => data.budget.setting;
  const savedPair = () => ({ budget: settingOf().budget_mb, warn: settingOf().warn_mb });
  // Redraw everything that follows from the draft; never touches the fields' own text.
  function liveBudget() {
    const form = budgetCard.querySelector('.storage-budget-form');
    if (!form || !data) return;
    const s = settingOf();
    const saved = savedPair();
    const raw = (key) => form.querySelector(`[data-storage-field="${key}"]`).value.trim().replace(',', '.');
    const typed = { budget: raw('budget') === '' ? NaN : Number(raw('budget')), warn: raw('warn') === '' ? NaN : Number(raw('warn')) };
    const differs = typed.budget !== saved.budget || typed.warn !== saved.warn;
    draft = differs ? typed : null;
    const bad = problemWith(typed, data);
    const total = data.budget.total_bytes;
    const shown = bad ? saved : typed; // an invalid draft shows the saved figures, not nonsense
    const level = levelFor(total, mbBytes(shown.budget), mbBytes(shown.warn));
    const t = { ...totals(data), budget: mbBytes(shown.budget), warn: mbBytes(shown.warn), level, share: total / mbBytes(shown.budget) };
    // The figure, the bar with its warn mark, the level badge.
    const kpi = budgetCard.querySelector('.storage-budget__figure .kp-kpi');
    const fig = figureOf(t);
    kpi.querySelector('.kp-kpi__value').innerHTML = fig.value;
    kpi.querySelector('.kp-kpi__trend').textContent = fig.trend;
    if (fig.tone) kpi.setAttribute('data-kp-tone', fig.tone);
    else kpi.removeAttribute('data-kp-tone');
    const bar = budgetCard.querySelector('[data-storage-stackbar]');
    if (bar) setStackbar(bar, stackSpec(t));
    budgetCard.querySelector('[data-storage-level]').innerHTML = levelBadge(level);
    // The words under each field.
    const pct = (b) => `${num(Math.round((total / mbBytes(b)) * 100))} %`;
    const note = (key, text, invalid) => {
      const el = form.querySelector(`[data-storage-note="${key}"]`);
      el.textContent = text;
      el.classList.toggle('kp-text-destructive', Boolean(invalid));
      form.querySelector(`[data-storage-field="${key}"]`).toggleAttribute('aria-invalid', Boolean(invalid));
      if (invalid) form.querySelector(`[data-storage-field="${key}"]`).setAttribute('aria-invalid', 'true');
    };
    const badField = bad?.[0];
    note('budget', badField === 'budget' ? bad[1] : `${size(total)} used of ${size(mbBytes(shown.budget))} (${pct(shown.budget)}).${s.budget_fixed ? ` ${fixedBy(s.budget_fixed)}` : ''}`, badField === 'budget');
    note('warn', badField === 'warn' ? bad[1] : `Warns from ${size(mbBytes(shown.warn))}, ${Math.round((shown.warn / shown.budget) * 100)} % of the budget; ${size(Math.max(0, mbBytes(shown.warn) - total))} to go.${s.warn_fixed ? ` ${fixedBy(s.warn_fixed)}` : ''}`, badField === 'warn');
    // The buttons say why they are off.
    const save = form.querySelector('#storage-budget-save');
    const reset = form.querySelector('#storage-budget-reset');
    const bothFixed = Boolean(s.budget_fixed && s.warn_fixed);
    const saveOff = bothFixed || !draft || Boolean(bad);
    const resetOff = bothFixed || (!s.stored && !differs);
    save.disabled = saveOff;
    reset.disabled = resetOff;
    form.querySelector('[data-storage-budget-state]').textContent = bothFixed
      ? 'Both values are fixed by configuration, so nothing can be saved here.'
      : bad ? 'Fix the marked field to save.' : !draft ? (s.stored ? 'This is the saved setting. Reset goes back to the default.' : 'This is the default setting. Change a value to save it.') : 'Not saved yet.';
  }

  function paintBudgetForm() {
    const host = budgetCard.querySelector('[data-storage-budget-edit]');
    if (!host) return Promise.resolve();
    const s = settingOf();
    const signature = JSON.stringify([s.budget_mb, s.warn_mb, s.stored, s.budget_fixed, s.warn_fixed, s.max_mb]);
    if (host.firstElementChild && (signature === formSignature || draft)) {
      liveBudget();
      return Promise.resolve();
    }
    formSignature = signature;
    draft = null;
    host.innerHTML = editHtml(settingOf(), draft ?? savedPair(), data);
    return attachParts(host).then(liveBudget);
  }

  async function saveBudget(button, body, word) {
    let answer = null;
    await runFlashButton(button, async () => {
      try {
        answer = await api('/api/kit/storage/budget', body);
        return word;
      } catch (error) {
        return { error: error.message.replace(/\.+$/, ''), word: 'Refused', remedy: error.body?.remedy };
      }
    });
    if (!answer) return;
    draft = null;
    formSignature = '';
    const b = answer.budget;
    overlays.toast(
      body.reset
        ? `Budget back to the default: ${size(b.budget_bytes)}, warning from ${size(b.warn_bytes)}.`
        : `Budget saved: ${size(b.budget_bytes)}, warning from ${size(b.warn_bytes)}.`,
      { ms: 4000 },
    );
    await load({ quiet: true });
  }

  /* --------------------------------------------------------- the cards -- */
  const card = (key) => root.querySelector(`[data-storage-card="${key}"]`);
  const budgetCard = card('budget');
  const compactCard = card('compact');
  const kindsCard = card('kinds');
  const tableSkeleton = kindsCard.querySelector('.kp-datatable').outerHTML;
  const narrow = matchMedia('(max-width: 639px)');
  let table = null; // the kinds table's handle

  // The table is drawn once per width class: data-kp-cards makes its rows
  // cards, and the package reads it when the table attaches.
  async function mountTable() {
    const old = kindsCard.querySelector('.kp-datatable');
    const fresh = Object.assign(document.createElement('div'), { innerHTML: tableSkeleton }).firstElementChild;
    if (narrow.matches) fresh.setAttribute('data-kp-cards', '');
    old.replaceWith(fresh);
    await attachParts(fresh.parentElement);
    table = dataTable(fresh);
    return fresh;
  }

  function cardsReading() {
    setCardState(budgetCard, 'loading', { words: 'Reading the storage…' });
    setCardState(compactCard, 'loading', { words: 'Reading the storage…' });
    table?.busy({ text: 'Reading what is stored…', overlay: true });
    table?.state('loading');
  }

  function cardsFailed(error) {
    const text = `${error.message.replace(/\.*$/, '.')} Nothing was changed.`;
    setCardState(budgetCard, 'error', { title: 'The storage could not be read', text, action: 'Try again' });
    setCardState(compactCard, 'error', { title: 'The storage could not be read', text, action: 'Try again' });
    table?.fail(text);
  }

  async function paint() {
    const t = totals(data);
    // The warning: one band, the worst fact first, with its fix.
    root.querySelector('[data-storage-band]')?.remove();
    const band = attentionBand(t, data);
    if (band) {
      root.querySelector('.kp-ops__head').insertAdjacentHTML('afterend', band);
      await attachParts(root);
    }
    budgetCard.querySelector('[data-storage-level]').innerHTML = levelBadge(t.level);
    budgetCard.querySelector('[data-storage-budget-about]').textContent =
      `Everything this service keeps on disk, against a budget of ${size(t.budget)}. The budget only warns: nothing is ever deleted for you.`;
    const budgetData = budgetCard.querySelector('[data-storage-budget]');
    // The editor outlives a redraw: a refresh must not eat what is being typed.
    const keptEditor = budgetData.querySelector('[data-storage-budget-edit]');
    budgetData.innerHTML = budgetHtml(t);
    if (keptEditor?.firstElementChild) budgetData.querySelector('[data-storage-budget-edit]').replaceWith(keptEditor);
    await attachParts(budgetData);
    setStackbar(budgetData.querySelector('[data-storage-stackbar]'), stackSpec(t));
    await paintBudgetForm();
    const compactData = compactCard.querySelector('[data-storage-compact]');
    compactData.innerHTML = compactHtml(t, data);
    await attachParts(compactData);
    kindsCard.querySelector('[data-storage-kinds-title]').textContent = `What is stored (${data.kinds.length} ${data.kinds.length === 1 ? 'kind' : 'kinds'})`;
    const sorted = [...data.kinds].sort((a, b) => b.bytes - a.bytes);
    root.querySelector('[data-storage-kinds]').innerHTML = sorted.map((k) => kindRow(k, t.budget)).join('');
    setCardState(budgetCard, 'ready');
    setCardState(compactCard, 'ready');
    table?.state('ready');
    table?.refresh();
  }

  // Read the storage. The first read (and a retry) shows the waiting states;
  // a refresh reads quietly and keeps what is on screen if it fails.
  let reading = null;
  async function load({ quiet = false } = {}) {
    if (reading) return reading;
    reading = (async () => {
      if (!quiet || !data) cardsReading();
      try {
        data = await api('/api/kit/storage');
      } catch (error) {
        if (!quiet || !data) cardsFailed(error);
        return false;
      }
      await paint();
      return true;
    })().finally(() => {
      reading = null;
    });
    return reading;
  }

  /* ------------------------------------------------------- the dialogs -- */
  let dialog = null; // { host, dlg, kind: 'clean' | 'compact', state }

  async function openModal(html, state, kind, extra) {
    dialog?.dlg.close();
    const host = document.createElement('div');
    host.setAttribute('data-storage-modal', '');
    host.innerHTML = html;
    document.body.append(host);
    const dlg = host.querySelector('dialog');
    // The page behind may be drawn again while the dialog is open; the key
    // goes back to the control that opened it, by its stable id.
    const opener = document.activeElement?.id || '';
    dialog = { host, dlg, kind, state };
    await hydrate(host);
    await attachParts(host);
    dlg.addEventListener('close', () => {
      host.remove();
      if (dialog?.host === host) dialog = null;
      if (opener && (!document.activeElement || document.activeElement === document.body)) document.getElementById(opener)?.focus();
    });
    dlg.addEventListener('cancel', (event) => {
      if (dialog?.kind === 'compact' && dialog.state.state === 'running') event.preventDefault();
    });
    dlg.showModal();
    return extra ? extra(dlg) : dlg;
  }

  // The package's states on the cards of a drawn dialog.
  async function hydrate(scope) {
    for (const el of scope.querySelectorAll('[data-storage-card="preview"]')) {
      const asked = el.dataset.storagePstate;
      if (asked === 'loading') setCardState(el, 'loading', { words: 'Counting the rows…' });
      else if (asked === 'idle') setCardState(el, 'empty', { title: 'Nothing to preview yet', text: 'Choose what to remove, then press Preview. Nothing is deleted by looking.' });
      else if (asked === 'empty') setCardState(el, 'empty', { title: 'Nothing matches', text: 'No row fits these choices, so there is nothing to delete. Change the date or a choice and preview again.' });
      else if (asked === 'invalid') setCardState(el, 'empty', { title: 'That is not a date', text: 'Type the day as dd/mm/yyyy, for example 30/06/2026, then press Preview.' });
      else if (asked === 'error') setCardState(el, 'error', { title: 'The preview could not be made', text: dialog?.state.error || 'The service did not answer.', action: 'Try again' });
    }
    for (const el of scope.querySelectorAll('[data-storage-card="steps"]')) {
      const asked = el.dataset.storageSstate;
      if (asked === 'checking') setCardState(el, 'loading', { words: 'Reading the file…' });
      else if (asked === 'failed') setCardState(el, 'error', { title: 'Compacting did not finish', text: dialog?.state.error || 'The file could not be compacted. Nothing was changed.', action: 'Try again' });
      else if (asked === 'unreadable') setCardState(el, 'error', { title: 'The file could not be read', text: dialog?.state.error || 'The service did not answer.', action: 'Try again' });
    }
  }

  // Draw the inside of the open dialog again, keeping it open and the focus where it was.
  async function redraw() {
    if (!dialog) return;
    const { dlg, kind, state } = dialog;
    const keep = document.activeElement && dlg.contains(document.activeElement) ? document.activeElement : null;
    const key = keep ? keep.id || keep.getAttribute('data-storage-filter') || '' : '';
    dlg.innerHTML = kind === 'clean' ? cleanInner(state, kindById(state.kind), narrow.matches) : compactInner(state, totals(data));
    // The states first, in the same frame as the markup, so a card never stands
    // for a moment in a state it has no plate for; then the parts attach.
    await hydrate(dlg);
    await attachParts(dlg);
    if (key) dlg.querySelector(`#${CSS.escape(key)}, [data-storage-filter="${CSS.escape(key)}"]`)?.focus();
  }

  const note = (text, extra = '') => `<p class="kp-dialog__note"${extra}>${esc(text)}</p>`;

  // The read-only count the server answers: rows, bytes, oldest, newest, samples and the token a delete needs.
  async function runPreview(c) {
    const k = kindById(c.kind);
    const sel = selectionOf(k, c.form);
    c.p = null;
    c.asked = null;
    if (sel === null) {
      c.preview = 'invalid';
      return redraw();
    }
    c.preview = 'loading';
    await redraw();
    try {
      const p = await api(`/api/kit/storage/${encodeURIComponent(c.kind)}/preview`, sel);
      if (dialog?.state !== c) return;
      c.p = p;
      c.asked = sel;
      c.preview = 'ready';
    } catch (error) {
      if (dialog?.state !== c) return;
      c.preview = 'error';
      c.error = error.message;
    }
    await redraw();
  }

  async function openCleanup(kindId) {
    const k = kindById(kindId);
    if (!k) return;
    const c = { kind: k.id, step: 'choose', preview: 'loading', form: defaultForm(k), p: null, asked: null, done: null, error: '' };
    await openModal(cleanShell(c, k, narrow.matches), c, 'clean');
    await runPreview(c);
  }

  async function doDelete(button, c) {
    const typed = dialog.dlg.querySelector('[data-kp-type-confirm] input')?.value ?? '';
    let result = null;
    await runFlashButton(button, async () => {
      try {
        const body = await api(`/api/kit/storage/${encodeURIComponent(c.kind)}/delete`, { ...c.asked, token: c.p.token, confirm: typed });
        result = body;
        return undefined;
      } catch (error) {
        return { error: error.message.replace(/\.+$/, ''), word: 'Refused', remedy: error.body?.remedy };
      }
    });
    if (!result || dialog?.state !== c) return;
    c.done = { count: result.deleted.deleted, free: result.deleted.reclaimable_bytes };
    c.step = 'done';
    await load({ quiet: true });
    await redraw();
  }

  // What a compact would do, asked of the service at the moment the dialog opens.
  async function checkCompact(c) {
    c.state = 'checking';
    c.error = '';
    await redraw();
    try {
      const p = await api('/api/kit/storage/compact/preview', {});
      if (dialog?.state !== c) return;
      c.free = p.reclaimable_bytes;
      c.state = p.paused ? 'paused' : p.reclaimable_bytes > 0 || totals(data).wal > 0 ? 'ready' : 'none';
    } catch (error) {
      if (dialog?.state !== c) return;
      c.state = 'unreadable';
      c.error = error.message;
    }
    await redraw();
  }

  async function openCompact() {
    const c = { state: 'checking', free: 0, freed: 0, error: '' };
    await openModal(compactShell(c, totals(data)), c, 'compact');
    await checkCompact(c);
  }

  async function runCompact(button, c) {
    const before = totals(data);
    const gain = c.free + before.wal;
    let ok = false;
    c.state = 'running';
    const list = dialog.dlg.querySelector('.kp-steplist');
    for (const [id, state] of [['pause', 'done'], ['rewrite', 'running']]) list?.querySelector(`[data-kp-step-id="${id}"]`)?.setAttribute('data-state', state);
    dialog.dlg.querySelector('#storage-compact-cancel')?.setAttribute('disabled', '');
    await runFlashButton(button, async () => {
      try {
        await api('/api/kit/storage/compact', {});
        ok = true;
        return undefined;
      } catch (error) {
        c.error = `${error.message.replace(/\.*$/, '.')} Nothing was changed.`;
        return { error: error.message.replace(/\.+$/, ''), word: 'Failed', remedy: error.body?.remedy };
      }
    });
    if (dialog?.state !== c) return;
    if (ok) {
      c.freed = gain;
      c.state = 'done';
      await load({ quiet: true });
    } else c.state = 'failed';
    await redraw();
  }

  /* ----------------------------------------------------------- events -- */
  document.addEventListener('click', async (event) => {
    const t = event.target instanceof Element ? event.target : null;
    if (!t) return;
    const cleanup = t.closest('[data-storage-cleanup]');
    if (cleanup && root.contains(cleanup)) {
      event.preventDefault();
      await openCleanup(cleanup.getAttribute('data-storage-cleanup'));
      return;
    }
    if (t.closest('[data-storage-compact]') && !t.closest('[disabled]')) {
      event.preventDefault();
      await openCompact();
      return;
    }
    const dlg = dialog && dialog.dlg.contains(t) ? dialog : null;
    if (!dlg) return;
    const c = dlg.state;
    if (dlg.kind === 'clean') {
      if (t.closest('[data-storage-reset]')) {
        c.form = defaultForm(kindById(c.kind));
        c.preview = 'idle';
        c.p = null;
        await redraw();
      } else if (t.closest('[data-storage-preview]')) {
        readForm(dlg.dlg, c, kindById(c.kind));
        await runPreview(c);
      } else if (t.closest('[data-storage-continue]')) {
        c.step = 'confirm';
        await redraw();
        dlg.dlg.querySelector('[data-kp-type-confirm] input')?.focus();
      } else if (t.closest('[data-storage-back]')) {
        c.step = 'choose';
        await redraw();
      } else if (t.closest('[data-storage-delete]')) {
        await doDelete(t.closest('[data-storage-delete]'), c);
      }
    } else if (dlg.kind === 'compact' && t.closest('[data-storage-run]')) {
      await runCompact(t.closest('[data-storage-run]'), c);
    }
  });

  // The budget editor: typing and the stepper change the draft; Save and Reset post.
  for (const type of ['input', 'change', 'kp-quantity-change']) {
    root.addEventListener(type, (event) => {
      if (event.target instanceof Element && event.target.closest('.storage-budget-form')) liveBudget();
    });
  }
  root.addEventListener('click', async (event) => {
    const t = event.target instanceof Element ? event.target : null;
    const save = t?.closest('[data-storage-budget-save]');
    const reset = t?.closest('[data-storage-budget-reset]');
    if (!save && !reset) return;
    event.preventDefault();
    if ((save ?? reset).disabled) return;
    if (save) {
      const s = settingOf();
      const body = {};
      if (!s.budget_fixed) body.budget_mb = draft.budget;
      if (!s.warn_fixed) body.warn_mb = draft.warn;
      await saveBudget(save, body, 'Saved');
    } else await saveBudget(reset, { reset: true }, 'Reset');
  });

  // A card or a table that failed asks again through the package's own retry event.
  document.addEventListener('kp-card-retry', async (event) => {
    const el = event.target instanceof Element ? event.target : null;
    if (!el) return;
    if (dialog && dialog.dlg.contains(el)) {
      if (dialog.kind === 'clean') await runPreview(dialog.state);
      else await checkCompact(dialog.state);
    } else if (root.contains(el)) await load();
  });
  root.addEventListener('kp-datatable-retry', () => load());
  // A change of any choice in the clean-up dialog makes the old preview stale: it is asked for again.
  for (const type of ['change', 'kp-segmented-change', 'kp-date-change']) {
    document.addEventListener(type, async (event) => {
      const el = event.target instanceof Element ? event.target : null;
      if (!dialog || dialog.kind !== 'clean' || !el || !dialog.dlg.contains(el)) return;
      if (!el.closest('[data-storage-filter], [data-storage-older], .kp-datepicker')) return;
      const c = dialog.state;
      readForm(dialog.dlg, c, kindById(c.kind));
      if (c.preview !== 'idle' && c.step === 'choose') {
        c.preview = 'idle';
        c.p = null;
        await redraw();
      }
    });
  }
  // The header's refresh control reads again, quietly.
  root.addEventListener('kp-refresh', async (event) => event.detail.done(await load({ quiet: true })));
  // A phone shows the kinds as cards; crossing that width draws the table again.
  narrow.addEventListener('change', async () => {
    if (!data) return;
    await mountTable();
    await paint();
  });

  /* ------------------------------------------------------------- start -- */
  await mountTable();
  await attachParts(root);
  // The first read goes through the header's own control, so its line says
  // when the page was read ("updated now") and a failure shows there too.
  const { refreshOf } = await kp('auto-refresh');
  const refresh = refreshOf(root.querySelector('.kp-refresh'));
  if (refresh) refresh.now('now');
  else await load();
}
