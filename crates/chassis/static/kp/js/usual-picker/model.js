// The model of one picker and what it reads from its box: items, pinned values, bands and folding.
import { OPTION_SELECTOR } from '../listbox.js';
import { USUAL_FOLD_ABOVE } from './constants.js';
/** @typedef {import('./types.js').UsualModel} UsualModel */

/** @type {WeakMap<Element, UsualModel>} */
export const models = new WeakMap();

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {string} [className] @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
export const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

/** @param {UsualModel} m @param {string} name @param {string} [fallback] */
export const attr = (m, name, fallback) => m.box.getAttribute(`data-kp-${name}`) ?? fallback;
/** @param {UsualModel} m @param {string} name */
const flag = (m, name) => m.box.hasAttribute(`data-kp-${name}`) && m.box.getAttribute(`data-kp-${name}`) !== 'off';
/** @param {number} n @param {number} lo @param {number} hi */
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** The real options of the list, not the rows this module adds. @param {HTMLElement} list */
export const realOptions = (list) =>
    /** @type {HTMLElement[]} */ ([...list.querySelectorAll(OPTION_SELECTOR)]).filter(
        (o) => !o.hasAttribute('data-kp-synth') && !o.hasAttribute('data-kp-pinned'),
    );

/** @param {UsualModel} m */
export function readItems(m) {
    m.items = realOptions(m.list).map((el) => ({
        el,
        value: el.dataset.value ?? (el.textContent ?? '').trim(),
        label: (el.dataset.kpLabel ?? el.firstChild?.textContent ?? el.textContent ?? '').trim(),
    }));
}

/** The pinned choices: "Nothing to log", "Not sure". @param {UsualModel} m @returns {{ value: string, label: string }[]} */
export function readPinned(m) {
    try {
        const raw = JSON.parse(attr(m, 'pinned', '[]') ?? '[]');
        return Array.isArray(raw) ? raw.filter((p) => p && typeof p.value === 'string' && typeof p.label === 'string') : [];
    } catch {
        return [];
    }
}

/** The band's values, in the band's order, only those the list has. @param {UsualModel} m @returns {string[]} */
export function bandValues(m) {
    /** @type {{ value: string, uses?: number }[]} */
    let entries = [];
    const raw = attr(m, 'usual', '') ?? '';
    if (m.given) entries = m.given;
    else if (raw.trim().startsWith('[')) {
        try {
            const list = JSON.parse(raw);
            if (Array.isArray(list))
                entries = list.map((e) => (typeof e === 'string' ? { value: e } : { value: String(e.value), uses: Number(e.uses) || 0 }));
        } catch {
            entries = [];
        }
    } else
        entries = raw
            .split(',')
            .map((v) => ({ value: v.trim() }))
            .filter((e) => e.value !== '');
    if (attr(m, 'usual-source') === 'counts') {
        const label = (/** @type {string} */ v) => m.items.find((i) => i.value === v)?.label ?? v;
        entries = [...entries].sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0) || label(a.value).localeCompare(label(b.value)));
    }
    const have = new Set(m.items.map((i) => i.value));
    const max = clamp(Number(attr(m, 'usual-max')) || 5, 1, 7);
    return entries
        .map((e) => e.value)
        .filter((v) => have.has(v))
        .slice(0, max);
}

/** Whether the full list is folded behind "Show all N" right now. @param {UsualModel} m */
export function folded(m) {
    const mode = attr(m, 'all');
    const fold = mode === 'fold' || (mode !== 'open' && m.items.length > USUAL_FOLD_ABOVE);
    return fold && !m.expanded;
}

/** Whether the list can fold at all. @param {UsualModel} m */
export function canFold(m) {
    const mode = attr(m, 'all');
    return mode === 'fold' || (mode !== 'open' && m.items.length > USUAL_FOLD_ABOVE);
}

/** @param {UsualModel} m @param {string} text */
export function say(m, text) {
    if (m.status) m.status.textContent = text;
}
