// The Storage page's budget editor: what the server refuses, the live level
// and the form markup.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { num } from './storage-format.js';
import { flashButton } from './storage-markup.js';

/* --------------------------------------------- the budget editor -- */
// The saved setting comes from the API; `draft` is what the two fields say
// now. Everything derived (the figure, the bar, the warn mark, the words
// under the fields, the buttons) is drawn from the draft, live.
const MAX_MB = (d) => d.budget.setting.max_mb;
export const levelFor = (total, budget, warn) => (total > budget ? 'over' : total >= warn ? 'warn' : 'ok');
export const mbBytes = (mb) => mb * 1e6;

// What the server refuses, in the server's words (see storage/runtime.rs validate_mb).
export function problemWith(pair, data) {
  const { budget, warn } = pair;
  if (!Number.isInteger(budget)) return ['budget', 'The budget must be a whole number of megabytes.'];
  if (!Number.isInteger(warn)) return ['warn', 'The warn line must be a whole number of megabytes.'];
  if (budget < 1 || budget > MAX_MB(data)) return ['budget', `The budget must be from 1 to ${num(MAX_MB(data))} MB.`];
  if (warn < 1 || (warn >= budget && budget !== 1)) return ['warn', warn < 1 ? 'The warn line must be at least 1 MB.' : `The warn line must be below the budget of ${num(budget)} MB.`];
  return null;
}

// The short reason a value cannot be edited here; the API's own sentence says more.
export const fixedBy = (f) => `Fixed by ${f.by === 'flag' ? 'the flag' : f.by === 'env' ? 'the variable' : 'the file setting'} ${f.name}.`;

export function editHtml(s, pair, data) {
  const bFix = s.budget_fixed;
  const wFix = s.warn_fixed;
  const field = (key, id, label, value, fixed, min, max, noteId) =>
    `<div class="kp-formgrid__row"><label class="kp-formgrid__label" for="${id}">${label}</label>
        <div class="kp-formgrid__control kp-formgrid__short"><div class="kp-quantity" data-kp-quantity data-kp-quantity-min="${min}" data-kp-quantity-max="${max}" data-kp-quantity-unit="MB" data-kp-quantity-label="${label}"${fixed ? ' data-kp-quantity-disabled' : ''}><input class="kp-quantity__input" id="${id}" value="${value}" inputmode="numeric" autocomplete="off" aria-describedby="${noteId}"${fixed ? ' disabled' : ''} data-storage-field="${key}" /></div></div>
        <p class="kp-formgrid__value" id="${noteId}" data-storage-note="${key}"></p></div>`;
  return `<fieldset class="kp-formgrid storage-form storage-budget-form" data-kp-formgrid-stack="auto" aria-describedby="storage-budget-explain"><legend class="kp-sr-only">Budget</legend>
      <p class="kp-dialog__note" id="storage-budget-explain" data-kp-formgrid-span="all">Only a warning: nothing is deleted when the budget is reached. Raise the budget to give the data more room, lower it to be told sooner.</p>
      ${field('budget', 'storage-budget-mb', 'Budget', pair.budget, bFix, 1, MAX_MB(data), 'storage-budget-mb-note')}
      ${field('warn', 'storage-warn-mb', 'Warn line', pair.warn, wFix, 1, MAX_MB(data), 'storage-warn-mb-note')}
      <div class="kp-formgrid__row kp-formgrid__row--buttons"><div class="kp-formgrid__control"><div class="kp-formgrid__buttons">
        ${flashButton('Reset to default', { words: 'Reset,Refused', attrs: `id="storage-budget-reset" data-storage-budget-reset aria-describedby="storage-budget-state"` })}
        ${flashButton('Save', { words: 'Saved,Refused', kind: 'primary', attrs: `id="storage-budget-save" data-storage-budget-save aria-describedby="storage-budget-state"` })}
      </div></div><p class="kp-formgrid__value kp-dialog__note" id="storage-budget-state" data-storage-budget-state role="status"></p></div>
    </fieldset>`;
}
