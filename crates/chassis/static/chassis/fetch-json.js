// `window.chassisFetchJson` (fix-fetch-401-1, homelab 91-95): one JSON
// request helper for every app page, so an expired login is handled once.
// Homelab kept three copies of the same function (store.js, dom.js, act.js),
// each sending the reader to /login on its own.
//
// It never throws for an answer: it resolves to
//   { ok: true, status, body }                      on a 2xx,
//   { ok: false, status, body, error, remedy }      on any other status,
//   { ok: false, status: 0, error, remedy }         when nothing answered.
// A 401, or a fetch that followed a redirect to /login, sends the page to
// /login?next=<this page> exactly once, however many calls saw it; the call
// still resolves (status 401) so the caller can stop drawing. An aborted
// request rejects with the AbortError, as fetch does.

const LOGIN = '/login';

/** The helper bound to `win` (the node test hands in a fake). */
export function makeFetchJson(win) {
    let leaving = false;
    const toLogin = () => {
        if (leaving) return;
        leaving = true;
        const here = `${win.location.pathname}${win.location.search}`;
        win.location.assign(here === '/' ? LOGIN : `${LOGIN}?next=${encodeURIComponent(here)}`);
    };
    return async function fetchJson(url, { method = 'GET', body, signal, headers = {} } = {}) {
        let res;
        try {
            res = await win.fetch(url, {
                method,
                signal,
                credentials: 'same-origin',
                headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
        } catch (err) {
            if (signal?.aborted) throw err;
            return { ok: false, status: 0, error: 'The service did not answer.', remedy: 'Check the connection, then try again.' };
        }
        const loginPage = res.redirected && new URL(res.url, win.location.href).pathname === LOGIN;
        if (res.status === 401 || loginPage) toLogin();
        const text = res.status === 204 || loginPage ? '' : await res.text().catch(() => '');
        let parsed = null;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            parsed = null;
        }
        const status = loginPage ? 401 : res.status;
        if (res.ok && !loginPage) return { ok: true, status, body: parsed };
        return {
            ok: false,
            status,
            body: parsed,
            error: parsed?.error ?? (status === 401 ? 'Not signed in.' : `The service answered ${status}.`),
            remedy: parsed?.remedy ?? (status === 401 ? 'Sign in, then try again.' : ''),
        };
    };
}

/** Put the helper on `win` unless it is there. */
export function installFetchJson(win) {
    if (!win.chassisFetchJson) win.chassisFetchJson = makeFetchJson(win);
    return win.chassisFetchJson;
}
