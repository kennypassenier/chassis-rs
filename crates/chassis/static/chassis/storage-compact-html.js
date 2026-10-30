// The compact dialog's markup: the figures, the steps, the meters and the
// shell.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { size } from './storage-format.js';
import { figure, flashButton, stepItem } from './storage-markup.js';
import { escapeHtml as esc } from './format-text.js';

/* ----------------------------------------------------- the compact -- */
export function compactInner(c, t) {
  const none = c.state === 'none' || c.state === 'paused';
  const done = c.state === 'done';
  const checking = c.state === 'checking' || c.state === 'unreadable';
  const gain = none || checking ? 0 : done ? c.freed : c.free;
  const before = done ? t.app + gain : t.app;
  const after = before - gain;
  const totalNow = done ? t.total + gain : t.total;
  const totalAfter = none || checking ? t.total : done ? t.total : Math.max(0, t.total - gain - t.wal);
  const meter = (label, bytes) =>
    `<span class="kp-meter" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round((bytes / t.budget) * 100)}" aria-valuetext="${size(bytes)} of ${size(t.budget)}" style="--kp-value: ${(bytes / t.budget).toFixed(4)}; --kp-mark: ${t.warn / t.budget}"><span class="kp-meter__mark" aria-hidden="true"></span></span>`;
  const st = c.state === 'running' ? ['done', 'running', 'pending'] : done ? ['done', 'done', 'done'] : ['pending', 'pending', 'pending'];
  const run = c.state === 'running' || done;
  const steps = `<ol class="kp-steplist" aria-label="What happens">${stepItem('pause', 'Writes pause', 'For a few seconds; reading carries on', st[0])}${stepItem('rewrite', 'The file is rewritten', 'Without the empty space deleted rows left', st[1])}${stepItem('resume', 'Writes resume', 'The budget reading is updated', st[2])}</ol>`;
  const off = none || checking || c.state === 'running';
  const primary = done
    ? '<button type="button" class="kp-button kp-button--primary" id="storage-compact-done" data-kp-dialog-close>Done</button>'
    : `<button type="button" class="kp-button" id="storage-compact-cancel" data-kp-dialog-close${c.state === 'running' ? ' disabled' : ''}>Cancel</button>${flashButton('Compact now', { kind: 'primary', words: 'Compacted,Failed', attrs: `id="storage-compact-run" data-storage-run${off ? ' disabled' : ''}${off ? ' aria-describedby="storage-compact-why"' : ''}` })}`;
  const noteText =
    c.state === 'paused'
      ? 'Writes are paused for a backup, so compacting has to wait. Try again in a minute.'
      : c.state === 'none'
        ? 'There is no empty space to give back, so compacting would change nothing.'
        : done
          ? `Done: ${size(gain)} given back. The file is ${size(t.app)} now.`
          : 'It never runs by itself. The sign-in data is not touched, and nothing is removed.';
  const sState = c.state === 'failed' ? 'failed' : c.state === 'checking' ? 'checking' : c.state === 'unreadable' ? 'unreadable' : 'ready';
  const cardState = sState === 'failed' || sState === 'unreadable' ? 'error' : sState === 'checking' ? 'loading' : 'ready';
  const fig = (label, value, noteTextLine) => figure(label, value, noteTextLine);
  return `<div class="kp-dialog__body"><div class="storage-grid storage-compact__grid">
    <div class="kp-dialog__head storage-compact__head"><h2 class="kp-dialog__title" id="storage-compact-title">Compact the application data</h2><p class="kp-dialog__description">Deleted rows leave empty space inside the file. Compacting rewrites it without that space.</p></div>
    <div class="kp-kpis storage-compact__kpis" role="group" aria-label="Before and after" data-kp-kpis-columns="all 3 1">${fig('Now', size(before), 'application data')}${fig('Can be given back', size(gain), none ? 'no empty space' : 'empty space')}${fig('After', size(after), 'about')}</div>
    <section class="kp-card storage-compact__steps" data-kp-state="${cardState}" data-storage-card="steps" data-storage-sstate="${sState}" aria-labelledby="storage-compact-h-steps"><div class="storage-card-head"><h3 class="kp-dialog__heading" id="storage-compact-h-steps">What happens</h3><p class="kp-lede" data-kp-lede-measure="full">${run ? 'In progress; you can leave this open.' : 'Three steps, a few seconds in all.'}</p></div>
      <div class="kp-card__stage"><div class="kp-card__data">${steps}</div></div></section>
    <section class="kp-card storage-compact__meters" aria-labelledby="storage-compact-h-meters"><div class="storage-card-head"><h3 class="kp-dialog__heading" id="storage-compact-h-meters">Against the budget</h3><p class="kp-lede" data-kp-lede-measure="full">All storage, with the tick at the ${size(t.warn)} warning level.</p></div>
      <div class="kp-formgrid storage-meters" data-kp-formgrid-label="fit"><div class="kp-formgrid__row"><span class="kp-formgrid__label">Now</span><div class="kp-formgrid__control">${meter('All storage now', totalNow)}</div><p class="kp-formgrid__value"><strong>${size(totalNow)}</strong></p></div>
        <div class="kp-formgrid__row"><span class="kp-formgrid__label">After</span><div class="kp-formgrid__control">${meter('All storage after compacting', totalAfter)}</div><p class="kp-formgrid__value"><strong>${size(totalAfter)}</strong></p></div></div></section>
    <section class="storage-compact__foot"><p class="kp-dialog__note" id="storage-compact-why">${esc(noteText)}</p><div class="storage-compact__acts">${primary}</div></section>
  </div></div>`;
}

export const compactShell = (c, t) =>
  `<dialog class="kp-dialog kp-dialog--wide storage-dialog storage-compact" id="storage-compact-dialog" aria-labelledby="storage-compact-title">${compactInner(c, t)}</dialog>`;
