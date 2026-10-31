// Strips that group: their host, joining and leaving the group card and the info mode.
import { openBusyCard } from '../busy-card.js';
import { CARDS, GROUPS, GROUP_OF, SPECS } from './state.js';

/**
 * The box that holds a group of strips, if this strip belongs to one: the nearest `[data-kp-uptime-group]` (`off` opts a strip
 * out), else the parent that holds two or more strips of its own, which is then marked `data-kp-uptime-group="auto"`. Strips of
 * a group that load together are covered by ONE busy card over the group, not by one card each [state-plates-1019].
 * @param {HTMLElement} el
 * @returns {Element | null}
 */
export function groupHost(el) {
    const marked = el.closest('[data-kp-uptime-group]');
    if (marked) return marked.getAttribute('data-kp-uptime-group') === 'off' ? null : marked;
    const parent = el.parentElement;
    if (!parent || parent.querySelectorAll(':scope > [data-kp-uptime]').length < 2) return null;
    parent.setAttribute('data-kp-uptime-group', 'auto');
    return parent;
}

/**
 * A loading strip joins its group's busy card, opening it when it is the first, and covers the strips that load now.
 * @param {HTMLElement} el @param {Element} host @param {string} words @param {boolean} first
 * @returns {import('../busy-card.js').BusyCard}
 */
export function joinGroupCard(el, host, words, first) {
    let group = GROUPS.get(host);
    if (group?.closing) {
        // A strip loads again while the card leaves: one card at a time, a new one.
        group.card.remove();
        GROUPS.delete(host);
        group = undefined;
    }
    if (!group) {
        /** @type {Set<HTMLElement>} */
        const loading = new Set();
        const card = openBusyCard(/** @type {HTMLElement} */ (host), {
            words,
            area: () => [...loading].filter((strip) => strip.isConnected),
            className: 'kp-uptime__busy kp-uptime__busy--group',
            arrive: !first,
        });
        group = { card, loading, closing: false };
        GROUPS.set(host, group);
    }
    group.loading.add(el);
    GROUP_OF.set(el, host);
    group.card.place();
    return group.card;
}

/**
 * A strip leaves its group's loading: true when it was the last, so the shared card must close before it is drawn.
 * @param {HTMLElement} el
 * @returns {{ last: boolean, card: import('../busy-card.js').BusyCard, host: Element } | null} null for a strip with no group card
 */
export function leaveGroupCard(el) {
    const host = GROUP_OF.get(el);
    if (!host) return null;
    GROUP_OF.delete(el);
    CARDS.delete(el);
    const group = GROUPS.get(host);
    if (!group) return null;
    group.loading.delete(el);
    if (group.loading.size > 0) group.card.place();
    return { last: group.loading.size === 0, card: group.card, host };
}

/** Whether a press on a cell opens its quick info. @param {HTMLElement} el */
export const infoMode = (el) => (SPECS.get(el)?.open ?? el.dataset.kpUptimeOpen) === 'info';
