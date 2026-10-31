// Picking, unpicking and adding a name.
import { OPTION_SELECTOR } from '../listbox.js';
import { say } from './model.js';
/** @typedef {import('./types.js').UsualModel} UsualModel */

/** Where a value came from. @param {UsualModel} m @param {string} value @returns {'usual' | 'all' | 'pinned'} */
export function originOf(m, value) {
    const row = /** @type {HTMLElement[]} */ ([...m.list.querySelectorAll(OPTION_SELECTOR)]).find((o) => o.dataset.value === value);
    if (row?.hasAttribute('data-kp-pinned')) return 'pinned';
    return row?.hasAttribute('data-kp-band') ? 'usual' : 'all';
}

/** Say something on the status line after the combobox has written its own count. @param {UsualModel} m @param {string} text */
export const sayAfter = (m, text) => window.setTimeout(() => say(m, text), 0);

/**
 * Light up the tag of a value for a moment: the answer to a pick, an add or a name typed that is already picked, where the
 * eyes are (the row of tags right above the field). A ring in the theme's own focus colour, switched on and off, never eased;
 * held still under reduced motion.
 * @param {UsualModel} m @param {string} value
 */
export function flashTag(m, value) {
    const tag = /** @type {HTMLElement | null} */ (m.box.querySelector(`.kp-tag[data-value="${CSS.escape(value)}"]`));
    if (!tag) return;
    tag.removeAttribute('data-kp-usual-flash');
    void tag.offsetWidth;
    tag.setAttribute('data-kp-usual-flash', '');
    window.setTimeout(() => tag.removeAttribute('data-kp-usual-flash'), 1300);
}

/** @param {UsualModel} m @param {string} value @param {'typed' | 'usual' | 'all' | 'pinned'} from */
export function pick(m, value, from) {
    m.nextFrom = from;
    const tags = m.box.hasAttribute('data-kp-tags');
    // The field is emptied first: a list closing while it still held the typed name drew "… is already picked" in its
    // closing frames, about the name just picked.
    if (tags) m.input.value = '';
    if (tags) m.handle.set([...m.handle.values().filter((v) => v !== value), value]);
    else m.handle.set([value]);
    m.handle.close();
    m.input.value = tags ? '' : (m.items.find((i) => i.value === value)?.label ?? m.input.value);
    m.handle.refresh();
    flashTag(m, value);
}

/** Take a value out of the picks without a pick event (the check's "Not today", or pressing "Had it" again). @param {UsualModel} m @param {string} value */
export function unpick(m, value) {
    m.silent = true;
    try {
        m.handle.set(m.handle.values().filter((v) => v !== value));
    } finally {
        m.silent = false;
    }
}
