// Local database (feat-localdb-client-1): pulling the changes feed
// (`GET <syncUrl>/<collection>?since=`) into the store. Transport-free:
// `send({ method, path })` answers { status, body } (status 0 = no answer).
//
// A page and its cursor are written in ONE transaction, so a crash re-reads
// the page. A 410 (cursor older than the server's floor) starts a full
// resync: pull from the beginning into the same store with a fresh
// generation, then drop every record that did not get it. The old data stays
// readable until the last page is in. One pull per collection at a time.

import { classify } from './data-policy.js';
import { makeRecord } from './db-plan.js';

const MAX_RESYNC_RESTARTS = 1;

function pathFor(config, name, since) {
    const query = [];
    if (since !== null && since !== undefined) query.push(`since=${encodeURIComponent(since)}`);
    if (config.pageLimit) query.push(`limit=${config.pageLimit}`);
    return `${config.syncUrl}/${encodeURIComponent(name)}${query.length ? `?${query.join('&')}` : ''}`;
}

/** The feed answer checked: a body that is not a feed page is an error, never an empty page. */
export function checkPage(body) {
    const ok = body && typeof body === 'object' && Array.isArray(body.upserts) && Array.isArray(body.deletes) && typeof body.cursor === 'string';
    if (!ok) throw new Error('the changes feed answered something that is not a page ({ upserts, deletes, cursor, more })');
    return body;
}

/**
 * deps: { store, send, config (syncUrl, pageLimit), now, uuid, room(), keeps(name, key),
 *         report({ collection, ...summary }), warn }.
 */
export function createPuller(deps) {
    const { store, send, config, now, uuid, room, keeps, report, warn = console.warn } = deps;
    const running = new Map(); // name -> promise
    const again = new Set();

    async function begin(name) {
        const meta = await store.getMeta(name);
        if (meta.cursor !== undefined && meta.cursor !== null) return { since: meta.cursor, gen: meta.resyncGen ?? null };
        const gen = meta.resyncGen ?? uuid(); // from the beginning = a resync, so records the master dropped go too
        await store.setMeta(name, { cursor: null, resyncGen: gen });
        return { since: null, gen };
    }

    async function apply(name, page, gen) {
        const upserts = page.upserts.filter((i) => keeps(name, String(i.key))).map((i) => makeRecord(i, { now: now(), gen }));
        const deletes = page.deletes.map((d) => String(d.key));
        const meta = { cursor: page.cursor, lastPull: now(), stale: false };
        return store.applyPage(name, { upserts, deletes, meta, room: room() });
    }

    async function finish(name, gen) {
        if (gen === null) return 0;
        const removed = await store.prune(name, (rec) => rec.gen !== gen);
        await store.setMeta(name, { resyncGen: null });
        return removed;
    }

    async function run(name) {
        const summary = { pages: 0, stopped: null, removed: 0 };
        let { since, gen } = await begin(name);
        let restarts = 0;
        for (;;) {
            const out = await send({ method: 'GET', path: pathFor(config, name, since) });
            if (out.status === 410 && restarts < MAX_RESYNC_RESTARTS) {
                restarts += 1;
                gen = uuid();
                since = null;
                await store.setMeta(name, { cursor: null, resyncGen: gen });
                continue;
            }
            const kind = classify(out.status);
            if (kind !== 'ok') return { ...summary, stopped: kind === 'rejected' || kind === 'retry' ? `error:${out.status}` : kind, status: out.status };
            const page = checkPage(out.body);
            const result = await apply(name, page, gen);
            if (!result.stored) {
                await store.setMeta(name, { stale: true }); // full: the cursor stays, nothing is lost once there is room
                return { ...summary, stopped: 'full' };
            }
            summary.pages += 1;
            since = page.cursor;
            if (!page.more) break;
        }
        summary.removed = await finish(name, gen);
        return summary;
    }

    /** Never throws: a failure is reported with its words and the collection stays as it was. */
    async function once(name) {
        try {
            const summary = await run(name);
            if (summary.stopped?.startsWith('error:')) warn(`chassisData.db: the changes feed of ${name} answered ${summary.status}; it is tried again later.`);
            report({ collection: name, ...summary });
            return summary;
        } catch (err) {
            warn(`chassisData.db: pulling ${name} failed.`, err);
            const summary = { pages: 0, removed: 0, stopped: 'error', error: err };
            report({ collection: name, ...summary });
            return summary;
        }
    }

    function pull(name) {
        if (running.has(name)) {
            again.add(name); // changes may have landed after this pull read its last page: go round once more
            return running.get(name);
        }
        const job = (async () => {
            let summary;
            do {
                again.delete(name);
                summary = await once(name);
            } while (again.has(name) && summary.stopped === null);
            return summary;
        })().finally(() => running.delete(name));
        running.set(name, job);
        return job;
    }

    return {
        pull,
        /** Resolves when no pull of `name` is running (a clear waits for it, or the pull would write behind it). */
        settled: (name) => (running.get(name) ?? Promise.resolve()).then(() => undefined),
        pullAll: (names) => Promise.all(names.map((n) => pull(n))),
        /** Forget the cursor: the next pull is a full resync (used when "keep everything" is switched on). */
        async resync(name) {
            await store.setMeta(name, { cursor: null, resyncGen: null });
            return pull(name);
        },
    };
}
