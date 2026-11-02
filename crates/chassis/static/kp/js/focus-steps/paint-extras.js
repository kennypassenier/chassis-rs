// The extra parts of a shown step: the wait with the button to the track that can go on, the ingredients, and the timer's start button.
import { getStrings } from '../strings.js';
import { focusState } from './state.js';
import { el } from './dom.js';
import { timerIdOf } from './tracks.js';
import { blockerNames, laneSummaries } from './blockers.js';
import { suggestion, waitLine } from './band.js';

/**
 * The step waits: what for, how long, and the button to the track that can go on.
 * @param {HTMLElement} root @param {HTMLElement} holder @param {import('./constants.js').FocusState} state
 * @param {ReturnType<typeof import('./blockers.js').blockersOf>} blocks @param {ReturnType<typeof import('./tracks.js').timerStates>} timers @param {number} index
 */
export function waitBlock(root, holder, state, blocks, timers, index) {
    const strings = getStrings();
    // The step waits: what for, how long, and the button to the track that can go on.
    holder.setAttribute('data-kp-focus-steps-locked', '');
    const wait = el('kp-alert kp-alert--info kp-focus-steps__wait', 'div');
    wait.setAttribute('role', 'status');
    const what = el('kp-focus-steps__wait-text');
    const title = el('kp-focus-steps__wait-title', 'strong');
    title.textContent = strings.focusTrackWaitTitle(blockerNames(state, blocks));
    const line = el('kp-focus-steps__wait-line', 'span');
    line.textContent = waitLine(state, blocks, timers, index);
    what.append(title, line);
    wait.append(what);
    const next = suggestion(laneSummaries(root));
    if (next) {
        const go = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--primary kp-focus-steps__wait-go', 'button'));
        go.type = 'button';
        go.setAttribute('data-kp-focus-go', String(state.tracks.indexOf(next.track)));
        go.textContent = strings.focusTrackGo(next.name);
        wait.append(go);
    }
    holder.append(wait);

}

/** The ingredients a step needs, as a labelled list. @param {NonNullable<import('./constants.js').FocusStep['ingredients']>} ingredients */
export function needsList(ingredients) {
    const strings = getStrings();
    const needs = el('kp-focus-steps__needs', 'section');
    const title = el('kp-focus-steps__needs-title', 'h3');
    focusState.serial += 1;
    title.id = `kp-focus-steps-${focusState.serial}-needs`;
    title.textContent = strings.focusNeeds;
    needs.setAttribute('aria-labelledby', title.id);
    const list = el('kp-focus-steps__needs-list', 'ul');
    for (const item of ingredients) {
        const row = el('kp-focus-steps__need', 'li');
        const { name, amount } = typeof item === 'string' ? { name: item, amount: '' } : item;
        const a = el('kp-focus-steps__amount', 'span');
        a.textContent = amount ?? '';
        const n = el('kp-focus-steps__name', 'span');
        n.textContent = name;
        row.append(a, n);
        list.append(row);
    }
    needs.append(title, list);
    return needs;

}

/** The start button of a step's timer. @param {HTMLElement} root @param {import('./constants.js').FocusState} state @param {NonNullable<import('./constants.js').FocusStep['timer']>} timer @param {boolean} blocked @param {number} index @param {number} total */
export function timerButton(root, state, timer, blocked, index, total) {
    const strings = getStrings();
    const minutes = Math.round(timer.seconds / 60);
    const button = /** @type {HTMLButtonElement} */ (el('kp-button kp-focus-steps__timer', 'button'));
    button.type = 'button';
    button.setAttribute('data-kp-timer-start', String(timer.seconds));
    button.setAttribute('data-kp-timer-name', timer.name ?? strings.focusCount(index + 1, total));
    // The timer has an id of its own, so the timer list, the lanes and a page that watches it name the same one.
    button.setAttribute('data-kp-timer-id', timerIdOf(state, index));
    if (blocked) button.setAttribute('aria-disabled', 'true');
    const list = root.getAttribute('data-kp-focus-steps-timers');
    if (list) button.setAttribute('data-kp-timer-for', list);
    button.textContent = strings.focusTimer(timer.seconds < 60 ? `${timer.seconds} s` : `${minutes} min`);
    return button;

}
