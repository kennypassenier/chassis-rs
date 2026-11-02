// Local database (feat-localdb-client-1): what a pulled page does to a
// collection's store. Pure; both stores (IndexedDB and memory) run the same
// plan, so the cap rule and the byte count cannot differ between them.

import { sizeOf } from './data-keep.js';

/**
 * The stored form of a feed item: the server's word exactly (`data`), its
 * revision as text, and bookkeeping (`size`, `syncedAt`, `gen`).
 */
export function makeRecord(item, { now, gen = null }) {
    return { key: String(item.key), rev: item.rev === undefined || item.rev === null ? null : String(item.rev), data: item.data, size: sizeOf(item.data), syncedAt: now, gen };
}

/**
 * Decide a page. `olds` maps key -> the stored record (or undefined). Deletes
 * are always applied (they free space). Upserts are all applied, or, when they
 * would grow the store past `room` bytes, none: nothing is evicted, and the
 * caller keeps the cursor where it was (`stored: false`).
 */
export function planPage({ upserts, deletes, olds, room = Infinity }) {
    const freed = deletes.reduce((n, key) => n - (olds.get(key)?.size ?? 0), 0);
    const grown = upserts.reduce((n, rec) => n + rec.size - (olds.get(rec.key)?.size ?? 0), 0);
    const fits = grown + freed <= room;
    return { upserts: fits ? upserts : [], deletes, delta: fits ? grown + freed : freed, stored: fits };
}
