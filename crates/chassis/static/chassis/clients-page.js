// The Clients page: figures as filters, idle callout, auto-refresh and the
// wiring of the issue and manage dialogs.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { CLIENTS_MODULES } from './clients-config.js';
import { watchForFirstCall } from './clients-first-call.js';
import { startIssueDialog } from './clients-issue.js';
import { createFilters } from './clients-filters.js';
import { wireRefresh } from './clients-refresh.js';
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
  // The name only keys the cache; every part is the one kp-themes bundle.
  const modules = {};
  const load = async (name) => (modules[name] ??= await import('../kp/dist/kp-themes.min.js'));
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

  // The page's shared context: the kp modules and the words the filters use.
  const one = root.dataset.clientsOne;
  const ctx = { root, modules, one, many: root.dataset.clientsMany, days: root.dataset.clientsDays };
  Object.assign(ctx, createFilters(ctx));
  ctx.wire();
  ctx.paintProblems();
  wireRefresh(ctx);

  // ---- no client yet: the page opens its list when one exists ------------
  if (root.hasAttribute('data-clients-onboarding')) watchForFirstCall();
}
