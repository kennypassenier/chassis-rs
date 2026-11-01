// Wires one region of a client's page: attaches the kp-themes parts the region
// holds and the handlers of its controls. It is called for every region when
// the page opens and again for a region the swap replaced, so every attach
// here is idempotent and every handler is bound to the region's own nodes.
import { copyText } from './clipboard.js';
import { fetchToken } from './requests.js';
import { localiseTimes } from './format-text.js';

export function wireRegion(ctx, region) {
  const { kp } = ctx;
  localiseTimes(region);
  kp.attachIdmarks(region);
  kp.attachConfirmations(region);
  kp.attachFlashButtons(region);
  kp.attachPatterns(region);
  kp.attachCommands(region);
  kp.attachJsonFields(region);
  kp.attachTypeConfirms(region);
  wireToken(ctx, region);
  wireSendTest(ctx, region);
}

// The token is asked of the service only when it is shown or copied; nothing
// about it is in the page.
function wireToken(ctx, region) {
  const secret = region.querySelector('[data-manage-secret]');
  secret?.addEventListener('kp-secret-request', (event) => {
    event.preventDefault();
    const { respond, fail } = event.detail;
    fetchToken(ctx.id).then((data) => respond(data.token), fail);
  });
  // The command with the real token in.
  const copyFull = region.querySelector('[data-manage-copy-full]');
  copyFull?.addEventListener('click', () =>
    ctx.kp.runFlashButton(copyFull, async () => {
      const data = await fetchToken(ctx.id);
      if (!(await copyText(data.command))) return { error: 'The browser refused to copy', remedy: 'Reveal the token and copy it by hand.' };
      return 'Copied';
    }),
  );
}

// Send test: the body in the field, to the service's own test route; the log
// is read again afterwards so the answer stands at the top.
function wireSendTest(ctx, region) {
  const send = region.querySelector('[data-manage-send]');
  const body = region.querySelector('[data-manage-body]');
  send?.addEventListener('click', () =>
    ctx.kp.runFlashButton(send, async () => {
      if (body && ctx.kp.jsonField(body)?.state() === 'invalid') return { error: 'The body is not valid JSON', remedy: 'Fix the line the field marks, or press Format.' };
      const res = await fetch(`/api/clients/${encodeURIComponent(ctx.id)}/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body ? { body: body.value } : {}),
      });
      const answer = await res.json().catch(() => ({}));
      await ctx.requests.load();
      if (!res.ok) return { error: answer.error || `HTTP ${res.status}`, remedy: answer.remedy };
      if (answer.status >= 400) return { error: `The test route answered ${answer.status}`, remedy: 'Open the request in the list to read the answer.' };
      return 'Sent';
    }),
  );
}
