// The app's words can change after configure(): a later configure({ messages }),
// the failed-edits drawer re-reads them, and the toasts follow ([fix-kitchen-cycle-6], [fix-kitchen-cycle-9]).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installData } from '../../static/chassis/data.js';
import { createFailedView } from '../../static/chassis/data-failed-view.js';
import { memoryStore } from '../../static/chassis/data-store.js';

function fakeDoc() {
    const handlers = {};
    const make = (tag) => ({
        tag, children: [], dataset: {}, style: {}, className: '', hidden: false, textContent: '', attrs: {},
        append(...k) { this.children.push(...k); }, replaceChildren(...k) { this.children = k; }, remove() { this.removed = true; },
        setAttribute(n, v) { this.attrs[n] = v; }, addEventListener() {}, contains: () => true, close() { this.open = false; },
        querySelector(sel) { return ((this.parts ??= {})[sel] ??= make('x')); }, closest() { return null; },
    });
    return { createElement: make, body: make('body'), handlers, addEventListener: (n, f) => (handlers[n] = f), removeEventListener: (n) => delete handlers[n] };
}
const fakeWin = () => {
    const handlers = {};
    return { handlers, addEventListener: (n, f) => (handlers[n] = f), removeEventListener: (n) => delete handlers[n] };
};

test('an open drawer draws again with the new words when they change (event or kp-strings-change)', async () => {
    const doc = fakeDoc();
    const win = fakeWin();
    let words = { failedTitle: 'Failed edits', close: 'Close', discardAll: 'Discard all' };
    const data = { queue: async () => [{ id: 1, state: 'failed', method: 'PUT', path: '/a', at: 1 }], drop: async () => true, resave: async () => true };
    const kp = { openDialog: (d) => { d.open = true; } };
    const view = createFailedView({ win, doc, kp, data, messages: () => words });
    await view.open();
    const dialog = doc.body.children[0];
    const title = () => dialog.querySelector('.kp-dialog__title').textContent;
    const foot = () => dialog.querySelector('.kp-drawer__foot').children[0].textContent;
    assert.deepEqual([title(), foot()], ['Failed edits', 'Discard all (1)']);
    words = { failedTitle: 'Mislukte wijzigingen', close: 'Sluiten', discardAll: 'Alles verwijderen' };
    win.handlers['chassis-data-messages']();
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual([title(), foot()], ['Mislukte wijzigingen', 'Alles verwijderen (1)'], 'the open drawer follows an event');
    assert.equal(dialog.querySelector('.kp-dialog__close').attrs['aria-label'], 'Sluiten');
    words = { failedTitle: 'Echec', discardAll: 'Tout' };
    doc.handlers['kp-strings-change']();
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual([title(), foot()], ['Echec', 'Tout (1)'], 'and kp-strings-change');
    view.destroy();
    assert.equal(win.handlers['chassis-data-messages'], undefined, 'listeners are removed');
    assert.equal(doc.handlers['kp-strings-change'], undefined);
});

function page() {
    const winHandlers = {};
    const toasts = [];
    const events = [];
    const win = {
        handlers: winHandlers, localStorage: null, fetch: async () => { throw new TypeError('offline'); },
        addEventListener: (n, f) => (winHandlers[n] = f), removeEventListener() {},
        dispatchEvent: (e) => { events.push(e.type); winHandlers[e.type]?.({ detail: e.detail }); },
        CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    };
    const doc = { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] };
    const kp = { toast: (words) => { toasts.push(words); return { isConnected: false }; }, connectionOf: () => null };
    const facade = installData(win, doc, { openStore: async () => memoryStore() }, kp);
    return { win, doc, facade, toasts, events };
}

test('a later configure({ messages }) replaces the words: toasts and the event follow, an object included', async () => {
    const { win, facade, toasts, events } = page();
    await facade.configure({ name: 'kitchen', routes: ['/api/a'], messages: { full: 'Full' } });
    win.handlers['chassis-data-storage']({ detail: { level: 'full', used: 1, max: 1 } });
    await facade.configure({ messages: { full: 'Vol' } });
    win.handlers['chassis-data-storage']({ detail: { level: 'full', used: 1, max: 1 } });
    assert.deepEqual(toasts, ['Full', 'Vol']);
    assert.ok(events.includes('chassis-data-messages'));
    await facade.configure({ messages: () => ({ full: 'Plein' }) });
    win.handlers['chassis-data-storage']({ detail: { level: 'full', used: 1, max: 1 } });
    assert.equal(toasts.at(-1), 'Plein');
});

test('a later configure() may bring only messages; anything else still throws', async () => {
    const { facade } = page();
    await facade.configure({ name: 'kitchen', routes: ['/api/a'] });
    assert.throws(() => facade.configure({ name: 'other', routes: ['/api/a'] }), /already called/);
    assert.throws(() => facade.configure({ messages: { full: 'x' }, routes: ['/api/b'] }), /may only pass \{ messages \}/);
    assert.throws(() => facade.configure({ messages: 'nope' }), /may only pass \{ messages \}/);
    assert.throws(() => facade.configure(), /may only pass/);
});
