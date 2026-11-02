// The client's PUT / PATCH / DELETE: sent at once when the queue is empty and
// the service answers, queued with If-Match otherwise (feat-offline-3, split
// out of data-client.js; no behaviour change).

import { checkPath, matchRoute } from './data-config.js';
import { classify } from './data-policy.js';
import { revOf } from './data-rev.js';
import { shouldKeep } from './data-keep.js';
import { send } from './data-send.js';
import { fail, refusal } from './data-errors.js';

function checkOptions(options) {
    if (options.headers) {
        throw fail('custom headers are not accepted. The session cookie authenticates; nothing else is sent or stored.');
    }
}

/** `ctx` = { config, cache, fetch, now, settings, queue: () => queue, kick }. */
export function createWrites(ctx) {
    const { config, cache, fetch, now } = ctx;

    /** After a send went through: the copy follows the service's answer. */
    async function afterWrite(entry, rev, body) {
        const route = matchRoute(config, entry.path);
        if (!route) return;
        if (entry.method === 'DELETE') return cache.forget(entry.path);
        if (shouldKeep(ctx.settings(), route, entry.path) && body && typeof body === 'object') {
            await cache.remember(entry.path, body, rev);
        }
    }

    /** What a queued edit does to the copy, so offline reads show it. */
    function optimistic(method, path, body) {
        if (method === 'DELETE') return cache.amend(path, () => undefined);
        const merge = method === 'PATCH' ? (old) => ({ ...old, ...body }) : () => body;
        return cache.amend(path, merge);
    }

    async function finish(entry, outcome) {
        const rev = revOf(outcome.body, outcome.etag, config.rev);
        await afterWrite(entry, rev, outcome.body);
        return { ok: true, queued: false, status: outcome.status, data: outcome.body, rev };
    }

    async function write(method, path, body, options = {}) {
        checkOptions(options);
        checkPath(path);
        const held = await cache.read(path);
        const ifMatch = options.rev !== undefined ? String(options.rev) : (held?.rev ?? null);
        const entry = { method, path, body, ifMatch, at: now() };
        const queue = ctx.queue();
        if (queue.pending() === 0) {
            const outcome = await send(fetch, entry);
            const kind = classify(outcome.status);
            if (kind === 'ok') return finish(entry, outcome);
            if (kind !== 'unreachable') throw refusal(outcome);
        }
        await queue.add(entry);
        await optimistic(method, path, body);
        ctx.kick();
        return { ok: true, queued: true, status: 0, data: null, rev: null };
    }

    return {
        afterWrite,
        put: (path, body, options) => write('PUT', path, body, options),
        patch: (path, body, options) => write('PATCH', path, body, options),
        delete: (path, options) => write('DELETE', path, undefined, options),
    };
}
