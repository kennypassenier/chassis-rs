// Element lookups and the markup of one step.
import { buildProgressbar } from '../progressbar.js';
import { getStrings } from '../strings.js';
import { focusState } from './state.js';
import { STATES } from './constants.js';
/** @typedef {import('./constants.js').FocusState} FocusState */

/** @param {string} className @param {string} [tag] */
export const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};
/** @param {Element} root @returns {FocusState} */
export const stateOf = (root) => {
    let state = STATES.get(root);
    if (!state) {
        state = {
            steps: [],
            index: 0,
            wake: null,
            wakeState: 'off',
            busy: null,
            answers: {},
            draft: {},
            timer: 0,
            startedAt: 0,
            pendingResume: null,
            finished: null,
            tracks: [],
            track: '',
            done: new Set(),
            alerts: new Map(),
            waiting: new Set(),
            lockKey: '',
            ticker: 0,
        };
        STATES.set(root, state);
    }
    return state;
};
/** @param {Element} root @param {string} name @returns {HTMLElement} */
export const part = (root, name) => /** @type {HTMLElement} */ (root.querySelector(`.kp-focus-steps__${name}`));
/** Lay the parts once. @param {HTMLElement} root */
export function build(root) {
    if (root.querySelector('.kp-focus-steps__head')) return;
    const strings = getStrings();
    focusState.serial += 1;
    const head = el('kp-focus-steps__head');
    const count = el('kp-focus-steps__count');
    count.id = `kp-focus-steps-${focusState.serial}-count`;
    const bar = el('kp-progressbar kp-focus-steps__bar');
    bar.setAttribute('aria-hidden', 'true');
    buildProgressbar(bar);
    bar.removeAttribute('role');
    const tools = el('kp-focus-steps__tools');
    const wake = el('kp-focus-steps__wake', 'span');
    const speak = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm kp-focus-steps__speak', 'button'));
    speak.type = 'button';
    const said = el('kp-focus-steps__speak-text', 'span');
    said.textContent = strings.focusReadAloud;
    said.setAttribute('data-kp-words', `${strings.focusReadAloud}\n${strings.focusStopReading}`);
    speak.append(said);
    speak.setAttribute('aria-pressed', 'false');
    speak.hidden = typeof speechSynthesis === 'undefined';
    tools.append(wake, speak);
    head.append(count, tools, bar);
    const body = el('kp-focus-steps__body');
    const step = el('kp-focus-steps__step', 'article');
    step.setAttribute('aria-labelledby', count.id);
    step.tabIndex = -1;
    body.append(step);
    const nav = el('kp-focus-steps__nav');
    const prev = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--lg kp-focus-steps__prev', 'button'));
    prev.type = 'button';
    const next = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--lg kp-button--primary kp-focus-steps__next', 'button'));
    next.type = 'button';
    for (const [button, word, glyph] of /** @type {const} */ ([
        [prev, strings.focusPrevious, 'prev'],
        [next, strings.focusNext, 'next'],
    ])) {
        const mark = el(`kp-focus-steps__glyph kp-focus-steps__glyph--${glyph}`, 'span');
        mark.setAttribute('aria-hidden', 'true');
        const text = el('kp-button__text', 'span');
        text.textContent = word;
        if (glyph === 'prev') button.append(mark, text);
        else button.append(text, mark);
    }
    nav.append(prev, next);
    const live = el('kp-sr-only kp-focus-steps__live', 'span');
    live.setAttribute('role', 'status');
    root.append(head, body, nav, live);
    if (!root.hasAttribute('role')) root.setAttribute('role', 'region');
    if (root.tabIndex < 0 && !root.hasAttribute('tabindex')) root.tabIndex = -1;
}
