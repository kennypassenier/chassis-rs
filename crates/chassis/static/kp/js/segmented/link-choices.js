// What a chip group tied to a field knows about the field's choices: which the most used are, which the chips stand for, and whether the field is still needed.
// Pure except `choicesOf`, which reads the field's options.

import { OPTION_SELECTOR } from '../listbox/values.js';
import { labelOf } from '../combobox/helpers.js';

/** The number of chips made from the field's most used choices, or `all`; absent: the chips the page wrote. */
export const TOP_ATTRIBUTE = 'data-kp-segmented-top';
/** `auto` (default): the field is left out while every choice is a chip; `always`: the field stays. */
export const FIELD_ATTRIBUTE = 'data-kp-segmented-field';
/** On an option: how often it is chosen, for the order of the chips (absent: 0, so the list's own order decides). */
export const USES_ATTRIBUTE = 'data-kp-uses';

/** @typedef {{ value: string, label: string, uses: number }} Choice */

/**
 * Each value once, the first one winning: a list that is closing is drawn twice for a moment (the motion layer leaves a copy of it), and its options
 * must not become two chips.
 * @param {readonly Choice[]} choices
 * @returns {Choice[]}
 */
export function uniqueChoices(choices) {
    const seen = new Set();
    return choices.filter((choice) => !seen.has(choice.value) && seen.add(choice.value));
}

/**
 * The choices of a field, in the order of its list.
 * @param {Element} combobox
 * @returns {Choice[]}
 */
export function choicesOf(combobox) {
    return uniqueChoices(
        [...combobox.querySelectorAll(OPTION_SELECTOR)].map((element) => {
            const option = /** @type {HTMLElement} */ (element);
            const label = labelOf(option);
            const uses = Number(option.getAttribute(USES_ATTRIBUTE));
            return { value: option.dataset.value ?? label, label, uses: Number.isFinite(uses) ? uses : 0 };
        }),
    );
}

/**
 * How many chips `data-kp-segmented-top` asks for.
 * @param {string | null} raw  the attribute's text
 * @param {number} total  how many choices the field has
 * @returns {number | null}  null when the page wrote the chips itself
 * @throws {RangeError} when the text is neither `all` nor a whole number above zero
 */
export function chipCount(raw, total) {
    if (raw === null) return null;
    const text = raw.trim().toLowerCase();
    if (text === 'all') return total;
    if (!/^\d+$/.test(text) || Number(text) < 1) throw new RangeError(`${TOP_ATTRIBUTE}="${raw}": expected "all" or a whole number above zero`);
    return Math.min(Number(text), total);
}

/**
 * The `count` most used choices, most used first; equal uses keep the order of the list. Every choice is a chip: the list's own order.
 * @param {readonly Choice[]} choices @param {number} count
 * @returns {Choice[]}
 */
export function mostUsed(choices, count) {
    if (count >= choices.length) return [...choices];
    return choices
        .map((choice, at) => ({ choice, at }))
        .sort((a, b) => b.choice.uses - a.choice.uses || a.at - b.at)
        .slice(0, count)
        .map(({ choice }) => choice);
}

/**
 * The choice that some typed text names: by its label, or by its value, in any case.
 * @param {readonly Choice[]} choices @param {string} text
 * @returns {Choice | null}
 */
export function choiceNamed(choices, text) {
    const words = text.trim().toLowerCase();
    if (words === '') return null;
    return choices.find((choice) => choice.label.toLowerCase() === words || choice.value.toLowerCase() === words) ?? null;
}

/**
 * Whether the field is still needed: it is while some choice has no chip, or when the page asked for it always.
 * @param {readonly Choice[]} choices @param {ReadonlySet<string>} chipValues @param {string | null} mode  `data-kp-segmented-field`
 */
export function fieldNeeded(choices, chipValues, mode) {
    if (mode?.trim().toLowerCase() === 'always') return true;
    return choices.some((choice) => !chipValues.has(choice.value));
}
