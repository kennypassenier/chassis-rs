// The Storage page's budget card: totals, the warning band, the figure, the
// three parts and the stack bar.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { size } from './storage-format.js';
import { escapeHtml as esc } from './format-text.js';

export const totals = (d) => {
  const file = (role) => d.files.find((f) => f.role === role);
  const wal = d.files.reduce((a, f) => a + f.wal_bytes, 0);
  return {
    app: file('app')?.db_bytes ?? 0,
    kit: file('kit')?.db_bytes ?? 0,
    wal,
    total: d.budget.total_bytes,
    budget: d.budget.budget_bytes,
    warn: d.budget.warn_bytes,
    free: d.reclaimable_bytes,
    level: d.budget.level,
    share: d.budget.total_bytes / d.budget.budget_bytes,
  };
};
/* ------------------------------------------------------- page markup -- */
export function attentionBand(t, data) {
  if (t.level === 'ok') return '';
  const biggest = [...data.kinds].sort((a, b) => b.bytes - a.bytes)[0];
  const over = t.level === 'over';
  const what = `Storage is ${over ? 'over its budget' : 'getting full'}: ${size(t.total)} of ${size(t.budget)}`;
  const why = over
    ? 'The budget only warns. Nothing was deleted, and the service keeps working and keeps saving.'
    : `You are warned from ${size(t.warn)}. Nothing is deleted for you, and the service keeps working and keeps saving.`;
  const fix = biggest && biggest.rows > 0
    ? `Clean up the biggest kind, ${biggest.label} (${size(biggest.bytes)}), then compact the file to give the space back.`
    : 'Compact the file to give the space back.';
  const action = biggest && biggest.rows > 0
    ? `<div class="kp-attention__actions"><button type="button" class="kp-button" id="storage-band-clean" data-storage-cleanup="${esc(biggest.id)}">Clean up ${esc(biggest.label)}…</button></div>`
    : '';
  return `<div class="kp-ops__attention kp-attention" data-storage-band><div class="kp-alert kp-alert--${over ? 'destructive' : 'warning'} kp-attention__item" role="alert" data-kp-severity="${over ? 'critical' : 'warning'}"><span class="kp-attention__icon" aria-hidden="true">!</span>
      <div class="kp-attention__text"><strong><span class="kp-sr-only">${over ? 'Critical' : 'Warning'}: </span>${esc(what)}</strong><span>${esc(why)}</span><span><b>What now:</b> ${esc(fix)}</span></div>${action}</div></div>`;
}

// The big figure: its tone, its value and the words under it.
export function figureOf(t) {
  // One place says the share of the budget: here, in the figure's line. A share
  // under a whole percent says so instead of "0 %".
  const pct = t.share > 0 && t.share < 0.01 ? 'under 1' : Math.round(t.share * 100);
  const left = t.budget - t.total;
  return {
    tone: t.level === 'over' ? 'destructive' : t.level === 'warn' ? 'warning' : '',
    value: `${size(t.total)}<small>of ${size(t.budget)}</small>`,
    trend: t.level === 'over' ? `${size(-left)} over the budget of ${size(t.budget)}` : `${size(left)} left; ${pct} % used`,
  };
}

export function budgetHtml(t) {
  const fig = figureOf(t);
  const tone = fig.tone ? ` data-kp-tone="${fig.tone}"` : '';
  const trend = fig.trend;
  const row = (label, value, note, tag = '') =>
    `<div class="storage-files__row"><span class="storage-files__label">${label}</span><strong class="storage-files__size">${value}</strong><p class="storage-files__note">${note}</p><span class="storage-files__tag">${tag}</span></div>`;
  return `<div class="storage-budget">
      <div class="kp-kpis storage-budget__figure" role="group" aria-label="Space used" data-kp-kpis-columns="all 1"><div class="kp-kpi"${tone}><span class="kp-kpi__label">Used</span><span class="kp-kpi__value">${fig.value}</span><span class="kp-kpi__trend">${trend}</span></div></div>
      <figure class="kp-stackbar storage-budget__bar" data-kp-stackbar data-storage-stackbar></figure>
      <div class="storage-files" role="group" aria-label="The three parts of the storage">
        ${row('Application data', size(t.app), `Everything this service stores. Cleaned up here, kind by kind${t.free ? `; ${size(t.free)} of it is empty space` : ''}.`)}
        ${row('Sign-in data', size(t.kit), 'Used for sign-in, never cleaned up here.', '<span class="kp-badge">Read-only</span>')}
        ${row('Pending writes', size(t.wal), 'Changes saved but not yet merged into the data. The service merges them by itself and keeps them under about 1 MB.')}
      </div>
      <div class="storage-budget__edit" data-storage-budget-edit></div></div>`;
}

// [fix-kit-choice-2] One spec, drawn twice by the kp-themes share bar: the bar
// in the budget card (no legend) and the legend in the "Give back empty space"
// card (the bar itself is cropped away there, see storage.css).
const stackBase = (t) => ({
  total: t.budget,
  format: size,
  summary: `${size(t.total)} / ${size(t.budget)}`,
  marks: [{ at: t.warn / t.budget, label: `Warns from ${size(t.warn)}` }],
  label: `Storage used: ${size(t.total)} of ${size(t.budget)}`,
  parts: [
    { key: 'app', label: 'Application data', value: t.app, tone: t.level === 'over' ? 'destructive' : t.level === 'warn' ? 'warning' : undefined },
    { key: 'kit', label: 'Sign-in data (read-only)', value: t.kit },
    { key: 'wal', label: 'Pending writes', value: t.wal },
  ],
});

export const stackSpec = (t) => ({ ...stackBase(t), legend: false });
export const legendSpec = (t) => ({ ...stackBase(t), title: 'Where the space goes' });
