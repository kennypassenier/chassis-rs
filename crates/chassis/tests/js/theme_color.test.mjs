// The status bar follows the theme (node --test): which element supplies the
// colour, when the meta is touched and when it is left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opaque, barColour, syncThemeColor, followThemeColor } from '../../static/chassis/theme-color.js';

/** A fake document: `els` maps selector -> background, `meta` is the theme-colour meta. */
function fakeDoc({ els = {}, meta = { content: '#223659' }, manifest = true } = {}) {
    const listeners = {};
    return {
        listeners,
        meta,
        addEventListener: (n, f) => (listeners[n] = f),
        querySelector(sel) {
            if (sel.startsWith('meta[name="theme-color"]')) return meta;
            if (sel.startsWith('link[rel="manifest"]')) return manifest ? {} : null;
            return sel in els ? { bg: els[sel] } : null;
        },
    };
}
const styleOf = (el) => ({ backgroundColor: el.bg });

test('transparency is detected in every computed spelling', () => {
    assert.equal(opaque('rgb(1, 2, 3)'), true);
    assert.equal(opaque('rgba(1, 2, 3, 1)'), true);
    assert.equal(opaque('rgba(0, 0, 0, 0)'), false);
    assert.equal(opaque('rgba(1, 2, 3, 0.5)'), false);
    assert.equal(opaque('color(srgb 1 0 0 / 50%)'), false);
    assert.equal(opaque('transparent'), false);
    assert.equal(opaque(''), false);
});

test('the kit header wins, a transparent bar falls through to the next', () => {
    const doc = fakeDoc({ els: { '.kp-nav': 'rgb(1, 1, 1)', body: 'rgb(9, 9, 9)' } });
    assert.equal(barColour(doc, styleOf), 'rgb(1, 1, 1)');
    const clear = fakeDoc({ els: { '.kp-nav': 'rgba(0, 0, 0, 0)', body: 'rgb(9, 9, 9)' } });
    assert.equal(barColour(clear, styleOf), 'rgb(9, 9, 9)');
    assert.equal(barColour(fakeDoc(), styleOf), null);
});

test('the meta changes only when the colour differs, and a missing meta is left missing', () => {
    const doc = fakeDoc({ els: { '.kp-nav': 'rgb(1, 1, 1)' } });
    assert.equal(syncThemeColor(doc, styleOf), true);
    assert.equal(doc.meta.content, 'rgb(1, 1, 1)');
    assert.equal(syncThemeColor(doc, styleOf), false);
    assert.equal(syncThemeColor(fakeDoc({ els: { body: 'rgb(1, 1, 1)' }, meta: null }), styleOf), false);
});

test('an installable page is synced at start and on kp-theme-change; others are untouched', () => {
    const doc = fakeDoc({ els: { '.kp-nav': 'rgb(5, 5, 5)' } });
    const timers = [];
    const win = {
        getComputedStyle: styleOf,
        requestAnimationFrame: (f) => f(),
        setTimeout: (f, ms) => timers.push([f, ms]),
    };
    assert.ok(followThemeColor(win, doc));
    assert.equal(doc.meta.content, 'rgb(5, 5, 5)', 'once at start');
    assert.equal(timers[0][1], 600);
    doc.meta.content = 'stale';
    doc.listeners['kp-theme-change']();
    assert.equal(doc.meta.content, 'rgb(5, 5, 5)');
    const plain = fakeDoc({ els: { '.kp-nav': 'rgb(5, 5, 5)' }, manifest: false });
    assert.equal(followThemeColor(win, plain), null);
    assert.equal(plain.meta.content, '#223659');
    assert.equal(followThemeColor(win, {}), null);
});
