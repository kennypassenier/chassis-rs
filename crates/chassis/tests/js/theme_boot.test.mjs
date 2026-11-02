// The no-flash script (static/theme-boot.js) writes the worn theme's register
// link before first paint. Run with the other node tests (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../../static/theme-boot.js', import.meta.url), 'utf8');

/** Runs the script against a fake page; returns what it wrote and the theme left on <html>. */
function boot({ stored, tag, startTheme = 'formal' }) {
    const attrs = { 'data-theme': startTheme };
    const store = new Map(stored ? [['theme', stored]] : []);
    const written = [];
    const root = { getAttribute: (k) => attrs[k] ?? null, setAttribute: (k, v) => { attrs[k] = v; } };
    const currentScript = tag && { getAttribute: (k) => tag[k] ?? null };
    const document = { documentElement: root, currentScript, write: (html) => written.push(html) };
    const localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    new Function('document', 'localStorage', SOURCE)(document, localStorage);
    return { written, theme: attrs['data-theme'], store };
}

const TAG = {
    'data-register-pattern': '/static/kp/dist/css/{theme}-register.min.css',
    'data-themes': 'formal,dark,cyberpunk',
    'data-fallback': 'formal',
};

test('the stored theme gets its register link, blocking the first paint', () => {
    const r = boot({ stored: 'cyberpunk', tag: TAG });
    assert.equal(r.theme, 'cyberpunk');
    assert.equal(r.written.length, 1);
    assert.match(r.written[0], /href="\/static\/kp\/dist\/css\/cyberpunk-register\.min\.css"/);
    assert.match(r.written[0], /data-kp-register="cyberpunk"/);
    assert.match(r.written[0], /blocking="render"/);
});

test('no stored theme asks for the register of the theme the page starts in', () => {
    const r = boot({ tag: TAG });
    assert.match(r.written[0], /formal-register\.min\.css/);
});

test('a stored name kp-themes no longer has is mapped once, then its register is named', () => {
    const r = boot({ stored: 'phantom', tag: TAG });
    assert.equal(r.theme, 'dark');
    assert.equal(r.store.get('theme'), 'dark');
    assert.match(r.written[0], /dark-register\.min\.css/);
});

test('an unknown name asks for the fallback register, never a missing file', () => {
    const r = boot({ stored: 'from-the-future', tag: TAG });
    assert.match(r.written[0], /formal-register\.min\.css/);
    assert.doesNotMatch(r.written[0], /from-the-future/);
});

test('a tag without a pattern (an older layout) writes nothing', () => {
    assert.deepEqual(boot({ stored: 'dark', tag: {} }).written, []);
    assert.deepEqual(boot({ stored: 'dark' }).written, []);
});
