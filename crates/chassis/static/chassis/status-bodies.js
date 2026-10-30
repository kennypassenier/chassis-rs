// The Status page's markup builders: key-value lists, figure strips, status
// rows, data tables, and what a JSON answer becomes.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { escapeHtml as esc } from './format-text.js';

/* ---------------------------------------------------------- bodies -- */
// The key-value list's own mark for a value that is not there.
const NONE = '<span class="kp-kv__none">—<span class="kp-sr-only">none</span></span>';
// No rows draws nothing (an html-only section has no empty list under it).
export const kvHtml = (pairs) =>
  !pairs.length ? '' : `<dl class="kp-kv kp-kv--lines" data-chassis-rows>${pairs
      .map(([l, v]) => `<div class="kp-kv__row"><dt>${esc(l)}</dt><dd>${v.html ?? (v === '' ? NONE : esc(v))}</dd></div>`)
      .join('')}</dl>`;
export const kpisHtml = (list, label) =>
  `<div class="kp-kpis" role="group" aria-label="${esc(label)}">${list
      .map(
        (k) =>
          `<div class="kp-kpi"${k.tone ? ` data-kp-tone="${esc(k.tone)}"` : ''}><span class="kp-kpi__label">${esc(k.label)}</span><span class="kp-kpi__value">${esc(k.value)}</span>${k.note ? `<span class="kp-kpi__trend">${esc(k.note)}</span>` : ''}</div>`,
      )
      .join('')}</div>`;
const checkState = (c) => (c.state === 'failed' || c.state === 'warn' ? c.state : c.ok === false ? 'failed' : 'ok');
export const checksHtml = (list, label) =>
  `<ul class="kp-statuslist kp-statuslist--rows" aria-label="${esc(label)}">${list
      .map(
        (c) =>
          `<li class="kp-statusrow" data-state="${checkState(c)}" data-kp-status-id="${esc(c.name)}"><span class="kp-statusrow__mark" aria-hidden="true"></span><span class="kp-statusrow__body"><span class="kp-statusrow__label">${esc(c.name)}</span><span class="kp-statusrow__detail">${esc(c.detail ?? '')}</span></span></li>`,
      )
      .join('')}</ul>`;
const sortsOf = (columns, rows) =>
  columns.map((_, c) => {
    const cells = rows.map((r) => String(r[c] ?? '').trim()).filter(Boolean);
    return cells.length && cells.every((s) => Number.isFinite(Number(s))) ? 'number' : 'text';
  });
export const rowsHtml = (rows, sorts, key) =>
  rows
    .map(
      (r) =>
        `<tr data-kp-row-key="${esc(r[key] ?? '')}">${r.map((cell, i) => `<td${sorts[i] === 'number' ? ' class="kp-numeric"' : ''}>${esc(cell)}</td>`).join('')}</tr>`,
    )
    .join('');
// The data table with its standard parts: search, sort, the status line,
// the pager, and its own empty slot (nothing yet / nothing matches).
export const tableHtml = (slug, title, { columns, rows, key = 0 }) => {
  const sorts = sortsOf(columns, rows);
  return `<div class="kp-datatable" data-kp-datatable data-kp-page-size="5" data-kp-remember="status-${esc(slug)}"><div class="kp-datatable__bar"><input class="kp-datatable__search" type="search" data-kp-datatable-search aria-label="Search ${esc(title)}" placeholder="Search"></div><div class="kp-table-wrap"><table class="kp-table"><caption class="kp-sr-only">${esc(title)}</caption><thead><tr>${columns
      .map((c, i) => `<th scope="col" data-kp-sort="${sorts[i]}">${esc(c)}</th>`)
      .join('')}</tr></thead><tbody>${rowsHtml(rows, sorts, key)}</tbody></table></div><div class="kp-empty" data-kp-datatable-empty hidden><span data-kp-datatable-empty-none>Nothing to list yet. Rows appear here as the service has them.</span><span data-kp-datatable-empty-nomatch>No row matches that search. <button type="button" class="kp-button kp-button--sm" data-kp-datatable-clear>Clear the search</button></span></div><div class="kp-datatable__bar"><p class="kp-datatable__status" data-kp-datatable-status role="status" aria-live="polite"></p><div class="kp-datatable__pager" data-kp-datatable-pager></div></div></div>`;
};

// What a JSON answer becomes, by the render a section named (JsonRender).
export const label = (key) => key.charAt(0).toUpperCase() + key.slice(1).replace(/[_-]+/g, ' ');
const scalar = (key, v) => {
  if (key === 'status' && typeof v === 'string') {
    const state = v === 'ok' ? 'ok' : v === 'degraded' ? 'warn' : 'down';
    return { html: `<span class="kp-health" data-state="${state}"><span class="kp-health__dot" aria-hidden="true"></span> ${esc(v)}</span>` };
  }
  if (key === 'version') return { html: `<span class="mono">${esc(v)}</span>` };
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
};
function jsonPairs(data) {
  if (Array.isArray(data)) return data.map((x) => (Array.isArray(x) ? [String(x[0]), String(x[1])] : [String(x.label ?? x.name), String(x.value ?? x.detail ?? '')]));
  const pairs = [];
  for (const [k, v] of Object.entries(data ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [name, sub] of Object.entries(v)) {
        if (sub && typeof sub === 'object' && 'detail' in sub) pairs.push([label(name), String(sub.detail)]);
      }
    } else pairs.push([label(k), scalar(k, v)]);
  }
  // The service's own facts first, the way a person reads them.
  return pairs;
}
function checksOf(data) {
  if (Array.isArray(data)) return data;
  return Object.entries(data ?? {}).map(([name, v]) => ({ name, ok: v.ok, state: v.state, detail: v.detail }));
}
export function jsonEmpty(render, data) {
  if (render === 'table') return !(data?.rows?.length);
  if (render === 'rows') return jsonPairs(data).length === 0;
  return (Array.isArray(data) ? data : checksOf(data)).length === 0;
}
export function jsonHtml(render, data, slug, title) {
  if (render === 'table') return tableHtml(slug, title, data);
  if (render === 'kpis') return kpisHtml(data, title);
  if (render === 'checks') return checksHtml(checksOf(data), title);
  return kvHtml(jsonPairs(data));
}
