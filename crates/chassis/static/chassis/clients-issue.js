// The Clients page's issue dialog.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { CLIENTS_POLL_MS } from './clients-config.js';
import { copyText } from './clipboard.js';
import { formatBrussels } from './format-text.js';
import { fetchToken } from './requests.js';

// ---- the issue dialog (clients-issue) -----------------------------------
// One dialog, three states in the same boxes: the form (and the form with
// its refusal), then the result. The rows of the grid have minimum heights
// and the card contents swap inside them, so the dialog is as tall in every
// state. The token lives in this closure only, never in the page: the secret
// field asks for it when it is shown or copied.

export const ISSUE_OPEN_KEY = 'chassis-open-manage';

export async function startIssueDialog(dialog, load, one) {
  const [forms, combobox, usual, patterns, command, flash, idmark, lede] = await Promise.all(
    ['forms', 'combobox', 'usual-picker', 'patterns', 'command', 'flash', 'idmark', 'lede'].map(load),
  );
  const form = dialog.querySelector('form#issue');
  const $ = (selector) => dialog.querySelector(selector);
  let token = '';
  let issued = null;
  let opening = false;
  let pollTimer = 0;

  forms.attachForms(dialog);
  combobox.attachComboboxes(dialog);
  combobox.attachSelects(dialog);
  usual.attachUsualPickers(dialog);
  flash.attachFlashButtons(dialog);
  idmark.attachIdmarks(dialog);
  lede.attachLedes(dialog);
  patterns.attachPatterns(dialog, { secretLoad: () => token });

  // ---- the client card follows what is typed ----
  const nameInput = $('[data-issue-in="name"]');
  const topicInput = $('[data-issue-in="topic"]');
  const card = $('[data-issue-card]');
  const state = $('[data-issue-state]');
  const textOf = (input) => {
    if (!input) return '';
    if (input instanceof HTMLSelectElement) return input.value ? input.selectedOptions[0].textContent.trim() : '';
    return input.value.trim();
  };
  function sync() {
    if (issued) return;
    const name = textOf(nameInput);
    for (const [key, input] of [['name', nameInput], ['topic', topicInput]]) {
      const target = $(`[data-issue-${key}]`);
      if (target) target.textContent = textOf(input) || target.dataset.issueEmpty;
    }
    idmark.setIdmark($('[data-issue-mark]'), name || `new ${one}`);
    card.classList.toggle('issue-prev--empty', !name);
    if (state.dataset.issueRefused !== undefined) {
      // Typing a new name takes the refusal back.
      delete state.dataset.issueRefused;
      state.className = 'kp-badge kp-badge--info';
      state.textContent = 'will be active';
    }
  }
  const later = () => window.setTimeout(sync, 0);
  for (const type of ['input', 'change', 'kp-usual-pick', 'kp-usual-add']) dialog.addEventListener(type, later);
  sync();

  // ---- Issue ----
  const submit = $('[data-issue-submit]');
  form.addEventListener('kp-form-valid', () => {
    flash.runFlashButton(submit, async () => {
      const name = textOf(nameInput);
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        // Every named control, so a project's extra fields (K16) ride along.
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const sentence = body.remedy ? `${body.error}. ${body.remedy}` : body.error || `HTTP ${res.status}`;
        // A refusal about the name stands under the name; any other speaks as a toast.
        if (name && sentence.includes(name)) {
          forms.showError(nameInput, sentence);
          state.dataset.issueRefused = '';
          state.className = 'kp-badge kp-badge--destructive';
          state.textContent = 'not issued';
          return { error: '' };
        }
        return { error: body.error || `HTTP ${res.status}`, remedy: body.remedy };
      }
      issued = await res.json();
      const [reveal, kit] = await Promise.all([
        fetchToken(issued.id),
        fetch('/api/kit/clients', { headers: { accept: 'application/json' }, credentials: 'same-origin' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      token = reveal.token;
      const template = kit?.command_template || reveal.command.replaceAll(token, `$${kit?.token_var || document.querySelector('[data-clients-page]')?.dataset.clientsTokenVar}`);
      showIssued(issued, template, reveal.command);
      return 'Issued';
    });
  });

  function setText(selector, text) {
    const el = $(selector);
    if (el) el.textContent = text;
  }

  function showIssued(client, template, full) {
    setText('[data-issue-title]', `${client.name} is ready`);
    $('[data-issue-title-badge]').hidden = false;
    setText('[data-issue-description]', 'Copy the token now and give it to the program.');
    setText('[data-issue-main-title]', 'Token and first call');
    setText('[data-issue-main-about]', 'The token, and the command that uses it, in one place.');
    setText('[data-issue-main-foot]', `The ${one}’s row shows its first request as soon as it calls.`);
    setText('[data-issue-side-title]', `The ${one}`);
    setText('[data-issue-side-about]', 'What was made, and where it appears.');
    setText('[data-issue-side-foot]', `It stays on the ${one}’s page, with its token.`);
    state.className = 'kp-badge kp-badge--success';
    state.textContent = 'active';
    delete state.dataset.issueRefused;
    setText('[data-issue-fact-token]', `Made ${formatBrussels(new Date())}`);
    setText('[data-issue-fact-call]', 'Not yet: this page notices it');
    // The command block is made from the template the API gave, with the token variable where the token goes.
    const host = $('[data-issue-command]');
    host.innerHTML = '<div class="kp-command" data-kp-command="bash" data-kp-command-where="the machine that will call this service"><pre class="kp-command__code"><code></code></pre></div>';
    host.querySelector('code').textContent = template;
    command.attachCommands(host);
    const copyFull = $('[data-issue-copy-full]');
    copyFull.onclick = () => flash.runFlashButton(copyFull, async () => {
      if (!(await copyText(full))) throw new Error('The browser refused to copy');
      return 'Copied';
    });
    $('[data-issue-pane="form"]').hidden = true;
    $('[data-issue-pane="result"]').hidden = false;
    $('[data-issue-actions="form"]').hidden = true;
    $('[data-issue-actions="done"]').hidden = false;
    $('[data-issue-pane="result"] [data-kp-secret-reveal]')?.focus();
    pollTimer = window.setInterval(watchFirstCall, CLIENTS_POLL_MS);
  }

  // The first call, noticed while the receipt is open.
  async function watchFirstCall() {
    if (document.visibilityState === 'hidden' || !issued) return;
    try {
      const res = await fetch('/api/kit/clients', { headers: { accept: 'application/json' }, credentials: 'same-origin' });
      if (!res.ok) return;
      const mine = (await res.json()).clients.find((c) => c.id === issued.id);
      if (!mine || !mine.uses) return;
      setText('[data-issue-fact-call]', `Called ${mine.last_used_ago}`);
      window.clearInterval(pollTimer);
    } catch (_) {
      // The next look tries again.
    }
  }

  // "Open the client": the page reloads (the list is stale) and opens its manage dialog.
  $('[data-issue-open]').addEventListener('click', () => {
    opening = true;
    try {
      sessionStorage.setItem(ISSUE_OPEN_KEY, issued.id);
    } catch (_) {
      // Without storage the page just reloads.
    }
    window.location.reload();
  });
  // Whatever closes it, an issued client means the list on the page is out of date.
  dialog.addEventListener('close', () => {
    window.clearInterval(pollTimer);
    if (issued && !opening) window.location.reload();
  });
}
