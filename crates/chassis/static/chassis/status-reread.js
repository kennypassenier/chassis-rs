// The status page's reads: the quiet refresh (nothing dimmed) and the loud
// re-read (the cards and, for the whole page, the figures show their loading
// states; a failure puts the last good read back, then shows the plate).
import { poll } from './status-api.js';
import { stampTimes } from './status-format.js';
import { POLLED, mayChange } from './status-settle.js';

export function createReread(ctx) {
  // A quiet read: what is on the page is replaced when it changed, nothing
  // is dimmed (the refresh control keeps the line).
  async function refreshAll({ force = false } = {}) {
    const data = await poll();
    await ctx.apply(data, { force });
    await Promise.all([...ctx.root.querySelectorAll('[data-chassis-json]')].map((card) => ctx.loadJson(card, { quiet: true })));
    return data;
  }

  // The cards a re-read covers: the whole page, or those of `scope` that this page fills.
  function cardsOf(scope) {
    const page = scope === 'page';
    const cards = page ? [...ctx.root.querySelectorAll('.kp-card[data-kp-state]:not([data-chassis-owned])')] : scope.filter((c) => c.matches(POLLED));
    return cards.filter((c) => mayChange(c, 'loading', 'reread'));
  }

  function pageReading() {
    ctx.showFailure(false);
    ctx.root.setAttribute('data-kp-state', 'loading');
    ctx.kpisLoading();
    const up = ctx.only('[data-kp-uptime]');
    if (up) ctx.setUptime(up, { state: 'loading', label: up.getAttribute('data-kp-uptime-label') || '', count: 48 });
  }

  // What was there is put back (the last good read), then the plate.
  function pageReadBack(strip, tiles, cards, was) {
    if (strip) {
      strip.innerHTML = tiles;
      ctx.attachVersionDeltas(strip);
      ctx.attachKpiStrips(strip);
      stampTimes(strip);
    }
    const up = ctx.only('[data-kp-uptime]');
    if (up) ctx.drawUptime(up, ctx.lastData ? ctx.lastData.uptime : JSON.parse(up.getAttribute('data-chassis-uptime') || '[]'));
    for (const card of cards) ctx.cardReadBack(card, was.get(card));
    ctx.showFailure(true);
  }

  async function reread(scope) {
    const page = scope === 'page';
    const cards = cardsOf(scope);
    const was = new Map(cards.map((c) => [c, c.getAttribute('data-kp-state')]));
    const strip = ctx.only('.kp-ops__kpis .kp-kpis');
    const tiles = strip ? strip.innerHTML : '';
    if (page) pageReading();
    for (const card of cards) {
      ctx.reading.add(card);
      ctx.cardReading(card);
    }
    try {
      const data = await poll();
      for (const card of cards) ctx.reading.delete(card);
      await ctx.apply(data, { force: true });
      if (page) {
        ctx.root.removeAttribute('data-kp-state');
        for (const card of cards.filter((c) => c.matches('[data-chassis-json]'))) ctx.reading.delete(card);
        await Promise.all([...ctx.root.querySelectorAll('[data-chassis-json]')].map((card) => ctx.loadJson(card)));
      }
      ctx.failures = 0;
      ctx.showFailure(false);
      return data;
    } catch (error) {
      for (const card of cards) ctx.reading.delete(card);
      if (page) pageReadBack(strip, tiles, cards, was);
      else for (const card of cards) ctx.cardReadFailed(card, error);
      throw error;
    }
  }

  return { refreshAll, reread };
}
