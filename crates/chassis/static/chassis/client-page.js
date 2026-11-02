// A client's own page (ux-chassis-5): the entry that finds the page, loads the
// kp-themes bundle once and hands the page to the modules that wire it. The
// page replaced the manage dialog over the list; what an action changes is
// shown in place (client-swap.js), never by reloading, and a delete is the one
// action that leaves the page, because its subject is gone.
//
//   client-wire.js      the kp parts and the handlers of one region
//   client-requests.js  the request log (read, retry, read again after a test)
//   client-danger.js    the confirmation panels of Re-issue, Revoke and Delete
//   client-swap.js      read the page again and swap the changed regions

import { createRequests } from './client-requests.js';
import { wireDanger } from './client-danger.js';
import { createSwap } from './client-swap.js';
import { wireRegion } from './client-wire.js';

// The kp-themes entries the client page uses, one file each under dist/js/.
const CLIENT_ENTRIES = ['card-state', 'loading-pieces', 'overlays', 'request-inspector', 'idmark', 'components', 'flash', 'patterns', 'command', 'json-field'];

const root = document.querySelector('[data-client-page]');
if (root) startClientPage(root);

async function startClientPage(page) {
  // The page imports only the entries it uses (kp-themes 12.2) and merges
  // their names into one object, which the region modules read as `ctx.kp`.
  const kp = Object.assign({}, ...(await Promise.all(CLIENT_ENTRIES.map((name) => import(`../kp/dist/js/${name}.js`)))));
  const ctx = { page, kp, id: page.dataset.clientId, name: page.dataset.clientName };
  ctx.requests = createRequests(ctx);
  ctx.requests.attach();
  ctx.swap = createSwap(ctx, (region) => wireRegion(ctx, region));
  // Every region wires itself; a region the swap brings is wired the same way.
  for (const region of page.querySelectorAll('[data-client-region]')) wireRegion(ctx, region);
  kp.attachCardStates(page);
  kp.attachLoadingPieces(page);
  ctx.requests.load();
  // The project's own action buttons ([data-post]) reload a plain page; here
  // they show their result in place.
  page.addEventListener('chassis-post-done', (event) => {
    event.preventDefault();
    ctx.swap.refresh();
  });
  wireDanger(ctx);
}
