// The issue dialog's result state: the swap from the form to the token, the
// first command and the receipt, and the look for the first call while it is
// open. Split out of clients-issue.js: everything after "Issue" succeeded.
import { CLIENTS_POLL_MS } from './clients-config.js';
import { copyText } from './clipboard.js';
import { formatBrussels } from './format-text.js';

export function createResult(ctx) {
  function setText(selector, text) {
    const el = ctx.$(selector);
    if (el) el.textContent = text;
  }

  // The first call, noticed while the receipt is open.
  async function watchFirstCall() {
    if (document.visibilityState === 'hidden' || !ctx.issued) return;
    try {
      const res = await fetch('/api/kit/clients', { headers: { accept: 'application/json' }, credentials: 'same-origin' });
      if (!res.ok) return;
      const mine = (await res.json()).clients.find((c) => c.id === ctx.issued.id);
      if (!mine || !mine.uses) return;
      setText('[data-issue-fact-call]', `Called ${mine.last_used_ago}`);
      window.clearInterval(ctx.pollTimer);
    } catch (_) {
      // The next look tries again.
    }
  }

  // The titles and texts of the dialog's three boxes, in the result's words.
  function writeResultTexts(client) {
    const one = ctx.one;
    setText('[data-issue-title]', `${client.name} is ready`);
    ctx.$('[data-issue-title-badge]').hidden = false;
    setText('[data-issue-description]', 'Copy the token now and give it to the program.');
    setText('[data-issue-main-title]', 'Token and first call');
    setText('[data-issue-main-about]', 'The token, and the command that uses it, in one place.');
    setText('[data-issue-main-foot]', `The ${one}’s row shows its first request as soon as it calls.`);
    setText('[data-issue-side-title]', `The ${one}`);
    setText('[data-issue-side-about]', 'What was made, and where it appears.');
    setText('[data-issue-side-foot]', `It stays on the ${one}’s page, with its token.`);
  }

  // The command block is made from the template the API gave, with the token variable where the token goes.
  function drawCommand(template, full) {
    const host = ctx.$('[data-issue-command]');
    host.innerHTML = '<div class="kp-command" data-kp-command="bash" data-kp-command-where="the machine that will call this service"><pre class="kp-command__code"><code></code></pre></div>';
    host.querySelector('code').textContent = template;
    ctx.command.attachCommands(host);
    const copyFull = ctx.$('[data-issue-copy-full]');
    copyFull.onclick = () => ctx.flash.runFlashButton(copyFull, async () => {
      if (!(await copyText(full))) throw new Error('The browser refused to copy');
      return 'Copied';
    });
  }

  function showIssued(client, template, full) {
    writeResultTexts(client);
    ctx.state.className = 'kp-badge kp-badge--success';
    ctx.state.textContent = 'active';
    delete ctx.state.dataset.issueRefused;
    setText('[data-issue-fact-token]', `Made ${formatBrussels(new Date())}`);
    setText('[data-issue-fact-call]', 'Not yet: this page notices it');
    drawCommand(template, full);
    ctx.$('[data-issue-pane="form"]').hidden = true;
    ctx.$('[data-issue-pane="result"]').hidden = false;
    ctx.$('[data-issue-actions="form"]').hidden = true;
    ctx.$('[data-issue-actions="done"]').hidden = false;
    ctx.$('[data-issue-pane="result"] [data-kp-secret-reveal]')?.focus();
    ctx.pollTimer = window.setInterval(watchFirstCall, CLIENTS_POLL_MS);
  }

  return { showIssued };
}
