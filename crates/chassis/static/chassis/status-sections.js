// The status page's section cards: redraw a section only when its data
// changed (a signature per section or part), keeping a table's search, sort
// and page when only its rows moved.
import { kvHtml, rowsHtml, tableHtml } from './status-bodies.js';
import { partHtml } from './status-parts.js';

export function createSections(ctx) {
  const signatures = new Map();

  // A table keeps its search, sort and page when its rows change: the rows
  // go into the data table that is there and it is told to look again; only
  // new columns draw it from scratch.
  function updateTable(wrapper, s, part) {
    const host = wrapper.querySelector('[data-kp-datatable]');
    const handle = host && ctx.dataTable(host);
    const columns = part.data.columns.join('\u0001');
    if (!handle || host.dataset.chassisColumns !== columns) {
      wrapper.innerHTML = tableHtml(s.slug, s.title, part.data);
      const fresh = wrapper.querySelector('[data-kp-datatable]');
      if (fresh) fresh.dataset.chassisColumns = columns;
      ctx.attachDataTables(wrapper);
      return;
    }
    const sorts = [...host.querySelectorAll('thead th')].map((th) => th.getAttribute('data-kp-sort') || 'text');
    host.querySelector('tbody').innerHTML = rowsHtml(part.data.rows, sorts, part.data.key ?? 0);
    handle.refresh();
  }

  // Draws only when the signature moved (or when forced); the first sight of a key only records it.
  function redrawWhenChanged(key, sig, force, draw) {
    const known = signatures.get(key);
    signatures.set(key, sig);
    if ((known === undefined || known === sig) && !force) return;
    draw();
  }

  // A section as it always was: label/value rows.
  function updateRows(card, s, force) {
    const rows = s.body && s.body.kind === 'rows' ? s.body.data : s.rows;
    const dl = card.querySelector('dl[data-chassis-rows]');
    if (dl && rows) redrawWhenChanged(s.slug, JSON.stringify(rows), force, () => (dl.outerHTML = kvHtml(rows)));
    // The list was left out while the rows were empty: draw it when they arrive.
    else if (rows && rows.length) {
      redrawWhenChanged(s.slug, JSON.stringify(rows), force, () => card.querySelector('.kp-card__data')?.insertAdjacentHTML('afterbegin', kvHtml(rows)));
    }
  }

  function updateParts(card, s, force) {
    (s.parts || []).forEach((part, i) => {
      const wrapper = card.querySelector(`[data-chassis-part="${i}"]`);
      const html = partHtml(s, part);
      if (!wrapper || html === null) return;
      redrawWhenChanged(`${s.slug}#${i}`, JSON.stringify(part.data), force, () => {
        if (part.kind === 'table') return updateTable(wrapper, s, part);
        wrapper.innerHTML = html;
        if (part.kind === 'checks') ctx.attachStatusLists(wrapper);
        else if (part.kind === 'kpis') ctx.attachKpiStrips(wrapper);
      });
    });
  }

  function updateSection(card, s, force) {
    if (card.dataset.chassisKind === 'rows') updateRows(card, s, force);
    else if (card.dataset.chassisKind === 'parts') updateParts(card, s, force);
  }

  return { updateSection };
}
