import { poll } from './status-api.js';
import { jsonEmpty, jsonHtml, kvHtml, rowsHtml, tableHtml } from './status-bodies.js';
import { emptyNote, cardReads } from './status-card-reads.js';
import { drawFailure } from './status-failure.js';
import { HOURS, stampTimes } from './status-format.js';
import { drawKpisLoading } from './status-loading.js';
import { kpiTiles, partHtml, sectionEmpty, updatesRows } from './status-parts.js';
import { attachStatusModules } from './status-modules.js';
import { escapeHtml } from './format-text.js';
import { copyText } from './clipboard.js';

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

async function startStatus(root) {
  const kp = (name) => import(`../kp/js/${name}.js`);
  const { restoreRemembered, attachRemembered } = await kp('remember');
  restoreRemembered(root);
  attachRemembered(root);

  await attachStatusModules(root, kp);

  const { setProblems } = await kp('problems');
  const { setUptime } = await kp('uptime');
  const { setStatus } = await kp('statusrow');
  const { setCardState } = await kp('card-state');
  const { runFlashButton } = await kp('flash');
  const { toast } = await kp('overlays');
  const { refreshOf } = await kp('auto-refresh');
  const { attachAgo } = await kp('freshness');
  const { attachVersionDeltas } = await kp('version-delta');
  const { attachStatusLists } = await kp('statusrow');
  const { attachDataTables, dataTable } = await kp('datatable');
  const { attachKpiStrips, setMeter } = await kp('kpi');
  const { setAttention } = await kp('attention');

  const say = (text) => toast(text, { ms: 3200 });
  const esc = escapeHtml;
  const { cardReading, cardReadFailed, cardReadBack } = cardReads({ setCardState, dataTable, attachDataTables });
  function showFailure(on) {
    drawFailure(root, setAttention, on);
  }
  function kpisLoading() {
    drawKpisLoading(root, setMeter);
  }
  /* ------------------------------------------------------- the polling -- */
  const refreshEl = root.querySelector('.kp-refresh');
  let lastData = null;
  let failures = 0;
  const signatures = new Map();

  const only = (selector) => root.querySelector(selector);
  function swap(el, html, attach) {
    if (!el) return;
    el.innerHTML = html;
    attach?.(el);
  }

  // A table keeps its search, sort and page when its rows change: the rows
  // go into the data table that is there and it is told to look again; only
  // new columns draw it from scratch.
  function updateTable(wrapper, s, part) {
    const host = wrapper.querySelector('[data-kp-datatable]');
    const handle = host && dataTable(host);
    const columns = part.data.columns.join('\u0001');
    if (!handle || host.dataset.chassisColumns !== columns) {
      wrapper.innerHTML = tableHtml(s.slug, s.title, part.data);
      const fresh = wrapper.querySelector('[data-kp-datatable]');
      if (fresh) fresh.dataset.chassisColumns = columns;
      attachDataTables(wrapper);
      return;
    }
    const sorts = [...host.querySelectorAll('thead th')].map((th) => th.getAttribute('data-kp-sort') || 'text');
    host.querySelector('tbody').innerHTML = rowsHtml(part.data.rows, sorts, part.data.key ?? 0);
    handle.refresh();
  }
  function updateSection(card, s, force) {
    const redraw = (key, sig, draw) => {
      const known = signatures.get(key);
      signatures.set(key, sig);
      if ((known === undefined || known === sig) && !force) return;
      draw();
    };
    if (card.dataset.chassisKind === 'rows') {
      // A section as it always was: label/value rows.
      const rows = s.body && s.body.kind === 'rows' ? s.body.data : s.rows;
      const dl = card.querySelector('dl[data-chassis-rows]');
      if (dl && rows) redraw(s.slug, JSON.stringify(rows), () => (dl.outerHTML = kvHtml(rows)));
      // The list was left out while the rows were empty: draw it when they arrive.
      else if (rows && rows.length) {
        redraw(s.slug, JSON.stringify(rows), () => card.querySelector('.kp-card__data')?.insertAdjacentHTML('afterbegin', kvHtml(rows)));
      }
      return;
    }
    if (card.dataset.chassisKind !== 'parts') return;
    (s.parts || []).forEach((part, i) => {
      const wrapper = card.querySelector(`[data-chassis-part="${i}"]`);
      const html = partHtml(s, part);
      if (!wrapper || html === null) return;
      redraw(`${s.slug}#${i}`, JSON.stringify(part.data), () => {
        if (part.kind === 'table') return updateTable(wrapper, s, part);
        wrapper.innerHTML = html;
        if (part.kind === 'checks') attachStatusLists(wrapper);
        else if (part.kind === 'kpis') attachKpiStrips(wrapper);
      });
    });
  }

  /* ------------------------------------------- the cards' data states -- */
  // A card the page fills from /api/kit/status is in one of the card's four
  // states (kp-themes card-state): loading shows the theme's own loading
  // card over the data, empty and failed its plates. Cards that read their
  // own JSON (data-chassis-json) keep their own loop below.
  //
  // A section that keeps its own state (an html section with its own
  // loading, empty and failed) opts out (kit-r4): `data-chassis-owned` on
  // its card leaves the card alone on every poll and re-read, and every
  // other card asks first through the cancelable `chassis-settle` event
  // (bubbles; detail { card, state, source }); preventDefault keeps the
  // card as it is.
  const POLLED = '.kp-card[data-kp-state]:not([data-chassis-json]):not([data-chassis-owned])';
  const reading = new Set();
  const mayChange = (card, state, source) =>
    card.dispatchEvent(new CustomEvent('chassis-settle', { bubbles: true, cancelable: true, detail: { card, state, source } }));
  function settle(card, empty) {
    if (reading.has(card)) return;
    const want = empty ? 'empty' : 'ready';
    if (card.getAttribute('data-kp-state') === want) return;
    if (!mayChange(card, want, 'poll')) return;
    setCardState(card, want, empty ? emptyNote(card) : undefined);
  }
  function settleCards(d) {
    for (const card of root.querySelectorAll(POLLED)) {
      if (card.matches('[data-chassis-card="health"]')) settle(card, d.parts.total === 0);
      else if (card.dataset.chassisSection) {
        const s = d.sections.find((x) => x.slug === card.dataset.chassisSection);
        if (s) settle(card, sectionEmpty(s));
      } else settle(card, false);
    }
  }

  async function apply(d, { force = false } = {}) {
    lastData = d;
    // The four figures: rebuilt when they changed; the age of the service
    // is patched in place, since it moves every minute.
    const strip = only('.kp-ops__kpis .kp-kpis');
    const tiles = kpiTiles(d);
    const kpiSig = tiles.replace(/<span class="kp-kpi__value">[^<]*<\/span><span class="kp-kpi__trend">since/, '');
    const upTile = only('[data-chassis-kpi="up"] .kp-kpi__value');
    if (strip && (strip.dataset.sig !== kpiSig || force)) {
      strip.dataset.sig = kpiSig;
      strip.innerHTML = tiles;
      strip.setAttribute('data-kp-kpis-columns', `all ${d.clients ? 4 : 3} 2 1`);
      attachVersionDeltas(strip);
      attachKpiStrips(strip);
      stampTimes(strip);
    } else if (upTile) upTile.textContent = d.up_for;

    // Health rows, by part.
    const list = only('[data-chassis-health]');
    if (list) {
      const names = Object.keys(d.health.subsystems);
      const have = [...list.querySelectorAll(':scope > .kp-statusrow')].map((r) => r.getAttribute('data-kp-status-id'));
      if (names.join('\n') === have.join('\n')) {
        for (const name of names) {
          const sub = d.health.subsystems[name];
          setStatus(list, name, { state: sub.ok ? 'ok' : 'failed', detail: sub.detail });
        }
      } else {
        list.innerHTML = names
          .map((name) => {
            const sub = d.health.subsystems[name];
            return `<li class="kp-statusrow" data-state="${sub.ok ? 'ok' : 'failed'}" data-kp-status-id="${esc(name)}"><span class="kp-statusrow__mark" aria-hidden="true"></span><span class="kp-statusrow__body"><span class="kp-statusrow__label">${esc(name)}</span><span class="kp-statusrow__detail">${esc(sub.detail)}</span></span></li>`;
          })
          .join('');
        attachStatusLists(list.parentElement);
      }
    }

    // What needs a person.
    const box = only('[data-kp-problems]');
    if (box) setProblems(box, d.problems);

    // The updates card.
    const dl = only('[data-chassis-updates]');
    if (dl) {
      const rows = updatesRows(d);
      if (dl.dataset.sig !== rows || force) {
        dl.dataset.sig = rows;
        dl.innerHTML = rows;
        attachVersionDeltas(dl);
        attachAgo(dl);
        stampTimes(dl);
      }
    }

    // The last 48 hours: the strip's own states (a strip with no hour that
    // has data says "No data yet" itself).
    const up = only('[data-kp-uptime]');
    if (up) drawUptime(up, d.uptime);

    for (const s of d.sections) {
      const card = root.querySelector(`[data-chassis-section="${CSS.escape(s.slug)}"]`);
      if (card) updateSection(card, s, force);
    }
    settleCards(d);
  }

  function drawUptime(up, periods) {
    const label = up.getAttribute('data-kp-uptime-label') || '';
    const shown = periods.map((p) => ({ ...p, label: HOURS.format(new Date(p.at)) }));
    const state = shown.some((p) => p.state !== 'none') ? 'ready' : 'empty';
    setUptime(up, { label, periods: state === 'empty' ? [] : shown, state, count: 48 });
  }

  // A quiet read: what is on the page is replaced when it changed, nothing
  // is dimmed (the refresh control keeps the line).
  async function refreshAll({ force = false } = {}) {
    const data = await poll();
    await apply(data, { force });
    await Promise.all([...root.querySelectorAll('[data-chassis-json]')].map((card) => loadJson(card, { quiet: true })));
    return data;
  }

  // The table's own Try again reads its card again.
  root.addEventListener('kp-datatable-retry', (event) => {
    const card = event.target.closest('.kp-card[data-chassis-section]');
    if (!card) return;
    if (card.matches('[data-chassis-json]')) loadJson(card);
    else reread([card]).catch(() => {});
  });
  async function reread(scope) {
    const page = scope === 'page';
    const cards = (page ? [...root.querySelectorAll('.kp-card[data-kp-state]:not([data-chassis-owned])')] : scope.filter((c) => c.matches(POLLED))).filter(
      (c) => mayChange(c, 'loading', 'reread'),
    );
    const was = new Map(cards.map((c) => [c, c.getAttribute('data-kp-state')]));
    const strip = only('.kp-ops__kpis .kp-kpis');
    const tiles = strip ? strip.innerHTML : '';
    if (page) {
      showFailure(false);
      root.setAttribute('data-kp-state', 'loading');
      kpisLoading();
      const up = only('[data-kp-uptime]');
      if (up) setUptime(up, { state: 'loading', label: up.getAttribute('data-kp-uptime-label') || '', count: 48 });
    }
    for (const card of cards) {
      reading.add(card);
      cardReading(card);
    }
    try {
      const data = await poll();
      for (const card of cards) reading.delete(card);
      await apply(data, { force: true });
      if (page) {
        root.removeAttribute('data-kp-state');
        for (const card of cards.filter((c) => c.matches('[data-chassis-json]'))) reading.delete(card);
        await Promise.all([...root.querySelectorAll('[data-chassis-json]')].map((card) => loadJson(card)));
      }
      failures = 0;
      showFailure(false);
      return data;
    } catch (error) {
      for (const card of cards) reading.delete(card);
      if (page) {
        // What was there is put back (the last good read), then the plate.
        if (strip) {
          strip.innerHTML = tiles;
          attachVersionDeltas(strip);
          attachKpiStrips(strip);
          stampTimes(strip);
        }
        const up = only('[data-kp-uptime]');
        if (up) drawUptime(up, lastData ? lastData.uptime : JSON.parse(up.getAttribute('data-chassis-uptime') || '[]'));
        for (const card of cards) cardReadBack(card, was.get(card));
        showFailure(true);
      } else {
        for (const card of cards) cardReadFailed(card, error);
      }
      throw error;
    }
  }

  root.addEventListener('click', async (event) => {
    if (!event.target.closest('[data-chassis-retry]')) return;
    try {
      await reread('page');
    } catch (_) {
      /* the plate is back */
    }
  });

  // The refresh control: the app fetches, the control keeps the line.
  // The first read after the page is drawn shows that it reads, in every
  // part's own loading state (and its failed plate when the service does not
  // answer); the reads after it are quiet.
  let firstRead = true;
  refreshEl?.addEventListener('kp-refresh', async (event) => {
    const { done } = event.detail;
    try {
      if (firstRead) {
        firstRead = false;
        await reread('page');
      } else await refreshAll();
      failures = 0;
      showFailure(false);
      done(true);
    } catch (_) {
      failures += 1;
      // One blip is the refresh line's to report; a second in a row means
      // the numbers on the page can no longer be trusted.
      if (failures >= 2) showFailure(true);
      done(false);
    }
  });

  // A failed row's Retry reads the status again; the rest of the page
  // follows, so a row never keeps saying "loading".
  root.addEventListener(
    'kp-status-retry',
    async (event) => {
      const list = event.target.closest('.kp-statuslist');
      const id = event.detail?.id ?? event.detail?.key;
      if (list && id) setStatus(list, id, { state: 'loading', detail: 'Reading again…' });
      try {
        await refreshAll({ force: true });
      } catch (_) {
        if (list && id) setStatus(list, id, { state: 'failed', detail: 'The service did not answer' });
      }
    },
    true,
  );

  /* ------------------------------------------- cards that read JSON -- */
  async function loadJson(card, { quiet = false } = {}) {
    const url = card.dataset.chassisJson;
    const render = card.dataset.chassisRender || 'rows';
    const slug = card.dataset.chassisSection;
    const title = card.querySelector('.kp-card__title')?.textContent ?? '';
    const body = card.querySelector('[data-chassis-part="0"]');
    if (!quiet) cardReading(card);
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok && !(data && typeof data === 'object' && 'status' in data)) throw new Error(data?.remedy || data?.error || `HTTP ${res.status}`);
      if (data === null) throw new Error('The answer is not JSON');
      if (render !== 'table' && jsonEmpty(render, data)) {
        body.innerHTML = '';
        setCardState(card, 'empty', { title: 'Nothing to show yet', text: 'It fills when the service has something to report.' });
        return;
      }
      body.innerHTML = `${jsonHtml(render, data, slug, title)}<p class="kp-text-muted chassis-status__read"><time class="kp-ago" data-localised="true" data-kp-ago data-kp-ago-verb="read" datetime="${new Date().toISOString()}"></time></p><div class="kp-row section-actions"><button type="button" class="kp-button" data-kp-flash-button data-kp-flash-words="Read,Refused" data-chassis-read-again>Read again</button></div>`;
      attachAgo(body);
      attachDataTables(body);
      attachStatusLists(body);
      attachKpiStrips(body);
      (await kp('flash')).attachFlashButtons(body);
      setCardState(card, 'ready');
    } catch (error) {
      if (quiet && card.getAttribute('data-kp-state') === 'ready') return; // stale data stays readable
      cardReadFailed(card, error);
    }
  }
  root.addEventListener('kp-card-retry', (event) => {
    const card = event.target.closest('.kp-card[data-kp-state]');
    if (!card) return;
    if (card.matches('[data-chassis-json]')) loadJson(card);
    else reread([card]).catch(() => {});
  });

  /* ------------------------------------------------------ the buttons -- */
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-chassis-flash], [data-chassis-read-again], [data-chassis-update-check]');
    if (!button || !root.contains(button) || button.hasAttribute('disabled')) return;

    if (button.matches('[data-chassis-read-again]')) {
      const card = button.closest('[data-chassis-json]');
      runFlashButton(button, async () => {
        await loadJson(card, { quiet: true });
        return card.getAttribute('data-kp-state') === 'ready' ? 'Read' : { error: 'The section could not be read', remedy: 'Try again in a moment.' };
      });
      return;
    }

    if (button.matches('[data-chassis-update-check]')) {
      runFlashButton(button, async () => {
        const res = await fetch('/api/kit/status/update-check', { method: 'POST', headers: { accept: 'application/json' } });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { error: body.error || `HTTP ${res.status}`, remedy: body.remedy };
        reread([root.querySelector('[data-chassis-card="updates"]')].filter(Boolean)).catch(() => {});
        return body.newer ? 'Update found' : 'Up to date';
      });
      return;
    }

    // A section's own button that keeps the page. A destructive one has
    // been through the confirmation dialog by the time this click arrives.
    runFlashButton(button, async () => {
      const res = await fetch(button.dataset.chassisFlash, { method: button.dataset.method || 'POST', headers: { accept: 'application/json' } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { error: body.error || res.statusText || `HTTP ${res.status}`, remedy: body.remedy };
      const n = Number.isInteger(body.count) ? body.count : null;
      const template = n === 1 && button.dataset.chassisToastOne ? button.dataset.chassisToastOne : button.dataset.chassisToast;
      if (template && (n !== null || !template.includes('{n}'))) say(template.replaceAll('{n}', String(n)));
      else if (typeof body.message === 'string' && body.message) say(body.message);
      // What the button changed shows in its section, which reads again in
      // its own loading state.
      const own = button.closest('.kp-card[data-chassis-section]');
      reread(own ? [own] : []).catch(() => {});
      return button.dataset.kpFlashWord || undefined;
    });
  });

  // The header's More menu.
  root.addEventListener('kp-menu-select', async (event) => {
    const value = event.detail?.value;
    if (value === 'copy-health') {
      const ok = await copyText(`${location.origin}/healthz`);
      say(ok ? 'Copied the health address' : 'Copying is not available here; the address is /healthz');
    } else if (value === 'download-json') {
      const link = document.createElement('a');
      link.href = '/api/kit/status';
      link.download = 'status.json';
      document.body.append(link);
      link.click();
      link.remove();
    }
  });

  /* ------------------------------------------------------- first paint -- */
  stampTimes(root);
  const box = only('[data-kp-problems]');
  if (box) setProblems(box, JSON.parse(box.getAttribute('data-chassis-problems') || '[]'));
  const strip = only('[data-kp-uptime]');
  if (strip) drawUptime(strip, JSON.parse(strip.getAttribute('data-chassis-uptime') || '[]'));
  for (const card of root.querySelectorAll('[data-chassis-json]')) loadJson(card);
  // The page is as fresh as the moment it was drawn.
  refreshOf(refreshEl)?.now?.('now');
}
