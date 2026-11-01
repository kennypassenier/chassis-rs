// The Storage page's reads: the loader (first read with waiting states,
// later reads quiet), and every trigger that asks for one again: the
// header's refresh control, a card's or table's Try again, a width change.
import { api } from './json-api.js';

export function createRefresh(ctx) {
  // Read the storage. The first read (and a retry) shows the waiting states;
  // a refresh reads quietly and keeps what is on screen if it fails.
  let reading = null;
  async function load({ quiet = false } = {}) {
    if (reading) return reading;
    reading = (async () => {
      if (!quiet || !ctx.data) ctx.cardsReading();
      try {
        ctx.data = await api('/api/kit/storage');
      } catch (error) {
        if (!quiet || !ctx.data) ctx.cardsFailed(error);
        return false;
      }
      await ctx.paint();
      return true;
    })().finally(() => {
      reading = null;
    });
    return reading;
  }

  function wire() {
    // A card or a table that failed asks again through the package's own retry event.
    document.addEventListener('kp-card-retry', async (event) => {
      const el = event.target instanceof Element ? event.target : null;
      if (!el) return;
      if (ctx.dialog && ctx.dialog.dlg.contains(el)) {
        if (ctx.dialog.kind === 'clean') await ctx.runPreview(ctx.dialog.state);
        else await ctx.checkCompact(ctx.dialog.state);
      } else if (ctx.root.contains(el)) await load();
    });
    ctx.root.addEventListener('kp-datatable-retry', () => load());
  }

  // The kit's refresh tick reads again, quietly (chassisRefresh, ux-chassis-10); a phone shows the
  // kinds as cards, so crossing that width draws the table again.
  function wireTriggers() {
    window.chassisRefresh.onTick(() => load({ quiet: true }));
    ctx.narrow.addEventListener('change', async () => {
      if (!ctx.data) return;
      await ctx.mountTable();
      await ctx.paint();
    });
  }

  return { load, wire, wireTriggers };
}
