// feat-page-data-1: the browser half of chassis::PageData.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePageData } from '../../static/chassis/page-data.js';

const ok = (body) => ({ ok: true, status: 200, body });
const no = (status, error = 'e', remedy = 'r') => ({ ok: false, status, error, remedy });

test('the merged read gives each named part on its own', async () => {
    const asked = [];
    const pd = makePageData(async (url) => (asked.push(url), ok({ parts: {
        list: { data: [1] },
        broken: { error: 'store down', remedy: 'try again', status: 502 },
    } })));
    const parts = await pd('/api/p', ['list', 'broken', 'missing']);
    assert.deepEqual(parts.list, { ok: true, data: [1] });
    assert.deepEqual(parts.broken, { ok: false, status: 502, error: 'store down', remedy: 'try again' });
    assert.equal(parts.missing.ok, false);
    assert.deepEqual(asked, ['/api/p'], 'one request');
});

test('without the merged route each part is asked on its own, side by side', async () => {
    const asked = [];
    const pd = makePageData(async (url) => {
        asked.push(url);
        if (url === '/api/p') return no(404);
        return url.endsWith('/a') ? ok(1) : no(502, 'down', 'later');
    });
    const parts = await pd('/api/p', ['a', 'b']);
    assert.deepEqual(parts.a, { ok: true, data: 1 });
    assert.deepEqual(parts.b, { ok: false, status: 502, error: 'down', remedy: 'later' });
    assert.deepEqual(asked, ['/api/p', '/api/p/a', '/api/p/b']);
});

test('a 401 on the merged read is not asked again per part', async () => {
    const asked = [];
    const pd = makePageData(async (url) => (asked.push(url), no(401, 'Not signed in.', 'Sign in')));
    const parts = await pd('/api/p', ['a', 'b']);
    assert.equal(parts.a.status, 401);
    assert.deepEqual(asked, ['/api/p']);
});

test('one part can be read again alone', async () => {
    const pd = makePageData(async (url) => (url === '/api/p/x%20y' ? ok(7) : no(404)));
    assert.deepEqual(await pd.one('/api/p', 'x y'), { ok: true, data: 7 });
});
