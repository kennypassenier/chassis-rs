// The keyboard of the text box: Enter and Escape, Alt+Down to open, arrows through the list, and stepping the time.

import { getStrings } from '../strings.js';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR } from './constants.js';
import { hasSeconds, stepOf } from './attributes.js';
import { parseTimeOfDay, stepTime, timeInWindow } from './parse.js';

/** @typedef {import('./field.js').TimeField} TimeField */

/** Enter: pick the active option when the list is open, else read the text and let the form go on if it is good. @param {TimeField} field @param {KeyboardEvent} event */
function onEnter(field, event) {
    const { list, input } = field;
    if (list.open) {
        event.preventDefault();
        const option = /** @type {HTMLElement | undefined} */ ([...list.popup.querySelectorAll('.kp-time__option')][list.active]);
        if (option) field.pick(option.getAttribute('data-kp-time-pick') ?? '');
        return;
    }
    // In a sentence or a form, Enter reads the text first and then lets the form go on.
    if (!field.commitText(input.value)) event.preventDefault();
}

/** Escape closes the list and keeps the key from the page. @param {TimeField} field @param {KeyboardEvent} event */
function onEscape(field, event) {
    if (!field.list.open) return;
    event.preventDefault();
    event.stopPropagation();
    field.list.close({ focus: true });
}

/**
 * Step the time from what is typed (a half-written time steps from where the person is), skipping to the next step inside the window.
 * @param {TimeField} field @param {KeyboardEvent} event @param {boolean} up
 */
function stepValue(field, event, up) {
    const { root, input } = field;
    const amount = event.key.startsWith('Page') || event.shiftKey ? MINUTES_PER_HOUR : stepOf(root);
    const typed = parseTimeOfDay(input.value, { seconds: hasSeconds(root) });
    const from = typed ? typed.value : field.value;
    const result = stepTime(from, up ? 1 : -1, amount);
    const min = root.getAttribute('data-kp-time-min');
    const max = root.getAttribute('data-kp-time-max');
    let next = result.value;
    if ((min || max) && !timeInWindow(next, min, max)) {
        // Skip to the next step inside the window.
        let tries = 0;
        while (!timeInWindow(next, min, max) && tries < MINUTES_PER_DAY / amount + 1) {
            next = stepTime(next, up ? 1 : -1, amount).value;
            tries += 1;
        }
    }
    field.setInvalid('');
    field.write(hasSeconds(root) ? `${next}:00` : next);
    input.select();
    if (result.wrapped) field.say(up ? getStrings().timeWrappedNext(next) : getStrings().timeWrappedPrevious(next));
}

/** @param {TimeField} field @param {KeyboardEvent} event */
export function onKey(field, event) {
    if (event.key === 'Enter') return onEnter(field, event);
    if (event.key === 'Escape') return onEscape(field, event);
    if (event.key === 'ArrowDown' && event.altKey) {
        event.preventDefault();
        return field.list.show();
    }
    const up = event.key === 'ArrowUp' || event.key === 'PageUp';
    const down = event.key === 'ArrowDown' || event.key === 'PageDown';
    if (!up && !down) return;
    event.preventDefault();
    const { list } = field;
    if (list.open && event.key.startsWith('Arrow')) {
        const options = list.popup.querySelectorAll('.kp-time__option');
        list.active = Math.max(0, Math.min(options.length - 1, list.active + (down ? 1 : -1)));
        list.markActive();
        return;
    }
    stepValue(field, event, up);
}
