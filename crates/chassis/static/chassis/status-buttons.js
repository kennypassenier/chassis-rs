// The status page's buttons: a section's own button that keeps the page, the
// Read again and update-check buttons, and the header's More menu.
import { copyText } from './clipboard.js';

export function wireButtons(ctx) {
  const { root, runFlashButton, say } = ctx;

  function readAgain(button) {
    const card = button.closest('[data-chassis-json]');
    runFlashButton(button, async () => {
      await ctx.loadJson(card, { quiet: true });
      return card.getAttribute('data-kp-state') === 'ready' ? 'Read' : { error: 'The section could not be read', remedy: 'Try again in a moment.' };
    });
  }

  function updateCheck(button) {
    runFlashButton(button, async () => {
      const res = await fetch('/api/kit/status/update-check', { method: 'POST', headers: { accept: 'application/json' } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { error: body.error || `HTTP ${res.status}`, remedy: body.remedy };
      ctx.reread([root.querySelector('[data-chassis-card="updates"]')].filter(Boolean)).catch(() => {});
      return body.newer ? 'Update found' : 'Up to date';
    });
  }

  // A section's own button that keeps the page. A destructive one has
  // been through the confirmation dialog by the time this click arrives.
  function sectionButton(button) {
    runFlashButton(button, async () => {
      const res = await fetch(button.dataset.chassisFlash, { method: button.dataset.method || 'POST', headers: { accept: 'application/json' } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { error: body.error || res.statusText || `HTTP ${res.status}`, remedy: body.remedy };
      const n = Number.isInteger(body.count) ? body.count : null;
      const template = n === 1 && button.dataset.chassisToastOne ? button.dataset.chassisToastOne : button.dataset.chassisToast;
      if (template && (n !== null || !template.includes('{n}'))) say(template.replaceAll('{n}', String(n)));
      else if (typeof body.message === 'string' && body.message) say(body.message);
      // What the button changed shows in its section, which reads again in
      // its own loading state.
      const own = button.closest('.kp-card[data-chassis-section]');
      ctx.reread(own ? [own] : []).catch(() => {});
      return button.dataset.kpFlashWord || undefined;
    });
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-chassis-flash], [data-chassis-read-again], [data-chassis-update-check]');
    if (!button || !root.contains(button) || button.hasAttribute('disabled')) return;
    if (button.matches('[data-chassis-read-again]')) readAgain(button);
    else if (button.matches('[data-chassis-update-check]')) updateCheck(button);
    else sectionButton(button);
  });

  // The header's More menu.
  root.addEventListener('kp-menu-select', async (event) => {
    const value = event.detail?.value;
    if (value === 'copy-health') {
      const ok = await copyText(`${location.origin}/healthz`);
      say(ok ? 'Copied the health address' : 'Copying is not available here; the address is /healthz');
    } else if (value === 'download-json') {
      const link = document.createElement('a');
      link.href = '/api/kit/status';
      link.download = 'status.json';
      document.body.append(link);
      link.click();
      link.remove();
    }
  });
}
