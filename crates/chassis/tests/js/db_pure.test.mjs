// The pure parts of the local database (feat-localdb-client-1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareKeys, getPath, matcher } from '../../static/chassis/db-order.js';
import { isListPath, itemPath, keyOfPath, needsRebuild, normalizeDb, parseManifest } from '../../static/chassis/db-config.js';
import { planPage, makeRecord } from '../../static/chassis/db-plan.js';
import { buildOverlay } from '../../static/chassis/db-overlay.js';
import { parseHint, bindTriggers } from '../../static/chassis/db-triggers.js';
import { checkPage } from '../../static/chassis/db-pull.js';
import { MANIFEST } from './db_fake.mjs';

const def = parseManifest(MANIFEST).collections.dishes;

test('keys sort like IndexedDB; paths and clauses match', () => {
    assert.ok(compareKeys(1, 'a') < 0 && compareKeys('a', [1]) < 0 && compareKeys('b', 'a') > 0);
    assert.equal(getPath({ a: { b: 3 } }, 'a.b'), 3);
    assert.equal(getPath({ a: 1 }, 'a.b'), undefined);
    assert.equal(matcher({ kind: 'startsWith', a: 'So' })('Soup'), true);
    assert.equal(matcher({ kind: 'between', a: 2, b: 4 })(5), false);
});

test('the manifest is validated and the routes make paths both ways', () => {
    assert.equal(itemPath(def, 'a b'), '/data/dishes/a%20b');
    assert.equal(keyOfPath(def, '/data/dishes/a%20b?x=1'), 'a b');
    assert.equal(keyOfPath(def, '/data/other/1'), null);
    assert.equal(isListPath(def, '/data/dishes'), true);
    assert.throws(() => parseManifest({ collections: [] }), /manifest/);
    assert.throws(() => parseManifest({ schema: 'x', collections: [{ name: 'Bad Name', key: 'id' }] }), /bad name/);
    assert.throws(() => normalizeDb({ pullMs: 0 }), /pullMs/);
    assert.equal(normalizeDb(true).pullMs, 300000);
    assert.equal(normalizeDb(false), null);
});

test('a changed schema hash or a missing store drops the database', () => {
    const m = parseManifest(MANIFEST);
    assert.equal(needsRebuild('h1', m, ['_meta', 'dishes']), false);
    assert.equal(needsRebuild('h0', m, ['_meta', 'dishes']), true);
    assert.equal(needsRebuild(null, m, []), true);
    assert.equal(needsRebuild('h1', m, ['_meta']), true);
});

test('a page that would pass the room stores no upserts but frees deletes', () => {
    const up = [makeRecord({ key: 'a', rev: 1, data: { x: 'y'.repeat(100) } }, { now: 1 })];
    const olds = new Map([['z', { size: 50 }]]);
    const tight = planPage({ upserts: up, deletes: ['z'], olds, room: 10 });
    assert.deepEqual([tight.stored, tight.upserts.length, tight.delta], [false, 0, -50]);
    assert.equal(planPage({ upserts: up, deletes: ['z'], olds, room: 1000 }).stored, true);
});

test('the overlay lays waiting edits over the records in queue order and skips failed ones', async () => {
    const entries = [
        { method: 'POST', path: '/data/dishes', body: { id: 'n1', name: 'New' }, state: 'queued' },
        { method: 'PATCH', path: '/data/dishes/n1', body: { name: 'Newer' }, state: 'queued' },
        { method: 'PATCH', path: '/data/dishes/s1', body: { name: 'Patched' }, state: 'failed' },
        { method: 'DELETE', path: '/data/dishes/s2', state: 'held' },
        { method: 'PATCH', path: '/data/dishes/s3', body: { name: 'P3' }, state: 'queued' },
        { method: 'POST', path: '/other', body: { id: 'x' }, state: 'queued' },
    ];
    const overlay = await buildOverlay(entries, def, async (k) => (k === 's3' ? { id: 's3', name: 'old', extra: 1 } : null));
    assert.deepEqual(overlay.get('n1'), { data: { id: 'n1', name: 'Newer' } });
    assert.deepEqual(overlay.get('s3').data, { id: 's3', name: 'P3', extra: 1 });
    assert.equal(overlay.get('s2').deleted, true);
    assert.equal(overlay.has('s1'), false, 'a failed edit is not in the view');
    assert.equal(overlay.has('x'), false);
});

test('hints name collections or mean all; a feed page is checked', () => {
    assert.deepEqual(parseHint('["dishes","freezer"]'), ['dishes', 'freezer']);
    assert.deepEqual(parseHint('{"collections":["dishes"]}'), ['dishes']);
    assert.deepEqual(parseHint('dishes, freezer'), ['dishes', 'freezer']);
    assert.equal(parseHint(''), null);
    assert.throws(() => checkPage({ upserts: [] }), /not a page/);
});

test('triggers: the timer, online, focus, visibility and the live hints fire a pull', () => {
    const fired = [];
    const target = () => { const m = new Map(); return { addEventListener: (n, f) => m.set(n, f), removeEventListener: (n) => m.delete(n), fire: (n, e) => m.get(n)?.(e), m }; };
    const win = Object.assign(target(), { EventSource: class { static last; constructor(url) { this.url = url; this.on = {}; this.closed = false; this.constructor.last = this; } addEventListener(n, f) { this.on[n] = f; } close() { this.closed = true; } } });
    const doc = Object.assign(target(), { hidden: false, visibilityState: 'visible' });
    win.navigator = { serviceWorker: target() };
    const timers = [];
    const off = bindTriggers({ win, doc, fire: (n) => fired.push(n), pullMs: 300000, live: '/events', setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length), clearTimer: () => {} });
    assert.equal(timers.at(-1).ms, 300000);
    timers.at(-1).fn();
    win.fire('online');
    win.fire('focus');
    doc.fire('visibilitychange');
    win.EventSource.last.on.sync({ data: '["dishes"]' });
    win.EventSource.last.on.resync({});
    assert.deepEqual(fired, [null, null, null, null, ['dishes'], null]);
    fired.length = 0;
    const sw = win.navigator.serviceWorker;
    sw.fire('message', { data: { type: 'chassis-sync', collections: ['dishes'] } });
    sw.fire('message', { data: { type: 'chassis-sync', collections: [] } });
    sw.fire('message', { data: { type: 'chassis-sw-activated' } });
    assert.deepEqual(fired, [['dishes'], null], 'a push hint pulls the named collections, an empty one all; other messages are ignored');
    fired.length = 0;
    doc.hidden = true;
    timers.at(-1).fn();
    assert.equal(fired.length, 0, 'a hidden page does not poll');
    off();
    assert.equal(win.EventSource.last.closed, true);
});
