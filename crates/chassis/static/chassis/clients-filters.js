// The Clients page's figures as filters and the idle callout: a click on a
// figure toggles the table's filter, typing in the search lets it go, and
// the callout names the idle clients with "Show them". Split out of
// clients-page.js: everything that narrows the list.
import { CLIENTS_FILTER_WORDS, CLIENTS_STATE_COLUMN } from './clients-config.js';

export function createFilters(ctx) {
  const { root } = ctx;
  const tiles = () => [...root.querySelectorAll('[data-clients-filter]')];
  let pressed = '';

  const tableHandle = () => {
    const wrap = root.querySelector('[data-kp-datatable]');
    return wrap ? ctx.modules.datatable.dataTable(wrap) : null;
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

  function wire() {
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
  }

  function paintProblems() {
    const box = root.querySelector('[data-kp-problems]');
    if (!box) return;
    const names = [...root.querySelectorAll('tr[data-clients-state="idle"] .kp-fw-medium')].map((a) => a.textContent.trim());
    const show = document.createElement('button');
    show.type = 'button';
    show.className = 'kp-button';
    show.textContent = 'Show them';
    show.addEventListener('click', () => filterBy('idle'));
    ctx.modules.problems.setProblems(
      box,
      names.length
        ? [
            {
              key: 'idle',
              severity: 'warning',
              what: `${names.length} ${names.length === 1 ? `${ctx.one} has` : `${ctx.many} have`} not called in ${ctx.days} days or more`,
              why: names.join(', '),
              remedy: 'Revoke the ones no program uses any more; a revoked token stops working at once.',
              action: show,
            },
          ]
        : [],
    );
  }

  return { tableHandle, filterBy, wire, paintProblems };
}
