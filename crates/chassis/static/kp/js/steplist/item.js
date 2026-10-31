// A step: its mark, spoken state and `aria-current` brought in step with its `data-state`, and a change announced.

import { getStrings } from '../strings.js';
import { STEPLIST_EVENT, STEPLIST_SELECTOR, STEP_ID_ATTRIBUTE } from './values.js';
import { known, span } from './dom.js';
import { say } from './region.js';

/** @typedef {import('../steplist.js').StepState} StepState */

/** @param {StepState} state */
const stateWord = (state) => {
    const s = getStrings();
    return { pending: s.stepPending, running: s.stepRunning, done: s.stepDone, failed: s.stepFailed, skipped: s.stepSkipped, current: s.stepCurrent }[
        state
    ];
};

/** One step of a list, and the state it was last synced to, to tell a change from a first sync. */
export class StepItem {
    /** @param {Element} item */
    constructor(item) {
        this.item = item;
        /** @type {StepState | undefined} */
        this.state = undefined;
    }

    /**
     * Bring the item's mark, spoken state and `aria-current` in step with its
     * `data-state`, and announce a change.
     *
     * @param {{ announce?: boolean }} [options]
     * @returns {StepState}
     */
    sync({ announce = false } = {}) {
        const { item } = this;
        const state = known(item.getAttribute('data-state'));
        if (item.getAttribute('data-state') !== state) item.setAttribute('data-state', state);
        this.drawMark(state);
        this.speak(state);
        if (state === 'running' || state === 'current') item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');

        const previous = this.state;
        this.state = state;
        const list = item.closest(STEPLIST_SELECTOR);
        if (list && announce && previous !== undefined && previous !== state) this.announce(list, state, previous);
        return state;
    }

    /** The mark, with the theme's spinner on the running step. @param {StepState} state */
    drawMark(state) {
        let mark = this.item.querySelector(':scope > .kp-steplist__mark');
        if (!mark) {
            mark = span('kp-steplist__mark');
            this.item.prepend(mark);
        }
        mark.setAttribute('aria-hidden', 'true');
        const spinning = mark.querySelector('.kp-spinner');
        if (state === 'running' && !spinning) {
            const spinner = span('kp-spinner');
            spinner.setAttribute('aria-hidden', 'true');
            mark.append(spinner);
        } else if (state !== 'running' && spinning) spinning.remove();
    }

    /** The state's word, visually hidden, after the title. @param {StepState} state */
    speak(state) {
        const body = this.item.querySelector('.kp-steplist__body') ?? this.item;
        let word = this.item.querySelector('.kp-steplist__state');
        if (!word) {
            word = span('kp-steplist__state');
            body.append(word);
        }
        // ", done" after the title: the comma makes the reader pause.
        word.textContent = `, ${stateWord(state)}`;
    }

    /** @param {Element} list @param {StepState} state @param {StepState} previous */
    announce(list, state, previous) {
        const { item } = this;
        const title = item.querySelector('.kp-steplist__title')?.textContent?.trim() ?? '';
        say(list, getStrings().stepAnnounce(title, stateWord(state)));
        list.dispatchEvent(
            new CustomEvent(STEPLIST_EVENT, {
                bubbles: true,
                detail: { item, id: item.getAttribute(STEP_ID_ATTRIBUTE), state, previous },
            }),
        );
    }
}

/** The sync of each item, made at the first look. @type {WeakMap<Element, StepItem>} */
const steps = new WeakMap();

/**
 * Sync an item (see StepItem.sync()).
 * @param {Element} item
 * @param {{ announce?: boolean }} [options]
 * @returns {StepState}
 */
export function syncItem(item, options) {
    let step = steps.get(item);
    if (!step) steps.set(item, (step = new StepItem(item)));
    return step.sync(options);
}
