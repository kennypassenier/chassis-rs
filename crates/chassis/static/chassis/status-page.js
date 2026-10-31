import { createApply } from './status-apply.js';
import { wireButtons } from './status-buttons.js';
import { cardReads } from './status-card-reads.js';
import { drawFailure } from './status-failure.js';
import { stampTimes } from './status-format.js';
import { createJsonCard } from './status-json-card.js';
import { drawKpisLoading } from './status-loading.js';
import { attachStatusModules } from './status-modules.js';
import { wireRefresh } from './status-refresh-wiring.js';
import { createReread } from './status-reread.js';
import { createSections } from './status-sections.js';
import { createSettle } from './status-settle.js';

/* ======================================================================
   status (kit-kp11)
   The status page as an operations page. The server draws the first
   paint; this block attaches the kp modules the page uses, keeps the page
   fresh from /api/kit/status (the refresh control, a failed health row's
   Retry, a section card's Try again), runs the section buttons that keep
   the page, and loads the cards that read their own JSON. Nothing here
   touches another page: it starts only where [data-chassis-status] is.
   ====================================================================== */
const statusRoot = document.querySelector('[data-chassis-status]');
if (statusRoot) {
  startStatus(statusRoot).catch((error) => console.error('chassis status page', error));
}

// The page's shared context: the kp modules it uses, its root and its
// mutable state (`lastData`, `failures`, `reading`) as properties. The
// factory modules read and write it and call each other through it, so each
// stays small and none needs a closure over the others. The kp modules load
// one after the other, in the order the page always loaded them.
async function buildContext(root) {
  // Every part comes from kp-themes' one bundle; the name only says which part
  // the call site wants.
  const kp = (_part) => import('../kp/dist/kp-themes.min.js');
  const { restoreRemembered, attachRemembered } = await kp('remember');
  restoreRemembered(root);
  attachRemembered(root);

  await attachStatusModules(root, kp);

  const { setProblems } = await kp('problems');
  const { setUptime } = await kp('uptime');
  const { setStatus, attachStatusLists } = await kp('statusrow');
  const { setCardState } = await kp('card-state');
  const { runFlashButton } = await kp('flash');
  const { toast } = await kp('overlays');
  const { refreshOf } = await kp('auto-refresh');
  const { attachAgo } = await kp('freshness');
  const { attachVersionDeltas } = await kp('version-delta');
  const { attachDataTables, dataTable } = await kp('datatable');
  const { attachKpiStrips, setMeter } = await kp('kpi');
  const { setAttention } = await kp('attention');

  const ctx = {
    root,
    kp,
    refreshOf,
    setProblems,
    setUptime,
    setStatus,
    setCardState,
    runFlashButton,
    attachAgo,
    attachVersionDeltas,
    attachStatusLists,
    attachDataTables,
    dataTable,
    attachKpiStrips,
    refreshEl: root.querySelector('.kp-refresh'),
    say: (text) => toast(text, { ms: 3200 }),
    only: (selector) => root.querySelector(selector),
    showFailure: (on) => drawFailure(root, setAttention, on),
    kpisLoading: () => drawKpisLoading(root, setMeter),
    lastData: null,
    failures: 0,
    reading: new Set(), // cards a re-read is filling; a poll leaves them alone
  };
  Object.assign(ctx, cardReads({ setCardState, dataTable, attachDataTables }));
  return ctx;
}

async function startStatus(root) {
  const ctx = await buildContext(root);
  Object.assign(ctx, createSections(ctx), createSettle(ctx), createJsonCard(ctx));
  Object.assign(ctx, createApply(ctx));
  Object.assign(ctx, createReread(ctx));

  wireRefresh(ctx);
  wireButtons(ctx);

  /* ------------------------------------------------------- first paint -- */
  stampTimes(root);
  const box = ctx.only('[data-kp-problems]');
  if (box) ctx.setProblems(box, JSON.parse(box.getAttribute('data-chassis-problems') || '[]'));
  const strip = ctx.only('[data-kp-uptime]');
  if (strip) ctx.drawUptime(strip, JSON.parse(strip.getAttribute('data-chassis-uptime') || '[]'));
  for (const card of root.querySelectorAll('[data-chassis-json]')) ctx.loadJson(card);
  // The page is as fresh as the moment it was drawn.
  ctx.refreshOf(ctx.refreshEl)?.now?.('now');
}
