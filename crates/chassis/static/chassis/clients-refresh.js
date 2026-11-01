// The Clients page's refresh: ask the page again and swap the figures and the
// rows in place, on the timer and after the issue dialog closes (a new row
// appears without a reload, ux-chassis-5). Only a change of the page's
// shape (the first client or the first call, when the onboarding cards give
// way to the list) is a reload, and not while a dialog is open. Split out of
// clients-page.js: everything that re-reads.
export function wireRefresh(ctx) {
  const { root } = ctx;
  const modalOpen = () => document.querySelector('dialog[open]') !== null;

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
      // New rows come with empty marks and no cards: give them theirs.
      ctx.modules.idmark?.attachIdmarks(body);
      ctx.modules.hovercard?.attachHoverCards(body);
    }
  }

  // Ask the page again and swap what moved.
  async function refreshPage() {
    const res = await fetch('/clients', { headers: { accept: 'text/html' }, credentials: 'same-origin' });
    if (!res.ok || res.redirected) return false;
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const next = doc.querySelector('[data-clients-page]');
    if (!next) return false;
    const reshaped = next.hasAttribute('data-clients-onboarding') !== root.hasAttribute('data-clients-onboarding');
    if (reshaped) {
      if (!modalOpen()) window.location.reload();
      return true;
    }
    swapFigures(next);
    swapRows(next);
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
  // The kit's refresh tick (chassisRefresh, ux-chassis-10) reads the list again.
  window.chassisRefresh.onTick(() => readAgain());
  // The issue dialog closed with a client issued: show its row.
  document.addEventListener('clients-issued', readAgain);
  root.addEventListener('kp-datatable-retry', readAgain);
}
