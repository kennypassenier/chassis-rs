// The kit's JSON requests: GET or POST with the cookie, and the sentence a
// refusal becomes. Shared by the Storage page and the Notifications card.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

/* ------------------------------------------------------------ the API -- */
// A failed read says the service's own sentence, or that it did not answer.
export const upFirst = (text) => String(text).replace(/^\w/, (c) => c.toUpperCase());
const sentenceOf = (body, status) =>
  body && body.error ? `${upFirst(String(body.error).replace(/\.+$/, ''))}.${body.remedy ? ` ${upFirst(String(body.remedy).replace(/\.*$/, ''))}.` : ''}` : `The service answered ${status}.`;
export async function api(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch (_) {
    throw Object.assign(new Error('The service did not answer.'), { silent: true });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(sentenceOf(data, res.status)), { status: res.status, body: data });
  return data;
}
