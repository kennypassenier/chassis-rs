// The client's PUT / PATCH / DELETE: sent at once when the queue is empty and
// the service answers, queued with If-Match otherwise (feat-offline-3, split
// out of data-client.js; no behaviour change).

import { checkPath, matchRoute } from './data-config.js';
import { classify } from './data-policy.js';
import { revOf } from './data-rev.js';
import { storable } from './data-trim.js';
import { send } from './data-send.js';
import { fail, refusal } from './data-errors.js';
import { amendLists, itemRouteOf } from './data-lists.js';

function checkOptions(options) {
    if (options.headers) {
        throw fail('custom headers are not accepted. The session cookie authenticates; nothing else is sent or stored.');
    }
}

/** `ctx` = { config, cache, fetch, now, settings, queue: () => queue, kick }. */
export function createWrites(ctx) {
    const { config, cache, fetch, now, uuid } = ctx;

    /** The copy of `path` becomes `body` (the server's version), or goes when it cannot be kept. */
    async function adopt(path, route, body, rev) {
        await listsHold(path, () => body); // the stored lists that hold the item take the server's version too
        const keep = storable(config, ctx.settings(), route, path, body);
        if (keep && (await cache.remember(path, keep.data, rev, keep.partial))) return;
        await cache.forget(path);
    }

    /** Change (or, with `undefined`, remove) the entry of item `path` in every stored list that holds it. */
    async function listsHold(path, change) {
        const item = itemRouteOf(config, path.split('?')[0]);
        if (item) await amendLists(ctx, item, path.split('?')[0], change);
    }

    /** The item and its entries in the stored lists are gone. */
    async function forgetItem(path) {
        await cache.forget(path);
        await listsHold(path, () => undefined);
    }

    /** Ask the server for `path` and make the copy that answer. Never leaves a local edit behind. */
    async function refetch(path, route) {
        const outcome = await send(fetch, { method: 'GET', path });
        if (classify(outcome.status) === 'ok') return adopt(path, route, outcome.body, revOf(outcome.body, outcome.etag, config.rev));
        // Gone, or not answerable now: a copy that may hold a refused edit is worse than none.
        if (outcome.status !== 404 && outcome.status !== 410) console.warn(`chassisData: ${path} could not be refetched (${outcome.status}); its offline copy was dropped.`);
        await forgetItem(path);
    }

    /** After a send went through: the copy becomes the service's answer (never a merge with the optimistic one). */
    async function afterWrite(entry, rev, body, replayed = false) {
        const route = matchRoute(config, entry.path);
        if (!route) return;
        if (entry.method === 'DELETE') return forgetItem(entry.path);
        const held = await cache.read(entry.path);
        if (entry.method === 'POST') {
            // The answer to a POST is not the copy of its path; an optimistic amendment is replaced by a fresh read.
            if (replayed && (held || entry.optimistic)) await refetch(entry.path, route);
            return;
        }
        if (body && typeof body === 'object') return adopt(entry.path, route, body, rev);
        if (held) await refetch(entry.path, route); // no usable answer body: ask for the real one
    }

    /** A queued edit was refused: the copy of its path goes back to the server's version at once. */
    async function restore(entry, outcomeBody) {
        const route = matchRoute(config, entry.path);
        if (!route) return;
        if (entry.method === 'POST' && !entry.optimistic && !(await cache.read(entry.path))) return; // nothing was amended
        const current = outcomeBody && typeof outcomeBody === 'object' ? outcomeBody.current : null;
        if (entry.method !== 'POST' && current && typeof current === 'object') {
            return adopt(entry.path, route, current, revOf(current, null, config.rev));
        }
        await refetch(entry.path, route);
    }

    /** What a queued edit does to the copy, so offline reads show it. */
    async function optimistic(method, path, body, change = null) {
        const make = change ?? (method === 'DELETE' ? () => undefined : method === 'PATCH' ? (old) => ({ ...old, ...body }) : () => body);
        // The same change shows in the item's copy and in every stored list entry of it.
        await cache.amend(path, make);
        await listsHold(path, make);
    }

    async function finish(entry, outcome) {
        const rev = revOf(outcome.body, outcome.etag, config.rev);
        await afterWrite(entry, rev, outcome.body);
        return { ok: true, queued: false, status: outcome.status, data: outcome.body, rev };
    }

    /** A POST has no revision of its own (unless `rev` is given); its key is made once, here. */
    async function entryFor(method, path, body, options) {
        if (method === 'POST') {
            return { method, path, body, ifMatch: options.rev !== undefined ? String(options.rev) : null, key: uuid(), at: now() };
        }
        const held = await cache.read(path);
        const ifMatch = options.rev !== undefined ? String(options.rev) : (held?.rev ?? null);
        return { method, path, body, ifMatch, at: now() };
    }

    async function write(method, path, body, options = {}) {
        checkOptions(options);
        checkPath(path);
        const entry = await entryFor(method, path, body, options);
        const queue = ctx.queue();
        if (queue.pending() === 0) {
            const outcome = await send(fetch, entry);
            const kind = classify(outcome.status);
            if (kind === 'ok') return finish(entry, outcome);
            if (kind !== 'unreachable') throw refusal(outcome);
        }
        const preview = method === 'POST' && typeof options.optimistic === 'function' ? options.optimistic : null;
        if (preview) entry.optimistic = true; // stored with the edit: a refusal then knows the copies were amended
        await queue.add(entry);
        if (method !== 'POST' || preview) await optimistic(method, path, body, preview);
        ctx.kick();
        return { ok: true, queued: true, status: 0, data: null, rev: null };
    }

    return {
        afterWrite,
        restore,
        put: (path, body, options) => write('PUT', path, body, options),
        patch: (path, body, options) => write('PATCH', path, body, options),
        post: (path, body, options) => write('POST', path, body, options),
        delete: (path, options) => write('DELETE', path, undefined, options),
    };
}
