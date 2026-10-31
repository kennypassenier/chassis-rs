// Builds the items of a menu: roles, labels, entries, the drawn list and the empty line.
import { resolveStrings } from '../strings.js';
import { countMenu } from './count.js';
import { keyOf, menuSignature, nextId } from './model.js';
/** @typedef {import('./types.js').MenuDecorateInfo} MenuDecorateInfo */
/** @typedef {import('./types.js').MenuGroup} MenuGroup */
/** @typedef {import('./types.js').MenuItem} MenuItem */
/** @typedef {import('./types.js').MenuState} MenuState */
/** @typedef {import('./types.js').Strings} Strings */

/** What counts as an item of the menu: a radio or a checkbox item (the refresh chooser's choices) is picked and reached by key like a plain one [CHA 21]. */
export const ITEM_ROLES = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

/** @param {MenuState} s @returns {HTMLElement[]} */
export const menuItems = (s) => /** @type {HTMLElement[]} */ ([...s.menu.querySelectorAll(ITEM_ROLES)]);

/** @param {HTMLElement} item */
export const labelOf = (item) => item.querySelector('.kp-menu__label')?.textContent ?? item.textContent ?? '';

/** @param {MenuState} s @param {HTMLElement} item @param {number} index */
export const decorateItem = (s, item, index) => {
    if (!s.decorate) return;
    /** @type {MenuDecorateInfo} */
    const info = { kind: 'menu-item', host: s.wrapper, index, label: labelOf(item) };
    const key = keyOf(s.wrapper);
    if (key !== undefined) info.key = key;
    if (item.dataset.kpValue !== undefined) info.value = item.dataset.kpValue;
    s.decorate(item, info);
};

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc
 * @param {K} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    el.className = className;
    if (text != null) el.textContent = text;
    return el;
};

/**
 * One entry: the label over the hint; a disabled one keeps its hint and
 * says why under it.
 * @param {Document} doc
 * @param {MenuItem} item
 * @returns {HTMLElement}
 */
function menuEntry(doc, item) {
    const el = /** @type {HTMLElement} */ (doc.createElement(item.href ? 'a' : 'button'));
    if (item.href) {
        el.setAttribute('href', item.href);
        if (item.download) el.setAttribute('download', item.download);
    } else el.setAttribute('type', 'button');
    el.setAttribute('role', 'menuitem');
    el.className = `kp-menu__item${item.danger ? ' kp-menu__item--destructive' : ''}`;
    el.tabIndex = -1;
    const label = make(doc, 'span', 'kp-menu__label', item.label);
    label.id = nextId('kp-menu-label');
    el.setAttribute('aria-labelledby', label.id);
    el.append(label);
    /** @type {string[]} */
    const described = [];
    if (item.hint) {
        const hint = make(doc, 'span', 'kp-menu__hint', item.hint);
        hint.id = nextId('kp-menu-hint');
        described.push(hint.id);
        el.append(hint);
    }
    if (item.disabled) {
        const reason = make(doc, 'span', 'kp-menu__hint kp-menu__reason', item.disabled);
        reason.id = nextId('kp-menu-reason');
        described.push(reason.id);
        el.append(reason);
        el.setAttribute('aria-disabled', 'true');
        el.dataset.kpReason = item.disabled;
    }
    if (described.length) el.setAttribute('aria-describedby', described.join(' '));
    el.title = item.disabled ?? item.hint ?? '';
    if (item.value) el.dataset.kpValue = item.value;
    for (const [name, value] of Object.entries(item.attrs ?? {})) {
        if (value == null) el.removeAttribute(name);
        else el.setAttribute(name, value);
    }
    return el;
}

/** @param {MenuState} s @param {MenuGroup[] | 'loading'} groups */
export function drawMenu(s, groups) {
    const doc = s.menu.ownerDocument;
    const strings = resolveStrings(s.strings);
    s.drawn = menuSignature(groups);
    if (groups === 'loading') {
        // One disabled entry at the final row height: a label over a hint
        // line. The hint is a no-break space, which keeps its line; a plain
        // space collapsed and left the row a line short (39 px for 58.5).
        const entry = menuEntry(doc, { label: strings.menuLoading, hint: '\u00a0' });
        entry.setAttribute('aria-disabled', 'true');
        entry.dataset.kpLoading = '';
        s.menu.replaceChildren(entry);
        s.menu.setAttribute('aria-busy', 'true');
        countMenu(s.menu);
        setEmpty(s, false, strings);
        return;
    }
    s.menu.removeAttribute('aria-busy');
    const used = groups.filter((g) => g.items.length);
    const total = used.reduce((n, g) => n + g.items.length, 0);
    /** @type {HTMLElement[]} */
    const blocks = [];
    let index = 0;
    for (const group of used) {
        const block = make(doc, 'div', 'kp-menu__group');
        // One entry, or a nameless group: no heading, so nothing to name it by.
        if (group.group && total > 1) {
            const heading = make(doc, 'p', 'kp-menu__heading', group.group);
            heading.id = nextId('kp-menu-group');
            heading.setAttribute('role', 'presentation');
            block.setAttribute('role', 'group');
            block.setAttribute('aria-labelledby', heading.id);
            block.append(heading);
        } else block.setAttribute('role', 'none');
        for (const item of group.items) {
            const entry = menuEntry(doc, item);
            block.append(entry);
            decorateItem(s, entry, index);
            index += 1;
        }
        blocks.push(block);
    }
    s.menu.replaceChildren(...blocks);
    countMenu(s.menu);
    setEmpty(s, total === 0, strings);
}

/**
 * No entries: the button hides (`data-kp-menu-empty="hide"`) or stays,
 * `aria-disabled`, and says why it does nothing.
 * @param {MenuState} s
 * @param {boolean} empty
 * @param {Strings} strings
 */
function setEmpty(s, empty, strings) {
    s.empty = empty;
    const hide = s.wrapper.dataset.kpMenuEmpty === 'hide';
    s.wrapper.hidden = empty && hide;
    if (empty && !hide) {
        s.button.setAttribute('aria-disabled', 'true');
        s.button.title = strings.menuEmpty;
    } else if (s.button.getAttribute('aria-disabled') === 'true') {
        s.button.removeAttribute('aria-disabled');
        s.button.removeAttribute('title');
    }
}
