// The bottom tab bar for phone widths [kpadopt-nav].
//
// The homelab dashboard drew its own (`.nx-tabbar`, chrome.js
// `mountTabBar`): the four frequent areas within thumb reach, a "More" tab
// that opens a sheet, a count on the tab that needs the reader. The look is
// CSS (`.kp-tabbar` in css/components.css, one answer per register); this
// file is the little that CSS cannot do:
//
//   <nav class="kp-tabbar" aria-label="Areas">
//     <a class="kp-tabbar__tab" href="/" aria-current="page" data-kp-tab="home">
//       <span class="kp-tabbar__icon"><svg …/></span>
//       <span class="kp-tabbar__label">Home</span>
//     </a>
//     <a class="kp-tabbar__tab" href="/inbox" data-kp-tab="inbox">
//       <span class="kp-tabbar__icon"><svg …/></span>
//       <span class="kp-tabbar__label">Needs you</span>
//       <span class="kp-badge kp-tabbar__badge" hidden></span>
//     </a>
//     <button type="button" class="kp-tabbar__tab kp-tabbar__tab--more" data-kp-dialog="more-drawer">
//       <span class="kp-tabbar__icon kp-tabbar__icon--more" aria-hidden="true"></span>
//       <span class="kp-tabbar__label">More</span>
//     </button>
//   </nav>
//   <dialog class="kp-drawer kp-dialog" id="more-drawer">…</dialog>
//
// The More tab opens a drawer through the page's existing `data-kp-dialog`
// wiring (attachDialogs, js/overlays.js); this adds what a tab bar needs of
// it: the tab says it opens a dialog (`aria-haspopup`) and whether it is open
// (`aria-expanded`), and it reads as the current tab (`aria-current="true"`, a
// current item of the set, as the folding bar's More button does) while the
// drawer holds the current page, that is while a `[aria-current]` link is
// inside it. A tab the page marked itself is left as the page marked it.
//
// The drawer is closed by its close button (give it a visible glyph: `×`),
// Escape, a press on the strip of page the drawer leaves open at its start edge
// on a phone (`dialog[data-kp-tabbar-drawer]`, css/components.css), and a press
// on one of its entries.
//
// The bar publishes its height as `--kp-tabbar-height` on the root while it is
// on the screen (0px when it is not), so the page keeps its last line, a toast
// and the back-to-top control clear of it, whatever the theme or the safe-area
// inset makes of its height.
//
// `setTabbarBadge(tab, count)` writes a count (every digit of it, never capped or abbreviated; hidden at 0
// or null); `setTabbarCurrent(bar, id)` moves `aria-current` to the tab with
// that `data-kp-tab`; `setTabbarBusy(tab, busy)` puts one tab to wait. Nothing runs on import; attachTabbars(root) returns a
// detach.

/** A tab bar. */
export const TABBAR = '.kp-tabbar';

/** The root property the bar's height is published on while the bar is shown. */
export const TABBAR_HEIGHT_PROPERTY = '--kp-tabbar-height';

/**
 * Write a count on a tab: all its digits (12 is 12 and 1534 is 1534, never `99+`
 * or `1.5k`: Kenny, 2026-10-03, a counter shows the real number), nothing and hidden at
 * 0 or `null`. The badge is made when the tab has none. A tab that has a
 * count is the one place the bar speaks for something that moved, so the
 * count is also on the tab as `data-kp-count`, for a register or a test.
 *
 * @param {Element} tab a `.kp-tabbar__tab`
 * @param {number | null} count
 * @returns {HTMLElement | null} the badge
 */
export function setTabbarBadge(tab, count) {
    let badge = /** @type {HTMLElement | null} */ (tab.querySelector('.kp-tabbar__badge'));
    const whole = count === null || !Number.isFinite(count) ? 0 : Math.trunc(count);
    const none = whole <= 0;
    if (!badge) {
        if (none) return null;
        badge = tab.ownerDocument.createElement('span');
        badge.className = 'kp-badge kp-tabbar__badge';
        tab.append(badge);
    }
    badge.hidden = none;
    badge.textContent = none ? '' : String(whole);
    if (none) tab.removeAttribute('data-kp-count');
    else tab.setAttribute('data-kp-count', String(whole));
    return badge;
}

/**
 * Make one tab the current page: `aria-current="page"` on it, off the others.
 * A `data-kp-tab` that matches no tab leaves every tab not current, which is
 * right for a page that lives behind the More tab (that tab marks itself).
 *
 * @param {Element} bar a `.kp-tabbar`
 * @param {string | null} id the `data-kp-tab` of the current tab
 */
export function setTabbarCurrent(bar, id) {
    // A tab that opens a dialog is current by what its dialog holds (attachTabbars), not by this.
    for (const tab of bar.querySelectorAll('.kp-tabbar__tab:not([data-kp-dialog])')) {
        if (id !== null && tab.getAttribute('data-kp-tab') === id) tab.setAttribute('aria-current', 'page');
        else tab.removeAttribute('aria-current');
    }
}

/**
 * Put a tab to wait: `aria-busy` on it and the theme's own spinner
 * (`.kp-spinner`) in the icon's place, which has its size, so the tab does not
 * move. Not busy puts the icon back.
 *
 * @param {Element} tab a `.kp-tabbar__tab`
 * @param {boolean} busy
 */
export function setTabbarBusy(tab, busy) {
    const icon = tab.querySelector('.kp-tabbar__icon');
    if (!icon) return;
    const spinner = icon.querySelector(':scope > .kp-spinner');
    tab.toggleAttribute('aria-busy', busy);
    if (busy) tab.setAttribute('aria-busy', 'true');
    if (busy && !spinner) {
        const made = tab.ownerDocument.createElement('span');
        made.className = 'kp-spinner';
        made.setAttribute('aria-hidden', 'true');
        icon.append(made);
    } else if (!busy) spinner?.remove();
}

/** @param {HTMLElement} bar @returns {() => void} */
function wire(bar) {
    const doc = bar.ownerDocument;
    const view = doc.defaultView;
    if (!view) return () => {};
    /** @type {(() => void)[]} */
    const undo = [];

    // The height, published while the bar is on the screen. A static bar sits in
    // the page's flow and gives nobody room to keep.
    if (!bar.classList.contains('kp-tabbar--static')) {
        const root = doc.documentElement;
        const publish = () => {
            const shown = view.getComputedStyle(bar).display !== 'none';
            root.style.setProperty(TABBAR_HEIGHT_PROPERTY, shown ? `${bar.offsetHeight}px` : '0px');
        };
        const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
        resize?.observe(bar);
        view.addEventListener('resize', publish);
        publish();
        undo.push(() => {
            resize?.disconnect();
            view.removeEventListener('resize', publish);
            root.style.removeProperty(TABBAR_HEIGHT_PROPERTY);
        });
    }

    // A tab that opens a dialog: say so, and follow the dialog.
    for (const el of bar.querySelectorAll('.kp-tabbar__tab[data-kp-dialog]')) {
        const tab = /** @type {HTMLElement} */ (el);
        const dialog = doc.getElementById(tab.dataset.kpDialog ?? '');
        if (!(dialog instanceof HTMLDialogElement)) continue;
        tab.setAttribute('aria-haspopup', 'dialog');
        tab.setAttribute('aria-controls', dialog.id);
        // Whether it was this script that marked the tab current, so it takes back only that.
        let marked = false;
        const sync = () => {
            tab.setAttribute('aria-expanded', String(dialog.open));
            const held = dialog.querySelector('[aria-current]:not([aria-current="false"])') !== null;
            if (held && !tab.hasAttribute('aria-current')) {
                tab.setAttribute('aria-current', 'true');
                marked = true;
            } else if (!held && marked) {
                tab.removeAttribute('aria-current');
                marked = false;
            }
        };
        sync();
        // The way back, four ways [Kenny, kpadopt-nav, 2026-10-16: More "opened full screen on the right side and there
        // was no way to go back"]: the close button and Escape are the dialog's own; a press outside the panel (the
        // strip of page the drawer leaves on a phone) and a press on one of its entries are this bar's. An entry that
        // is a link still follows its link: the drawer is closed after the press, not instead of it.
        dialog.setAttribute('data-kp-tabbar-drawer', '');
        const onPress = (/** @type {MouseEvent} */ event) => {
            if (!dialog.open) return;
            const target = event.target;
            if (target === dialog) {
                const box = dialog.getBoundingClientRect();
                const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
                if (outside) dialog.close();
                return;
            }
            if (target instanceof Element && target.closest('a[href], .kp-menu__item') !== null && target.closest('[data-kp-dialog-close]') === null)
                view.setTimeout(() => dialog.close(), 0);
        };
        dialog.addEventListener('click', onPress);
        const watch = new MutationObserver(sync);
        watch.observe(dialog, { attributes: true, attributeFilter: ['open', 'aria-current'], subtree: true });
        dialog.addEventListener('close', sync);
        undo.push(() => {
            watch.disconnect();
            dialog.removeEventListener('close', sync);
            dialog.removeEventListener('click', onPress);
            dialog.removeAttribute('data-kp-tabbar-drawer');
            tab.removeAttribute('aria-haspopup');
            tab.removeAttribute('aria-controls');
            tab.removeAttribute('aria-expanded');
            if (marked) tab.removeAttribute('aria-current');
        });
    }

    return () => undo.splice(0).forEach((off) => off());
}

/** The bars wired already, so a second call is a no-op for them. */
const wired = new WeakSet();

/**
 * Wire every tab bar under `root`. Idempotent.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachTabbars(root = document) {
    /** @type {(() => void)[]} */
    const undo = [];
    /** @type {HTMLElement[]} */
    const found = [];
    if (root instanceof HTMLElement && root.matches(TABBAR)) found.push(root);
    for (const el of root.querySelectorAll(TABBAR)) found.push(/** @type {HTMLElement} */ (el));
    for (const bar of found) {
        if (wired.has(bar)) continue;
        wired.add(bar);
        const off = wire(bar);
        undo.push(() => {
            off();
            wired.delete(bar);
        });
    }
    return () => undo.splice(0).forEach((off) => off());
}
