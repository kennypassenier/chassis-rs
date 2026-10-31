// Pure helpers: the options of a list, the order of its rows and the days a way has gone unused.

import { DAY_MS, DEFAULT_NEVER_USED_DAYS } from './constants.js';

/**
 * The options as the page wrote them: the spec first, then the attribute, then the default.
 * @param {HTMLElement} el @param {import('./constants.js').PasskeysSpec} spec
 */
export function passkeyOptions(el, spec) {
    const attr = (/** @type {string} */ name) => el.getAttribute(`data-kp-${name}`);
    const last = spec.protectLast ?? attr('protect-last');
    const confirm = spec.confirm ?? attr('confirm');
    const days = spec.neverUsedAfter ?? (attr('never-used-after') === null ? DEFAULT_NEVER_USED_DAYS : Number(attr('never-used-after')));
    return {
        protectLast: /** @type {'refuse' | 'confirm' | 'off'} */ (last === 'confirm' || last === 'off' ? last : 'refuse'),
        confirm: /** @type {'dialog' | 'type-name'} */ (confirm === 'type-name' ? 'type-name' : 'dialog'),
        refuseLook: /** @type {'button' | 'note'} */ ((spec.refuseLook ?? attr('refuse-look')) === 'note' ? 'note' : 'button'),
        markCurrent: spec.markCurrent ?? attr('mark-current') !== 'off',
        neverUsedAfter: Number.isFinite(days) && days >= 0 ? days : DEFAULT_NEVER_USED_DAYS,
    };
}

/**
 * The order of the list: the one in use first, then the most recently used,
 * a way never used last.
 * @param {readonly import('./constants.js').PasskeyRow[]} rows
 * @returns {import('./constants.js').PasskeyRow[]}
 */
export function sortPasskeys(rows) {
    return [...rows].sort(
        (a, b) =>
            Number(Boolean(b.current)) - Number(Boolean(a.current)) ||
            (b.lastUsedAt ?? -Infinity) - (a.lastUsedAt ?? -Infinity) ||
            (b.createdAt ?? 0) - (a.createdAt ?? 0),
    );
}

/**
 * Whole days a way has gone unused (since it was added when never used), or
 * null when it was used within `limit` days or the flag is off.
 * @param {import('./constants.js').PasskeyRow} row @param {number} now @param {number} limit
 * @returns {number | null}
 */
export function unusedDays(row, now, limit) {
    if (!(limit > 0)) return null;
    const since = row.lastUsedAt ?? row.createdAt;
    if (since == null || !Number.isFinite(since)) return null;
    const days = Math.floor((now - since) / DAY_MS);
    return days >= limit ? days : null;
}
