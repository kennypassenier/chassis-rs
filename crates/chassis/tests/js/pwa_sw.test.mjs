// The service worker's decisions (feat-webapp-4), run without a browser:
// the pure logic file is loaded as the worker loads it, and the worker's
// fetch handler is driven with a fake cache and a fake network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const dir = new URL('../../src/shell/webapp/pwa/', import.meta.url);
const logicSrc = readFileSync(new URL('sw-logic.js', dir), 'utf8');
const coreSrc = readFileSync(new URL('sw.js', dir), 'utf8');

const logic = (() => {
    const module = { exports: {} };
    vm.runInNewContext(logicSrc, { module, URL });
    return module.exports;
})();

const origin = 'https://meds.example';
const req = (path, method = 'GET', extra = {}) => ({ method, url: origin + path, origin, hasRange: false, ...extra });
const res = ({ headers = {}, ...over } = {}) => ({
    status: 200,
    type: 'basic',
    redirected: false,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    clone() { return this; },
    ...over,
});

test('only same-origin GETs outside the API and the login are handled', () => {
    assert.equal(logic.isCacheableRequest(req('/')), true);
    assert.equal(logic.isCacheableRequest(req('/static/chassis.css?v=1')), true);
    assert.equal(logic.isCacheableRequest(req('/js/main.js')), true);
    for (const path of ['/api', '/api/kit/status', '/login', '/logout', '/sw.js', '/manifest.webmanifest']) {
        assert.equal(logic.isCacheableRequest(req(path)), false, path);
    }
    assert.equal(logic.isCacheableRequest(req('/apiary')), true, 'a prefix match is not a path match');
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
        assert.equal(logic.isCacheableRequest(req('/x', method)), false, method);
    }
    assert.equal(logic.isCacheableRequest(req('/x', 'GET', { hasRange: true })), false);
    assert.equal(logic.isCacheableRequest({ ...req('/x'), url: 'https://other.example/x' }), false);
    assert.equal(logic.isCacheableRequest({ ...req('/x'), url: 'not a url' }), false);
});

test('only a complete, direct 200 is stored', () => {
    assert.equal(logic.isCacheableResponse(res()), true);
    assert.equal(logic.isCacheableResponse(res({ status: 303 })), false);
    assert.equal(logic.isCacheableResponse(res({ status: 404 })), false);
    assert.equal(logic.isCacheableResponse(res({ status: 206 })), false);
    assert.equal(logic.isCacheableResponse(res({ type: 'opaque', status: 0 })), false);
    assert.equal(logic.isCacheableResponse(res({ type: 'opaqueredirect', status: 0 })), false);
    assert.equal(logic.isCacheableResponse(res({ redirected: true })), false, 'the login page behind a redirect');
    assert.equal(logic.isCacheableResponse(res({ headers: { 'content-type': 'text/event-stream' } })), false);
    assert.equal(logic.isCacheableResponse(res({ headers: { 'cache-control': 'private, No-Store' } })), false);
});

test('a release drops the caches of the earlier ones and nothing else', () => {
    const now = logic.cacheNameFor('k2', 'a2');
    assert.equal(now, 'chassis-pwa-k2-a2');
    assert.deepEqual(
        Array.from(logic.staleCaches(['chassis-pwa-k1-a1', now, 'someone-elses'], now)),
        ['chassis-pwa-k1-a1'],
    );
    assert.deepEqual(Array.from(logic.surplusKeys([1, 2, 3, 4, 5], 3)), [1, 2]);
    assert.deepEqual(Array.from(logic.surplusKeys([1, 2], 3)), []);
});

// The worker with fakes: the network answers or fails, the cache remembers.
function worker({ network }) {
    const listeners = {};
    const store = new Map();
    const cache = {
        put: async (r, v) => store.set(r.url, v),
        match: async (r) => store.get(typeof r === 'string' ? r : r.url),
        keys: async () => [...store.keys()].map((url) => ({ url })),
        delete: async (k) => store.delete(k.url),
        addAll: async () => {},
    };
    const ctx = {
        self: { addEventListener: (n, f) => (listeners[n] = f), location: { origin }, skipWaiting() {}, clients: {} },
        caches: { open: async () => cache, keys: async () => [], delete: async () => {} },
        fetch: async (r) => network(r),
        Response: class {
            constructor(body, init) { Object.assign(this, { body, ...init }); }
            static error() { return { type: 'error' }; }
        },
        URL,
        KIT_VERSION: 'k',
        APP_VERSION: 'a',
    };
    vm.runInNewContext(`${logicSrc}\n${coreSrc}`, ctx);
    const handle = async (request) => {
        let answer;
        const waits = [];
        listeners.fetch({
            request,
            respondWith: (p) => (answer = p),
            waitUntil: (p) => waits.push(p),
        });
        const out = answer ? await answer : undefined;
        await Promise.all(waits);
        return out;
    };
    return { handle, store };
}
const request = (path, mode = 'cors', method = 'GET') => ({
    url: origin + path, method, mode, headers: { has: () => false, get: () => null },
});

test('the network wins whenever it answers, and the cache only fills in offline', async () => {
    let online = true;
    let version = 'v1';
    const w = worker({
        network: (r) => {
            if (!online) throw new TypeError('offline');
            return res({ body: `${r.url} ${version}` });
        },
    });
    assert.equal((await w.handle(request('/js/main.js'))).body, `${origin}/js/main.js v1`);
    version = 'v2';
    assert.equal((await w.handle(request('/js/main.js'))).body, `${origin}/js/main.js v2`, 'never the stale copy');
    online = false;
    assert.equal((await w.handle(request('/js/main.js'))).body, `${origin}/js/main.js v2`, 'offline: the last copy');
});

test('an offline navigation without a copy shows the offline page; the API is not touched', async () => {
    const w = worker({ network: () => { throw new TypeError('offline'); } });
    const out = await w.handle(request('/stacks', 'navigate'));
    assert.equal(out.status, 200);
    assert.equal(out.headers['X-Chassis-Offline'], '1');
    assert.equal((await w.handle(request('/api/kit/status'))), undefined, 'not handled: the browser asks the network');
    assert.equal((await w.handle(request('/x', 'cors', 'POST'))), undefined);
    assert.equal((await w.handle(request('/js/gone.js'))).type, 'error', 'a script offline is an error, not HTML');
});

test('a redirected login page and a 303 are never stored', async () => {
    const w = worker({ network: () => res({ redirected: true, body: 'login' }) });
    await w.handle(request('/', 'navigate'));
    assert.equal(w.store.size, 0);
    const w2 = worker({ network: () => res({ status: 303, type: 'opaqueredirect' }) });
    await w2.handle(request('/', 'navigate'));
    assert.equal(w2.store.size, 0);
});

test('an event stream is left to the browser, wherever it is mounted', () => {
    // Habits, 2026-11-01: a Live channel outside /api went through the
    // worker's fetch() and never ended; after six pages Firefox stalled.
    const live = req('/live/updates', 'GET', { accept: 'text/event-stream' });
    assert.equal(logic.isCacheableRequest(live), false);
    assert.equal(logic.isCacheableRequest(req('/live/updates', 'GET', { accept: 'text/html' })), true);
    assert.equal(logic.isCacheableRequest(req('/x')), true, 'no Accept header is a page or a file');
});
