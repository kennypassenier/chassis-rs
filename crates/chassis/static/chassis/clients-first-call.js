// The first-client walk-through: the page notices the first call.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { CLIENTS_POLL_MS } from './clients-config.js';

export function watchForFirstCall(root, modules, one) {
  const list = root.querySelector('[data-clients-steps]');
  if (!list) return;
  let timer = 0;
  // The third step is the one that waits; when the service does not answer it says so in its own failed state and
  // goes back to waiting with the next answer.
  const waitNote = root.querySelector('[data-clients-wait-note]')?.textContent ?? '';
  const waitState = () => root.querySelector('[data-kp-step-id="s3"]')?.dataset.state;
  let before = '';
  async function look() {
    if (document.visibilityState === 'hidden') return;
    let data;
    try {
      const res = await fetch('/api/kit/clients', { headers: { accept: 'application/json' }, credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (_) {
      if (waitState() !== 'failed') before = waitState();
      if (before === 'running') modules.steplist.setStep(list, 's3', { state: 'failed', note: 'The service did not answer; this page looks again in 5 seconds.' });
      return;
    }
    if (waitState() === 'failed') modules.steplist.setStep(list, 's3', { state: before, note: waitNote });
    if (data.counts.called === 0) {
      // A client was issued from another tab: the page reshapes.
      if ((data.counts.active > 0) !== (root.querySelector('[data-kp-step-id="s1"]').dataset.state === 'done') && !document.querySelector('dialog[open]')) {
        window.location.reload();
      }
      return;
    }
    window.clearInterval(timer);
    const caller = data.clients.filter((c) => c.last_used_at).sort((a, b) => b.last_used_at.localeCompare(a.last_used_at))[0];
    for (const key of ['s1', 's2']) modules.steplist.setStep(list, key, { state: 'done' });
    modules.steplist.setStep(list, 's3', { state: 'done', note: caller ? `${caller.name} called ${caller.last_used_ago}` : 'The first request arrived' });
    const what = root.querySelector('[data-clients-what]');
    if (what) {
      // The package's own plate, redrawn in place with the "done" picture.
      const { statePlate, drawArt } = await import('../kp/dist/kp-themes.min.js');
      what.removeAttribute('data-kp-art');
      statePlate(document, {
        kind: 'empty',
        into: what,
        title: 'Connected',
        text: `The first request arrived. The list shows the ${one}, when it last called and how often.`,
        art: drawArt(document, 'done'),
      });
    }
    root.querySelector('[data-clients-done]')?.removeAttribute('hidden');
  }
  timer = window.setInterval(look, CLIENTS_POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') look();
  });
}
