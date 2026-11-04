// fix-fetch-401-1: one JSON helper, one login redirect per page (homelab
// 91-95 kept three copies of it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFetchJson } from '../../static/chassis/fetch-json.js';

function fakeWin(answer, path = '/stacks?x=1') {
    const went = [];
    return {
        went,
        location: { pathname: path.split('?')[0], search: path.includes('?') ? `?${path.split('?')[1]}` : '', href: `http://h${path}`, assign: (u) => went.push(u) },
        fetch: async (url, init) => answer(url, init),
    };
}
const res = (status, body, extra = {}) => ({
    status, ok: status >= 200 && status < 300, redirected: false, url: 'http://h/api/x',
    text: async () => (body === undefined ? '' : JSON.stringify(body)), ...extra,
});

test('a 2xx resolves with the parsed body and sends JSON with a body', async () => {
    let seen;
    const win = fakeWin((url, init) => ((seen = init), res(200, { a: 1 })));
    const out = await makeFetchJson(win)('/api/x', { method: 'POST', body: { b: 2 } });
    assert.deepEqual(out, { ok: true, status: 200, body: { a: 1 } });
    assert.equal(seen.headers['content-type'], 'application/json');
    assert.equal(seen.body, '{"b":2}');
});

test('a refusal carries the service sentence and remedy', async () => {
    const win = fakeWin(() => res(409, { error: 'stale', remedy: 'reload' }));
    const out = await makeFetchJson(win)('/api/x');
    assert.equal(out.ok, false);
    assert.equal(out.status, 409);
    assert.equal(out.error, 'stale');
    assert.equal(out.remedy, 'reload');
    assert.deepEqual(win.went, []);
});

test('401s and a redirect to the login page send the page to /login?next= once', async () => {
    let n = 0;
    const win = fakeWin(() => (n++ % 2 ? res(401, { error: 'not logged in' }) : res(200, undefined, { redirected: true, url: 'http://h/login' })));
    const f = makeFetchJson(win);
    const outs = await Promise.all([f('/a'), f('/b'), f('/c')]);
    assert.deepEqual(outs.map((o) => o.status), [401, 401, 401]);
    assert.deepEqual(win.went, ['/login?next=%2Fstacks%3Fx%3D1']);
});

test('nothing answering resolves with status 0; an abort rejects', async () => {
    const win = fakeWin(() => { throw new TypeError('offline'); });
    assert.equal((await makeFetchJson(win)('/a')).status, 0);
    const ctl = new AbortController();
    ctl.abort();
    const aborted = fakeWin(() => { throw new DOMException('aborted', 'AbortError'); });
    await assert.rejects(makeFetchJson(aborted)('/a', { signal: ctl.signal }), { name: 'AbortError' });
});
