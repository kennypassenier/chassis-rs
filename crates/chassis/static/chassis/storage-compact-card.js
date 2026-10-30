// The Storage page's compact card: the space that can be given back and the
// button that opens the dialog.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { size, when } from './storage-format.js';
import { escapeHtml as esc } from './format-text.js';

export function compactHtml(t, data) {
  const none = t.free <= 0 && t.wal <= 0;
  const off = none || data.paused || !data.has_app_db;
  const why = !data.has_app_db
    ? 'This application keeps no data of its own, so there is nothing to compact.'
    : data.paused
      ? 'Writes are paused for a backup. Compacting can start again in a minute.'
      : none
        ? 'Nothing to give back yet: deleted rows leave empty space to reclaim.'
        : 'Writes pause for a few seconds. It never runs by itself.';
  const note = none ? 'The file has no empty space' : 'Empty space deleted rows left behind';
  return `<div class="storage-compact-card">
      <div class="kp-kpis" role="group" aria-label="Space that can be given back" data-kp-kpis-columns="all 1"><div class="kp-kpi"><span class="kp-kpi__label">Can be given back</span><span class="kp-kpi__value">${size(t.free)}</span><span class="kp-kpi__trend">${note}</span></div></div>
      <dl class="kp-kv kp-kv--lines"><div class="kp-kv__row"><dt>File now</dt><dd>${size(t.app)}</dd></div><div class="kp-kv__row"><dt>After compacting</dt><dd>about ${size(t.app - t.free)}</dd></div><div class="kp-kv__row"><dt>Last compacted</dt><dd>${data.last_compacted_at ? when(data.last_compacted_at) : 'never'}</dd></div></dl>
      <div class="storage-compact-card__act"><button type="button" class="kp-button kp-button--primary" id="storage-open-compact" data-storage-compact${off ? ' disabled aria-describedby="storage-open-compact-why"' : ''}>Compact…</button><p class="kp-dialog__note" id="storage-open-compact-why">${esc(why)}</p></div></div>`;
}
