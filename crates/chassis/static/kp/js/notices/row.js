// One notice row and one source switch, as the controller renders them.

import { setAgo } from '../freshness.js';
import { make } from './parts.js';

/** @typedef {import('../notices.js').Notice} Notice */
/** @typedef {import('../notices.js').NoticeSource} NoticeSource */
/** @typedef {ReturnType<typeof import('../strings.js').getStrings>} Strings */

/** @param {Strings} t @param {Notice['severity']} severity */
const severityWord = (t, severity) =>
    severity === 'critical' ? t.attentionCritical : severity === 'warning' ? t.attentionWarning : t.attentionInfo;

/**
 * The Mark read / Mark unread button. Same function, same place [Kenny, 2026-10-17 22:09]: it is the first slot of the actions
 * grid in every row, the fix (when the notice has one) the second, so the buttons stand under each other. The button is as wide
 * as the longer of its two words in the button's own type, so it never spills and the second slot starts in the same place in
 * every row, whichever word a row shows [t56-words-1018].
 * @param {Document} doc @param {Strings} t @param {string} key @param {boolean} read
 */
function markButton(doc, t, key, read) {
    const mine = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-button--sm kp-button--ghost kp-notices__mark-read'));
    const face = make(doc, 'span', 'kp-notices__mark-face');
    face.style.setProperty('--kp-notices-sizer', JSON.stringify(read ? t.noticesMarkRead : t.noticesMarkUnread));
    face.append(make(doc, 'span', 'kp-notices__mark-label', read ? t.noticesMarkUnread : t.noticesMarkRead));
    mine.append(face);
    mine.type = 'button';
    mine.setAttribute('data-kp-notice-read', key);
    return mine;
}

/**
 * One notice: its mark, what happened since when, what it affects and what to do, and its actions.
 * @param {Document} doc @param {Strings} t @param {Notice} n @param {boolean} read
 */
export function noticeRow(doc, t, n, read) {
    const li = make(doc, 'li', 'kp-notices__item');
    li.setAttribute('data-kp-key', n.key);
    li.setAttribute('data-kp-severity', n.severity);
    li.toggleAttribute('data-kp-unread', !read);
    li.tabIndex = 0;
    const mark = make(doc, 'span', 'kp-notices__mark', n.severity === 'info' ? 'i' : '!');
    mark.setAttribute('aria-hidden', 'true');
    const text = make(doc, 'div', 'kp-notices__text');
    const title = make(doc, 'strong', 'kp-notices__title');
    title.append(make(doc, 'span', 'kp-sr-only', `${severityWord(t, n.severity)}: `), n.title);
    const since = make(doc, 'time', 'kp-ago kp-notices__since');
    since.setAttribute('data-kp-ago', '');
    since.setAttribute('data-kp-ago-verb', t.noticesSinceVerb);
    text.append(title, since);
    if (n.consequence) text.append(make(doc, 'span', 'kp-notices__consequence', n.consequence));
    if (n.remedy) text.append(make(doc, 'span', 'kp-notices__remedy', n.remedy));
    const actions = make(doc, 'div', 'kp-notices__actions');
    actions.append(markButton(doc, t, n.key, read));
    if (n.fix) {
        const fix = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-button--sm kp-notices__fix', n.fix.label));
        fix.type = 'button';
        fix.setAttribute('data-kp-notice-fix', n.key);
        actions.append(fix);
    }
    li.append(mark, text, actions);
    setAgo(since, n.since);
    return li;
}

/**
 * A switch that mutes one source.
 * @param {Document} doc @param {Strings} t @param {NoticeSource} src
 */
export function sourceSwitch(doc, t, src) {
    const label = make(doc, 'label', 'kp-switch kp-notices__source');
    const input = /** @type {HTMLInputElement} */ (make(doc, 'input', 'kp-switch__input'));
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.checked = src.muted === true;
    input.setAttribute('data-kp-source', src.key);
    const words = make(doc, 'span', 'kp-notices__source-label', src.label);
    label.append(input, words, make(doc, 'span', 'kp-notices__source-state', input.checked ? t.noticesMuted : t.noticesNotMuted));
    return label;
}
