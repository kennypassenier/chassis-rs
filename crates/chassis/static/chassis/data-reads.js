// The client's GET: the service first, the stored copy when it cannot be
// reached (feat-offline-3, split out of data-client.js; no behaviour change).

import { checkPath, matchRoute } from './data-config.js';
import { classify } from './data-policy.js';
import { revOf } from './data-rev.js';
import { storable } from './data-trim.js';
import { send } from './data-send.js';
import { fail, refusal } from './data-errors.js';

/** `ctx` = { config, cache, fetch, settings: () => current settings }. */
export function createReads(ctx) {
    const { config, cache, fetch } = ctx;

    /**
     * The answer the app already holds (`options.from`: a Response, or a promise of one, e.g. a
     * fetch started early in the page head). Used only when it is a good answer for the same
     * URL; otherwise null and the normal request goes out. Never silent about a mismatch.
     */
    async function seeded(path, from) {
        let res = null;
        try {
            res = await from;
        } catch (err) {
            console.warn(`chassisData: the early answer for ${path} failed (${err?.message}); asking the service.`);
            return null;
        }
        if (!res || typeof res.json !== 'function') return null;
        if (res.url) {
            const url = new URL(res.url, 'http://x');
            if (`${url.pathname}${url.search}` !== path) {
                console.warn(`chassisData: the early answer is for ${res.url}, not ${path}; asking the service.`);
                return null;
            }
        }
        if (classify(res.status) !== 'ok' || res.bodyUsed) return null;
        const body = await res.json().catch(() => null);
        return { status: res.status, body, etag: res.headers?.get?.('etag') ?? null };
    }

    /** `options.from`: an answer the app already has for `path`, used instead of the first request. */
    async function get(path, options = {}) {
        checkPath(path);
        const early = options.from === undefined ? null : await seeded(path, options.from);
        const outcome = early ?? (await send(fetch, { method: 'GET', path }));
        const route = matchRoute(config, path);
        const kind = classify(outcome.status);
        if (kind === 'ok') return answered(path, route, outcome);
        if (kind === 'rejected' && (outcome.status === 404 || outcome.status === 410)) await ctx.reconcile.gone(path); // deleted on the server: so is the copy
        if (kind !== 'unreachable') throw refusal(outcome);
        const copy = route ? await cache.read(path) : null;
        if (!copy) throw fail('the service cannot be reached and there is no offline copy of this page.', { status: 0, offline: true });
        return { data: copy.data, rev: copy.rev, offline: true, partial: copy.partial === true, savedAt: copy.savedAt };
    }

    async function answered(path, route, outcome) {
        const rev = revOf(outcome.body, outcome.etag, config.rev);
        const keep = storable(config, ctx.settings(), route, path, outcome.body);
        // Replaced whole, never merged: the server's answer is the copy.
        if (keep) await cache.remember(path, keep.data, rev, keep.partial);
        if (route?.kind === 'list') await ctx.reconcile.listAnswered(route, path, outcome.body);
        return { data: outcome.body, rev, offline: false, partial: false, savedAt: null };
    }

    return { get };
}
