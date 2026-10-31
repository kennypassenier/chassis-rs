// A folding bar's state on the instance and the fit: measure the items, decide which fold, mark them and redraw the More menu.

import { Controller } from '../controller.js';
import { closeMenu, setMenu } from '../menu-button.js';
import { resolveStrings } from '../strings.js';
import { FoldGroups } from './groups.js';
import { buildMore } from './more.js';
import { planFold, planSeparators } from './plan.js';
import { NAV_FOLD_EVENT, counterOf, isSep } from './read.js';

/** A pixel of safety on the room the list has: offsetWidth rounds each item to whole pixels. */
const ROOM_SAFETY_PX = 1;

export class NavFoldCore extends Controller {
    /**
     * @param {HTMLElement} nav the `.kp-nav` carrying `data-kp-nav-fold`
     * @param {{ strings?: Partial<import('../strings.js').Strings> }} [options]
     */
    constructor(nav, options = {}) {
        super(nav, options);
        const list = /** @type {HTMLElement | null} */ (nav.querySelector(':scope > .kp-nav__links'));
        const view = nav.ownerDocument.defaultView;
        if (!list || !view) throw new Error('A folding bar needs a `.kp-nav__links` list and a window.');
        this.list = list;
        this.view = view;
        this.doc = nav.ownerDocument;
        /** The words this bar alone says differently, if any. */
        this.strings = options.strings;
        const parts = buildMore(this.doc);
        this.more = parts.more;
        this.wrapper = parts.wrapper;
        this.button = parts.button;
        this.menu = parts.menu;
        this.label = parts.label;
        this.dot = parts.dot;
        this.alertText = parts.alertText;
        this.groups = new FoldGroups(() => this.words());
        /** What the menu was last drawn from, so an unchanged fit does not redraw it. */
        this.signature = '';
        /** The items that are folded now. @type {HTMLElement[]} */
        this.foldedNow = [];
        /** @type {ResizeObserver | null} */
        this.resize = null;
    }

    /** The dictionary this bar speaks. */
    words() {
        return resolveStrings(this.strings);
    }

    /** The label, the counter's words and the menu's name, in the bar's own words. */
    writeWords() {
        const s = this.words();
        this.label.textContent = s.navMore;
        this.alertText.textContent = ` ${s.navMoreAlert}`;
        this.menu.setAttribute('aria-label', s.navMoreMenu);
    }

    /** @returns {HTMLElement[]} the bar's own items, in order */
    itemsOf() {
        return /** @type {HTMLElement[]} */ ([...this.list.children]).filter((li) => li !== this.more && !li.hidden);
    }

    /** The toggle the narrow bar collapses into, when it is what the bar shows now. */
    toggled() {
        const toggle = this.host.querySelector(':scope > .kp-nav__toggle');
        return toggle !== null && this.view.getComputedStyle(toggle).display !== 'none';
    }

    /** Per item: true when it leaves the bar, separators decided. @param {HTMLElement[]} items */
    plan(items) {
        const { list, view, more } = this;
        /** @type {boolean[]} */
        let plan = items.map(() => false);
        // A list that is not drawn (a page hides it at this width) has nothing to fit.
        if (!this.toggled() && list.getClientRects().length > 0) {
            plan = planFold({
                widths: items.map((li) => li.offsetWidth),
                gap: Number.parseFloat(view.getComputedStyle(list).columnGap) || 0,
                room: list.clientWidth - ROOM_SAFETY_PX,
                moreWidth: more.offsetWidth,
                keep: items.map((li) => li.hasAttribute('data-kp-nav-keep')),
            });
        }
        const seps = items.map(isSep);
        return seps.includes(true) ? planSeparators(plan, seps) : plan;
    }

    /** What the visible items use of the list, for a register that paints the list itself. */
    publishUsed() {
        const { list, more, view } = this;
        const shown = this.itemsOf().filter((li) => !li.hasAttribute('data-kp-nav-folded'));
        const last = more.hasAttribute('data-kp-nav-idle') ? shown[shown.length - 1] : more;
        const box = list.getBoundingClientRect();
        const end = last ? last.getBoundingClientRect() : box;
        const rtl = view.getComputedStyle(list).direction === 'rtl';
        list.style.setProperty('--kp-nav-fold-used', `${Math.max(0, Math.round(rtl ? box.right - end.left : end.right - box.left))}px`);
    }

    /**
     * The menu's separators where the bar had one: the menu's own `.kp-menu__separator` before each group that followed a
     * folded separator. The menu draws its groups itself (and later, while it is open), so this runs after every draw.
     */
    ruleMenu() {
        const { menu, doc } = this;
        const ruledAt = this.groups.ruledAt;
        const blocks = /** @type {HTMLElement[]} */ ([...menu.children]).filter((n) => n.classList.contains('kp-menu__group'));
        for (const old of menu.querySelectorAll(':scope > .kp-menu__separator[data-kp-nav-sep]')) {
            const at = blocks.indexOf(/** @type {HTMLElement} */ (old.nextElementSibling));
            if (!ruledAt.includes(at)) old.remove();
        }
        for (const at of ruledAt) {
            const block = blocks[at];
            if (!block || block.previousElementSibling?.matches('.kp-menu__separator[data-kp-nav-sep]')) continue;
            const line = doc.createElement('div');
            line.className = 'kp-menu__separator';
            line.setAttribute('role', 'separator');
            line.setAttribute('data-kp-nav-sep', '');
            block.before(line);
        }
    }

    /**
     * Mark the items that left the bar and the bar itself; the menu closes when nothing is folded any more.
     * @param {HTMLElement[]} items @param {HTMLElement[]} leaving everything that leaves, separators too @param {HTMLElement[]} folded the links among them
     */
    markItems(items, leaving, folded) {
        const { more, host, doc } = this;
        // The list keeps at least the More button's room while something is folded (css/components.css).
        if (folded.length) this.list.style.setProperty('--kp-nav-fold-more', `${more.offsetWidth}px`);
        else this.list.style.removeProperty('--kp-nav-fold-more');
        for (const li of items) li.toggleAttribute('data-kp-nav-folded', leaving.includes(li));
        more.toggleAttribute('data-kp-nav-idle', folded.length === 0);
        host.toggleAttribute('data-kp-nav-folding', folded.length > 0);
        if (folded.length === 0 && this.foldedNow.length > 0) closeMenu(this.wrapper);
        // Focus inside an item that has just left the bar goes to the button that holds it now.
        const active = doc.activeElement;
        if (active && folded.some((li) => li.contains(active))) this.button.focus();
    }

    /** The More item's marks: the current page behind it, a counter behind it. @param {HTMLElement[]} folded */
    markMore(folded) {
        const { more, button } = this;
        more.toggleAttribute(
            'data-kp-nav-more-current',
            folded.some((li) => li.querySelector('[aria-current]:not([aria-current="false"])') !== null),
        );
        const alert = folded.some((li) => counterOf(li) !== '');
        more.toggleAttribute('data-kp-nav-more-alert', alert);
        this.dot.hidden = !alert;
        this.alertText.hidden = !alert;
        // The button holds the current page: it reads as a current item of the bar (`true`, not `page`: it is a set).
        if (more.hasAttribute('data-kp-nav-more-current')) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
    }

    /** Draw the More menu from the groups when they changed. @param {import('../menu-button.js').MenuGroup[]} groups */
    drawMenu(groups) {
        const next = JSON.stringify([groups.map((g) => [g.group, g.items.map((i) => [i.label, i.href ?? '', i.disabled ?? '', i.attrs ?? null])]), this.groups.ruledAt]);
        if (next !== this.signature) {
            this.signature = next;
            if (groups.length) setMenu(this.wrapper, groups);
        }
        // An open menu keeps what it shows until it closes (menu-button.js); its next draw rules it then.
        if (this.menu.hidden) this.ruleMenu();
    }

    /** Whether the folded set is another than the one last announced. @param {HTMLElement[]} items @param {HTMLElement[]} folded */
    changed(items, folded) {
        const at = (/** @type {HTMLElement[]} */ list) => list.map((li) => items.indexOf(li)).join(',');
        return at(folded) !== at(this.foldedNow) || folded.length !== this.foldedNow.length;
    }

    fit() {
        const { list, more, host } = this;
        // The More item belongs at the end, wherever a render added an item after it.
        if (list.lastElementChild !== more) list.append(more);
        const items = this.itemsOf();
        const plan = this.plan(items);
        // Every item that leaves the bar, separators too; `folded` is the links among them.
        const leaving = items.filter((_, i) => plan[i]);
        const folded = leaving.filter((li) => !isSep(li));
        const changed = this.changed(items, folded);
        this.markItems(items, leaving, folded);
        this.foldedNow = folded;
        const groups = this.groups.build(leaving);
        this.markMore(folded);
        this.drawMenu(groups);
        host.setAttribute('data-kp-nav-fold-ready', '');
        this.publishUsed();
        if (changed) host.dispatchEvent(new CustomEvent(NAV_FOLD_EVENT, { bubbles: true, detail: { folded: folded.length, items: folded } }));
    }
}
