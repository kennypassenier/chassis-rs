// The answer menu on a cell.
import { getStrings } from '../strings.js';
import { STATE, allowed, el, glyphOf, stateOf, wordOf } from './facts.js';
import { request } from './request.js';
/** @typedef {import('./types.js').AvailabilityAnswer} AvailabilityAnswer */

/** The next answer in a press. @param {HTMLElement} root @param {AvailabilityAnswer | undefined} now @returns {AvailabilityAnswer | null} */
export function next(root, now) {
    const order = allowed(root);
    if (!now) return order[0];
    const i = order.indexOf(now);
    return i + 1 < order.length ? order[i + 1] : null;
}

/** @param {HTMLElement} root */
function closeMenu(root) {
    const st = STATE.get(root);
    st?.menu?.remove();
    if (st) st.menu = null;
}

/** Open the answers under a cell. @param {HTMLElement} root @param {HTMLElement} cell */
export function openMenu(root, cell) {
    closeMenu(root);
    const st = stateOf(root);
    const s = getStrings();
    const person = cell.getAttribute('data-row-key') ?? '';
    const column = cell.getAttribute('data-col-key') ?? '';
    // The package's own menu: the popover surface holding a `.kp-menu` of `.kp-menu__item`s, as the catalogue draws it.
    const menu = el('kp-popover kp-availability__menu');
    const list = el('kp-menu', 'ul');
    list.setAttribute('role', 'menu');
    list.setAttribute(
        'aria-label',
        s.availabilityCell(
            st.spec.people?.find((p) => p.id === person)?.name ?? person,
            st.set.columns.find((c) => c.key === column)?.label ?? column,
            '',
        ),
    );
    const now = st.set.answers[person]?.[column];
    for (const answer of [...allowed(root), null]) {
        const li = el('', 'li');
        li.setAttribute('role', 'none');
        const b = /** @type {HTMLButtonElement} */ (el('kp-menu__item kp-availability__menu-item', 'button'));
        b.type = 'button';
        b.setAttribute('role', 'menuitemradio');
        b.setAttribute('aria-checked', String(answer === (now ?? null)));
        b.textContent = answer ? `${glyphOf(answer)} ${wordOf(answer)}` : s.availabilityClear;
        b.addEventListener('click', () => {
            closeMenu(root);
            void request(root, person, [column], answer);
        });
        li.append(b);
        list.append(li);
    }
    menu.append(list);
    root.append(menu);
    const r = cell.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    menu.style.insetInlineStart = `${Math.max(0, r.left - rr.left)}px`;
    menu.style.insetBlockStart = `${r.bottom - rr.top + 4}px`;
    st.menu = menu;
    /** @param {KeyboardEvent} event */
    const key = (event) => {
        const items = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('button')]);
        const i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        if (event.key === 'Escape') {
            event.preventDefault();
            closeMenu(root);
            cell.focus();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            items[(i + 1) % items.length].focus();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            items[(i - 1 + items.length) % items.length].focus();
        }
    };
    menu.addEventListener('keydown', key);
    (menu.querySelector('[aria-checked="true"]') ?? menu.querySelector('button'))?.dispatchEvent(new Event('focus'));
    /** @type {HTMLElement | null} */ (menu.querySelector('[aria-checked="true"]') ?? menu.querySelector('button'))?.focus();
    const outside = (/** @type {Event} */ event) => {
        if (event.target instanceof Node && !menu.contains(event.target)) {
            closeMenu(root);
            document.removeEventListener('pointerdown', outside, true);
        }
    };
    document.addEventListener('pointerdown', outside, true);
}
