// Local database (feat-localdb-client-1): the manifest of `GET /api/sync`,
// validated once, and the paths of a collection's item routes. Pure.
//
// Manifest: { schema: "<hash>", collections: [{ name, key, rev, indexes: [..],
//   routes: { list, item } | [list, item], shared?, keys?: "client" | "server" }] }
// `keys: "server"`: the server assigns the key, so a create is sent without one.

import { fail } from './data-errors.js';

export const DB_DEFAULTS = Object.freeze({ syncUrl: '/api/sync', pullMs: 5 * 60 * 1000, pageLimit: null, live: null });

/** Prefix of the temporary key a queued create of a server-keyed collection shows under. */
export const LOCAL_PREFIX = 'local:';
export const isLocalKey = (key) => typeof key === 'string' && key.startsWith(LOCAL_PREFIX);

const NAME = /^[a-z][a-z0-9_]{0,39}$/;
const PARAM = /^:[A-Za-z_][A-Za-z0-9_]*$/;

/** The `db` option of `configure()` (`true` = all defaults), validated. */
export function normalizeDb(option) {
    if (!option) return null;
    const merged = { ...DB_DEFAULTS, ...(option === true ? {} : option) };
    if (typeof merged.syncUrl !== 'string' || !merged.syncUrl.startsWith('/') || merged.syncUrl.startsWith('//')) {
        throw fail('db.syncUrl must be a path of this app', { remedy: 'For example "/api/sync".' });
    }
    if (!(merged.pullMs > 0)) throw fail('db.pullMs must be a number above zero (milliseconds)');
    if (merged.pageLimit !== null && !(merged.pageLimit >= 1)) throw fail('db.pageLimit must be 1 or more');
    merged.syncUrl = merged.syncUrl.replace(/\/$/, '');
    return merged;
}

function routesOf(raw, name) {
    const pair = Array.isArray(raw) ? { list: raw[0], item: raw[1] } : raw ?? null;
    if (pair === null) return null;
    const okPath = (p) => typeof p === 'string' && p.startsWith('/') && !p.includes('?');
    const params = typeof pair.item === 'string' ? pair.item.split('/').filter((p) => PARAM.test(p)) : [];
    if (!okPath(pair.list) || !okPath(pair.item) || params.length !== 1) {
        throw fail(`the manifest gives collection ${name} unusable routes`, { remedy: 'Declare .routes("/data/x", "/data/x/:id").' });
    }
    return { list: pair.list, item: pair.item };
}

function collectionOf(raw) {
    if (!raw || !NAME.test(raw.name ?? '')) throw fail(`the manifest holds a collection with a bad name (${JSON.stringify(raw?.name)})`);
    const text = (v, field) => {
        if (typeof v !== 'string' || v === '') throw fail(`collection ${raw.name} has no ${field} in the manifest`);
        return v;
    };
    const indexes = raw.indexes ?? [];
    if (!Array.isArray(indexes) || indexes.some((i) => typeof i !== 'string' || i === '')) throw fail(`collection ${raw.name} has bad indexes`);
    return { name: raw.name, key: text(raw.key, 'key'), rev: text(raw.rev ?? 'rev', 'rev'), indexes, routes: routesOf(raw.routes, raw.name), shared: raw.shared === true, keys: raw.keys === 'server' ? 'server' : 'client' };
}

/** `{ schema, collections: { name: def } }` or an error that names what is wrong. */
export function parseManifest(body) {
    const schema = body?.schema ?? body?.hash;
    if (typeof schema !== 'string' || schema === '' || !Array.isArray(body?.collections)) {
        throw fail('GET /api/sync did not answer a manifest ({ schema, collections })', { remedy: 'Declare the collections with SyncCollection on the server.' });
    }
    const collections = {};
    for (const raw of body.collections) {
        const def = collectionOf(raw);
        if (collections[def.name]) throw fail(`the manifest lists collection ${def.name} twice`);
        collections[def.name] = def;
    }
    return { schema, collections };
}

/** The path of item `key` of a collection. */
export function itemPath(def, key) {
    if (!def.routes) throw fail(`collection ${def.name} declares no routes, so it cannot be written`, { remedy: 'Add .routes(list, item) on the server.' });
    return def.routes.item.split('/').map((p) => (PARAM.test(p) ? encodeURIComponent(key) : p)).join('/');
}

/** The key an item path of the collection names, or null when `path` is not one of its item paths. */
export function keyOfPath(def, path) {
    if (!def.routes) return null;
    const want = def.routes.item.split('/');
    const got = path.split('?')[0].split('/');
    if (want.length !== got.length) return null;
    let key = null;
    for (let i = 0; i < want.length; i += 1) {
        if (PARAM.test(want[i])) key = got[i] === '' ? null : decodeURIComponent(got[i]);
        else if (want[i] !== got[i]) return null;
    }
    return key;
}

/** Whether `path` is the list route of the collection. */
export const isListPath = (def, path) => def.routes?.list === path.split('?')[0];

/** Whether a stored database must be dropped and pulled again: none, another schema hash, or a missing store. */
export function needsRebuild(storedSchema, manifest, storeNames) {
    if (storedSchema === null || storedSchema !== manifest.schema) return true;
    return Object.keys(manifest.collections).some((n) => !storeNames.includes(n));
}
