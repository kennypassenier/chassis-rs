// The folded chip group [ux-1101]: under its fold width a chip group on tracks (js/segmented/fit.js) gives its place to the
// package's menu button, "Show: All ▾", whose entries are the chips. The group stays in the page, collapsed and out of reach, so
// its width can still be read, its value is still the one the page reads, and a pick in the menu is a press on its chip (the
// same event, the same announcement). Single groups pick and close; multi groups tick and stay open.

import { attachOne } from '../controller.js';
import { MenuButtonControl } from '../menu-button/controller.js';
import { MENU_SELECT_EVENT } from '../menu-button/constants.js';
import { setMenu } from '../menu-button/open.js';
import { getStrings } from '../strings.js';
import { isAll, isMulti, isOn, itemDisabled, itemsOf, labelOf, valueOf } from './read.js';

/** The menu button standing in for a folded group, and what it listens to. @typedef {{ host: HTMLElement, button: HTMLButtonElement, off: () => void }} Fold */

/** @type {WeakMap<Element, Fold>} */
const folds = new WeakMap();

/** The group's own name, for the button: its label, the text it is labelled by, else the dictionary's "Show". @param {HTMLElement} group */
function nameOf(group) {
    const own = group.getAttribute('aria-label');
    if (own) return own;
    const ids = (group.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
    const text = ids.map((id) => group.ownerDocument.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim();
    return text || getStrings().segmentedFoldName;
}

/** What is chosen, in words: one label, "3 chosen", or All. @param {HTMLElement} group */
function chosenWords(group) {
    const s = getStrings();
    const items = itemsOf(group);
    const on = items.filter((item) => isOn(group, item) && !(isMulti(group) && isAll(item)));
    if (on.length === 1) return labelOf(on[0]);
    if (on.length > 1) return s.segmentedFoldMany(on.length);
    const all = items.find(isAll);
    return all ? labelOf(all) : s.segmentedFoldAll;
}

/** A chip as a menu entry: its label with its exact count, ticked when on. @param {HTMLElement} group @param {HTMLElement} item */
function entryOf(group, item) {
    const count = item.querySelector('.kp-segmented__count')?.textContent?.trim();
    return {
        label: count ? `${labelOf(item)} · ${count}` : labelOf(item),
        value: valueOf(item),
        disabled: itemDisabled(item) ? item.getAttribute('data-kp-disabled-reason') || item.title || labelOf(item) : null,
        attrs: { role: isMulti(group) ? 'menuitemcheckbox' : 'menuitemradio', 'aria-checked': String(isOn(group, item)) },
    };
}

/** The button's words and the entries' ticks, from the group as it is now. @param {HTMLElement} group @param {Fold} fold */
function paintFold(group, fold) {
    fold.button.textContent = `${getStrings().segmentedFoldButton(nameOf(group), chosenWords(group))} ▾`;
    const entries = itemsOf(group).filter((item) => !item.hidden).map((item) => entryOf(group, item));
    setMenu(fold.host, [{ group: '', items: entries }]);
    // An open menu keeps its entries (setMenu waits for the close): its ticks are written in place.
    for (const entry of fold.host.querySelectorAll('[role="menuitemcheckbox"], [role="menuitemradio"]')) {
        const item = itemsOf(group).find((one) => valueOf(one) === entry.getAttribute('data-kp-value'));
        if (item) entry.setAttribute('aria-checked', String(isOn(group, item)));
    }
}

/** Build the menu button before the group and wire it. @param {HTMLElement} group @returns {Fold} */
function buildFold(group) {
    const doc = group.ownerDocument;
    const host = doc.createElement('div');
    host.className = 'kp-menu-button kp-segmented__fold';
    host.setAttribute('data-kp-menu-button', '');
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'kp-button kp-segmented__fold-button';
    const menu = doc.createElement('div');
    menu.className = 'kp-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', nameOf(group));
    host.append(button, menu);
    group.before(host);
    const control = attachOne(host, MenuButtonControl, {});
    /** @param {Event} event */
    const pick = (event) => {
        const value = /** @type {CustomEvent<{ value: string }>} */ (event).detail?.value;
        const item = itemsOf(group).find((one) => valueOf(one) === value);
        if (!item) return;
        // A press on the chip itself: the group's own handling, event and announcement.
        item.click();
        if (isMulti(group)) event.preventDefault();
        paintFold(group, /** @type {Fold} */ (folds.get(group)));
    };
    host.addEventListener(MENU_SELECT_EVENT, pick);
    const off = () => {
        host.removeEventListener(MENU_SELECT_EVENT, pick);
        control?.destroy();
        host.remove();
    };
    return { host, button, off };
}

/**
 * Show or hide the menu that stands in for a folded group, and bring its words in line with the group.
 * @param {HTMLElement} group @param {boolean} folded
 */
export function syncFold(group, folded) {
    let fold = folds.get(group);
    if (!fold && !folded) return;
    if (!fold) {
        fold = buildFold(group);
        folds.set(group, fold);
    }
    const hadFocus = folded !== !fold.host.hidden && (folded ? group : fold.host).contains(group.ownerDocument.activeElement);
    fold.host.hidden = !folded;
    paintFold(group, fold);
    // The focus follows the control across a fold, so a keyboard user is never left on something that went away.
    if (hadFocus) (folded ? fold.button : /** @type {HTMLElement | undefined} */ (itemsOf(group).find((item) => item.tabIndex === 0)))?.focus();
}

/** After the group's state changed: the open or closed menu says so too. @param {Element} group */
export function repaintFold(group) {
    const fold = folds.get(group);
    if (fold && !fold.host.hidden) paintFold(/** @type {HTMLElement} */ (group), fold);
}

/** Take the menu away for good (the group's detach). @param {Element} group */
export function dropFold(group) {
    folds.get(group)?.off();
    folds.delete(group);
    if (group instanceof HTMLElement) group.removeAttribute('data-kp-segmented-folded');
}

