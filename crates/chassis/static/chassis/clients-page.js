// The Clients page: figures as filters, idle callout, auto-refresh and the
// wiring of the issue and manage dialogs.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { CLIENTS_FILTER_WORDS, CLIENTS_MODULES, CLIENTS_STATE_COLUMN } from './clients-config.js';
import { watchForFirstCall } from './clients-first-call.js';
import { startIssueDialog } from './clients-issue.js';
import { startManageDialogs } from './clients-manage.js';

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
//     after Issue, without a reload,
//   - the manage dialogs (clients-manage): kp-themes parts attached when a
//     dialog first opens; the token is a .kp-secret that asks the service,
//     the requests are a .kp-inspector, Send test is a flash button.
//
// Dates are written by the server in dd/mm/yyyy HH:mm (Europe/Brussels);
// `formatBrussels` is the same format for the few times the browser writes.
// ============================================================================
const clientsPageRoot = document.querySelector('[data-clients-page]');
if (clientsPageRoot) startClientsPage(clientsPageRoot);

async function startClientsPage(root) {
  const base = '../kp/js/';
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
  startManageDialogs(root, load);
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
    // "Clear the search" in the table's empty state also lets go of a pressed figure.
    if (event.target.closest('[data-kp-datatable-clear]')) filterBy('');
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
    for (const fresh of doc.querySelectorAll('dialog.manage-dialog')) {
      const mine = document.getElementById(fresh.id);
      if (mine && !mine.open) mine.replaceWith(document.adoptNode(fresh));
    }
    paintProblems();
    return true;
  }
  // The list answers in its own states: loading (the table's busy card, only when
  // the read takes longer than a blink), failed (with its own Try again), ready.
  async function readAgain() {
    const handle = tableHandle();
    const waiting = handle ? window.setTimeout(() => handle.state('loading'), 400) : 0;
    let ok = false;
    try {
      ok = await refreshPage();
    } catch (_) {
      ok = false;
    }
    window.clearTimeout(waiting);
    handle?.state(ok ? 'ready' : 'failed');
    return ok;
  }
  root.addEventListener('kp-refresh', async (event) => event.detail.done(await readAgain()));
  root.addEventListener('kp-datatable-retry', readAgain);

  // ---- the first client: the page notices the first call -----------------
  if (root.hasAttribute('data-clients-onboarding')) watchForFirstCall(root, modules, one);
}
