// The Clients page's auto-refresh: ask the page again and swap the figures,
// the rows and the closed dialogs in place. A change of shape (a new client,
// the first call) is a reload, unless a dialog is open. Split out of
// clients-page.js: everything that re-reads.
export function wireRefresh(ctx) {
  const { root } = ctx;
  const modalOpen = () => document.querySelector('dialog[open]') !== null;
  const rowIds = (scope) => [...scope.querySelectorAll('tbody tr[data-kp-row-key]')].map((tr) => tr.dataset.kpRowKey).sort().join();

  function swapFigures(next) {
    for (const tile of next.querySelectorAll('[data-clients-filter]')) {
      const mine = root.querySelector(`[data-clients-filter="${tile.dataset.clientsFilter}"]`);
      if (!mine) continue;
      mine.querySelector('.kp-kpi__value').textContent = tile.querySelector('.kp-kpi__value').textContent;
      if (tile.hasAttribute('data-kp-tone')) mine.setAttribute('data-kp-tone', tile.getAttribute('data-kp-tone'));
      else mine.removeAttribute('data-kp-tone');
    }
  }

  function swapRows(next) {
    const body = root.querySelector('tbody');
    const nextBody = next.querySelector('tbody');
    if (body && nextBody) {
      body.replaceChildren(...[...nextBody.children].map((row) => document.adoptNode(row)));
      ctx.tableHandle()?.refresh();
    }
  }

  // Ask the page again and swap what moved.
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
    swapFigures(next);
    swapRows(next);
    // A dialog that is open keeps what it shows; the others are replaced so
    // "last used" is current the next time one opens.
    for (const fresh of doc.querySelectorAll('dialog.manage-dialog')) {
      const mine = document.getElementById(fresh.id);
      if (mine && !mine.open) mine.replaceWith(document.adoptNode(fresh));
    }
    ctx.paintProblems();
    return true;
  }

  // The list answers in its own states: loading (the table's busy card, only when
  // the read takes longer than a blink), failed (with its own Try again), ready.
  async function readAgain() {
    const handle = ctx.tableHandle();
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
}
