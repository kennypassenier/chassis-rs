// Local database: read-through for a collection that is not kept (the server
// is the master). With "keep everything" off the store holds only the kept
// items, so a read of anything else asks the server through the collection's
// own routes (the list route for queries, the item route for `get`) and
// answers from that. What it learned is stored per the keep rules: a kept key
// is written to the store (when new or changed), everything else is only
// shown. Offline, or when the service answers an error, the read falls back
// to the stored records (the caller marks the result `partial`); an error
// other than "cannot be reached" is reported, never swallowed.

import { classify } from './data-policy.js';
import { entriesOf } from './data-trim.js';
import { revOf } from './data-rev.js';
import { itemPath } from './db-config.js';
import { makeRecord } from './db-plan.js';

/** deps: { def, store, keeper, send, settings: () => { all }, now, warn }. */
export function createThrough(deps) {
    const { def, store, keeper, send, settings, now, warn = console.warn } = deps;
    const enabled = () => !settings().all && Boolean(def.routes);

    /** The answer's body, or null (unreachable, or an error that was reported). */
    async function answer(path, what) {
        const out = await send({ method: 'GET', path });
        const kind = classify(out.status);
        if (kind === 'ok') return out;
        if (kind !== 'unreachable' && out.status !== 404 && out.status !== 410) {
            warn(`chassisData.db: ${def.name}: reading ${what} through the service answered ${out.status}; the stored records are shown.`);
        }
        return null;
    }

    /** Store the row when its key is kept and the stored one is missing or older. */
    async function rememberKept(row) {
        if (!keeper.keeps(def.name, row.key)) return;
        const had = await store.get(def.name, row.key);
        if (had && had.rev === row.rev) return;
        await store.putOne(def.name, makeRecord(row, { now: now(), gen: null }));
    }

    function rowOf(entry) {
        const key = entry?.[def.key];
        if (key === undefined || key === null || key === '') return null;
        return { key: String(key), rev: revOf(entry, null, def.rev), data: entry };
    }

    return {
        enabled,
        /** Every row the list route answers as `{ key, rev, data }`, or null (not enabled, offline, refused: use the store). */
        async list() {
            if (!enabled()) return null;
            const out = await answer(def.routes.list, 'the list');
            if (!out) return null;
            const entries = entriesOf(out.body);
            if (!entries) {
                warn(`chassisData.db: ${def.name}: ${def.routes.list} answered neither a list nor { items }; the stored records are shown.`);
                return null;
            }
            const rows = entries.map(rowOf).filter((r) => r !== null);
            for (const row of rows) await rememberKept(row);
            return rows;
        },
        /** One row through the item route, or null (not enabled, offline, not there). */
        async item(key) {
            if (!enabled()) return null;
            const out = await answer(itemPath(def, key), `item ${key}`);
            if (!out) return null;
            const row = { key: String(key), rev: revOf(out.body, out.etag, def.rev), data: out.body };
            await rememberKept(row);
            return row;
        },
    };
}
