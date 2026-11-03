// The stale-chunk guard (fix-stale-chunk-1), run without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardStaleImports, isFailedImport, mayReload, RELOAD_KEY, COOLDOWN_MS } from '../../static/chassis/stale-import.js';

const fakeWin = (store = new Map()) => {
    let handler;
    return {
        reloads: 0,
        sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
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
