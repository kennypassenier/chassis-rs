// Local database (feat-localdb-client-1): the queued writes of a collection
// laid over the server's records. Pure. The stored record is always the
// server's word; what the person did and the server has not accepted yet is
// computed here, in queue order, each time it is asked. A failed edit is not
// in the overlay, so it vanishes from the view by itself, with nothing to roll
// back (OFFLINE_DESIGN rule 3).
//
// Kinds of queued entry: a create (POST to the list route; a server-keyed
// collection shows it under `local:<idempotency key>`), PUT (merged into the
// stored record for display), PATCH, DELETE, and an item action (POST to
// `<item route>/<name>`) whose optimistic transform the app registered by
// name (fix-overlay-3). Functions never live in the queue, only the name.

import { LOCAL_PREFIX, isListPath, keyOfPath } from './db-config.js';

/** The key a queued create shows under, or null when it cannot be told. */
function createKey(def, entry) {
    if (def.keys === 'server') return typeof entry.key === 'string' && entry.key !== '' ? `${LOCAL_PREFIX}${entry.key}` : null;
    const key = entry.body?.[def.key];
    return typeof key === 'string' && key !== '' ? key : null;
}

/** `{ key, name }` when the entry is a POST to `<item path>/<registered action>`, else null. */
function actionOf(def, entry, actions) {
    if (entry.method !== 'POST') return null;
    const parts = entry.path.split('?')[0].split('/');
    const name = parts.pop();
    if (!actions.has(name)) return null;
    const key = keyOfPath(def, parts.join('/'));
    return key === null ? null : { key, name };
}

/** One queued entry as `{ key, change, name? }` for this collection, or null when it is not about it. */
function effectOf(def, entry, actions) {
    if (entry.method === 'POST' && isListPath(def, entry.path)) {
        const key = createKey(def, entry);
        return key === null ? null : { key, change: 'create' };
    }
    const key = keyOfPath(def, entry.path);
    if (key !== null) return { key, change: { PUT: 'put', PATCH: 'patch', DELETE: 'delete' }[entry.method] ?? null };
    const act = actionOf(def, entry, actions);
    return act ? { ...act, change: 'action' } : null;
}

/** The registered transform applied to a copy of `base`; a throwing transform is reported and changes nothing. */
function transformed(actions, name, base, body, collection) {
    try {
        return actions.get(name)({ ...base }, body ?? {});
    } catch (err) {
        console.warn(`chassisData.db: the optimistic action "${name}" of ${collection} threw; the record is shown without it.`, err);
        return undefined;
    }
}

/**
 * Map key -> `{ deleted: true }` or `{ data }` for the waiting (not failed)
 * entries of `def`. `baseOf(key)` answers the stored item's data (or null),
 * needed only to change an item the queue has not made itself. `actions` maps
 * an action name to `(record, body) => record` (`null` hides the record).
 */
export async function buildOverlay(entries, def, baseOf, actions = new Map()) {
    const overlay = new Map();
    const current = async (key) => {
        const had = overlay.get(key);
        return had ? (had.deleted ? null : had.data) : baseOf(key);
    };
    for (const entry of entries) {
        if (entry.state === 'failed') continue;
        const effect = effectOf(def, entry, actions);
        if (!effect || effect.change === null) continue;
        const { key, change } = effect;
        const shown = (data) => overlay.set(key, { data: { ...data, [def.key]: key } });
        if (change === 'delete') {
            overlay.set(key, { deleted: true });
        } else if (change === 'create') {
            shown(entry.body);
        } else {
            const base = await current(key);
            if (change === 'put') shown({ ...base, ...entry.body }); // a partial PUT must not hide the fields it leaves out
            else if (!base) continue;
            else if (change === 'patch') shown({ ...base, ...entry.body });
            else {
                const next = transformed(actions, effect.name, base, entry.body, def.name);
                if (next === null) overlay.set(key, { deleted: true });
                else if (next !== undefined) shown(next);
            }
        }
    }
    return overlay;
}
