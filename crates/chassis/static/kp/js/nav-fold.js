// A bar that folds what does not fit behind a "More" menu [kpadopt-nav].
//
// The homelab dashboard's bar (admin/web/js/main.js `fitBar`) used to fold
// ALL its links behind the phone toggle the moment a theme's wide letters
// wrapped one of them onto a second row. This folds only the links that do
// not fit, from the end, and keeps the rest in the bar:
//
//   <div class="kp-nav-wrap">
//     <nav class="kp-nav" data-kp-nav-fold aria-label="Main">
//       <span class="kp-nav__brand">Your app</span>
//       <ul class="kp-nav__links">…</ul>
//     </nav>
//   </div>
//
// Opt-in by `data-kp-nav-fold` on the nav. The script adds one list item at
// the end of `.kp-nav__links`, `.kp-nav__more`, which holds kp's own menu
// button (js/menu-button.js: a `.kp-menu-button` whose button is a bar link
// and whose menu is a `.kp-menu--rich`), so the More menu has the keys, the
// placement and the theme of every other menu. Nothing is moved or cloned in
// the bar: a link that does not fit stays in its list item, which only turns
// `data-kp-nav-folded` (out of the flow, invisible, out of the focus order,
// still measurable), and the menu holds one entry for it that clicks the real
// link, so a router's own handler still runs. A list item with a dropdown or a
// mega menu becomes a named group in the menu: its heading, then its links.
//
// No layout shift. The list takes the room the brand and the end slots leave
// (`flex: 1 1 0`), so what it holds never changes how wide it is, and it does
// not wrap: the bar is one row before the script runs (the overflow is
// clipped, not wrapped) and one row after. A folded link is measured at its
// own natural width, so the fit does not depend on the state it is in; there
// is nothing to oscillate. The decision is taken inside a ResizeObserver
// callback, before the frame is painted.
//
// The bar's own phone toggle (`data-kp-nav-toggle`) wins where it is shown:
// below the 40rem container query, with a toggle present, the bar collapses
// as it always did and this stands down.
//
// Marks: `data-kp-nav-fold-ready` on the nav once it has been fitted,
// `data-kp-nav-folding` while anything is folded, `data-kp-nav-folded` on each
// folded item, `data-kp-nav-more-current` on the More item when the current
// page is behind it and `data-kp-nav-more-alert` when a counter (`.kp-badge`)
// is (a dot on the button, announced); `aria-current="true"` goes on the button
// itself while the current page is behind it. `data-kp-nav-keep` on an item keeps it in the bar. Fires `kp-nav-fold` on
// the nav when the folded set changes: `{ folded, items }`. Every word is in
// the dictionary (`navMore`, `navMoreMenu`, `navMoreAlert`, `navMoreUnavailable`).
//
// A separator between two groups of links [kpadopt3] is a list item of its own,
// `<li class="kp-nav__sep" aria-hidden="true"></li>`: a rule in the bar, never a
// target. The fold reads it as part of the bar: a separator stands only between
// two links that are shown, so one whose links on either side have folded folds
// with them (no rule dangles before More or at the start), and in the More menu
// the links that followed it start a group below the menu's own separator
// (`.kp-menu__separator`). A separator is never counted as a folded item.
//
// Nothing runs on import; attachNavFolds(root) returns a detach.

import { resolveStrings } from './strings.js';
import { attachMenuButtons, closeMenu, setMenu } from './menu-button.js';

/** A bar that folds. */
export const NAV_FOLD = '[data-kp-nav-fold]';

/** Fired on the nav, bubbling, when the set of folded items changed: `{ folded, items }`. */
export const NAV_FOLD_EVENT = 'kp-nav-fold';

/** The item the script adds to the bar's list. */
export const NAV_MORE = '[data-kp-nav-more]';

/**
 * Which items do not fit: pure, so the arithmetic is read on its own.
 *
 * Items are kept from the start for as long as they fit beside the More
 * button; the first that does not fit folds with everything after it. An
 * item marked to keep stays in the bar wherever it is. When everything fits
 * without the More button, nothing folds.
 *
 * @param {object} at
 * @param {readonly number[]} at.widths each item's natural width
 * @param {number} at.gap the space between two items
 * @param {number} at.room the width the list has
 * @param {number} at.moreWidth the More item's width
 * @param {readonly boolean[]} [at.keep] items that never fold
 * @returns {boolean[]} per item: true when it folds
 */
export function planFold({ widths, gap, room, moreWidth, keep = [] }) {
    const n = widths.length;
    const total = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, n - 1);
    if (total <= room) return widths.map(() => false);
    const budget = room - moreWidth - gap;
    const fits = widths.map((_, i) => keep[i] === true);
    let count = fits.filter(Boolean).length;
    let used = widths.reduce((sum, w, i) => (fits[i] ? sum + w : sum), 0) + gap * Math.max(0, count - 1);
    for (let i = 0; i < n; i += 1) {
        if (fits[i]) continue;
        const next = used + widths[i] + (count > 0 ? gap : 0);
        if (next > budget) break;
        fits[i] = true;
        used = next;
        count += 1;
    }
    return fits.map((f) => !f);
}

/** @param {Element} el @returns {string} the visible words of a link, less its counter */
function wordsOf(el) {
    const copy = /** @type {Element} */ (el.cloneNode(true));
    for (const skip of copy.querySelectorAll('.kp-badge, [aria-hidden="true"], [data-kp-nav-fold-skip]')) skip.remove();
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** @param {Element} el @returns {string} its counter's text, or '' */
function counterOf(el) {
    const badge = el.querySelector('.kp-badge:not([hidden])');
    return (badge?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** A separator between two groups of links [kpadopt3]. */
export const NAV_SEP = '.kp-nav__sep';

/** @param {Element} li @returns {boolean} */
const isSep = (li) => li.matches(NAV_SEP);

/**
 * Which separators fold with the links around them: pure, beside planFold().
 *
 * Nothing folds while no link folds. Once one does, a separator stays only
 * where a shown link stands both before and after it in the bar, so no rule
 * is left at the start of the bar or against the More button.
 *
 * @param {readonly boolean[]} plan per item: true when it folds (planFold)
 * @param {readonly boolean[]} seps per item: true when it is a separator
 * @returns {boolean[]} the plan with the separators decided
 */
export function planSeparators(plan, seps) {
    const shown = plan.map((folds, i) => !folds && !seps[i]);
    if (!plan.some((folds, i) => folds && !seps[i])) return plan.map((folds, i) => (seps[i] ? false : folds));
    return plan.map((folds, i) => {
        if (!seps[i]) return folds;
        return !(shown.slice(0, i).includes(true) && shown.slice(i + 1).includes(true));
    });
}

/** @param {HTMLElement} el @returns {boolean} */
const unavailable = (el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';

/**
 * @typedef {object} NavFoldOptions
 * @property {Partial<import('./strings.js').Strings>} [strings] any of the dictionary's `navMore…` words, for this bar only
 */

/** What a bar's fold is wired to, kept so a second call is a no-op. */
const folds = new WeakMap();

/**
 * Fold one bar.
 *
 * @param {HTMLElement} nav the `.kp-nav` carrying `data-kp-nav-fold`
 * @param {NavFoldOptions} [options]
 * @returns {() => void} detach
 */
export function foldNav(nav, { strings } = {}) {
    if (folds.has(nav)) return () => {};
    const list = /** @type {HTMLElement | null} */ (nav.querySelector(':scope > .kp-nav__links'));
    const view = nav.ownerDocument.defaultView;
    if (!list || !view) return () => {};
    const doc = nav.ownerDocument;
    const words = () => resolveStrings(strings);

    // The More item: kp's menu button, dressed as one of the bar's links.
    const more = doc.createElement('li');
    more.className = 'kp-nav__more';
    more.setAttribute('data-kp-nav-more', '');
    more.setAttribute('data-kp-nav-idle', '');
    const wrapper = doc.createElement('div');
    wrapper.className = 'kp-menu-button kp-nav__more-wrap';
    wrapper.setAttribute('data-kp-menu-button', '');
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'kp-nav__link kp-nav__more-button';
    const menu = doc.createElement('div');
    menu.className = 'kp-menu kp-menu--rich kp-nav__more-menu';
    menu.setAttribute('role', 'menu');
    wrapper.append(button, menu);
    more.append(wrapper);
    // The word, then a dot for a counter behind the button (hidden until one is).
    const label = doc.createElement('span');
    const dot = doc.createElement('span');
    dot.className = 'kp-nav__more-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.hidden = true;
    const alertText = doc.createElement('span');
    alertText.className = 'kp-sr-only';
    alertText.hidden = true;
    button.append(label, dot, alertText);
    const writeWords = () => {
        const s = words();
        label.textContent = s.navMore;
        alertText.textContent = ` ${s.navMoreAlert}`;
        menu.setAttribute('aria-label', s.navMoreMenu);
    };
    writeWords();
    list.append(more);
    const detachMenu = attachMenuButtons(more, { strings });

    /** @type {HTMLElement[]} */
    let sources = [];
    /** The menu's groups that follow a folded separator. @type {Set<import('./menu-button.js').MenuGroup>} */
    let ruled = new Set();
    /** Their places among the groups the menu draws (menu-button.js leaves out an empty group). @type {number[]} */
    let ruledAt = [];
    let signature = '';
    let foldedNow = /** @type {HTMLElement[]} */ ([]);

    /** @returns {HTMLElement[]} the bar's own items, in order */
    const itemsOf = () => /** @type {HTMLElement[]} */ ([...list.children]).filter((li) => li !== more && !li.hidden);

    /** The toggle the narrow bar collapses into, when it is what the bar shows now. */
    const toggled = () => {
        const toggle = nav.querySelector(':scope > .kp-nav__toggle');
        return toggle !== null && view.getComputedStyle(toggle).display !== 'none';
    };

    /**
     * The menu's groups for the folded items; `sources` keeps the real link behind each entry.
     * @param {HTMLElement[]} folded
     */
    const groupsOf = (folded) => {
        const s = words();
        /** @type {import('./menu-button.js').MenuGroup[]} */
        const groups = [];
        /** @type {import('./menu-button.js').MenuItem[] | null} */
        let plain = null;
        // A folded separator: the next group stands below a rule in the menu.
        let rule = false;
        ruled = new Set();
        sources = [];
        /** @param {HTMLElement} el @returns {import('./menu-button.js').MenuItem} */
        const entry = (el) => {
            const name = wordsOf(el) || (el.getAttribute('aria-label') ?? '');
            const count = counterOf(el);
            /** @type {import('./menu-button.js').MenuItem} */
            const item = { label: count ? `${name} · ${count}` : name, value: String(sources.length) };
            const href = el.getAttribute('href');
            if (href && el.tagName === 'A') item.href = href;
            const current = el.getAttribute('aria-current');
            if (current && current !== 'false') item.attrs = { 'aria-current': current };
            if (unavailable(el)) item.disabled = s.navMoreUnavailable;
            sources.push(el);
            return item;
        };
        /** @param {import('./menu-button.js').MenuGroup} group */
        const open = (group) => {
            if (rule && groups.some((g) => g.items.length)) ruled.add(group);
            rule = false;
            groups.push(group);
        };
        for (const li of folded) {
            if (isSep(li)) {
                plain = null;
                rule = true;
                continue;
            }
            const primary = /** @type {HTMLElement | null} */ (li.querySelector(':scope > a, :scope > button'));
            const panel = li.querySelector(':scope > .kp-nav__menu');
            if (!panel) {
                if (!primary) continue;
                if (!plain) {
                    plain = [];
                    open({ group: '', items: plain });
                }
                plain.push(entry(primary));
                continue;
            }
            plain = null;
            /** @type {import('./menu-button.js').MenuItem[]} */
            const items = [];
            if (primary?.matches('a[href]')) items.push(entry(primary));
            for (const link of /** @type {HTMLElement[]} */ ([...panel.querySelectorAll('a[href], button')])) {
                if (link.closest('[hidden]')) continue;
                if (link.matches('[data-kp-nav-disclosure]')) continue;
                items.push(entry(link));
            }
            open({ group: primary ? wordsOf(primary) : '', items });
        }
        return groups;
    };

    /** What the visible items use of the list, for a register that paints the list itself. */
    const publishUsed = () => {
        const shown = itemsOf().filter((li) => !li.hasAttribute('data-kp-nav-folded'));
        const last = more.hasAttribute('data-kp-nav-idle') ? shown[shown.length - 1] : more;
        const box = list.getBoundingClientRect();
        const end = last ? last.getBoundingClientRect() : box;
        const rtl = view.getComputedStyle(list).direction === 'rtl';
        list.style.setProperty('--kp-nav-fold-used', `${Math.max(0, Math.round(rtl ? box.right - end.left : end.right - box.left))}px`);
    };

    /**
     * The menu's separators where the bar had one: the menu's own `.kp-menu__separator` before each group that followed a
     * folded separator. The menu draws its groups itself (and later, while it is open), so this runs after every draw.
     */
    const ruleMenu = () => {
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
    };
    const drawn = new MutationObserver(ruleMenu);
    drawn.observe(menu, { childList: true });

    const fit = () => {
        // The More item belongs at the end, wherever a render added an item after it.
        if (list.lastElementChild !== more) list.append(more);
        const items = itemsOf();
        /** @type {boolean[]} */
        let plan = items.map(() => false);
        // A list that is not drawn (a page hides it at this width) has nothing to fit.
        if (!toggled() && list.getClientRects().length > 0) {
            const gap = Number.parseFloat(view.getComputedStyle(list).columnGap) || 0;
            plan = planFold({
                widths: items.map((li) => li.offsetWidth),
                gap,
                // A pixel of safety: offsetWidth rounds each item to whole pixels.
                room: list.clientWidth - 1,
                moreWidth: more.offsetWidth,
                keep: items.map((li) => li.hasAttribute('data-kp-nav-keep')),
            });
        }
        const seps = items.map(isSep);
        if (seps.includes(true)) plan = planSeparators(plan, seps);
        // Every item that leaves the bar, separators too; `folded` is the links among them.
        const leaving = items.filter((_, i) => plan[i]);
        const folded = leaving.filter((li) => !isSep(li));
        // The list keeps at least the More button's room while something is folded (css/components.css).
        if (folded.length) list.style.setProperty('--kp-nav-fold-more', `${more.offsetWidth}px`);
        else list.style.removeProperty('--kp-nav-fold-more');
        const now = items.map((li, i) => (plan[i] && !seps[i] ? i : -1)).filter((i) => i >= 0);
        const same = now.join(',') === foldedNow.map((li) => items.indexOf(li)).join(',') && folded.length === foldedNow.length;
        for (const li of items) li.toggleAttribute('data-kp-nav-folded', leaving.includes(li));
        more.toggleAttribute('data-kp-nav-idle', folded.length === 0);
        nav.toggleAttribute('data-kp-nav-folding', folded.length > 0);
        if (folded.length === 0 && foldedNow.length > 0) closeMenu(wrapper);
        // Focus inside an item that has just left the bar goes to the button that holds it now.
        const active = doc.activeElement;
        if (active && folded.some((li) => li.contains(active))) button.focus();
        foldedNow = folded;

        const groups = groupsOf(leaving);
        ruledAt = groups
            .filter((g) => g.items.length)
            .map((g, i) => (ruled.has(g) ? i : -1))
            .filter((i) => i > 0);
        more.toggleAttribute(
            'data-kp-nav-more-current',
            folded.some((li) => li.querySelector('[aria-current]:not([aria-current="false"])') !== null),
        );
        const alert = folded.some((li) => counterOf(li) !== '');
        more.toggleAttribute('data-kp-nav-more-alert', alert);
        dot.hidden = !alert;
        alertText.hidden = !alert;
        // The button holds the current page: it reads as a current item of the bar (`true`, not `page`: it is a set).
        if (more.hasAttribute('data-kp-nav-more-current')) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
        const next = JSON.stringify([
            groups.map((g) => [g.group, g.items.map((i) => [i.label, i.href ?? '', i.disabled ?? '', i.attrs ?? null])]),
            ruledAt,
        ]);
        if (next !== signature) {
            signature = next;
            if (groups.length) setMenu(wrapper, groups);
        }
        // An open menu keeps what it shows until it closes (menu-button.js); its next draw rules it then.
        if (menu.hidden) ruleMenu();
        nav.setAttribute('data-kp-nav-fold-ready', '');
        publishUsed();
        if (!same) nav.dispatchEvent(new CustomEvent(NAV_FOLD_EVENT, { bubbles: true, detail: { folded: folded.length, items: folded } }));
    };

    // A pick clicks the real link: the router, the counter and the page's own
    // handlers all hear it. A modified click (new tab, new window) goes to the
    // entry's own href instead.
    /** @param {MouseEvent} event */
    const onPick = (event) => {
        const entryEl = event.target instanceof Element ? event.target.closest('[role="menuitem"]') : null;
        const source = entryEl ? sources[Number(/** @type {HTMLElement} */ (entryEl).dataset.kpValue)] : undefined;
        if (!source || entryEl?.getAttribute('aria-disabled') === 'true') return;
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        source.click();
        // A router may handle the click without leaving the page; the focus
        // must not be left on a menu that has closed.
        queueMicrotask(() => {
            if (doc.activeElement === doc.body || doc.activeElement === null) button.focus();
        });
    };
    menu.addEventListener('click', onPick, true);

    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    resize?.observe(list);
    /** The items whose natural width the fit reads: a font that loads, a counter that grows. */
    const watchItems = () => {
        for (const li of itemsOf()) resize?.observe(li);
    };
    watchItems();
    resize?.observe(more);

    // The list changing (a render adds a link, a router moves aria-current) is
    // a reason to fit again; the More item's own menu is not.
    const mutations = new MutationObserver((records) => {
        if (records.every((r) => more.contains(r.target))) return;
        watchItems();
        fit();
    });
    mutations.observe(list, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-current', 'hidden', 'disabled', 'aria-disabled', 'data-kp-nav-keep'],
    });
    // The font of the theme is a width; so is the narrow toggle's visibility.
    doc.fonts?.ready.then(fit);
    view.addEventListener('resize', fit);

    folds.set(nav, true);
    fit();

    return () => {
        resize?.disconnect();
        mutations.disconnect();
        drawn.disconnect();
        view.removeEventListener('resize', fit);
        menu.removeEventListener('click', onPick, true);
        detachMenu();
        more.remove();
        for (const li of itemsOf()) li.removeAttribute('data-kp-nav-folded');
        nav.removeAttribute('data-kp-nav-folding');
        nav.removeAttribute('data-kp-nav-fold-ready');
        list.style.removeProperty('--kp-nav-fold-used');
        list.style.removeProperty('--kp-nav-fold-more');
        folds.delete(nav);
    };
}

/** The mark the React NavBar puts on a bar it wires itself [AR29]; it folds its own (`fold`). */
export const NAV_FOLD_OWNED = '[data-kp-nav-owner]';

/**
 * Fold every bar under `root` that carries `data-kp-nav-fold`. A bar the React
 * NavBar renders folds itself; pass `ownedBy: ''` to fold it here instead.
 *
 * @param {ParentNode} [root]
 * @param {NavFoldOptions & { ownedBy?: string }} [options]
 * @returns {() => void} detach
 */
export function attachNavFolds(root = document, { ownedBy = NAV_FOLD_OWNED, ...options } = {}) {
    /** @type {(() => void)[]} */
    const undo = [];
    /** @type {HTMLElement[]} */
    const found = [];
    if (root instanceof HTMLElement && root.matches(NAV_FOLD)) found.push(root);
    for (const el of root.querySelectorAll(NAV_FOLD)) found.push(/** @type {HTMLElement} */ (el));
    for (const nav of found) {
        if (ownedBy !== '' && nav.matches(ownedBy)) continue;
        undo.push(foldNav(nav, options));
    }
    return () => undo.splice(0).forEach((off) => off());
}
