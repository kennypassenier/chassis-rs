// The Status page's pure parts: the four figures, the updates rows and a
// section's parts as markup.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { checksHtml, kpisHtml, kvHtml, tableHtml } from './status-bodies.js';
import { plural } from './status-format.js';
import { escapeHtml as esc } from './format-text.js';

export function kpiTiles(d) {
  const parts = d.parts;
  const ok = parts.total - parts.failing;
  const degraded = d.health.status !== 'ok';
  const u = d.update_facts;
  const repo = d.repository_url ? ` data-kp-version-href="${esc(d.repository_url)}/releases/tag/v{to}"` : '';
  const chip = `<span class="kp-badge kp-badge--version" data-kp-version-from="${esc(d.version)}" data-kp-version-to="${esc(u.latest)}"${repo}></span>`;
  const running = u.newer
    ? `${chip} is out`
    : u.latest
      ? 'The latest release'
      : u.mode === 'unavailable'
        ? 'Updates are not available in this service'
        : 'No newer release known';
  const trend = degraded
    ? `${plural('part', parts.failing)} failing; the health check answers 503`
    : parts.total > 0
      ? 'Every part can do its work'
      : 'This service has no parts to check; being alive is the only signal';
  const meter =
    parts.total > 0
      ? `<span class="kp-kpi__meter" role="meter" aria-label="Parts that can do their work" aria-valuenow="${ok}" aria-valuemin="0" aria-valuemax="${parts.total}" style="--kp-value: ${ok / parts.total}"></span>`
      : '';
  const clients = d.clients
    ? `<a class="kp-kpi" href="${esc(d.clients.href)}" data-chassis-kpi="clients"><span class="kp-kpi__label">${esc(d.clients.label)}</span><span class="kp-kpi__value">${d.clients.active}<small>of ${d.clients.total}</small></span><span class="kp-kpi__trend">active; open the list</span></a>`
    : '';
  return `<div class="kp-kpi"${degraded ? ' data-kp-tone="destructive"' : ''} data-chassis-kpi="health"><span class="kp-kpi__label">Health</span><span class="kp-kpi__value">${degraded ? 'Degraded' : 'Healthy'}${parts.total > 0 ? `<small>${ok} of ${parts.total} parts</small>` : ''}</span><span class="kp-kpi__trend">${trend}</span>${meter}</div>
      <div class="kp-kpi" data-chassis-kpi="running"><span class="kp-kpi__label">Running</span><span class="kp-kpi__value">${esc(d.version)}</span><span class="kp-kpi__trend">${running}</span></div>
      <div class="kp-kpi" data-chassis-kpi="up"><span class="kp-kpi__label">Up for</span><span class="kp-kpi__value">${esc(d.up_for)}</span><span class="kp-kpi__trend">since <time datetime="${esc(d.started_at)}" data-chassis-when data-localised="true"></time></span></div>
      ${clients}`;
}

export function updatesRows(d) {
  const u = d.update_facts;
  const latest = u.newer
    ? `<span class="kp-badge kp-badge--version" data-kp-version-from="${esc(d.version)}" data-kp-version-to="${esc(u.latest)}"${d.repository_url ? ` data-kp-version-href="${esc(d.repository_url)}/releases/tag/v{to}"` : ''}></span>`
    : u.latest
      ? 'You are on it'
      : '<span class="kp-kv__none">—<span class="kp-sr-only">not checked</span></span>';
  const checked = u.last_check_at
    ? `<time datetime="${esc(u.last_check_at)}" data-chassis-when data-localised="true"></time> <time class="kp-ago" data-localised="true" data-kp-ago data-kp-ago-verb="checked" datetime="${esc(u.last_check_at)}"></time>`
    : 'Never';
  return `<div class="kp-kv__row"><dt>Mode</dt><dd>${esc(u.mode_label)}</dd></div><div class="kp-kv__row"><dt>Running</dt><dd><span class="mono">${esc(d.version)}</span></dd></div><div class="kp-kv__row"><dt>Latest release</dt><dd>${latest}</dd></div><div class="kp-kv__row"><dt>Last check</dt><dd>${checked}</dd></div>`;
}

// One section card, brought up to date. A part is redrawn only when what
// it shows changed, so a poll that finds nothing new touches nothing.
export function partHtml(s, part) {
  if (part.kind === 'rows') return kvHtml(part.data);
  if (part.kind === 'kpis') return kpisHtml(part.data, s.title);
  if (part.kind === 'checks') return checksHtml(part.data, s.title);
  if (part.kind === 'table') return tableHtml(s.slug, s.title, part.data);
  return null;
}
// What a section holds, as the card's data state: nothing to report is the
// card's own empty state (a table has its own empty slot, so it counts as
// content).
const partEmpty = (part) => part.kind !== 'table' && Array.isArray(part.data) && part.data.length === 0;
export function sectionEmpty(s) {
  if (s.html) return false;
  const parts = s.parts || [];
  if (!parts.length) return !(s.body && s.body.kind === 'rows' ? s.body.data : s.rows)?.length;
  return parts.every(partEmpty);
}
