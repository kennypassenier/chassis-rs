// The request log of a client's page: a kp inspector that reads what the
// service captured, shows a loading card on the first read and keeps the list
// on screen when it reads again after a test. Its own module because the page
// reads it from three places (first view, retry, after Send test).
import { refusal } from './requests.js';

// What the inspector reads of a request the service captured.
function inspectorRequest(c) {
  return {
    at: c.at,
    method: c.method,
    path: c.path,
    status: c.status,
    headers: c.headers,
    body: c.body,
    bodyBytes: c.body_bytes,
    truncated: c.truncated,
    source: c.source === 'test' ? 'test' : 'client',
  };
}

export function createRequests(ctx) {
  const host = () => ctx.page.querySelector('[data-kp-requests]');

  async function load() {
    const el = host();
    if (!el) return;
    // A first read or a retry shows the waiting card; a read after a test keeps the list on screen.
    if (el.dataset.kpState !== 'ready') ctx.kp.setRequestsState(el, 'loading');
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(ctx.id)}/requests`, { headers: { accept: 'application/json' }, credentials: 'same-origin' });
      if (!res.ok) throw new Error(refusal(res, await res.json().catch(() => ({}))));
      ctx.kp.setRequests(el, (await res.json()).map(inspectorRequest));
    } catch (e) {
      ctx.kp.setRequestsState(el, 'error', { message: e instanceof Error && e.message ? e.message : 'The service did not answer.' });
    }
  }

  function attach() {
    const el = host();
    if (!el) return;
    ctx.kp.attachRequestInspectors(el, { origin: location.origin });
    el.addEventListener('kp-requests-retry', load);
  }

  return { load, attach };
}
