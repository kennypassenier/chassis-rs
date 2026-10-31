// The attention band, kept worst first [scope-143].
//
// `.kp-attention` holds one `.kp-attention__item` per problem, each with the
// action that fixes it, and takes no room at all when it holds none (the
// stylesheet does that). The items are ranked by `data-kp-severity`
// (critical, warning, info); this module keeps that order in the DOM itself,
// so a screen reader meets the problems in the order the eye does, and a
// problem added later lands in its place rather than at the bottom. Nothing
// runs on import; attachAttention(root) returns a detach.
//
// A live page builds its band after the boot and refreshes it on every poll
// (the homelab dashboard, port spec item F). attachAttention() therefore also
// picks up bands added later and lets go of bands that leave, and
// setAttention(band, items) updates a band by each item's key: an unchanged
// item stays the same element, so an alert is announced once rather than on
// every poll, and a focused fix button keeps its focus.

// The module is a facade [closure-pattern B, Kenny 2026-10-30]: the item painting, the set-by-key placing and the AttentionWatch
// controller live in js/attention/, listed in js/README.md.

import { watchAttention } from './attention/watch.js';

export { ATTENTION, SEVERITIES } from './attention/values.js';
export { sortAttention, setAttention } from './attention/set.js';

/**
 * One problem on the band.
 * @typedef {object} AttentionItem
 * @property {string} key its stable id (`data-kp-key`): the same key is the same element on every refresh
 * @property {'critical' | 'warning' | 'info'} severity
 * @property {string} title the problem, in one line
 * @property {string} [text] one sentence more
 * @property {Node | null} [action] the fix (a button or a link). Left out, a kept item keeps the action it has; `null` removes it. A new node equal in markup to the one shown (`isEqualNode`) keeps the one shown, so its focus and listeners survive a refresh.
 * @property {string} [srSeverity] the word a screen reader hears before the title, in place of the dictionary's
 */

/**
 * Keep every attention band under `root` worst first, now and whenever an
 * item arrives or changes severity. A band added under `root` later is
 * sorted as it arrives and watched from then on; a band that leaves the
 * page is let go (its watcher disconnected). The band hides itself in CSS
 * when it holds nothing.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachAttention(root = document) {
    return watchAttention(root);
}
