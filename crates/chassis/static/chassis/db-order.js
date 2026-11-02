// Local database (feat-localdb-client-1): key order and the three index
// matches. Pure. IndexedDB orders keys numbers < dates < strings < arrays; the
// in-memory store and the merge of pending edits must agree with it, so one
// comparison lives here and both use it.

const rank = (v) => (typeof v === 'number' ? 0 : v instanceof Date ? 1 : typeof v === 'string' ? 2 : Array.isArray(v) ? 3 : -1);

/** Whether IndexedDB can index `v` (booleans, null and objects cannot). */
export const indexable = (v) => rank(v) >= 0 && !(typeof v === 'number' && Number.isNaN(v));

/** -1 / 0 / 1 in IndexedDB key order; values that cannot be indexed sort last. */
export function compareKeys(a, b) {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    if (ra === 3) {
        for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
            const c = compareKeys(a[i], b[i]);
            if (c !== 0) return c;
        }
        return Math.sign(a.length - b.length);
    }
    const x = ra === 1 ? a.getTime() : a;
    const y = ra === 1 ? b.getTime() : b;
    return x < y ? -1 : x > y ? 1 : 0;
}

/** The value at a dotted path of an item (`"owner.name"`), or undefined. */
export function getPath(item, path) {
    let at = item;
    for (const part of path.split('.')) {
        if (at === null || typeof at !== 'object') return undefined;
        at = at[part];
    }
    return at;
}

/** The match of a query clause: `{ kind: 'equals' | 'between' | 'startsWith', a, b }` as a test on one value. */
export function matcher(spec) {
    if (spec.kind === 'equals') return (v) => indexable(v) && compareKeys(v, spec.a) === 0;
    if (spec.kind === 'between') return (v) => indexable(v) && compareKeys(v, spec.a) >= 0 && compareKeys(v, spec.b) <= 0;
    if (spec.kind === 'startsWith') return (v) => typeof v === 'string' && v.startsWith(spec.a);
    throw new Error(`chassisData.db: unknown clause ${JSON.stringify(spec.kind)}.`);
}

/** The same clause as an IDBKeyRange (`startsWith` = from the prefix to the prefix plus the highest character). */
export function keyRange(IDBKeyRange, spec) {
    if (spec.kind === 'equals') return IDBKeyRange.only(spec.a);
    if (spec.kind === 'between') return IDBKeyRange.bound(spec.a, spec.b);
    return IDBKeyRange.bound(spec.a, `${spec.a}￿`);
}

