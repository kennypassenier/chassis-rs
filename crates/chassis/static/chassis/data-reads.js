// The client's GET: the service first, the stored copy when it cannot be
// reached (feat-offline-3, split out of data-client.js; no behaviour change).

import { checkPath, matchRoute } from './data-config.js';
import { classify } from './data-policy.js';
import { revOf } from './data-rev.js';
import { shouldKeep } from './data-keep.js';
import { send } from './data-send.js';
import { fail, refusal } from './data-errors.js';

/** `ctx` = { config, cache, fetch, settings: () => current settings }. */
export function createReads(ctx) {
    const { config, cache, fetch } = ctx;

    async function get(path) {
        checkPath(path);
        const outcome = await send(fetch, { method: 'GET', path });
        const route = matchRoute(config, path);
        const kind = classify(outcome.status);
        if (kind === 'ok') return answered(path, route, outcome);
        if (kind !== 'unreachable') throw refusal(outcome);
        const copy = route ? await cache.read(path) : null;
        if (!copy) throw fail('the service cannot be reached and there is no offline copy of this page.', { status: 0, offline: true });
        return { data: copy.data, rev: copy.rev, offline: true, savedAt: copy.savedAt };
    }

    async function answered(path, route, outcome) {
        const rev = revOf(outcome.body, outcome.etag, config.rev);
        if (shouldKeep(ctx.settings(), route, path)) await cache.remember(path, outcome.body, rev);
        return { data: outcome.body, rev, offline: false, savedAt: null };
    }

    return { get };
}
