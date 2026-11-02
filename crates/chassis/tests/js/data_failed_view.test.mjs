// The failed-edits view (feat-offline-failed-view-1): the list, the reasons
// and the actions routed to the client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reasonOf, reviewable, renderEntry, FAILED_MESSAGES } from '../../static/chassis/data-failed.js';
import { createFailedView } from '../../static/chassis/data-failed-view.js';

function fakeDoc() {
    const make = (tag) => ({
        tag, children: [], dataset: {}, style: {}, className: '', hidden: false, textContent: '',
        append(...k) { this.children.push(...k); }, replaceChildren(...k) { this.children = k; }, remove() { this.removed = true; },
        setAttribute() {}, addEventListener(n, f) { this.on = f; }, contains: () => true, close() { this.open = false; },
        querySelector(sel) { return ((this.parts ??= {})[sel] ??= make('x')); }, closest() { return null; },
    });
    return { createElement: make, body: make('body') };
}

test('the failed list holds refused and held edits only, each with the server\'s own words', () => {
    const q = [{ id: 1, state: 'queued' }, { id: 2, state: 'failed' }, { id: 3, state: 'held' }];
    assert.deepEqual(reviewable(q).map((e) => e.id), [2, 3]);
    const t = FAILED_MESSAGES;
    assert.equal(reasonOf({ conflict: { status: 422, body: { error: 'Name is empty', remedy: 'Give it a name.' } } }, t), 'Name is empty Give it a name.');
    assert.equal(reasonOf({ conflict: { status: 409, body: null } }, t), t.reasonStale);
    assert.equal(reasonOf({ conflict: { status: 500 } }, t), t.reasonOther);
    const card = renderEntry(fakeDoc(), { id: 2, method: 'DELETE', path: '/api/dishes/7', at: 0, state: 'failed', conflict: { status: 409 } }, t);
    assert.equal(card.dataset.chassisFailedItem, '2');
    assert.equal(card.children[0].children[0].textContent, 'Delete /api/dishes/7');
    const acts = card.children[2].children.map((b) => [b.dataset.chassisFailedAct, b.dataset.chassisFailedId]);
    assert.deepEqual(acts, [['discard', '2'], ['save', '2']]);
});

test('the view routes Discard, Save again and Discard all to the client, asks once for all, and shows the empty state', async () => {
    const doc = fakeDoc();
    let queue = [{ id: 1, state: 'failed', method: 'PUT', path: '/a', at: 1 }, { id: 2, state: 'held', method: 'PUT', path: '/b', at: 1 }];
    const calls = [];
    const data = {
        queue: async () => queue,
        drop: async (id) => { calls.push(['drop', id]); queue = queue.filter((e) => e.id !== id); return true; },
        resave: async (id) => { calls.push(['resave', id]); queue = queue.filter((e) => e.id !== id); return true; },
    };
    let confirmed = 0;
    const opened = [];
    const kp = { openDialog: (d) => { d.open = true; opened.push(d); }, openConfirmation: (t, o) => { confirmed++; o.onAccept(); } };
    const win = { addEventListener() {}, removeEventListener() {} };
    const view = createFailedView({ win, doc, kp, data });
    await view.open();
    const dialog = doc.body.children[0];
    assert.equal(opened.length, 1);
    const click = (act, id) => dialog.on({ target: { closest: () => ({ dataset: { chassisFailedAct: act, chassisFailedId: id } }) } });
    const shown = () => dialog.querySelector('.kp-drawer__body').children[0];
    assert.equal(shown().className, 'chassis-failed__list');
    assert.equal(shown().children.length, 2);
    click('save', '1');
    await new Promise((r) => setTimeout(r, 5));
    click('discard-all');
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(calls, [['resave', 1], ['drop', 2]]);
    assert.equal(confirmed, 1);
    assert.match(shown().className, /kp-empty/, 'nothing left: the full-size empty state');
    assert.equal(dialog.querySelector('.kp-drawer__foot').hidden, true);
    view.destroy();
    assert.equal(dialog.removed, true);
});

test('describe(entry) names a failed card; no, empty or throwing describe falls back to verb and path (fix-habits-drawer-9)', async () => {
    const { labelOf } = await import('../../static/chassis/data-failed.js');
    const entry = { id: 4, method: 'PUT', path: '/data/tasks/5703', at: 0, state: 'failed', conflict: { status: 409 } };
    const t = FAILED_MESSAGES;
    assert.deepEqual(labelOf(entry, t, (e) => ({ title: `Task ${e.id}`, detail: 'Buy milk' })), { title: 'Task 4', detail: 'Buy milk' });
    assert.deepEqual(labelOf(entry, t, () => ({ title: '  ' })), { title: 'Change /data/tasks/5703', detail: '' });
    const warn = console.warn; console.warn = () => {};
    try { assert.equal(labelOf(entry, t, () => { throw new Error('x'); }).title, 'Change /data/tasks/5703'); } finally { console.warn = warn; }
    assert.equal(labelOf(entry, t).title, 'Change /data/tasks/5703');
    const card = renderEntry(fakeDoc(), entry, t, () => ({ title: 'Buy milk', detail: 'Tasks' }));
    const head = card.children[0];
    assert.deepEqual(head.children.map((c) => c.textContent), ['Buy milk', 'Tasks']);
    const { normalize } = await import('../../static/chassis/data-config.js');
    assert.throws(() => normalize({ routes: ['/a'], describe: 'nope' }), /describe must be a function/);
});
