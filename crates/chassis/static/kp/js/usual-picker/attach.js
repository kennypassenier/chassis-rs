// Attaches the usual pickers of a page and the functions a page calls on one.
import { attachOne } from '../controller.js';
import { USUAL } from './constants.js';
import { bandValues, models } from './model.js';
import { render } from './sync.js';
import { UsualPickerControl } from './controller.js';
/** @typedef {import('./types.js').UsualHandle} UsualHandle */

/**
 * Wire every picker with `data-kp-usual` under `root`. The combobox it stands on is attached here (a box with the usual is
 * skipped by `attachComboboxes` until this has made it ready).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachUsualPickers(root = document) {
    const boxes = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(USUAL) ? [root] : []),
        ...root.querySelectorAll(USUAL),
    ]);
    // A picker in the registry is wired already; one whose combobox could not be wired destroyed itself and is tried again.
    /** @type {(UsualPickerControl | undefined)[]} */
    const made = [];
    for (const box of boxes) if (!models.has(box)) made.push(attachOne(box, UsualPickerControl));
    return () => {
        for (const control of made.splice(0)) control?.destroy();
    };
}

/**
 * The handle of an attached picker.
 * @param {Element} element
 * @returns {UsualHandle | null}
 */
export function usualPicker(element) {
    const m = models.get(element);
    if (!m) return null;
    return {
        element: m.box,
        setUsual: (values) => setUsual(m.box, values),
        usual: () => bandValues(m),
        notToday: () => [...m.notToday],
        setState: (state) => setUsualState(m.box, state),
        setHint: (text) => (text === '' ? m.box.removeAttribute('data-kp-hint') : m.box.setAttribute('data-kp-hint', text)),
        refresh: () => render(m),
    };
}

/**
 * Hand a picker its band: values (in order), or `{ value, uses }` which `data-kp-usual-source="counts"` ranks by uses.
 * @param {Element} element
 * @param {readonly (string | { value: string, uses?: number })[]} values
 */
export function setUsual(element, values) {
    const m = models.get(element);
    if (!m) return;
    m.given = values.map((v) => (typeof v === 'string' ? { value: v } : v));
    if (!m.box.hasAttribute('data-kp-usual')) m.box.setAttribute('data-kp-usual', '');
    render(m);
}

/**
 * The state of a picker: `loading` (the busy card in the place of the list, the input waiting), `empty`, `error` (Retry fires
 * `kp-usual-retry`; the last good list stays), `ready`.
 * @param {Element} element
 * @param {'ready' | 'loading' | 'empty' | 'error'} state
 */
export function setUsualState(element, state) {
    if (state === 'ready') element.removeAttribute('data-kp-state');
    else element.setAttribute('data-kp-state', state);
}

/**
 * The values marked "Not today".
 * @param {Element} element
 * @returns {string[]}
 */
export function usualNotToday(element) {
    return [...(models.get(element)?.notToday ?? [])];
}
