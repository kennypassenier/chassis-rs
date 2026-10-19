// The kit's dashboard behaviours (K12, K13, K14, rule 31). Everything
// else is server-rendered HTML and plain forms. This module is the kit's
// own file, not vendored: the gate does not check it against kp-themes.
//
// It attaches the four @kp-soft/themes behaviours the kit's templates use
// (v3.x modules are pure, so somebody has to call them), then wires the
// kit's own controls:
//
//   [data-reveal="ID"]        fetch the token once, show it for N seconds
//   [data-copy-token="ID"]    fetch and copy ONLY the token (Kenny's ask)
//   [data-copy-command="ID"]  fetch and copy the whole curl line
//   [data-test="ID"]          send the test request, then refresh requests
//   [data-requests="ID"]      toggle the last-requests panel, loading it
//   [data-post]               a POST-and-reload button (re-issue, revoke, delete)
//
// The token is never in the page: every reveal/copy fetches
// /api/clients/ID/token on click, so a "view source" or a cached page holds
// nothing (K12).
//
// Clipboard: navigator.clipboard exists only in a secure context (https, or
// http://localhost). On http://inbox.lan:8080 from another machine the
// execCommand fallback runs; it works only inside a real click, which is
// exactly where these buttons live. (kyu's finding, kept.)

import { attachThemePickers } from './kp/js/theme-picker.js';
import { enforceContracts, attachConfirmations, attachSkipLinks } from './kp/js/components.js';
import { attachEffects } from './kp/js/effects.js';

attachThemePickers();
enforceContracts();
attachConfirmations();
// K15, kp-themes 5.0.0 (R2-b, 2026-09-09): js/effects.js performs what a
// stylesheet cannot — the block cursor inside a focused field for a theme
// that sets `--kp-caret: block` (none of kp-themes 11.0.0's twelve does, since
// terminal left; the hook stays for one that will) (the register paints the cell, the module writes the column), the
// themes' arrivals and reveals. The kit's own pages carry no reveal hooks,
// so on them the module does the caret and the arrival only.
//
// The caret is bound at attach time and only if the theme active at that
// moment answers `--kp-caret: block`; a page loaded in formal and switched
// to a caret theme would keep the browser's caret. Measured 2026-09-09: detach()
// does not forget the fields it bound (a module-level WeakSet), so
// detach-and-reattach cannot rebind them — instead the kit attaches once
// more, the first time a caret theme becomes active after load. Bound
// fields stay bound; whether the cell is painted is the register's call.
// This works because every register is already in dist/kp-themes.css: the
// knob is readable the moment the theme attribute changes (D2).
let effects = attachEffects(document);
let caretAttached = caretTheme();
function caretTheme() {
  return getComputedStyle(document.documentElement).getPropertyValue('--kp-caret').trim() === 'block';
}
document.addEventListener('kp-theme-change', () => {
  if (caretAttached || !caretTheme()) return;
  caretAttached = true;
  effects = attachEffects(document);
});

attachSkipLinks();

// Where a scratch field has to live to be selectable. A modal <dialog> puts
// itself in the top layer and makes EVERYTHING outside it inert, so a field
// appended to <body> while one is open can never be focused (feat-clients-4
// moved these buttons into exactly such a dialog).
function topLayerHost() {
  try {
    const modal = document.querySelector('dialog:modal');
    if (modal) return modal;
  } catch (_) {
    // :modal is recent; an engine that does not know it falls through.
  }
  return document.body;
}

// Copy without the clipboard API, for the plain-http case where that API does
// not exist. Two things this has to get right, both measured on CT 118 with
// inbox 0.1.8 on 2026-09-10:
//
//   1. The field goes in the top layer when a modal dialog is open. With it
//      on <body>, `document.activeElement` stayed BODY and the selection was
//      empty — the field was inert.
//   2. `execCommand('copy')` returned TRUE anyway, with nothing selected. Its
//      return value is therefore not a verdict (standing rule 34: an
//      always-true term in a verdict is a defect), so the selection is
//      checked and that is what decides.
//
// Together those produced a button that flashed "Copied" over an untouched
// clipboard, which is worse than a button that reports failure.
function copyLegacy(text) {
  const host = topLayerHost();
  const scratch = document.createElement('textarea');
  scratch.value = text;
  scratch.setAttribute('readonly', '');
  scratch.style.position = 'fixed';
  scratch.style.left = '-9999px';
  host.appendChild(scratch);
  scratch.focus();
  scratch.select();
  const selected = scratch.selectionEnd - scratch.selectionStart === text.length;
  let copied = false;
  if (selected) {
    try {
      copied = document.execCommand('copy');
    } catch (_) {
      copied = false;
    }
  }
  host.removeChild(scratch);
  return copied && selected;
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => copyLegacy(text));
  }
  return Promise.resolve(copyLegacy(text));
}

// The label a button goes back to after a busy spell or a flash. Saved
// on the button the first time either needs it; the reveal button moves
// it between Reveal and Hide itself.
function restLabel(button) {
  if (button.dataset.label === undefined) button.dataset.label = button.textContent;
  return button.dataset.label;
}

// Show a message on the button for a moment, then its rest label. Safe to
// call from inside `busy`: the flash outlives the busy spell (K29, found
// while wiring project actions — a remedy flashed during `busy` was
// overwritten the same tick by busy's own restore, so no [data-post]
// refusal was ever visible, and the button then came back wearing its
// busy label).
function flash(button, message, ms = 1500) {
  restLabel(button);
  pinWidth(button);
  button.textContent = message;
  window.clearTimeout(button.flashTimer);
  button.flashTimer = window.setTimeout(() => {
    button.flashTimer = 0;
    button.textContent = button.dataset.label;
    unpinWidth(button);
  }, ms);
}

// rule 31: busy while a request is in flight; disabled so a second click
// cannot become a second action.
// feat-clients-5: a control that reports it is working may not move the
// layout around it (Kenny, looking at a live dashboard on 2026-09-10:
// clicking `Send test` made Revoke and Delete jump from stacked to side by
// side). The cause is width, not the label: these buttons sit in a wrapping
// flex row inside a table cell, so a busy label narrower than the rest label
// — "Sending…" against "Send test" — lets the row unwrap, and the whole cell
// re-lays out under the reader's cursor. Measuring the button once and
// holding that as a floor keeps every other element where it was.
//
// What this does NOT hold: a refusal flashed on the button carries a whole
// remedy sentence (K29) and is wider than any rest label, so that case still
// grows the button. Narrowing it would hide the remedy, which is the more
// important of the two; feat-clients-4 removes the problem at the root by
// moving these controls out of the table row and into a modal.
function pinWidth(button) {
  if (button.dataset.restWidth === undefined) {
    button.dataset.restWidth = String(Math.ceil(button.getBoundingClientRect().width));
  }
  button.style.minWidth = `${button.dataset.restWidth}px`;
}

// Only once the button is wearing its rest label again — releasing it while a
// flash is still up would let the row jump a second time.
function unpinWidth(button) {
  button.style.minWidth = '';
  delete button.dataset.restWidth;
}

async function busy(button, work) {
  if (button.getAttribute('aria-busy') === 'true') return;
  restLabel(button);
  pinWidth(button);
  button.setAttribute('aria-busy', 'true');
  button.disabled = true;
  button.textContent = button.dataset.busyLabel || 'Working…';
  try {
    await work();
  } finally {
    button.removeAttribute('aria-busy');
    button.disabled = false;
    // A flash raised by `work` stays on screen; the timer restores the label.
    if (!button.flashTimer) {
      button.textContent = button.dataset.label;
      unpinWidth(button);
    }
  }
}

// The one line a refusal becomes on a button: the kit's error and its
// remedy when the body carries them (project routes answer the same shape
// through chassis::Error), the bare status otherwise.
function refusal(res, body) {
  if (body.error && body.remedy) return `${body.error}. ${body.remedy}`;
  return body.remedy || body.error || `HTTP ${res.status}`;
}

async function fetchToken(id) {
  const res = await fetch(`/api/clients/${id}/token`, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.remedy ? `${err.error}. ${err.remedy}` : `HTTP ${res.status}`);
  }
  return res.json();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// feat-ui-1: a timestamp on a page is read by a person, so it is rendered the
// one way the kit writes dates: dd/mm/yyyy HH:mm, 24 hours, Europe/Brussels
// (kit-kp11, UI principles rule 52; it was the reader's locale before). The
// server puts the exact RFC 3339 value in `datetime` and a plain fallback in
// the text; this replaces that text and keeps the exact value in the tooltip, so
// nothing is lost for whoever does want the machine form. Kenny's case was
// `2026-09-10T02:16:47Z` in a live table column.
//
// A value the browser cannot read is left exactly as the server wrote it: a
// wrong date is worse than an ugly one.
function localiseTimes(root = document) {
  for (const el of root.querySelectorAll('time[datetime]:not([data-localised])')) {
    const when = new Date(el.getAttribute('datetime'));
    if (Number.isNaN(when.getTime())) continue;
    el.textContent = formatBrussels(when);
    el.title = el.getAttribute('datetime');
    el.dataset.localised = 'true';
  }
}
localiseTimes();

function renderRequests(list) {
  if (!list.length) return '<p class="text-secondary" style="margin:0.5rem 0">No requests captured yet.</p>';
  return list
    .map((c) => {
      const headers = c.headers.map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(v)}`).join('\n');
      const trunc = c.truncated ? ` <span class="kp-badge">truncated, ${c.body_bytes} bytes</span>` : '';
      const source = c.source === 'test' ? ' <span class="kp-badge kp-badge--info">test</span>' : '';
      return `<details class="kp-card" style="margin:0.5rem 0"><summary><time datetime="${escapeHtml(c.at)}">${escapeHtml(c.at)}</time> ${escapeHtml(c.method)} ${escapeHtml(c.path)} → ${c.status}${source}${trunc}</summary><pre class="snippet">${headers}\n\n${escapeHtml(c.body)}</pre></details>`;
    })
    .join('');
}

async function loadRequests(id, panel) {
  const res = await fetch(`/api/clients/${id}/requests`, { headers: { accept: 'application/json' } });
  const list = res.ok ? await res.json() : [];
  panel.innerHTML = renderRequests(list);
  localiseTimes(panel);
}

document.addEventListener('click', (event) => {
  const reveal = event.target.closest('[data-reveal]');
  if (reveal) {
    const id = reveal.dataset.reveal;
    const target = document.getElementById(`token-${id}`);
    if (target.dataset.revealed === 'true') {
      hide(target, reveal);
      return;
    }
    busy(reveal, async () => {
      try {
        const { token } = await fetchToken(id);
        target.textContent = token;
        target.dataset.revealed = 'true';
        reveal.dataset.label = 'Hide';
        const seconds = parseInt(reveal.dataset.revealSeconds, 10) || 10;
        window.clearTimeout(target.revealTimer);
        target.revealTimer = window.setTimeout(() => hide(target, reveal), seconds * 1000);
      } catch (e) {
        flash(reveal, e.message, 3000);
      }
    });
    return;
  }

  const copyToken = event.target.closest('[data-copy-token]');
  const copyCommand = event.target.closest('[data-copy-command]');
  const copier = copyToken || copyCommand;
  if (copier) {
    const id = copyToken ? copyToken.dataset.copyToken : copyCommand.dataset.copyCommand;
    busy(copier, async () => {
      try {
        const data = await fetchToken(id);
        const ok = await copyText(copyToken ? data.token : data.command);
        flash(copier, ok ? 'Copied' : 'Copy failed — use Reveal');
      } catch (e) {
        flash(copier, e.message, 3000);
      }
    });
    return;
  }

  const test = event.target.closest('[data-test]');
  if (test) {
    const id = test.dataset.test;
    busy(test, async () => {
      const res = await fetch(`/api/clients/${id}/test`, { method: 'POST', headers: { accept: 'application/json' } });
      const body = await res.json().catch(() => ({}));
      flash(test, res.ok ? `Sent → ${body.status}` : refusal(res, body), 3000);
      const panel = document.getElementById(`requests-${id}`);
      if (panel && !panel.hidden) await loadRequests(id, panel);
    });
    return;
  }

  // feat-clients-4: the row carries one button; everything else is in the
  // dialog it opens. The requests load on open rather than behind a second
  // click — the panel is already on screen there, so a toggle would only be a
  // control that hides what the reader just asked for.
  const manage = event.target.closest('[data-manage]');
  if (manage) {
    // The name in the list is a link (#manage-ID) and opens the same dialog.
    event.preventDefault();
    const id = manage.dataset.manage;
    const dialog = document.getElementById(`manage-${id}`);
    if (!dialog) return;
    dialog.showModal();
    const panel = dialog.querySelector(`#requests-${id}`);
    if (panel) {
      if (manage.matches('button')) busy(manage, () => loadRequests(id, panel));
      else loadRequests(id, panel);
    }
    return;
  }

  const closeManage = event.target.closest('[data-close-manage]');
  if (closeManage) {
    closeManage.closest('dialog')?.close();
    return;
  }

  const toggle = event.target.closest('[data-requests]');
  if (toggle) {
    const id = toggle.dataset.requests;
    const panel = document.getElementById(`requests-${id}`);
    if (panel.hidden) {
      panel.hidden = false;
      toggle.textContent = 'Hide requests';
      busy(toggle, () => loadRequests(id, panel));
    } else {
      panel.hidden = true;
      toggle.textContent = 'Last requests';
    }
    return;
  }

  const post = event.target.closest('[data-post]');
  // Destructive buttons carry data-kp-confirm; components.js arms them on
  // the first click and lets the second through, which is the click we see.
  // The same path serves the kit's own buttons and a project's row or
  // section actions (K29): the route is whatever data-post says.
  if (post && !post.hasAttribute('data-kp-armed-pending')) {
    busy(post, async () => {
      const res = await fetch(post.dataset.post, { method: post.dataset.method || 'POST', headers: { accept: 'application/json' } });
      if (res.ok) {
        window.location.reload();
      } else {
        const body = await res.json().catch(() => ({}));
        flash(post, refusal(res, body), 5000);
      }
    });
  }
});

function hide(target, toggle) {
  window.clearTimeout(target.revealTimer);
  target.textContent = target.dataset.masked;
  target.dataset.revealed = 'false';
  toggle.dataset.label = 'Reveal';
  toggle.textContent = 'Reveal';
}


// Forms with a plain POST (login): a plain POST navigates away; the button
// still shows its busy label until the page changes (rule 31). The Issue
// form on the Clients page is the dialog in the "clients" block below: it
// never navigates, so its submit is only kept from doing so here. Lives in
// this file rather than inline so the page carries no inline script (CSP
// script-src 'self', S8).
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const button = form.querySelector('button[type="submit"]');
  if (form.id === 'issue') {
    event.preventDefault();
    return;
  }
  if (button && button.dataset.busyLabel) {
    button.disabled = true;
    button.textContent = button.dataset.busyLabel;
  }
});

// ============================================================================
// clients (kit-kp11): the Clients page, as approved in the clients-list and
// clients-first reviews. The server renders the whole page; this block adds
//
//   - the kp modules the page uses (loaded only on this page),
//   - the four figures as filters (a click toggles, a second click resets),
//   - the idle callout with "Show them",
//   - the auto-refresh (swaps the figures, the rows and the dialogs in place),
//   - the first-client walk-through: with no call yet, the page asks
//     /api/kit/clients every 5 seconds and finishes step 3 by itself,
//   - the issue dialog (clients-issue): the live client card that follows
//     the form, and the swap to the token, the first command and the receipt
//     after Issue, without a reload.
//
// Dates are written by the server in dd/mm/yyyy HH:mm (Europe/Brussels);
// `formatBrussels` is the same format for the few times the browser writes.
// ============================================================================

// dd/mm/yyyy HH:mm, 24 hours, Europe/Brussels (UI principles, rule 52).
// A function declaration so localiseTimes() above can call it before this
// block runs; the formatter is built on first use for the same reason.
function formatBrussels(when) {
  formatBrussels.format ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(formatBrussels.format.formatToParts(when).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

// What each figure searches for in the State column. The words are the ones
// the server writes in the badges.
const CLIENTS_FILTER_WORDS = { 'in use': 'active', idle: 'idle', new: 'not used yet', revoked: 'revoked' };
// The State column: Client is the first.
const CLIENTS_STATE_COLUMN = 1;
const CLIENTS_POLL_MS = 5000;

// [selector the module is for, module, what it attaches]. The same
// selectors js/auto.js asks; the page loads only what it carries.
const CLIENTS_MODULES = [
  ['[data-kp-remember]', 'remember', 'attachRemembered'],
  ['.kp-lede', 'lede', 'attachLedes'],
  ['.kp-kpis[data-kp-kpis-columns]', 'kpi', 'attachKpiStrips'],
  ['.kp-table-wrap', 'tables', 'attachTableRegions'],
  ['[data-kp-datatable]', 'datatable', 'attachDataTables'],
  ['[data-kp-idmark]', 'idmark', 'attachIdmarks'],
  ['.kp-steplist', 'steplist', 'attachSteplists'],
  ['[data-kp-art]', 'art', 'attachArt'],
  ['[data-kp-problems]', 'problems', 'attachProblems'],
  ['[data-kp-refresh]', 'auto-refresh', 'attachRefresh'],
  ['.kp-ops', 'footprint', 'attachFootprints'],
  ['dialog.kp-dialog, .kp-datatable', 'motion', 'attachMotion'],
  ['.kp-card, [data-kp-datatable]', 'loading-pieces', 'attachLoadingPieces'],
];

const clientsPageRoot = document.querySelector('[data-clients-page]');
if (clientsPageRoot) startClientsPage(clientsPageRoot);

async function startClientsPage(root) {
  const base = './kp/js/';
  const modules = {};
  const load = async (name) => (modules[name] ??= await import(`${base}${name}.js`));
  const wanted = CLIENTS_MODULES.filter(([selector]) => root.querySelector(selector));
  await Promise.all([...wanted.map(([, name]) => load(name)), load('overlays'), load('hovercard'), load('problems'), load('datatable'), load('steplist')]);
  if (modules.remember) modules.remember.restoreRemembered(root);
  // The dialogs and hovercards live outside the page's root (a dialog in the
  // top layer, a card on <body>), and both modules attach each trigger once.
  modules.overlays.attachDialogs(document);
  modules.hovercard.attachHoverCards(document);
  const issueDialog = document.getElementById('issue-dialog');
  if (issueDialog) await startIssueDialog(issueDialog, load, root.dataset.clientsOne);
  for (const [, name, attach] of wanted) modules[name][attach](root);

  const one = root.dataset.clientsOne;
  const many = root.dataset.clientsMany;
  const days = root.dataset.clientsDays;
  const tiles = () => [...root.querySelectorAll('[data-clients-filter]')];
  let pressed = '';

  // ---- the figures as filters -------------------------------------------
  const tableHandle = () => {
    const wrap = root.querySelector('[data-kp-datatable]');
    return wrap ? modules.datatable.dataTable(wrap) : null;
  };
  function filterBy(key) {
    pressed = key;
    for (const tile of tiles()) tile.setAttribute('aria-pressed', String(tile.dataset.clientsFilter === key));
    const handle = tableHandle();
    if (!handle) return;
    if (key) {
      handle.scope(CLIENTS_STATE_COLUMN);
      handle.query(CLIENTS_FILTER_WORDS[key]);
    } else {
      handle.query('');
      handle.scope(null);
    }
  }
  root.addEventListener('click', (event) => {
    const tile = event.target.closest('[data-clients-filter]');
    if (tile) filterBy(tile.getAttribute('aria-pressed') === 'true' ? '' : tile.dataset.clientsFilter);
  });
  // Typing something else in the search box ends the filter: the figure
  // lets go and the search covers every column again.
  root.querySelector('[data-kp-datatable-search]')?.addEventListener('input', (event) => {
    if (pressed && event.target.value !== CLIENTS_FILTER_WORDS[pressed]) {
      pressed = '';
      for (const tile of tiles()) tile.setAttribute('aria-pressed', 'false');
      tableHandle()?.scope(null);
    }
  });

  // ---- the idle callout -------------------------------------------------
  function paintProblems() {
    const box = root.querySelector('[data-kp-problems]');
    if (!box) return;
    const names = [...root.querySelectorAll('tr[data-clients-state="idle"] .kp-fw-medium')].map((a) => a.textContent.trim());
    const show = document.createElement('button');
    show.type = 'button';
    show.className = 'kp-button';
    show.textContent = 'Show them';
    show.addEventListener('click', () => filterBy('idle'));
    modules.problems.setProblems(
      box,
      names.length
        ? [
            {
              key: 'idle',
              severity: 'warning',
              what: `${names.length} ${names.length === 1 ? `${one} has` : `${many} have`} not called in ${days} days or more`,
              why: names.join(', '),
              remedy: 'Revoke the ones no program uses any more; a revoked token stops working at once.',
              action: show,
            },
          ]
        : [],
    );
  }
  paintProblems();

  // ---- the auto-refresh -------------------------------------------------
  const modalOpen = () => document.querySelector('dialog[open]') !== null;
  const rowIds = (scope) => [...scope.querySelectorAll('tbody tr[data-kp-row-key]')].map((tr) => tr.dataset.kpRowKey).sort().join();

  // Ask the page again and swap what moved. A change of shape (a new
  // client, the first call) is a reload, unless a dialog is open.
  async function refreshPage() {
    const res = await fetch('/clients', { headers: { accept: 'text/html' }, credentials: 'same-origin' });
    if (!res.ok || res.redirected) return false;
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const next = doc.querySelector('[data-clients-page]');
    if (!next) return false;
    const reshaped = next.hasAttribute('data-clients-onboarding') !== root.hasAttribute('data-clients-onboarding') || rowIds(next) !== rowIds(root);
    if (reshaped) {
      if (!modalOpen()) window.location.reload();
      return true;
    }
    for (const tile of next.querySelectorAll('[data-clients-filter]')) {
      const mine = root.querySelector(`[data-clients-filter="${tile.dataset.clientsFilter}"]`);
      if (!mine) continue;
      mine.querySelector('.kp-kpi__value').textContent = tile.querySelector('.kp-kpi__value').textContent;
      if (tile.hasAttribute('data-kp-tone')) mine.setAttribute('data-kp-tone', tile.getAttribute('data-kp-tone'));
      else mine.removeAttribute('data-kp-tone');
    }
    const body = root.querySelector('tbody');
    const nextBody = next.querySelector('tbody');
    if (body && nextBody) {
      body.replaceChildren(...[...nextBody.children].map((row) => document.adoptNode(row)));
      tableHandle()?.refresh();
    }
    // A dialog that is open keeps what it shows; the others are replaced so
    // "last used" is current the next time one opens.
    for (const fresh of doc.querySelectorAll('dialog.client-dialog')) {
      const mine = document.getElementById(fresh.id);
      if (mine && !mine.open) mine.replaceWith(document.adoptNode(fresh));
    }
    paintProblems();
    return true;
  }
  root.addEventListener('kp-refresh', async (event) => {
    let ok = false;
    try {
      ok = await refreshPage();
    } catch (_) {
      ok = false;
    }
    event.detail.done(ok);
  });

  // ---- the first client: the page notices the first call -----------------
  if (root.hasAttribute('data-clients-onboarding')) watchForFirstCall(root, modules, one);
}

// ---- the issue dialog (clients-issue) -----------------------------------
// One dialog, three states in the same boxes: the form (and the form with
// its refusal), then the result. The rows of the grid have minimum heights
// and the card contents swap inside them, so the dialog is as tall in every
// state. The token lives in this closure only, never in the page: the secret
// field asks for it when it is shown or copied.

const ISSUE_OPEN_KEY = 'chassis-open-manage';

async function startIssueDialog(dialog, load, one) {
  const [forms, combobox, usual, patterns, command, flash, idmark, lede] = await Promise.all(
    ['forms', 'combobox', 'usual-picker', 'patterns', 'command', 'flash', 'idmark', 'lede'].map(load),
  );
  const form = dialog.querySelector('form#issue');
  const $ = (selector) => dialog.querySelector(selector);
  let token = '';
  let issued = null;
  let opening = false;
  let pollTimer = 0;

  forms.attachForms(dialog);
  combobox.attachComboboxes(dialog);
  combobox.attachSelects(dialog);
  usual.attachUsualPickers(dialog);
  flash.attachFlashButtons(dialog);
  idmark.attachIdmarks(dialog);
  lede.attachLedes(dialog);
  patterns.attachPatterns(dialog, { secretLoad: () => token });

  // ---- the client card follows what is typed ----
  const nameInput = $('[data-issue-in="name"]');
  const topicInput = $('[data-issue-in="topic"]');
  const card = $('[data-issue-card]');
  const state = $('[data-issue-state]');
  const textOf = (input) => {
    if (!input) return '';
    if (input instanceof HTMLSelectElement) return input.value ? input.selectedOptions[0].textContent.trim() : '';
    return input.value.trim();
  };
  function sync() {
    if (issued) return;
    const name = textOf(nameInput);
    for (const [key, input] of [['name', nameInput], ['topic', topicInput]]) {
      const target = $(`[data-issue-${key}]`);
      if (target) target.textContent = textOf(input) || target.dataset.issueEmpty;
    }
    idmark.setIdmark($('[data-issue-mark]'), name || `new ${one}`);
    card.classList.toggle('issue-prev--empty', !name);
    if (state.dataset.issueRefused !== undefined) {
      // Typing a new name takes the refusal back.
      delete state.dataset.issueRefused;
      state.className = 'kp-badge kp-badge--info';
      state.textContent = 'will be active';
    }
  }
  const later = () => window.setTimeout(sync, 0);
  for (const type of ['input', 'change', 'kp-usual-pick', 'kp-usual-add']) dialog.addEventListener(type, later);
  sync();

  // ---- Issue ----
  const submit = $('[data-issue-submit]');
  form.addEventListener('kp-form-valid', () => {
    flash.runFlashButton(submit, async () => {
      const name = textOf(nameInput);
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        // Every named control, so a project's extra fields (K16) ride along.
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const sentence = body.remedy ? `${body.error}. ${body.remedy}` : body.error || `HTTP ${res.status}`;
        // A refusal about the name stands under the name; any other speaks as a toast.
        if (name && sentence.includes(name)) {
          forms.showError(nameInput, sentence);
          state.dataset.issueRefused = '';
          state.className = 'kp-badge kp-badge--destructive';
          state.textContent = 'not issued';
          return { error: '' };
        }
        return { error: body.error || `HTTP ${res.status}`, remedy: body.remedy };
      }
      issued = await res.json();
      const [reveal, kit] = await Promise.all([
        fetchToken(issued.id),
        fetch('/api/kit/clients', { headers: { accept: 'application/json' }, credentials: 'same-origin' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      token = reveal.token;
      const template = kit?.command_template || reveal.command.replaceAll(token, '$CLIENT_TOKEN');
      showIssued(issued, template, reveal.command);
      return 'Issued';
    });
  });

  function setText(selector, text) {
    const el = $(selector);
    if (el) el.textContent = text;
  }

  function showIssued(client, template, full) {
    setText('[data-issue-title]', `${client.name} is ready`);
    $('[data-issue-title-badge]').hidden = false;
    setText('[data-issue-description]', 'Copy the token now and give it to the program.');
    setText('[data-issue-main-title]', 'Token and first call');
    setText('[data-issue-main-about]', 'The token, and the command that uses it, in one place.');
    setText('[data-issue-main-foot]', `The ${one}’s row shows its first request as soon as it calls.`);
    setText('[data-issue-side-title]', `The ${one}`);
    setText('[data-issue-side-about]', 'What was made, and where it appears.');
    setText('[data-issue-side-foot]', `It stays on the ${one}’s page, with its token.`);
    state.className = 'kp-badge kp-badge--success';
    state.textContent = 'active';
    delete state.dataset.issueRefused;
    setText('[data-issue-fact-token]', `Made ${formatBrussels(new Date())}`);
    setText('[data-issue-fact-call]', 'Not yet: this page notices it');
    // The command block is made from the template the API gave, with $CLIENT_TOKEN where the token goes.
    const host = $('[data-issue-command]');
    host.innerHTML = '<div class="kp-command" data-kp-command="bash" data-kp-command-where="the machine that will call this service"><pre class="kp-command__code"><code></code></pre></div>';
    host.querySelector('code').textContent = template;
    command.attachCommands(host);
    const copyFull = $('[data-issue-copy-full]');
    copyFull.onclick = () => flash.runFlashButton(copyFull, async () => {
      if (!(await copyText(full))) throw new Error('The browser refused to copy');
      return 'Copied';
    });
    $('[data-issue-pane="form"]').hidden = true;
    $('[data-issue-pane="result"]').hidden = false;
    $('[data-issue-actions="form"]').hidden = true;
    $('[data-issue-actions="done"]').hidden = false;
    $('[data-issue-pane="result"] [data-kp-secret-reveal]')?.focus();
    pollTimer = window.setInterval(watchFirstCall, CLIENTS_POLL_MS);
  }

  // The first call, noticed while the receipt is open.
  async function watchFirstCall() {
    if (document.visibilityState === 'hidden' || !issued) return;
    try {
      const res = await fetch('/api/kit/clients', { headers: { accept: 'application/json' }, credentials: 'same-origin' });
      if (!res.ok) return;
      const mine = (await res.json()).clients.find((c) => c.id === issued.id);
      if (!mine || !mine.uses) return;
      setText('[data-issue-fact-call]', `Called ${mine.last_used_ago}`);
      window.clearInterval(pollTimer);
    } catch (_) {
      // The next look tries again.
    }
  }

  // "Open the client": the page reloads (the list is stale) and opens its manage dialog.
  $('[data-issue-open]').addEventListener('click', () => {
    opening = true;
    try {
      sessionStorage.setItem(ISSUE_OPEN_KEY, issued.id);
    } catch (_) {
      // Without storage the page just reloads.
    }
    window.location.reload();
  });
  // Whatever closes it, an issued client means the list on the page is out of date.
  dialog.addEventListener('close', () => {
    window.clearInterval(pollTimer);
    if (issued && !opening) window.location.reload();
  });

  // Back from "Open the client".
  try {
    const wanted = sessionStorage.getItem(ISSUE_OPEN_KEY);
    if (wanted) {
      sessionStorage.removeItem(ISSUE_OPEN_KEY);
      document.querySelector(`[data-manage="${CSS.escape(wanted)}"]`)?.click();
    }
  } catch (_) {
    // No storage, nothing to open.
  }
}

function watchForFirstCall(root, modules, one) {
  const list = root.querySelector('[data-clients-steps]');
  if (!list) return;
  let timer = 0;
  async function look() {
    if (document.visibilityState === 'hidden') return;
    let data;
    try {
      const res = await fetch('/api/kit/clients', { headers: { accept: 'application/json' }, credentials: 'same-origin' });
      if (!res.ok) return;
      data = await res.json();
    } catch (_) {
      return;
    }
    if (data.counts.called === 0) {
      // A client was issued from another tab: the page reshapes.
      if ((data.counts.active > 0) !== (root.querySelector('[data-kp-step-id="s1"]').dataset.state === 'done') && !document.querySelector('dialog[open]')) {
        window.location.reload();
      }
      return;
    }
    window.clearInterval(timer);
    const caller = data.clients.filter((c) => c.last_used_at).sort((a, b) => b.last_used_at.localeCompare(a.last_used_at))[0];
    for (const key of ['s1', 's2']) modules.steplist.setStep(list, key, { state: 'done' });
    modules.steplist.setStep(list, 's3', { state: 'done', note: caller ? `${caller.name} called ${caller.last_used_ago}` : 'The first request arrived' });
    const what = root.querySelector('[data-clients-what]');
    if (what) {
      what.setAttribute('data-kp-art', 'done');
      what.querySelector('.kp-empty__title').textContent = 'Connected';
      what.querySelector('.kp-empty__body').textContent = `The first request arrived. The list shows the ${one}, when it last called and how often.`;
    }
    root.querySelector('[data-clients-done]')?.removeAttribute('hidden');
  }
  timer = window.setInterval(look, CLIENTS_POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') look();
  });
}

// kit-kp11: the page-ready signal. Everything above has attached by now, so
// an app's own module can attach ITS kp modules after the kit without
// double-attaching what is listed in `attached` (the theme picker above all).
// `chassis.ready` is a promise (awaiting it after the event still works);
// `chassis:ready` fires once on document.
{
  const attached = ['theme-picker', 'contracts', 'confirmations', 'effects', 'skip-links'];
  const ready = new Promise((resolve) => {
    const done = () => {
      resolve(window.chassis);
      document.dispatchEvent(new CustomEvent('chassis:ready', { detail: { attached } }));
    };
    // Module scripts run deferred, so the document is parsed; wait a task
    // so listeners registered by sibling modules in the same pass are in.
    setTimeout(done, 0);
  });
  window.chassis = Object.freeze({ ...(window.chassis || {}), attached, ready });
}
