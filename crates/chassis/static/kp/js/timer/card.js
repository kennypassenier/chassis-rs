// Builds and paints one timer card.
import { getStrings } from '../strings.js';
import { buildProgressbar } from '../progressbar.js';
import { clockOf, el, leftOf } from './model.js';
import { timerState } from './state.js';
/** @typedef {import('./types.js').Timer} Timer */

/**
 * A card for a timer, its parts in place.
 * @param {string} id
 * @returns {HTMLElement}
 */
export function buildCard(id) {
    const strings = getStrings();
    const card = el('kp-timer', 'li');
    card.setAttribute('data-kp-timer-id', id);
    timerState.serial += 1;
    const head = el('kp-timer__head');
    const name = el('kp-timer__name', 'span');
    name.id = `kp-timer-${timerState.serial}-name`;
    const word = el('kp-timer__state', 'span');
    word.setAttribute('data-kp-words', [strings.timerRunning, strings.timerPaused, strings.timerDoneWord].join('\n'));
    head.append(name, word);
    const time = el('kp-timer__time');
    time.setAttribute('role', 'timer');
    time.setAttribute('aria-labelledby', name.id);
    const bar = el('kp-progressbar kp-timer__bar');
    bar.setAttribute('aria-hidden', 'true');
    buildProgressbar(bar);
    bar.removeAttribute('role');
    const actions = el('kp-timer__actions');
    const toggle = /** @type {HTMLButtonElement} */ (el('kp-button kp-timer__toggle', 'button'));
    toggle.type = 'button';
    const more = /** @type {HTMLButtonElement} */ (el('kp-button kp-timer__more', 'button'));
    more.type = 'button';
    const remove = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-timer__remove', 'button'));
    remove.type = 'button';
    const glyph = el('kp-timer__remove-glyph', 'span');
    glyph.setAttribute('aria-hidden', 'true');
    remove.append(glyph);
    // Holds the first button's column as wide as the widest of its words, in the button's own face, in every state.
    const sizer = el('kp-button kp-timer__sizer', 'span');
    sizer.setAttribute('aria-hidden', 'true');
    actions.append(sizer, toggle, more, remove);
    card.append(head, time, bar, actions);
    card.setAttribute('aria-labelledby', name.id);
    return card;
}

/** Bring a card in step with its timer. @param {Timer} timer */
export function paint(timer) {
    const strings = getStrings();
    const { card } = timer;
    const left = leftOf(timer);
    card.setAttribute('data-kp-timer-state', timer.state);
    const name = /** @type {HTMLElement} */ (card.querySelector('.kp-timer__name'));
    if (name.textContent !== timer.name) {
        name.textContent = timer.name;
        name.title = timer.name;
    }
    const word = /** @type {HTMLElement} */ (card.querySelector('.kp-timer__state'));
    word.textContent = timer.state === 'running' ? strings.timerRunning : timer.state === 'paused' ? strings.timerPaused : strings.timerDoneWord;
    const time = /** @type {HTMLElement} */ (card.querySelector('.kp-timer__time'));
    const shown = timer.state === 'done' ? strings.timerDone(timer.name) : clockOf(timer, left);
    if (time.textContent !== shown) time.textContent = shown;
    time.title = timer.state === 'done' ? shown : '';
    const bar = /** @type {HTMLElement} */ (card.querySelector('.kp-timer__bar'));
    bar.style.setProperty('--kp-value', String(timer.total > 0 ? Math.min(1, 1 - left / timer.total) : 1));
    const toggle = /** @type {HTMLButtonElement} */ (card.querySelector('.kp-timer__toggle'));
    const label = timer.state === 'running' ? strings.timerPause : timer.state === 'paused' ? strings.timerResume : strings.timerStopRing;
    if (toggle.textContent !== label) toggle.textContent = label;
    toggle.classList.toggle('kp-button--primary', timer.state === 'done');
    toggle.setAttribute('data-kp-words', [strings.timerPause, strings.timerResume, strings.timerStopRing].join('\n'));
    const sizer = /** @type {HTMLElement} */ (card.querySelector('.kp-timer__sizer'));
    const widest = [strings.timerPause, strings.timerResume, strings.timerStopRing].join('\n');
    if (sizer.textContent !== widest) sizer.textContent = widest;
    const more = /** @type {HTMLButtonElement} */ (card.querySelector('.kp-timer__more'));
    more.textContent = strings.timerAddMinute(60);
    more.setAttribute('aria-label', strings.timerAddMinuteTo(timer.name));
    const remove = /** @type {HTMLButtonElement} */ (card.querySelector('.kp-timer__remove'));
    remove.setAttribute('aria-label', strings.timerRemove(timer.name));
    remove.title = strings.timerRemove(timer.name);
}
