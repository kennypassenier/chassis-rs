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

const root = document.querySelector('[data-client-page]');
if (root) startClientPage(root);

async function startClientPage(page) {
  // One bundle serves every part; the page imports it once.
  const kp = await import('../kp/dist/kp-themes.min.js');
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
