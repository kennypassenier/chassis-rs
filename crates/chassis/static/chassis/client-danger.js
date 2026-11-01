// The confirmation panels of a client's page (Re-issue, Revoke, Delete). A
// confirmation stands inside the page, under the danger band, instead of a
// second dialog on top of the first: pressing the action opens its panel,
// which says exactly what will happen and holds Cancel and the confirming
// button. Only one is open at a time; Escape and Cancel close it and give the
// focus back to the action. Delete asks for the name (a kp type-confirm block).
// What a confirmed action changes is shown in place by client-swap.js; Delete
// leaves for the list, because the page's subject is gone.
const PANEL_SETTLE_MS = 600;

export function wireDanger(ctx) {
  const { page } = ctx;
  const panelOf = (name) => page.querySelector(`[data-client-confirm="${name}"]`);
  const askOf = (name) => page.querySelector(`[data-client-ask="${name}"]`);

  function close(name, { restore = false } = {}) {
    const panel = panelOf(name);
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    const ask = askOf(name);
    ask?.setAttribute('aria-expanded', 'false');
    if (restore) ask?.focus();
  }

  function closeAll() {
    for (const panel of page.querySelectorAll('[data-client-confirm]')) close(panel.dataset.clientConfirm);
  }

  function open(name) {
    closeAll();
    const panel = panelOf(name);
    if (!panel) return;
    panel.hidden = false;
    askOf(name)?.setAttribute('aria-expanded', 'true');
    // The safe choice takes the focus; the panel is brought into view on a phone.
    panel.querySelector('[data-client-cancel]')?.focus({ preventScroll: true });
    panel.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }

  page.addEventListener('click', (event) => {
    const ask = event.target.closest('[data-client-ask]');
    if (ask && !ask.disabled) open(ask.dataset.clientAsk);
    const cancel = event.target.closest('[data-client-cancel]');
    if (cancel) close(cancel.closest('[data-client-confirm]').dataset.clientConfirm, { restore: true });
  });
  page.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const panel = event.target.closest?.('[data-client-confirm]');
    if (panel && !panel.hidden) close(panel.dataset.clientConfirm, { restore: true });
  });

  // A confirmed action succeeded: the button shows its word for a moment, then the page shows the result.
  page.addEventListener('kp-flash', (event) => {
    const done = event.target.closest?.('[data-client-done]');
    if (!done || event.detail?.state !== 'success') return;
    const what = done.dataset.clientDone;
    window.setTimeout(() => (what === 'delete' ? leave() : settle(what)), PANEL_SETTLE_MS);
  });

  async function settle(what) {
    await ctx.swap.refresh();
    ctx.kp.toast(what === 'reissue' ? `New token for ${ctx.name}. Reveal or copy it above.` : `The token of ${ctx.name} is revoked.`, { ms: 5000 });
  }

  // The subject is gone: the list, without this page in the history.
  function leave() {
    window.location.replace(page.querySelector('[data-client-back]')?.getAttribute('href') || '/clients');
  }
}
