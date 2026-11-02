// The one request the offline client makes (feat-offline-1): same-origin, the
// session cookie, JSON in and out, an optional If-Match. Nothing else is ever
// sent, so there is nothing else to store (a queued POST adds its Idempotency-Key, a random UUID). Answers never throw on a status:
// a network failure is `status: 0`.

import { ifMatchValue } from './data-rev.js';

export async function send(fetchFn, { method, path, body, ifMatch, key }) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const match = ifMatchValue(ifMatch);
    if (match) headers['if-match'] = match;
    if (key) headers['idempotency-key'] = key; // a queued POST: the server applies one key once
    let res;
    try {
        res = await fetchFn(path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            credentials: 'same-origin',
            cache: 'no-store', // the client keeps its own copy; the browser's HTTP cache must not pose as a live answer
        });
    } catch (err) {
        if (err?.name === 'AbortError') throw err;
        return { status: 0, body: null, etag: null };
    }
    const parsed = await res.json().catch(() => null);
    return { status: res.status, body: parsed, etag: res.headers?.get?.('etag') ?? null };
}
