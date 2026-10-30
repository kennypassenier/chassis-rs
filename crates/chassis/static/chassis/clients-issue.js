// The Clients page's issue dialog.
// Split out of chassis.js by responsibility; the page runs exactly as
// before. The card (clients-issue-card), the Issue request
// (clients-issue-submit) and the result state (clients-issue-result) share
// one `ctx` object built here.

import { createCardSync } from './clients-issue-card.js';
import { createResult } from './clients-issue-result.js';
import { wireSubmit } from './clients-issue-submit.js';

// ---- the issue dialog (clients-issue) -----------------------------------
// One dialog, three states in the same boxes: the form (and the form with
// its refusal), then the result. The rows of the grid have minimum heights
// and the card contents swap inside them, so the dialog is as tall in every
// state. The token lives in this dialog's ctx only, never in the page: the secret
// field asks for it when it is shown or copied.

export const ISSUE_OPEN_KEY = 'chassis-open-manage';

export async function startIssueDialog(dialog, load, one) {
  const [forms, combobox, usual, patterns, command, flash, idmark, lede] = await Promise.all(
    ['forms', 'combobox', 'usual-picker', 'patterns', 'command', 'flash', 'idmark', 'lede'].map(load),
  );
  const $ = (selector) => dialog.querySelector(selector);
  // The dialog's shared state: `token` lives here only, never in the page.
  const ctx = {
    dialog, one, forms, idmark, command, flash, $,
    form: dialog.querySelector('form#issue'),
    nameInput: $('[data-issue-in="name"]'),
    topicInput: $('[data-issue-in="topic"]'),
    card: $('[data-issue-card]'),
    state: $('[data-issue-state]'),
    token: '',
    issued: null,
    opening: false,
    pollTimer: 0,
  };

  forms.attachForms(dialog);
  combobox.attachComboboxes(dialog);
  combobox.attachSelects(dialog);
  usual.attachUsualPickers(dialog);
  flash.attachFlashButtons(dialog);
  idmark.attachIdmarks(dialog);
  lede.attachLedes(dialog);
  patterns.attachPatterns(dialog, { secretLoad: () => ctx.token });

  const cardSync = createCardSync(ctx);
  ctx.textOf = cardSync.textOf;
  Object.assign(ctx, createResult(ctx));
  cardSync.wire();
  wireSubmit(ctx);

  // "Open the client": the page reloads (the list is stale) and opens its manage dialog.
  $('[data-issue-open]').addEventListener('click', () => {
    ctx.opening = true;
    try {
      sessionStorage.setItem(ISSUE_OPEN_KEY, ctx.issued.id);
    } catch (_) {
      // Without storage the page just reloads.
    }
    window.location.reload();
  });
  // Whatever closes it, an issued client means the list on the page is out of date.
  dialog.addEventListener('close', () => {
    window.clearInterval(ctx.pollTimer);
    if (ctx.issued && !ctx.opening) window.location.reload();
  });
}
