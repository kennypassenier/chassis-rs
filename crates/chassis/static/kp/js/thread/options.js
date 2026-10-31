// A thread's selector, events and time zone, its options as the page wrote them, its calendar days, and how messages
// group under one header.

import { agoMoment } from '../freshness.js';
import { getStrings } from '../strings.js';

/** @typedef {import('../thread.js').ThreadMessage} ThreadMessage */
/** @typedef {import('../thread.js').ThreadSpec} ThreadSpec */


/** A thread the page fills with setThread(). */
export const THREAD = '[data-kp-thread]';
/** Fired on the root when Retry (a failed list, or a message that was not sent) is pressed: `{ key? }`. */
export const THREAD_RETRY_EVENT = 'kp-thread-retry';
/** Fired on the root when the Add button of an empty thread is pressed. */
export const THREAD_ADD_EVENT = 'kp-thread-add';
/** Fired on the root when a message's own action is pressed: `{ key, id }`. */
export const THREAD_ACTION_EVENT = 'kp-thread-action';
/** Fired on the root when a message is folded or shown whole: `{ key, expanded }`. */
export const THREAD_FOLD_EVENT = 'kp-thread-fold';
/** The zone every time is written in. */
export const THREAD_TIME_ZONE = 'Europe/Brussels';

/** @param {Document} doc @param {string} className @param {string} [tag] */
export const make = (doc, className, tag = 'span') => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
};

/**
 * The options as the page wrote them: the spec first, then the attribute, then the default.
 * @param {HTMLElement} el @param {ThreadSpec} spec
 */
export function threadOptions(el, spec) {
    const attr = (/** @type {string} */ name) => el.getAttribute(`data-kp-thread-${name}`);
    const order = spec.order ?? attr('order');
    const foldRaw = spec.fold ?? attr('fold');
    /** @type {'newest' | 'full' | number} */
    let fold = 'newest';
    if (foldRaw === 'full' || foldRaw === 'none') fold = 'full';
    else if (typeof foldRaw === 'number' && foldRaw > 0) fold = Math.floor(foldRaw);
    else if (typeof foldRaw === 'string' && /^\d+$/.test(foldRaw) && Number(foldRaw) > 0) fold = Number(foldRaw);
    const lines = Number(spec.foldLines ?? attr('fold-lines'));
    const group = Number(spec.group ?? attr('group'));
    const avatar = spec.avatar ?? attr('avatar');
    const bubble = spec.bubble ?? attr('bubble');
    return {
        bubble: /** @type {'tinted' | 'plain' | 'filled'} */ (bubble === 'plain' || bubble === 'filled' ? bubble : 'tinted'),
        order: /** @type {'oldest' | 'newest'} */ (order === 'newest' ? 'newest' : 'oldest'),
        fold,
        foldLines: Number.isFinite(lines) && lines > 0 ? Math.floor(lines) : 3,
        group: attr('group') === null && spec.group === undefined ? 5 : Number.isFinite(group) && group >= 0 ? group : 5,
        days: spec.days ?? attr('days') !== 'off',
        avatar: /** @type {'in' | 'both' | 'none'} */ (avatar === 'both' || avatar === 'none' ? avatar : 'in'),
    };
}

/** The Brussels calendar day of a moment, as a sortable key. @param {number} ms */
export const dayKey = (ms) => agoMoment(ms, THREAD_TIME_ZONE).slice(0, 10).split('/').reverse().join('-');

/**
 * "Monday 13/10/2026".
 * @param {number} ms @param {string} locale
 */
export function dayLabel(ms, locale) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: THREAD_TIME_ZONE }).format(ms);
    return getStrings().threadDay(weekday, agoMoment(ms, THREAD_TIME_ZONE).slice(0, 10));
}

/**
 * Split messages (oldest first) into runs that share one header: the same
 * side and sender, the same day, each within `minutes` of the one before.
 * System lines stand alone.
 * @param {readonly ThreadMessage[]} messages @param {number} minutes
 * @returns {ThreadMessage[][]}
 */
export function groupMessages(messages, minutes) {
    /** @type {ThreadMessage[][]} */
    const groups = [];
    for (const message of messages) {
        const run = groups[groups.length - 1];
        const before = run?.[run.length - 1];
        const joins =
            before !== undefined &&
            message.dir !== 'system' &&
            before.dir === message.dir &&
            (before.sender ?? '') === (message.sender ?? '') &&
            dayKey(before.at) === dayKey(message.at) &&
            message.at - before.at <= minutes * 60_000 &&
            minutes > 0;
        if (joins) run.push(message);
        else groups.push([message]);
    }
    return groups;
}

/** The options an attribute of the root changes at runtime, with the spec key each one stands for. */
export const OPTION_ATTRIBUTES = /** @type {const} */ ({
    'data-kp-thread-order': 'order',
    'data-kp-thread-fold': 'fold',
    'data-kp-thread-fold-lines': 'foldLines',
    'data-kp-thread-group': 'group',
    'data-kp-thread-days': 'days',
    'data-kp-thread-avatar': 'avatar',
    'data-kp-thread-bubble': 'bubble',
});

/** How close to the newest end still counts as there [px]. */
const NEAR_PX = 24;

/** Whether the scroll box is at the newest end. @param {HTMLElement} box @param {'oldest' | 'newest'} order */
export const atNewest = (box, order) => (order === 'newest' ? box.scrollTop <= NEAR_PX : box.scrollHeight - box.clientHeight - box.scrollTop <= NEAR_PX);

