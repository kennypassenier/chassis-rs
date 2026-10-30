// The small request helpers the Clients dialogs share: how a refusal reads,
// and fetching a client's token.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

// The one line a refusal becomes on a button: the kit's error and its
// remedy when the body carries them (project routes answer the same shape
// through chassis::Error), the bare status otherwise.
export function refusal(res, body) {
  if (body.error && body.remedy) return `${body.error}. ${body.remedy}`;
  return body.remedy || body.error || `HTTP ${res.status}`;
}

export async function fetchToken(id) {
  const res = await fetch(`/api/clients/${id}/token`, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.remedy ? `${err.error}. ${err.remedy}` : `HTTP ${res.status}`);
  }
  return res.json();
}
