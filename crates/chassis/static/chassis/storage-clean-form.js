// The clean-up dialog's form: its defaults, what it asks of the API and
// what it holds now.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { dmy, startOfDay } from './storage-format.js';

/* ----------------------------------------------------- the clean-up -- */
const DEFAULT_AGE_DAYS = 30;
// The value of "Any" in a choice: a word of its own, so an empty value never stands for it.
export const ANY = '__any';

export function defaultForm(k) {
  const values = {};
  for (const f of k.filters) values[f.name] = f.type === 'flag' ? false : f.type === 'text' ? '' : ANY;
  return { older: dmy(Date.now() - DEFAULT_AGE_DAYS * 86_400_000), values };
}

// What the form asks, as the API's selection; null when the date is no date.
export function selectionOf(k, form) {
  const sel = { filters: {} };
  if (k.supports_age) {
    const start = startOfDay(form.older);
    if (start === null) return null;
    sel.older_than_secs = Math.max(0, Math.floor((Date.now() - start) / 1000));
  }
  for (const f of k.filters) {
    const v = form.values[f.name];
    if (f.type === 'flag') {
      if (v) sel.filters[f.name] = 'true';
    } else if (typeof v === 'string' && v.trim() !== '' && v !== ANY) sel.filters[f.name] = v.trim();
  }
  return sel;
}

// What the form of the open clean-up dialog holds right now.
export function readForm(dlg, c, k) {
  const older = dlg.querySelector('[data-storage-older]');
  if (older) c.form.older = older.value;
  for (const f of k.filters) {
    const el = dlg.querySelector(`[data-storage-filter="${CSS.escape(f.name)}"]`);
    if (!el) continue;
    if (f.type === 'choice') {
      const on = el.matches('select') ? el.value : (el.querySelector('[aria-checked="true"]')?.getAttribute('data-value') ?? '');
      c.form.values[f.name] = on;
    } else if (f.type === 'flag') c.form.values[f.name] = el.checked;
    else c.form.values[f.name] = el.value;
  }
}
