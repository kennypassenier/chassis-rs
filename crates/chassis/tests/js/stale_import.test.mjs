// The stale-chunk guard (fix-stale-chunk-1), run without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardStaleImports, guardImport, isFailedImport, mayReload, RELOAD_KEY, COOLDOWN_MS, UPDATE_EVENT } from '../../static/chassis/stale-import.js';

const fakeWin = (store = new Map()) => {
    let handler;
    return {
        reloads: 0,
        sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
        events: [],
        dispatchEvent(e) { this.events.push(e); return true; },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
        handlers: {},
        addEventListener(type, f) { if (type === 'unhandledrejection') handler = f; this.handlers[type] = f; },
        setTimeout: (f) => f(),
        location: { reload() { win.reloads += 1; } },
        fire: (reason) => handler({ reason }),
        store,
    };
};
let win;

test('the three browser spellings of a failed dynamic import are recognised', () => {
    assert.equal(isFailedImport(new TypeError('Failed to fetch dynamically imported module: https://x/chunk-A.js')), true);
    assert.equal(isFailedImport(new TypeError('error loading dynamically imported module')), true);
    assert.equal(isFailedImport(new TypeError('Importing a module script failed.')), true);
    assert.equal(isFailedImport(new Error('network down')), false);
    assert.equal(isFailedImport(undefined), false);
});

test('a failed import reloads once, then never again within the cooldown', () => {
    win = fakeWin();
    guardStaleImports(win);
    win.fire(new TypeError('error loading dynamically imported module'));
    win.fire(new TypeError('error loading dynamically imported module'));
    assert.equal(win.reloads, 1);
    assert.ok(Number(win.store.get(RELOAD_KEY)) > 0);
});

test('an unrelated rejection does nothing; a late failure after the cooldown reloads again', () => {
    win = fakeWin();
    guardStaleImports(win);
    win.fire(new Error('boom'));
    assert.equal(win.reloads, 0);
    assert.equal(mayReload(win.sessionStorage, Date.now()), true);
    win.store.set(RELOAD_KEY, String(Date.now() - COOLDOWN_MS - 1));
    win.fire(new TypeError('Failed to fetch dynamically imported module'));
    assert.equal(win.reloads, 1);
});

test('blocked storage never reloads, and the guard installs once', () => {
    win = fakeWin();
    Object.defineProperty(win, 'sessionStorage', { get() { throw new Error('blocked'); } });
    guardStaleImports(win);
    guardStaleImports(win);
    win.fire(new TypeError('error loading dynamically imported module'));
    assert.equal(win.reloads, 0);
});

const failed = () => new TypeError('error loading dynamically imported module');

test('Reload::Ask: the guard asks through the update event and reloads only on apply', () => {
    win = fakeWin();
    guardStaleImports(win, { ask: true });
    win.fire(failed());
    win.fire(failed());
    assert.equal(win.reloads, 0);
    assert.equal(win.events.length, 1);
    assert.equal(win.events[0].type, UPDATE_EVENT);
    win.events[0].detail.apply();
    assert.equal(win.reloads, 1);
    assert.ok(Number(win.store.get(RELOAD_KEY)) > 0);
});

test('ask mode can be switched on by a later call (boot-kit installs the guard first)', () => {
    win = fakeWin();
    guardStaleImports(win);
    guardStaleImports(win, { ask: true });
    win.fire(failed());
    assert.equal(win.reloads, 0);
    assert.equal(win.events.length, 1);
});

test('an import whose caller catches the failure still reaches the guard, and still rejects', async () => {
    win = fakeWin();
    guardStaleImports(win);
    await assert.rejects(guardImport(Promise.reject(failed()), win), TypeError);
    assert.equal(win.reloads, 1);
    await assert.rejects(guardImport(Promise.reject(new Error('boom')), win), /boom/);
    assert.equal(win.reloads, 1);
    assert.equal(await guardImport(Promise.resolve(7), win), 7);
});

test('a rejection while the page is being left never reloads (it would cancel the navigation)', () => {
    win = fakeWin();
    guardStaleImports(win);
    win.handlers.beforeunload();
    win.fire(new TypeError('error loading dynamically imported module'));
    assert.equal(win.reloads, 0);
    assert.equal(win.store.get(RELOAD_KEY), undefined);
    win = fakeWin();
    guardStaleImports(win);
    win.handlers.pagehide();
    win.fire(new TypeError('error loading dynamically imported module'));
    assert.equal(win.reloads, 0);
});

test('a navigation that starts during the settle delay also cancels the reload', () => {
    win = fakeWin();
    let later;
    win.setTimeout = (f) => { later = f; };
    guardStaleImports(win);
    win.fire(new TypeError('error loading dynamically imported module'));
    win.handlers.pagehide();
    later();
    assert.equal(win.reloads, 0);
});

test('a caught import cancelled by leaving the page does not reload either', async () => {
    win = fakeWin();
    guardStaleImports(win);
    win.handlers.pagehide();
    await assert.rejects(guardImport(Promise.reject(failed()), win), TypeError);
    assert.equal(win.reloads, 0);
});

test('a page start failure while the page is being left is not reported', async () => {
    const { reportUnlessLeaving } = await import('../../static/chassis/stale-import.js');
    win = fakeWin();
    guardStaleImports(win);
    const seen = [];
    const orig = console.error;
    console.error = (...a) => seen.push(a);
    try {
        reportUnlessLeaving('chassis status page', failed(), win);
        win.handlers.pagehide();
        reportUnlessLeaving('chassis status page', failed(), win);
    } finally {
        console.error = orig;
    }
    assert.equal(seen.length, 1, 'reported before leaving, quiet while leaving');
});
