// The pure parts of the offline client (feat-offline-1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, matchRoute, checkPath } from '../../static/chassis/data-config.js';
import { revOf, ifMatchValue, rebase, conflictRev } from '../../static/chassis/data-rev.js';
import { classify, decide, defaultConflictPolicy } from '../../static/chassis/data-policy.js';
import { shouldKeep, withAll, withItem, capLevel, EMPTY } from '../../static/chassis/data-keep.js';
import { isLogoutAction, purgeBeforeLogout } from '../../static/chassis/data-logout.js';

test('routes with :id are items, others are lists; bad config is refused with a remedy', () => {
    const c = normalize({ name: 'k', routes: ['/api/dishes', '/api/dishes/:id'] });
    assert.equal(matchRoute(c, '/api/dishes/7?x=1').kind, 'item');
    assert.equal(matchRoute(c, '/api/dishes').kind, 'list');
    assert.equal(matchRoute(c, '/api/other'), null);
    assert.equal(matchRoute(c, '/api/dishes/7/steps'), null);
    assert.throws(() => normalize({ routes: [] }), /routes is empty\. List/);
    assert.throws(() => normalize({ name: 'bad name', routes: ['/a'] }), /name must be/);
    assert.throws(() => normalize({ routes: ['/a'], maxBytes: 0 }), /maxBytes/);
    assert.throws(() => checkPath('https://evil.example/x'), /not a path/);
    assert.throws(() => checkPath('//evil.example/x'), /not a path/);
});

test('a revision comes from the body, else the ETag', () => {
    assert.equal(revOf({ rev: 5 }, '"9"', 'rev'), '5');
    assert.equal(revOf({}, '"9"', 'rev'), '9');
    assert.equal(revOf(null, 'W/"3"', 'rev'), '3');
    assert.equal(revOf([], null, 'rev'), null);
    assert.equal(ifMatchValue('5'), '"5"');
    assert.equal(ifMatchValue(null), null);
    assert.equal(conflictRev({ rev: 8 }, 'rev'), '8');
    assert.equal(conflictRev({ current: { v: 4 } }, 'v'), '4');
});

test('rebase moves only the follow-up edits of the same path', () => {
    const q = [
        { id: 2, path: '/a', ifMatch: '1' }, { id: 3, path: '/b', ifMatch: '1' }, { id: 4, path: '/a', ifMatch: '7' },
    ];
    assert.deepEqual(rebase(q, '/a', '1', '2').map((e) => [e.id, e.ifMatch]), [[2, '2']]);
    assert.deepEqual(rebase(q, '/a', '1', null), []);
});

test('statuses map to what the queue does', () => {
    for (const [s, k] of [[0, 'unreachable'], [503, 'unreachable'], [401, 'auth'], [409, 'conflict'], [412, 'conflict'],
        [422, 'rejected'], [404, 'rejected'], [500, 'retry'], [200, 'ok']]) assert.equal(classify(s), k, String(s));
});

test('the conflict policy skips by default, accepts one-line replacements, and distrusts unknown answers', () => {
    assert.equal(defaultConflictPolicy({}, {}), 'skip');
    assert.equal(decide(null, {}, {}), 'skip');
    assert.equal(decide(() => 'hold', {}, {}), 'hold');
    assert.equal(decide(() => 'drop', {}, {}), 'drop');
    const warn = console.warn; console.warn = () => {};
    assert.equal(decide(() => 'banana', {}, {}), 'hold');
    console.warn = warn;
});

test('keep settings: all, per item, lists follow kept items', () => {
    const c = normalize({ routes: ['/api/d', '/api/d/:id'] });
    const item = matchRoute(c, '/api/d/1'); const list = matchRoute(c, '/api/d');
    assert.equal(shouldKeep(EMPTY, item, '/api/d/1'), false);
    assert.equal(shouldKeep(withAll(EMPTY, true), item, '/api/d/1'), true);
    const one = withItem(EMPTY, '/api/d/1', true);
    assert.equal(shouldKeep(one, item, '/api/d/1?x=2'), true);
    assert.equal(shouldKeep(one, matchRoute(c, '/api/d/2'), '/api/d/2'), false);
    assert.equal(shouldKeep(one, list, '/api/d'), true);
    assert.equal(shouldKeep(withItem(one, '/api/d/1', false), list, '/api/d'), false);
    assert.equal(shouldKeep(one, null, '/x'), false);
});

test('the cap has three levels', () => {
    assert.equal(capLevel(79, 100, 0.8), 'ok');
    assert.equal(capLevel(80, 100, 0.8), 'warn');
    assert.equal(capLevel(100, 100, 0.8), 'full');
});

test('only the logout form is recognised, and a stuck purge cannot hold the logout', async () => {
    assert.equal(isLogoutAction('/logout', 'https://a.example/x'), true);
    assert.equal(isLogoutAction('https://a.example/logout', 'https://a.example/'), true);
    assert.equal(isLogoutAction('/login', 'https://a.example/'), false);
    assert.equal(isLogoutAction('', 'not a url'), false);
    assert.equal(await purgeBeforeLogout(async () => {}, 10, setTimeout), 'purged');
    assert.equal(await purgeBeforeLogout(() => new Promise(() => {}), 5, setTimeout), 'late');
    const warn = console.warn; console.warn = () => {};
    assert.equal(await purgeBeforeLogout(async () => { throw new Error('x'); }, 50, setTimeout), 'failed');
    console.warn = warn;
});
