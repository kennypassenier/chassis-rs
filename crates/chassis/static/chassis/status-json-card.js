// The status page's cards that read their own JSON (data-chassis-json):
// fetch the card's URL, draw the body in the card's render kind, and keep
// stale data readable when a quiet re-read fails.
import { jsonEmpty, jsonHtml } from './status-bodies.js';

export function createJsonCard(ctx) {
  const readLine = () =>
    `<p class="kp-text-muted chassis-status__read"><time class="kp-ago" data-localised="true" data-kp-ago data-kp-ago-verb="read" datetime="${new Date().toISOString()}"></time></p><div class="kp-row section-actions"><button type="button" class="kp-button" data-kp-flash-button data-kp-flash-words="Read,Refused" data-chassis-read-again>Read again</button></div>`;

  async function fetchJson(url) {
    const res = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (!res.ok && !(data && typeof data === 'object' && 'status' in data)) throw new Error(data?.remedy || data?.error || `HTTP ${res.status}`);
    if (data === null) throw new Error('The answer is not JSON');
    return data;
  }

  async function loadJson(card, { quiet = false } = {}) {
    const render = card.dataset.chassisRender || 'rows';
    const slug = card.dataset.chassisSection;
    const title = card.querySelector('.kp-card__title')?.textContent ?? '';
    const body = card.querySelector('[data-chassis-part="0"]');
    if (!quiet) ctx.cardReading(card);
    try {
      const data = await fetchJson(card.dataset.chassisJson);
      if (render !== 'table' && jsonEmpty(render, data)) {
        body.innerHTML = '';
        ctx.setCardState(card, 'empty', { title: 'Nothing to show yet', text: 'It fills when the service has something to report.' });
        return;
      }
      body.innerHTML = `${jsonHtml(render, data, slug, title)}${readLine()}`;
      ctx.attachAgo(body);
      ctx.attachDataTables(body);
      ctx.attachStatusLists(body);
      ctx.attachKpiStrips(body);
      (await ctx.kp('flash')).attachFlashButtons(body);
      ctx.setCardState(card, 'ready');
    } catch (error) {
      if (quiet && card.getAttribute('data-kp-state') === 'ready') return; // stale data stays readable
      ctx.cardReadFailed(card, error);
    }
  }

  return { loadJson };
}
