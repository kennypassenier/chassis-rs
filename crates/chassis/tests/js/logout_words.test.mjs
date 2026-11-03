// fix-logout-words-1: the kit's own pages ask at logout with the app's words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rememberLogoutWords, storedLogoutWords, LOGOUT_WORDS_KEY } from '../../static/chassis/logout-words.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
const dutch = {
    logoutTitle: 'Afmelden met niet-verzonden wijzigingen?',
    body: (n) => (n === 1 ? '1 wijziging is nog niet verzonden.' : `${n} wijzigingen zijn nog niet verzonden.`),
    accept: 'Toch afmelden',
    stay: 'Blijven',
};

test('the app words survive to a kit page, plural included', () => {
    const s = memory();
    rememberLogoutWords(s, dutch);
    const w = storedLogoutWords(s);
    assert.equal(w.logoutTitle, dutch.logoutTitle);
    assert.equal(w.accept, 'Toch afmelden');
    assert.equal(w.stay, 'Blijven');
    assert.equal(w.body(1), '1 wijziging is nog niet verzonden.');
    assert.equal(w.body(3), '3 wijzigingen zijn nog niet verzonden.');
});

test('nothing stored or unreadable gives the kit defaults', () => {
    assert.deepEqual(storedLogoutWords(memory()), {});
    const s = memory();
    s.setItem(LOGOUT_WORDS_KEY, '{not json');
    assert.deepEqual(storedLogoutWords(s), {});
    assert.deepEqual(storedLogoutWords(null), {});
});

test('a title-only app falls back to its title, and a body without n keeps one sentence', () => {
    const s = memory();
    rememberLogoutWords(s, { title: 'Keuken', body: () => 'Er wacht nog iets.' });
    const w = storedLogoutWords(s);
    assert.equal(w.logoutTitle, 'Keuken');
    assert.equal(w.body(5), 'Er wacht nog iets.');
});
