// How a Status card shows that it is reading, failed or back: the card's
// own states, or a data table's.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { tableHtml } from './status-bodies.js';

export const emptyNote = (card) => ({ title: card.dataset.chassisEmptyTitle, text: card.dataset.chassisEmptyText });

// The card read states, built on the kp parts the page loaded.
export function cardReads({ setCardState, dataTable, attachDataTables }) {
  // What a failed read says: the service's own sentence, or that it did not answer.
  const why = (error) => (error instanceof TypeError || !error?.message ? 'The service did not answer.' : `${String(error.message).replace(/\.+$/, '')}.`);
  // A card whose body is data tables only (a section table, or a JSON-fed
  // card that renders one) uses the data table's own busy and failed states,
  // the standard ones, instead of the card's: busy({ overlay: true }) +
  // state('loading') while it reads, fail(reason) with the table's Try again
  // when it cannot. Every other card keeps the card's own four states.
  const tableCard = (card) => {
    if (card.dataset.chassisRender) return card.dataset.chassisRender === 'table';
    const parts = [...card.querySelectorAll('[data-chassis-part]')];
    return parts.length > 0 && parts.every((p) => p.querySelector('[data-kp-datatable]'));
  };
  const tableHandles = (card) => [...card.querySelectorAll('[data-kp-datatable]')].map((host) => dataTable(host)).filter(Boolean);
  // A JSON-fed table card has no table until its first answer: a table with
  // no rows stands in so the standard loading and failed states have a body.
  function ensureTable(card) {
    const body = card.querySelector('[data-chassis-part="0"]');
    if (body && !body.querySelector('[data-kp-datatable]')) {
      body.innerHTML = tableHtml(card.dataset.chassisSection || 'read', card.querySelector('.kp-card__title')?.textContent ?? '', { columns: ['\u00a0'], rows: [] });
      attachDataTables(body);
    }
  }
  function cardReading(card) {
    if (!tableCard(card)) return setCardState(card, 'loading', { words: 'Reading…' });
    if (card.getAttribute('data-kp-state') !== 'ready') setCardState(card, 'ready');
    ensureTable(card);
    for (const h of tableHandles(card)) {
      h.busy({ text: 'Reading…', overlay: true });
      h.state('loading');
    }
  }
  function cardReadFailed(card, error) {
    if (!tableCard(card)) return setCardState(card, 'error', { title: 'This section could not be read', text: `${why(error)} Nothing was changed.`, action: 'Try again' });
    if (card.getAttribute('data-kp-state') !== 'ready') setCardState(card, 'ready');
    ensureTable(card);
    for (const h of tableHandles(card)) h.fail(`${why(error)} Nothing was changed.`);
  }
  function cardReadBack(card, was) {
    if (!tableCard(card)) return setCardState(card, was, was === 'empty' ? emptyNote(card) : undefined);
    for (const h of tableHandles(card)) h.state('ready');
  }
  return { cardReading, cardReadFailed, cardReadBack };
}
