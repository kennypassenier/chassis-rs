// The shell's connection line: the page's own requests report what they
// see.
// Split out of shell.js by responsibility; the page runs exactly as before.

import { attachConnection, setConnection } from '../kp/js/connection.js';

// `joined` collects the names of the kp modules attached here.
export function attachConnectionLine(connectionEl, joined) {
  attachConnection(document);
  joined.push('connection');
  const realFetch = window.fetch.bind(window);
  let state = 'online';
  connectionEl.addEventListener('kp-connection-state', (event) => { state = event.detail.state; });
  const online = () => { if (state !== 'online') setConnection(connectionEl, 'online'); };
  // The line is for the whole service being out of reach. A request that
  // fails or is refused is not that by itself: the component that asked
  // already shows its own failed state. So a failing request only makes the
  // line ask the open /healthz; the line shows when that cannot be reached
  // (offline) or answers 503 (refused), and stays away when it answers.
  let probing = null;
  const probe = () => {
    probing ||= (async () => {
      try {
        const res = await realFetch('/healthz', { cache: 'no-store' });
        if (res.status === 503) setConnection(connectionEl, 'refused', { why: 'The service answered 503: it is not ready.' });
        else online();
      } catch (_) {
        setConnection(connectionEl, 'offline');
      } finally {
        probing = null;
      }
    })();
    return probing;
  };
  window.fetch = async (...args) => {
    let res;
    try {
      res = await realFetch(...args);
    } catch (error) {
      if (error && error.name !== 'AbortError') probe();
      throw error;
    }
    if ([401, 502, 503, 504].includes(res.status)) probe();
    else online();
    return res;
  };
  addEventListener('offline', () => setConnection(connectionEl, 'offline'));
  addEventListener('online', () => online());
  // Retry now (and the automatic tries): ask the service's own health route.
  connectionEl.addEventListener('kp-connection-retry', async () => {
    try {
      const res = await realFetch('/healthz', { cache: 'no-store' });
      if (res.status === 503) setConnection(connectionEl, 'refused', { why: 'The service answered 503: it is not ready.' });
      else setConnection(connectionEl, 'online');
    } catch (_) {
      setConnection(connectionEl, 'offline');
    }
  });
}
