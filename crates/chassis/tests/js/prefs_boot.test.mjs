// The browser half of the preferences, run in a fake window (node --test).
// Locks: the declaration rule is the Rust one (shared fixture), the database
// wins on load before anything reads localStorage, declared writes go to the
// database and nothing else does, a kp-unsaved draft is seeded and mirrored
// from kp-themes' events and never read from a field kp excluded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../../static/prefs-boot.js', import.meta.url), 'utf8');
const RULES = JSON.parse(readFileSync(new URL('../fixtures/sync_rules.json', import.meta.url), 'utf8'));

function world({ keys = {}, session = {}, local = {}, tab = {}, marker = false, limits, synced } = {}) {
    class Storage {
        constructor() { this.m = new Map(); }
        get length() { return this.m.size; }
        key(i) { return [...this.m.keys()][i] ?? null; }
        getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
        setItem(k, v) { this.m.set(String(k), String(v)); }
        removeItem(k) { this.m.delete(k); }
        clear() { this.m.clear(); }
    }
    const localStorage = new Storage();
    const sessionStorage = new Storage();
    Object.entries(local).forEach(([k, v]) => localStorage.setItem(k, v));
    Object.entries(tab).forEach(([k, v]) => sessionStorage.setItem(k, v));
    if (marker) localStorage.setItem('chassis-prefs:synced', 'admin');
    const calls = [];
    const listeners = {};
    const events = [];
    const snap = {
        v: 1, scope: 'admin', keys, session,
        synced: synced ?? RULES.synced,
        limits: limits ?? { max_value_bytes: 16384, max_scope_bytes: 262144, max_keys: 512 },
    };
    const doc = {
        getElementById: (id) => (id === 'chassis-prefs' ? { textContent: JSON.stringify(snap) } : null),
        documentElement: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } },
        visibilityState: 'visible',
        addEventListener: (n, f) => { (listeners[n] ??= []).push(f); },
    };
    const win = {
        localStorage, sessionStorage, Storage, document: doc,
        addEventListener: (n, f) => { (listeners['w:' + n] ??= []).push(f); },
        dispatchEvent: (e) => { events.push(e); },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        TextEncoder, JSON, Promise, Object, Date, console: { warn() {} },
        setTimeout: (f) => { win.__timers.push(f); return win.__timers.length; },
        clearTimeout() {},
        __timers: [],
        fetch: async (url, init = {}) => {
            calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined });
            const refuse = win.__refuse?.(url, init);
            return { ok: !refuse, status: refuse ?? 200, json: async () => snap };
        },
    };
    win.window = win;
    vm.createContext(win);
    vm.runInContext(SRC, win);
    const drain = async () => {
        for (let i = 0; i < 5; i++) {
            const t = win.__timers.splice(0);
            t.forEach((f) => f());
            await new Promise((r) => setImmediate(r));
        }
    };
    return { win, calls, listeners, events, localStorage, sessionStorage, drain, doc };
}

test('the declaration rule is the same as the server\'s (shared fixture)', () => {
    const w = world();
    for (const c of RULES.cases) {
        const synced = w.win.chassisPrefs.isSynced(c.key);
        assert.equal(synced, c.local || c.session, c.key);
    }
});

test('database values land in localStorage before anything reads them, declared keys only', () => {
    const w = world({ keys: { 'homelab.log-levels': '["warn"]', 'homelab.theme-light': 'x', other: 'y' }, local: { 'homelab.log-levels': 'old' } });
    assert.equal(w.localStorage.getItem('homelab.log-levels'), '["warn"]');
    assert.equal(w.localStorage.getItem('homelab.theme-light'), null, 'the pre-login theme stays local');
    assert.equal(w.localStorage.getItem('other'), null);
    assert.equal(w.calls.length, 0, 'no request is needed to start');
});

test('the first sync uploads what only this browser has; later syncs treat it as deleted elsewhere', async () => {
    const first = world({ local: { 'homelab-toured': '1', undeclared: 'u' } });
    await first.drain();
    assert.deepEqual(first.calls.map((c) => [c.method, c.url]), [['PUT', '/api/kit/prefs/homelab-toured']]);
    const later = world({ local: { 'homelab-toured': '1' }, marker: true });
    assert.equal(later.localStorage.getItem('homelab-toured'), null);
    assert.equal(later.calls.length, 0);
});

test('declared writes go to the database, others never do (kp-remember included, kp-themes untouched)', async () => {
    const w = world();
    w.localStorage.setItem('kp-remember:datatable:status:sort', '{"a":1}');
    w.localStorage.setItem('homelab.theme-dark', 'x');
    w.localStorage.setItem('theme', 'nostromo');
    w.sessionStorage.setItem('homelab.drive.tab', 'a');
    w.win.chassisPrefs.storage.setItem('homelab.map.deplist', 'list');
    w.localStorage.removeItem('homelab.map.deplist');
    await w.drain();
    const sent = w.calls.map((c) => `${c.method} ${c.url}`).sort();
    assert.deepEqual(sent, [
        'DELETE /api/kit/prefs/homelab.map.deplist',
        'PUT /api/kit/prefs/kp-remember%3Adatatable%3Astatus%3Asort',
    ]);
    assert.deepEqual(w.calls.find((c) => c.method === 'PUT').body, { value: '{"a":1}' });
});

test('any key name travels as one encoded path segment', async () => {
    const w = world({ synced: { ...RULES.synced, prefix: ['nx-sort:', 'my app/'] } });
    w.localStorage.setItem('nx-sort:Mijn tabel #1?%', 'v');
    w.localStorage.setItem('my app/ключ', 'w');
    await w.drain();
    const urls = w.calls.map((c) => c.url).sort();
    assert.deepEqual(urls, [
        '/api/kit/prefs/my%20app%2F%D0%BA%D0%BB%D1%8E%D1%87',
        '/api/kit/prefs/nx-sort%3AMijn%20tabel%20%231%3F%25',
    ]);
});

test('clear() removes the declared keys in the database too', async () => {
    const w = world({ keys: { 'homelab-toured': '1', 'nx-sort:a': 'x' } });
    w.localStorage.clear();
    await w.drain();
    assert.deepEqual(w.calls.map((c) => c.method), ['DELETE', 'DELETE']);
});

test('a value over the limit stays in the browser and says so', async () => {
    const w = world({ limits: { max_value_bytes: 10, max_scope_bytes: 100, max_keys: 5 } });
    w.localStorage.setItem('homelab.big', 'x'.repeat(11));
    await w.drain();
    assert.equal(w.calls.length, 0);
    assert.equal(w.events[0].type, 'chassis-prefs-error');
});

test('a refusal is reported once and not retried; a 503 is retried', async () => {
    const w = world();
    w.win.__refuse = () => 400;
    w.localStorage.setItem('homelab.x', '1');
    await w.drain();
    assert.equal(w.calls.length, 1);
    assert.equal(w.events.at(-1).type, 'chassis-prefs-error');
    const v = world();
    v.win.__refuse = () => 503;
    v.localStorage.setItem('homelab.x', '1');
    await v.drain();
    assert.ok(v.win.chassisPrefs.pending().includes('homelab.x'));
});

// kp-themes' unsaved bar (js/unsaved.js) keeps a draft in sessionStorage
// under `kp-unsaved:<path>:<name>`, as JSON of field name to value, never a
// password field. It has no storage option, so the bridge seeds before kp
// attaches and mirrors from kp's events.
const DRAFT = 'kp-unsaved:/settings:settings';

test('a kp-unsaved draft from another device is seeded into this tab before kp attaches', () => {
    const w = world({ session: { [DRAFT]: '{"port":"8081"}' } });
    assert.equal(w.sessionStorage.getItem(DRAFT), '{"port":"8081"}');
    assert.equal(w.calls.length, 0);
});

test('this tab\'s own draft wins over the database copy', () => {
    const w = world({ session: { [DRAFT]: '{"port":"1"}' }, tab: { [DRAFT]: '{"port":"2"}' } });
    assert.equal(w.sessionStorage.getItem(DRAFT), '{"port":"2"}');
});

test('kp\'s change, save and discard events mirror the draft, read back after kp wrote it', async () => {
    const w = world();
    // kp fires its event first, writes the key after.
    w.listeners['kp-unsaved-change'].forEach((f) => f({}));
    w.sessionStorage.setItem(DRAFT, '{"port":"9"}');
    await w.drain();
    assert.deepEqual(w.calls.map((c) => [c.method, c.body?.value]), [['PUT', '{"port":"9"}']]);
    // Discard / save: kp removes the key.
    w.listeners['kp-unsaved-discard'].forEach((f) => f({}));
    w.sessionStorage.removeItem(DRAFT);
    await w.drain();
    assert.deepEqual(w.calls.map((c) => c.method), ['PUT', 'DELETE']);
    assert.equal(w.calls[1].url, '/api/kit/prefs/kp-unsaved%3A%2Fsettings%3Asettings');
});

test('other sessionStorage keys never leave the tab', async () => {
    const w = world();
    w.listeners['kp-unsaved-change'].forEach((f) => f({}));
    w.sessionStorage.setItem('homelab.live-view', 'x');
    w.sessionStorage.setItem('homelab.drive.tab', 'y');
    await w.drain();
    assert.equal(w.calls.length, 0);
});

test('a theme the app chose to mirror sets the page theme once the values are in', () => {
    const w = world({ keys: { theme: 'nostromo' }, synced: { ...RULES.synced, exact: ['theme'] } });
    assert.equal(w.localStorage.getItem('theme'), 'nostromo');
    assert.equal(w.doc.documentElement.attrs['data-theme'], 'nostromo');
});

test('the pre-login theme stays local when the app does not declare it', () => {
    const w = world({ keys: { theme: 'nostromo' } });
    assert.equal(w.localStorage.getItem('theme'), null);
    assert.equal(w.doc.documentElement.attrs['data-theme'], undefined);
});

// reload-flush (homelab, found adopting 3.12.0): a choice made a moment
// before a reload came back as the database's older value. An unconfirmed
// write is kept in this browser, wins over the page's snapshot, and is sent.
test('a write the reload outran wins over the database and is sent again', async () => {
    const first = world({ keys: { 'homelab.log-levels': '["warn"]' }, marker: true });
    first.localStorage.setItem('homelab.log-levels', '["error"]');
    const pending = first.localStorage.getItem('chassis-prefs:pending');
    assert.ok(pending, 'the write is kept until the server confirms it');
    // The reload: same browser storage, the database still has the old value.
    const second = world({
        keys: { 'homelab.log-levels': '["warn"]' },
        marker: true,
        local: { 'homelab.log-levels': '["error"]', 'chassis-prefs:pending': pending },
    });
    assert.equal(second.localStorage.getItem('homelab.log-levels'), '["error"]', 'the newer choice survives the reload');
    await second.drain();
    const put = second.calls.find((c) => c.method === 'PUT');
    assert.deepEqual(put?.body, { value: '["error"]' });
    assert.equal(second.localStorage.getItem('chassis-prefs:pending'), null, 'confirmed, so no longer kept');
});

test('a pending write of another login is dropped, and a reload sends at once', async () => {
    const w = world({
        keys: { 'homelab.log-levels': '["warn"]' },
        marker: true,
        local: { 'chassis-prefs:pending': JSON.stringify({ scope: 'someone-else', keys: { 'homelab.log-levels': '["x"]' } }) },
    });
    assert.equal(w.localStorage.getItem('homelab.log-levels'), '["warn"]');
    assert.equal(w.localStorage.getItem('chassis-prefs:pending'), null);
    w.localStorage.setItem('homelab.log-levels', '["error"]');
    (w.listeners['w:beforeunload'] ?? []).forEach((f) => f());
    await new Promise((r) => setImmediate(r));
    assert.ok(w.calls.some((c) => c.method === 'PUT'), 'beforeunload flushes without waiting for the timer');
});
