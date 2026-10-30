// The status page's fresh data: apply one /api/kit/status answer to the
// four figures, the health rows, the problems, the updates card, the
// 48-hour strip and the sections. Quiet: only what changed is replaced.
import { HOURS, stampTimes } from './status-format.js';
import { kpiTiles, updatesRows } from './status-parts.js';
import { escapeHtml } from './format-text.js';

export function createApply(ctx) {
  const esc = escapeHtml;

  // The four figures: rebuilt when they changed; the age of the service
  // is patched in place, since it moves every minute.
  function applyKpis(d, force) {
    const strip = ctx.only('.kp-ops__kpis .kp-kpis');
    const tiles = kpiTiles(d);
    const kpiSig = tiles.replace(/<span class="kp-kpi__value">[^<]*<\/span><span class="kp-kpi__trend">since/, '');
    const upTile = ctx.only('[data-chassis-kpi="up"] .kp-kpi__value');
    if (strip && (strip.dataset.sig !== kpiSig || force)) {
      strip.dataset.sig = kpiSig;
      strip.innerHTML = tiles;
      strip.setAttribute('data-kp-kpis-columns', `all ${d.clients ? 4 : 3} 2 1`);
      ctx.attachVersionDeltas(strip);
      ctx.attachKpiStrips(strip);
      stampTimes(strip);
    } else if (upTile) upTile.textContent = d.up_for;
  }

  const healthRow = (name, sub) =>
    `<li class="kp-statusrow" data-state="${sub.ok ? 'ok' : 'failed'}" data-kp-status-id="${esc(name)}"><span class="kp-statusrow__mark" aria-hidden="true"></span><span class="kp-statusrow__body"><span class="kp-statusrow__label">${esc(name)}</span><span class="kp-statusrow__detail">${esc(sub.detail)}</span></span></li>`;

  // Health rows, by part.
  function applyHealth(d) {
    const list = ctx.only('[data-chassis-health]');
    if (!list) return;
    const names = Object.keys(d.health.subsystems);
    const have = [...list.querySelectorAll(':scope > .kp-statusrow')].map((r) => r.getAttribute('data-kp-status-id'));
    if (names.join('\n') === have.join('\n')) {
      for (const name of names) {
        const sub = d.health.subsystems[name];
        ctx.setStatus(list, name, { state: sub.ok ? 'ok' : 'failed', detail: sub.detail });
      }
    } else {
      list.innerHTML = names.map((name) => healthRow(name, d.health.subsystems[name])).join('');
      ctx.attachStatusLists(list.parentElement);
    }
  }

  function applyUpdates(d, force) {
    const dl = ctx.only('[data-chassis-updates]');
    if (!dl) return;
    const rows = updatesRows(d);
    if (dl.dataset.sig !== rows || force) {
      dl.dataset.sig = rows;
      dl.innerHTML = rows;
      ctx.attachVersionDeltas(dl);
      ctx.attachAgo(dl);
      stampTimes(dl);
    }
  }

  function drawUptime(up, periods) {
    const label = up.getAttribute('data-kp-uptime-label') || '';
    const shown = periods.map((p) => ({ ...p, label: HOURS.format(new Date(p.at)) }));
    const state = shown.some((p) => p.state !== 'none') ? 'ready' : 'empty';
    ctx.setUptime(up, { label, periods: state === 'empty' ? [] : shown, state, count: 48 });
  }

  async function apply(d, { force = false } = {}) {
    ctx.lastData = d;
    applyKpis(d, force);
    applyHealth(d);
    // What needs a person.
    const box = ctx.only('[data-kp-problems]');
    if (box) ctx.setProblems(box, d.problems);
    applyUpdates(d, force);
    // The last 48 hours: the strip's own states (a strip with no hour that
    // has data says "No data yet" itself).
    const up = ctx.only('[data-kp-uptime]');
    if (up) drawUptime(up, d.uptime);
    for (const s of d.sections) {
      const card = ctx.root.querySelector(`[data-chassis-section="${CSS.escape(s.slug)}"]`);
      if (card) ctx.updateSection(card, s, force);
    }
    ctx.settleCards(d);
  }

  return { apply, drawUptime };
}
