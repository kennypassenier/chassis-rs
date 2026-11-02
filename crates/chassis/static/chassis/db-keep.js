// Local database (feat-localdb-client-1): which items of a collection stay on
// the device. With "keep everything" on (chassisData.keepAll, the existing
// per-device switch) every pulled item is stored. With it off, only the keys
// chosen with `collection.keep(key, true)` are; a newly kept key is fetched
// once through its item route; deletes are always applied. The chosen keys
// live in localStorage next to the other per-device settings and survive a
// logout, like they do.

import { itemPath } from './db-config.js';
import { makeRecord } from './db-plan.js';
import { classify } from './data-policy.js';
import { revOf } from './data-rev.js';

const keyOf = (app) => `chassis-db:${app}:keep`;

/** Saved choices { collection: [keys] }; a blocked or damaged store gives none, with a warning. */
export function loadKept(storage, app, warn = console.warn) {
    try {
        const raw = storage?.getItem(keyOf(app));
        const parsed = raw ? JSON.parse(raw) : {};
        return new Map(Object.entries(parsed).map(([c, keys]) => [c, new Set(Array.isArray(keys) ? keys.filter((k) => typeof k === 'string') : [])]));
    } catch (err) {
        warn('chassisData.db: the kept items could not be read; starting with none.', err);
        return new Map();
    }
}

function saveKept(storage, app, kept, warn) {
    try {
        storage?.setItem(keyOf(app), JSON.stringify(Object.fromEntries([...kept].map(([c, keys]) => [c, [...keys]]))));
    } catch (err) {
        warn('chassisData.db: the kept items could not be saved; they last until the page closes.', err);
    }
}

/** deps: { storage, app, store, settings: () => { all }, send, now, field (rev field), warn }. */
export function createKeeper(deps) {
    const { storage, app, store, settings, send, now, warn = console.warn } = deps;
    const kept = loadKept(storage, app, warn);
    const has = (c, key) => kept.get(c)?.has(key) === true;

    /** Fetch the item through its route and store it; a refusal is reported and the key stays chosen. */
    async function fetchOne(def, key) {
        const out = await send({ method: 'GET', path: itemPath(def, key) });
        if (classify(out.status) !== 'ok') {
            if (out.status !== 404 && out.status !== 410) warn(`chassisData.db: ${def.name}/${key} could not be fetched to keep offline (${out.status}); the next pull of the feed does not bring it either.`);
            return false;
        }
        const rev = revOf(out.body, out.etag, def.rev);
        await store.putOne(def.name, makeRecord({ key, rev, data: out.body }, { now: now(), gen: null }));
        return true;
    }

    return {
        /** Whether a pulled upsert of `key` is stored. */
        keeps: (c, key) => settings().all || has(c, key),
        isKept: (c, key) => settings().all || has(c, key),
        /** Choose or drop one key; resolves to the new state. Dropping removes the local record unless everything is kept. */
        async set(def, key, on) {
            const keys = kept.get(def.name) ?? new Set();
            if (on) keys.add(key);
            else keys.delete(key);
            kept.set(def.name, keys);
            saveKept(storage, app, kept, warn);
            if (on) {
                if (!(await store.get(def.name, key))) await fetchOne(def, key);
            } else if (!settings().all) {
                await store.removeOne(def.name, key);
            }
            return settings().all || on === true;
        },
        /** "Keep everything" went off: drop the records nobody chose. */
        trim: (def) => store.prune(def.name, (rec) => !has(def.name, rec.key)),
    };
}
