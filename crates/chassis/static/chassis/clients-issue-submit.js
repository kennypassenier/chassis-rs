// The issue dialog's Issue button: post the form, speak a refusal under the
// name or as a toast, and on success fetch the token and the command template
// and hand them to the result state. Split out of clients-issue.js: transport.
import { fetchToken } from './requests.js';

export function wireSubmit(ctx) {
  const submit = ctx.$('[data-issue-submit]');

  // Posts every named control, so a project's extra fields (K16) ride along.
  async function postClient() {
    return fetch('/api/clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(ctx.form))),
    });
  }

  // A refusal about the name stands under the name; any other speaks as a toast.
  async function refusalOf(res, name) {
    const body = await res.json().catch(() => ({}));
    const sentence = body.remedy ? `${body.error}. ${body.remedy}` : body.error || `HTTP ${res.status}`;
    if (name && sentence.includes(name)) {
      ctx.forms.showError(ctx.nameInput, sentence);
      ctx.state.dataset.issueRefused = '';
      ctx.state.className = 'kp-badge kp-badge--destructive';
      ctx.state.textContent = 'not issued';
      return { error: '' };
    }
    return { error: body.error || `HTTP ${res.status}`, remedy: body.remedy };
  }

  async function issue() {
    const name = ctx.textOf(ctx.nameInput);
    const res = await postClient();
    if (!res.ok) return refusalOf(res, name);
    ctx.issued = await res.json();
    const [reveal, kit] = await Promise.all([
      fetchToken(ctx.issued.id),
      fetch('/api/kit/clients', { headers: { accept: 'application/json' }, credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    ctx.token = reveal.token;
    const template = kit?.command_template || reveal.command.replaceAll(ctx.token, `$${kit?.token_var || document.querySelector('[data-clients-page]')?.dataset.clientsTokenVar}`);
    ctx.showIssued(ctx.issued, template, reveal.command);
    return 'Issued';
  }

  ctx.form.addEventListener('kp-form-valid', () => {
    ctx.flash.runFlashButton(submit, issue);
  });
}
