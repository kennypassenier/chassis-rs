// The status page's card data states. A card the page fills from
// /api/kit/status is in one of the card's four states (kp-themes card-state):
// loading shows the theme's own loading card over the data, empty and failed
// its plates. Cards that read their own JSON (data-chassis-json) keep their
// own loop (status-json-card.js).
//
// A section that keeps its own state (an html section with its own
// loading, empty and failed) opts out (kit-r4): `data-chassis-owned` on
// its card leaves the card alone on every poll and re-read, and every
// other card asks first through the cancelable `chassis-settle` event
// (bubbles; detail { card, state, source }); preventDefault keeps the
// card as it is.
import { emptyNote } from './status-card-reads.js';
import { sectionEmpty } from './status-parts.js';

export const POLLED = '.kp-card[data-kp-state]:not([data-chassis-json]):not([data-chassis-owned])';

export const mayChange = (card, state, source) =>
  card.dispatchEvent(new CustomEvent('chassis-settle', { bubbles: true, cancelable: true, detail: { card, state, source } }));

export function createSettle(ctx) {
  function settle(card, empty) {
    if (ctx.reading.has(card)) return;
    const want = empty ? 'empty' : 'ready';
    if (card.getAttribute('data-kp-state') === want) return;
    if (!mayChange(card, want, 'poll')) return;
    ctx.setCardState(card, want, empty ? emptyNote(card) : undefined);
  }

  function settleCards(d) {
    for (const card of ctx.root.querySelectorAll(POLLED)) {
      if (card.matches('[data-chassis-card="health"]')) settle(card, d.parts.total === 0);
      else if (card.dataset.chassisSection) {
        const s = d.sections.find((x) => x.slug === card.dataset.chassisSection);
        if (s) settle(card, sectionEmpty(s));
      } else settle(card, false);
    }
  }

  return { settleCards };
}
