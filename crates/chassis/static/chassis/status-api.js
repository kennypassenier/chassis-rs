// The Status page's read of /api/kit/status.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

export async function poll() {
  const res = await fetch('/api/kit/status', { headers: { accept: 'application/json' }, cache: 'no-store', redirect: 'manual' });
  // A session that ended answers with the login redirect: take the reader there.
  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 303) {
    location.reload();
    throw new Error('The session ended');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
