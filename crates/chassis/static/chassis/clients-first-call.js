// The empty state's watcher: the page opens its list by itself once a
// client exists. The onboarding cards are shown only while there is none
// [ux-chassis-2], so the walk-through has no later steps to animate; it
// only has to notice a client issued elsewhere (another tab, the API) and
// reload into the list.

import { CLIENTS_POLL_MS } from './clients-config.js';

export function watchForFirstCall() {
  async function look() {
    if (document.visibilityState === 'hidden') return;
    let data;
    try {
      const res = await fetch('/api/kit/clients', { headers: { accept: 'application/json' }, credentials: 'same-origin' });
      if (!res.ok) return;
      data = await res.json();
    } catch (_) {
      // The service did not answer; the next look tries again.
      return;
    }
    // A dialog that is open keeps what it shows; the page reshapes after it closes.
    if (data.counts.all > 0 && !document.querySelector('dialog[open]')) window.location.reload();
  }
  window.setInterval(look, CLIENTS_POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') look();
  });
}
