// A group whose `data-kp-segmented` changes at runtime [live-options-1019]: rewrites its roles and states for the new mode.

import { TRI_ATTRIBUTE } from './constants.js';
import { isAll, isMulti, isTri, itemsOf, valueOf } from './read.js';
import { writeTri } from './tri.js';

/**
 * The values that were on while the group was in `mode`, read the way that mode wrote them.
 * @param {Element} group @param {string} mode
 */
function valuesIn(group, mode) {
    const on = mode === 'tri' ? 'include' : 'true';
    return itemsOf(group)
        .filter(
            (item) =>
                (mode === 'tri' ? item.getAttribute(TRI_ATTRIBUTE) : item.getAttribute(mode === 'multi' ? 'aria-pressed' : 'aria-checked')) === on,
        )
        .filter((item) => !(mode !== 'single' && isAll(item)))
        .map(valueOf);
}

/** Leaving the three-way look: its marks, spoken words, summary line and status region go. @param {Element} group */
function dropTriParts(group) {
    for (const item of itemsOf(group)) {
        item.removeAttribute(TRI_ATTRIBUTE);
        item.removeAttribute('aria-disabled');
        for (const part of item.querySelectorAll(':scope > .kp-segmented__mark, :scope > .kp-segmented__state')) part.remove();
    }
    const next = group.nextElementSibling;
    if (next?.classList.contains('kp-segmented__summary')) next.remove();
    group.parentElement?.querySelector(`:scope > .kp-segmented__live[data-for="${CSS.escape(group.id || '')}"]`)?.remove();
}

/**
 * Write the roles and the state attributes the way the group's new mode reads them, and say which values were on and stay on (a
 * single group keeps the first of several, which `paint` decides). The event is not fired: the page changed the mode, the person
 * chose nothing. The caller paints.
 * @param {Element} group @param {string} was the mode before
 * @returns {string[]} the values that stay on
 */
export function rewriteForMode(group, was) {
    const tri = isTri(group);
    const multi = isMulti(group);
    // The "All" item is a value of its own in a single group and the absence of values in the other two.
    const all = itemsOf(group).find(isAll);
    let values = valuesIn(group, was);
    if (all && (multi || tri)) values = values.filter((value) => value !== valueOf(all));
    else if (all && values.length === 0) values = [valueOf(all)];
    if (was === 'tri' && !tri) dropTriParts(group);
    const role = group.getAttribute('role');
    if (role === null || role === 'group' || role === 'radiogroup') group.setAttribute('role', multi || tri ? 'group' : 'radiogroup');
    for (const item of itemsOf(group)) {
        item.removeAttribute('aria-checked');
        item.removeAttribute('aria-pressed');
        if (multi || tri) {
            if (item.getAttribute('role') === 'radio') item.removeAttribute('role');
        } else if (!item.hasAttribute('role')) item.setAttribute('role', 'radio');
        if (tri && !isAll(item)) writeTri(item, 'any');
    }
    return values;
}
