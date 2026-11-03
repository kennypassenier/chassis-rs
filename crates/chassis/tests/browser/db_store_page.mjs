// Runs INSIDE Firefox (loaded by db_store.firefox.mjs): the real IndexedDB
// store of the local database, db-store.js, driven the way the pull and the
// logout guard drive it. Throws on the first broken expectation; returns the
// names of the steps that passed.
import { openDbStore, DB_PREFIX } from '/static/chassis/db-store.js';
import { parseManifest } from '/static/chassis/db-config.js';
import { makeRecord } from '/static/chassis/db-plan.js';

const APP = 'browser-test';
const NAME = DB_PREFIX + APP;

const manifest = (schema) =>
    parseManifest({
        schema,
        collections: [{ name: 'dishes', key: 'id', rev: 'rev', indexes: ['name'], routes: { list: '/data/dishes', item: '/data/dishes/:id' } }],
    });

function expect(actual, wanted, what) {
    const [a, w] = [JSON.stringify(actual), JSON.stringify(wanted)];
    if (a !== w) throw new Error(`${what}: expected ${w}, got ${a}`);
}

const dish = (id, name, rev) => makeRecord({ key: id, rev, data: { id, name } }, { now: 1, gen: 'g1' });
const databases = async () => (await indexedDB.databases()).map((d) => d.name);

async function applyAndRead(store) {
    await store.applyPage('dishes', { upserts: [dish('a', 'Soup', 1), dish('b', 'Stew', 1), dish('c', 'Salad', 1)], deletes: [], meta: { cursor: '3' } });
    expect((await store.all('dishes')).map((r) => r.key), ['a', 'b', 'c'], 'page 1 stored');
    expect((await store.query('dishes', 'name', { kind: 'startsWith', a: 'S' })).map((r) => r.key).sort(), ['a', 'b', 'c'], 'index query');
    expect((await store.query('dishes', 'name', { kind: 'equals', a: 'Stew' })).map((r) => r.key), ['b'], 'index equals');
    // Page 2: an upsert replaces whole, a tombstone removes; page and cursor in one transaction.
    await store.applyPage('dishes', { upserts: [dish('a', 'Broth', 2)], deletes: ['b'], meta: { cursor: '5' } });
    expect((await store.get('dishes', 'a')).data.name, 'Broth', 'upsert replaces the record');
    expect(await store.get('dishes', 'b'), null, 'tombstone removes');
    const sum = (await store.all('dishes')).reduce((n, r) => n + r.size, 0);
    expect(store.bytes(), sum, 'byte count follows the records');
}

async function cursorRoundTrip(store) {
    expect((await store.getMeta('dishes')).cursor, '5', 'cursor stored with the page');
    store.close();
    const again = await openDbStore(indexedDB, APP, null); // offline start: no manifest, the stored one is used
    expect(Object.keys(again.manifest.collections), ['dishes'], 'cached manifest');
    expect((await again.getMeta('dishes')).cursor, '5', 'cursor survives a reopen');
    expect((await again.all('dishes')).map((r) => r.key).sort(), ['a', 'c'], 'records survive a reopen');
    return again;
}

async function schemaRebuild(store) {
    store.close();
    const same = await openDbStore(indexedDB, APP, manifest('h1'));
    expect((await same.all('dishes')).length, 2, 'same schema hash keeps the data');
    same.close();
    const next = await openDbStore(indexedDB, APP, manifest('h2'));
    expect(await next.all('dishes'), [], 'a new schema hash drops the data');
    expect((await next.getMeta('dishes')).cursor ?? null, null, 'and the cursor');
    return next;
}

export async function run() {
    await indexedDB.deleteDatabase(NAME);
    const steps = [];
    const store = await openDbStore(indexedDB, APP, manifest('h1'));
    expect(await databases(), [NAME], 'database created');
    steps.push('open');
    await applyAndRead(store);
    steps.push('apply page with upserts and tombstones');
    const reopened = await cursorRoundTrip(store);
    steps.push('cursor round trip');
    const rebuilt = await schemaRebuild(reopened);
    steps.push('schema hash rebuild');
    await rebuilt.destroy(); // what the logout guard calls
    expect((await databases()).includes(NAME), false, 'logout purge removes the database');
    steps.push('logout purge');
    return steps;
}
