// A row's actions as one primary button and a row menu for the rest [ux-1101, table-rows]. Opt-in: `data-kp-row-actions="menu"` on the
// table. The page writes the actions as it always did (buttons or links inside `.kp-table__actions`); the table keeps the primary one
// where it stands and moves the others, the same elements with their listeners, into a `.kp-menu` under a "⋯" menu button, so a
// row (and a phone card) carries one button and one menu button instead of a stack of small ones, and the destructive action is
// never the middle of three.
import { attachMenuButtons } from '../../menu-button.js';
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

/** The group of one row's actions, and the button that stays the primary one when the page marks none. */
const GROUP = '.kp-table__actions';
const PRIMARY = '[data-kp-row-primary]';
const DESTRUCTIVE = '.kp-button--destructive';
/** What the menu button says: the more-actions mark. */
const MORE_GLYPH = '⋯';
/** What an action that moves into the menu gets, and what it gave up. */
const ITEM_CLASS = 'kp-menu__item';
const ITEM_DESTRUCTIVE = 'kp-menu__item--destructive';

export class TableRowActions {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        /** The groups already folded, so a redraw never folds one twice. @type {WeakSet<Element>} */
        this.done = new WeakSet();
        /** What each moved action was before: class, role and tabindex. @type {WeakMap<HTMLElement, { className: string, role: string | null, tabindex: string | null, destructive: boolean }>} */
        this.memory = new WeakMap();
    }

    /** Whether the table asked for the menu form. */
    get wanted() {
        return this.t.wrap.dataset.kpRowActions === 'menu';
    }

    /** Fold the actions of every row that has not been folded yet; rows the page adds later are folded when they are first drawn. */
    sync() {
        if (!this.wanted) return;
        for (const row of this.t.model.all) {
            for (const group of /** @type {HTMLElement[]} */ ([...row.querySelectorAll(GROUP)])) {
                if (this.done.has(group)) continue;
                this.done.add(group);
                this.fold(group);
            }
        }
    }

    /** The one that stays: the page's mark, else the first that is not destructive, else the first. @param {HTMLElement[]} items */
    primaryOf(items) {
        return items.find((item) => item.matches(PRIMARY)) ?? items.find((item) => !item.matches(DESTRUCTIVE)) ?? items[0];
    }

    /** @param {HTMLElement} group */
    fold(group) {
        const items = /** @type {HTMLElement[]} */ ([...group.children].filter((child) => child.matches('button, a')));
        if (items.length < 2) return;
        const primary = this.primaryOf(items);
        const rest = items.filter((item) => item !== primary);
        const wrapper = this.buildMenu(rest);
        group.classList.add('kp-table__actions--menu');
        group.append(wrapper);
        const detach = attachMenuButtons(group);
        this.t.identity.undo.push(() => {
            detach();
            this.unfold(group, wrapper, rest, primary);
        });
    }

    /** The menu button with its menu; every action moves in as an entry. @param {HTMLElement[]} rest */
    buildMenu(rest) {
        const { identity } = this.t;
        const wrapper = identity.make('div', 'kp-menu-button kp-table__more');
        wrapper.dataset.kpMenuButton = '';
        const button = /** @type {HTMLButtonElement} */ (identity.make('button', 'kp-button kp-button--sm kp-table__more-button'));
        button.type = 'button';
        button.setAttribute('aria-label', identity.s0.tableRowMenu);
        button.textContent = MORE_GLYPH;
        const menu = identity.make('div', 'kp-menu');
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', identity.s0.tableRowMenu);
        menu.hidden = true;
        for (const item of rest) this.toEntry(item, menu);
        wrapper.append(button, menu);
        return wrapper;
    }

    /** One action becomes a menu entry; what it was is kept so the detach can give it back. @param {HTMLElement} item @param {HTMLElement} menu */
    toEntry(item, menu) {
        const was = { className: item.className, role: item.getAttribute('role'), tabindex: item.getAttribute('tabindex'), destructive: item.matches(DESTRUCTIVE) };
        this.memory.set(item, was);
        item.className = was.destructive ? `${ITEM_CLASS} ${ITEM_DESTRUCTIVE}` : ITEM_CLASS;
        item.setAttribute('role', 'menuitem');
        item.setAttribute('tabindex', '-1');
        menu.append(item);
    }

    /** Put every action back in its group, in its own order, as the page wrote it. @param {HTMLElement} group @param {HTMLElement} wrapper @param {HTMLElement[]} rest @param {HTMLElement} primary */
    unfold(group, wrapper, rest, primary) {
        for (const item of rest) {
            const was = this.memory.get(item);
            if (was === undefined) continue;
            item.className = was.className;
            for (const [name, value] of /** @type {const} */ ([['role', was.role], ['tabindex', was.tabindex]])) {
                if (value === null) item.removeAttribute(name);
                else item.setAttribute(name, value);
            }
            primary.after(item);
        }
        wrapper.remove();
        group.classList.remove('kp-table__actions--menu');
    }
}
