// Local database (feat-localdb-client-1): the queued writes of a collection
// laid over the server's records. Pure. The stored record is always the
// server's word; what the person did and the server has not accepted yet is
// computed here, in queue order, each time it is asked. A failed edit is not
// in the overlay, so it vanishes from the view by itself, with nothing to roll
// back (OFFLINE_DESIGN rule 3).

import { isListPath, keyOfPath } from './db-config.js';

/** One queued entry as `{ key, change }` for this collection, or null when it is not about it. */
function effectOf(def, entry) {
    if (entry.method === 'POST' && isListPath(def, entry.path)) {
        const key = entry.body?.[def.key];
        return typeof key === 'string' && key !== '' ? { key, change: 'create' } : null;
    }
    const key = keyOfPath(def, entry.path);
    if (key === null) return null;
    return { key, change: { PUT: 'put', PATCH: 'patch', DELETE: 'delete' }[entry.method] ?? null };
}

/**
 * Map key -> `{ deleted: true }` or `{ data }` for the waiting (not failed)
 * entries of `def`. `baseOf(key)` answers the stored item's data (or null),
 * needed only to patch an item the queue has not made itself.
 */
export async function buildOverlay(entries, def, baseOf) {
    const overlay = new Map();
    for (const entry of entries) {
        if (entry.state === 'failed') continue;
        const effect = effectOf(def, entry);
        if (!effect || effect.change === null) continue;
        const { key, change } = effect;
        if (change === 'delete') {
            overlay.set(key, { deleted: true });
        } else if (change === 'patch') {
            const had = overlay.get(key);
            const base = had ? (had.deleted ? null : had.data) : await baseOf(key);
            if (base) overlay.set(key, { data: { ...base, ...entry.body, [def.key]: key } });
        } else {
            overlay.set(key, { data: { ...entry.body, [def.key]: key } });
        }
    }
    return overlay;
}
