// The clean-up dialog's markup: the choices, the preview, the confirmation
// band and the shell.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { ANY } from './storage-clean-form.js';
import { count, humane, size, unitOf, num, when } from './storage-format.js';
import { escapeHtml as esc } from './format-text.js';
import { figure, flashButton, stepItem } from './storage-markup.js';

function filterControl(k, f, v) {
  const id = `storage-clean-filter-${f.name}`;
  if (f.type === 'choice') {
    const options = [[ANY, 'Any'], ...(f.values ?? []).map((x) => [x, humane(x)])];
    if (options.length > 5) {
      return `<select class="kp-field__input" id="${esc(id)}" data-storage-filter="${esc(f.name)}">${options.map(([val, label]) => `<option value="${esc(val)}"${v === val ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
    }
    const items = options
      .map(([val, label]) => `<button type="button" class="kp-segmented__item" data-value="${esc(val)}" role="radio" aria-checked="${v === val}"><span class="kp-segmented__label">${esc(label)}</span></button>`)
      .join('');
    return `<div class="kp-segmented" data-kp-segmented="single" id="${esc(id)}" data-storage-filter="${esc(f.name)}" role="radiogroup" aria-labelledby="${esc(id)}-l">${items}</div>`;
  }
  if (f.type === 'flag') {
    return `<label class="kp-switch"><input class="kp-switch__input" type="checkbox" role="switch" id="${esc(id)}" data-storage-filter="${esc(f.name)}"${v ? ' checked' : ''} /><span class="kp-switch__state" aria-hidden="true"></span><span class="kp-sr-only">${esc(f.label)}</span></label>`;
  }
  return `<input class="kp-field__input" type="text" id="${esc(id)}" data-storage-filter="${esc(f.name)}" value="${esc(v)}" autocomplete="off" />`;
}

const FILTER_NOTES = {
  choice: 'Leave it on Any to ignore it.',
  flag: 'Off means everything counts.',
  text: 'Part of the value is enough. Empty means everything counts.',
};

function filtersCard(k, c) {
  const locked = c.step !== 'choose';
  const rows = k.filters
    .map(
      (f) =>
        `<div class="kp-formgrid__row"><label class="kp-formgrid__label" id="storage-clean-filter-${esc(f.name)}-l" for="storage-clean-filter-${esc(f.name)}">${esc(f.label)}</label><div class="kp-formgrid__control">${filterControl(k, f, c.form.values[f.name])}</div><p class="kp-formgrid__value">${FILTER_NOTES[f.type] ?? ''}</p></div>`,
    )
    .join('');
  const older = k.supports_age
    ? `<div class="kp-formgrid__row"><label class="kp-formgrid__label" for="storage-clean-older">Older than</label>
          <div class="kp-formgrid__control kp-formgrid__short"><div class="kp-datepicker" data-kp-datepicker lang="en-GB" data-kp-date-format="rule52"><input class="kp-field__input" id="storage-clean-older" type="text" inputmode="numeric" data-kp-date-input data-storage-older value="${esc(c.form.older)}" /><button type="button" class="kp-button" data-kp-date-open aria-label="Open the calendar"><span aria-hidden="true">▦</span></button><div class="kp-datepicker__panel" data-kp-date-panel hidden></div></div></div>
          <p class="kp-formgrid__value">Rows from before this day. Dates are dd/mm/yyyy.</p></div>`
    : '';
  const none = !k.supports_age && !k.filters.length
    ? `<p class="kp-dialog__note storage-nofilters" data-kp-formgrid-span="all">${esc(k.label)} has no date and declares no filter, so everything in it goes.</p>`
    : !k.supports_age
      ? `<p class="kp-dialog__note storage-nofilters" data-kp-formgrid-span="all">${esc(k.label)} has no date, so only the choices below decide.</p>`
      : !k.filters.length
        ? `<p class="kp-dialog__note storage-nofilters" data-kp-formgrid-span="all">${esc(k.label)} declares no other filter: only the date decides.</p>`
        : '';
  return `<section class="kp-card storage-clean__filters" aria-labelledby="storage-clean-h-filters">
      <div class="storage-card-head"><h3 class="kp-dialog__heading" id="storage-clean-h-filters">1 · Choose what to remove</h3><p class="kp-lede" data-kp-lede-measure="full">Only what matches every choice is counted. Leave a choice on Any to ignore it.</p></div>
      <fieldset class="kp-formgrid storage-form" data-kp-formgrid-stack="auto"${locked ? ' disabled' : ''}><legend class="kp-sr-only">What to remove</legend>
        ${older}${rows}${none}
        <div class="kp-formgrid__row kp-formgrid__row--buttons"><div class="kp-formgrid__control"><div class="kp-formgrid__buttons"><button type="button" class="kp-button" id="storage-clean-reset" data-storage-reset>Reset choices</button><button type="button" class="kp-button kp-button--primary" id="storage-clean-preview" data-storage-preview>Preview</button></div></div></div>
      </fieldset></section>`;
}

function sampleTable(k, p, cards) {
  const columns = p.columns?.length ? p.columns : Object.keys(p.samples[0] ?? {}).filter((c) => c !== 'id');
  const cell = (col, v) => {
    if (v === null || v === undefined) return '<span class="kp-text-muted">—</span>';
    if (col === p.time_column && typeof v === 'string') return esc(when(v));
    return esc(typeof v === 'boolean' ? (v ? 'yes' : 'no') : v);
  };
  const rows = p.samples
    .map(
      (r) =>
        `<tr>${columns.map((col) => `<td data-label="${esc(humane(col))}"${col === p.time_column ? ' class="kp-timestamp"' : ''} title="${esc(r[col] ?? '')}">${cell(col, r[col])}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<div class="kp-datatable storage-prev__table" data-kp-datatable${cards ? ' data-kp-cards' : ''} data-kp-page-size="5"><div class="kp-table-wrap"><table class="kp-table"><caption>${p.samples.length === 1 ? 'The row' : `The ${p.samples.length} oldest rows`} that match, of ${count(p.rows, k)}</caption>
      <thead><tr>${columns.map((col) => `<th scope="col">${esc(humane(col))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function previewCard(k, c, cards) {
  const p = c.p;
  const done = c.step === 'done' && c.done;
  let asked = c.preview;
  if (done) asked = 'ready';
  else if (c.step === 'confirm') asked = p && p.rows ? 'ready' : 'empty';
  else if (asked === 'ready' && p && !p.rows) asked = 'empty';
  const state = asked === 'idle' || asked === 'invalid' ? 'empty' : asked;
  let body = '';
  if (done) {
    const d = c.done;
    body = `<div class="kp-kpis storage-prev__kpis" role="group" aria-label="What was removed" data-kp-kpis-columns="all 2">${figure('Removed', count(d.count, k), `from ${esc(k.label)}`)}${figure('Empty space in the file', size(d.free), 'until it is compacted')}</div>
        <div class="kp-attention storage-prev__note" data-storage-band><div class="kp-alert kp-alert--success kp-attention__item" role="status"><span class="kp-attention__icon" aria-hidden="true">✓</span><div class="kp-attention__text"><strong>${esc(count(d.count, k))} removed from ${esc(k.label)}</strong><span>The file keeps its size until you compact it, so the budget reading does not drop yet.</span><span><b>What now:</b> Compact the application data to give ${size(d.free)} back.</span></div><div class="kp-attention__actions"><button type="button" class="kp-button" data-storage-compact>Compact…</button></div></div></div>`;
  } else if (asked === 'ready' && p) {
    body = `<div class="kp-kpis storage-prev__kpis" role="group" aria-label="What would be removed" data-kp-kpis-columns="all 4 2">${figure('To remove', num(p.rows), unitOf(k))}${figure('Frees about', size(p.bytes), 'inside the file')}${figure('Oldest', `<span class="storage-when">${p.oldest ? when(p.oldest) : '—'}</span>`, 'of what is removed')}${figure('Newest', `<span class="storage-when">${p.newest ? when(p.newest) : '—'}</span>`, 'of what is removed')}</div>${sampleTable(k, p, cards)}`;
  }
  const lede = done ? 'Done. This is what was removed.' : 'A read-only count. Nothing is deleted before you confirm.';
  return `<section class="kp-card storage-clean__preview" data-kp-state="${state}" data-storage-card="preview" data-storage-pstate="${asked}" aria-labelledby="storage-clean-h-prev">
      <div class="storage-card-head"><h3 class="kp-dialog__heading" id="storage-clean-h-prev">${done ? '3 · Removed' : '2 · What would be removed'}</h3><p class="kp-lede" data-kp-lede-measure="full">${lede}</p></div>
      <div class="kp-card__stage"><div class="kp-card__data">${body}</div></div></section>`;
}

function confirmBand(k, c) {
  const p = c.p;
  const ready = Boolean(p && p.rows > 0) && (c.preview === 'ready' || c.step !== 'choose');
  if (c.step === 'done') {
    return `<section class="storage-clean__confirm storage-clean__confirm--done" aria-label="Finished"><div class="storage-clean__confirm-words"><h3 class="kp-dialog__heading">Finished</h3><p class="kp-dialog__note">The lists and the budget have been read again.</p></div><div class="storage-clean__confirm-body"></div><div class="storage-clean__confirm-acts"><button type="button" class="kp-button kp-button--primary" id="storage-clean-done" data-kp-dialog-close>Done</button></div></section>`;
  }
  if (c.step === 'confirm' && p) {
    return `<section class="storage-clean__confirm kp-dialog__section--danger" aria-labelledby="storage-clean-h-confirm">
      <div class="storage-clean__confirm-words"><h3 class="kp-dialog__heading" id="storage-clean-h-confirm">Delete for good</h3><p class="kp-dialog__note">Type the name of the kind to confirm; the field below shows exactly what. This cannot be undone.</p></div>
      <div class="storage-clean__confirm-body"><div id="storage-clean-confirm" data-kp-type-confirm="${esc(p.confirm_with)}" data-kp-type-confirm-for="storage-clean-delete" data-kp-type-confirm-loses="storage-clean-lost"></div>
        <template id="storage-clean-lost"><ul class="kp-type-confirm__list"><li>${esc(count(p.rows, k))} of ${esc(k.label)}${p.oldest ? `, from ${esc(when(p.oldest))} to ${esc(when(p.newest))}` : ''} (about ${size(p.bytes)})</li><li>Nothing else: the other kinds and the sign-in data stay.</li></ul></template></div>
      <div class="storage-clean__confirm-acts"><button type="button" class="kp-button" id="storage-clean-back" data-storage-back>Back</button>${flashButton('Delete for good', { kind: 'destructive', words: 'Deleted,Refused', attrs: 'id="storage-clean-delete" data-storage-delete' })}</div></section>`;
  }
  const reason = !ready
    ? c.preview === 'idle'
      ? 'Press Preview first: you see what would go before you decide.'
      : c.preview === 'loading'
        ? 'Counting…'
        : c.preview === 'error'
          ? 'The preview failed, so there is nothing to confirm yet.'
          : c.preview === 'invalid'
            ? 'The date is not a date, so there is nothing to confirm yet.'
            : 'Nothing matches, so there is nothing to delete.'
    : 'Next you type the name of the kind.';
  return `<section class="storage-clean__confirm" aria-labelledby="storage-clean-h-confirm">
      <div class="storage-clean__confirm-words"><h3 class="kp-dialog__heading" id="storage-clean-h-confirm">Delete for good</h3><p class="kp-dialog__note">Step 2 asks you to type before anything is removed.</p></div>
      <div class="storage-clean__confirm-body"><p class="kp-dialog__note" id="storage-clean-why">${esc(reason)}</p></div>
      <div class="storage-clean__confirm-acts"><button type="button" class="kp-button kp-button--primary" id="storage-clean-continue" data-storage-continue${ready ? '' : ' disabled aria-describedby="storage-clean-why"'}>Continue to confirm</button></div></section>`;
}

export function cleanInner(c, k, cards) {
  const s1 = c.step === 'choose' ? 'current' : 'done';
  const s2 = c.step === 'choose' ? 'pending' : c.step === 'confirm' ? 'current' : 'done';
  const s3 = c.step === 'done' ? 'done' : 'pending';
  return `<div class="kp-dialog__body"><div class="storage-grid storage-clean__grid">
    <div class="kp-dialog__head storage-clean__head"><h2 class="kp-dialog__title" id="storage-clean-title">Clean up ${esc(k.label)}</h2><p class="kp-dialog__description">${k.description ? `${esc(k.description)} ` : ''}Now ${esc(count(k.rows, k))}, ${size(k.bytes)}.</p></div>
    <ol class="kp-steplist kp-steplist--journey storage-clean__steps" aria-label="Steps">${stepItem('choose', 'Choose and preview', 'Nothing is deleted yet', s1)}${stepItem('confirm', 'Confirm', 'Type to confirm', s2)}${stepItem('done', 'Removed', 'The lists update', s3)}</ol>
    ${filtersCard(k, c)}${previewCard(k, c, cards)}${confirmBand(k, c)}
  </div></div>
  <div class="kp-dialog__actions"><button type="button" class="kp-button" id="storage-clean-close" data-kp-dialog-close>Close</button></div>`;
}

export const cleanShell = (c, k, cards) =>
  `<dialog class="kp-dialog kp-dialog--wide storage-dialog storage-clean" id="storage-clean-dialog" aria-labelledby="storage-clean-title">${cleanInner(c, k, cards)}</dialog>`;
