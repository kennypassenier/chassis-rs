// Pure helpers: the chord parser, list splitting, slide timing and name lookups.
import { handles } from './constants.js';

/**
 * A key chord as written on the panel: `Control+b`, `Mod+Shift+k`, `Alt+n`.
 * `Control` and `Mod` are the platform's command key: Meta on a Mac.
 *
 * @param {string} chord
 * @param {boolean} mac
 */
export function parseChord(chord, mac) {
    const parts = chord
        .split('+')
        .map((part) => part.trim())
        .filter(Boolean);
    const key = (parts.pop() ?? '').toLowerCase();
    const mods = new Set(parts.map((part) => part.toLowerCase()));
    const command = mods.has('control') || mods.has('ctrl') || mods.has('mod');
    return {
        key,
        ctrl: command && !mac,
        meta: (command && mac) || mods.has('meta'),
        alt: mods.has('alt') || mods.has('option'),
        shift: mods.has('shift'),
        /** The same chord as `aria-keyshortcuts` writes it. */
        aria: [
            ...(command ? [mac ? 'Meta' : 'Control'] : []),
            ...(mods.has('meta') && !command ? ['Meta'] : []),
            ...(mods.has('alt') || mods.has('option') ? ['Alt'] : []),
            ...(mods.has('shift') ? ['Shift'] : []),
            key.length === 1 ? key.toUpperCase() : key,
        ].join('+'),
    };
}
/** Whether a key press belongs to a text field rather than to the page. @param {EventTarget | null} target */
export function typing(target) {
    if (!(target instanceof Element)) return false;
    return target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}
/**
 * Split a computed list at its top-level commas: a timing function such as
 * `cubic-bezier(0.2, 0, 0, 1)` holds commas of its own.
 *
 * @param {string} list
 * @returns {string[]}
 */
function splitList(list) {
    /** @type {string[]} */
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < list.length; i += 1) {
        const c = list[i];
        if (c === '(') depth += 1;
        else if (c === ')') depth -= 1;
        else if (c === ',' && depth === 0) {
            out.push(list.slice(start, i).trim());
            start = i + 1;
        }
    }
    out.push(list.slice(start).trim());
    return out;
}
/**
 * The time, curve and delay the panel moves its `translate` on, as its
 * computed style says right now (so after a state flip, the curve of the
 * state it goes to: a theme's own close curve, or the opening's turned
 * around). A panel with no transition on it gives `0s`.
 *
 * @param {Element} panel
 */
export function slideTiming(panel) {
    const style = getComputedStyle(panel);
    const names = splitList(style.transitionProperty);
    let at = names.indexOf('translate');
    if (at === -1) at = names.indexOf('all');
    if (at === -1) return { duration: '0s', ease: 'linear', delay: '0s' };
    const pick = (/** @type {string} */ list) => {
        const parts = splitList(list);
        return parts[at % parts.length] ?? '';
    };
    return {
        duration: pick(style.transitionDuration) || '0s',
        ease: pick(style.transitionTimingFunction) || 'linear',
        delay: pick(style.transitionDelay) || '0s',
    };
}
/**
 * @typedef {object} Sidenav
 * @property {HTMLElement} element
 * @property {(options?: { remember?: boolean }) => void} open
 * @property {(options?: { remember?: boolean }) => void} close  `{ remember: false }` for a close the reader did not ask for — a layout adapting to the room it has
 * @property {(options?: { remember?: boolean }) => void} toggle
 * @property {(mode: 'over' | 'side' | 'push') => void} setMode
 * @property {(collapsed?: boolean) => void} setSlim
 * @property {() => boolean} isOpen
 * @property {() => void} destroy
 */

/**
 * The handle for one panel, or undefined when it was never attached.
 *
 * @param {Element | null} element
 * @returns {Sidenav | undefined}
 */
export function sidenavOf(element) {
    return element === null ? undefined : handles.get(element);
}
/**
 * Whether a toggler has no name of its own, so the module gives it one.
 *
 * A toggler that already carries `aria-label` is renamed as the state
 * changes; one with words in it keeps them. What counts as words is what a
 * screen reader would read: a button holding only an `aria-hidden` glyph —
 * the arrow a rail toggle usually is — has text content and no name, and
 * was left as a bare "button" [scope-48].
 *
 * @param {Element} toggler
 */
export function wantsName(toggler) {
    if (toggler.getAttribute('aria-label') !== null) return true;
    const clone = /** @type {Element} */ (toggler.cloneNode(true));
    for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
    return (clone.textContent ?? '').trim() === '';
}
export const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
