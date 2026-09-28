// The side navigation [feat-nav-3].
//
// Built to the feature list Kenny pointed at — MDBootstrap's sidenav, read
// on 2026-09-11 — translated into this package's conventions rather than
// copied: every option is a `data-kp-sidenav-*` attribute, so a page that
// never loads a module still gets a navigation, and the module only adds
// what markup cannot express.
//
// What the module owns, and CSS does not:
//
//   · the offset a `side` or `push` mode puts on a content element this
//     component does not own — CSS cannot reach across to a selector the
//     consumer named;
//   · the focus trap and the focus return, which are keyboard facts;
//   · the scroll lock;
//   · the backdrop element, so a consumer can put a class on it;
//   · remembering, when the page asks for it by naming a key.
//
// Every state has a named way out [KT6]: the toggler, Escape, the
// backdrop, the `kp-sidenav-*` events, the handle `sidenavOf()` returns,
// and the detach.

import { getStrings } from './strings.js';
import { paintRemembered, sidenavGroups } from './remember.js';

export const SIDENAV_TOGGLE_EVENT = 'kp-sidenav-toggle';
export const SIDENAV_SLIM_EVENT = 'kp-sidenav-slim';
export const SIDENAV_MODE_EVENT = 'kp-sidenav-mode';

/** The mark a consumer puts on a toggler they wire themselves [AR29]. */
export const SIDENAV_OWNED = '[data-kp-sidenav-owner]';

/**
 * Every option, written out.
 *
 * Built by joining a prefix to a name at first, which worked and hid the
 * whole surface: no gate could enumerate the options, and the
 * documentation site's extractor found one attribute whose name was the
 * bare prefix. An option nobody can list is an option nobody can
 * document [AR21].
 */
export const OPTIONS = {
    mode: 'data-kp-sidenav-mode',
    position: 'data-kp-sidenav-position',
    side: 'data-kp-sidenav-side',
    open: 'data-kp-sidenav-open',
    slim: 'data-kp-sidenav-slim',
    slimCollapsed: 'data-kp-sidenav-slim-collapsed',
    expandOnHover: 'data-kp-sidenav-expand-on-hover',
    accordion: 'data-kp-sidenav-accordion',
    backdrop: 'data-kp-sidenav-backdrop',
    backdropClass: 'data-kp-sidenav-backdrop-class',
    closeOnEsc: 'data-kp-sidenav-close-on-esc',
    lockScroll: 'data-kp-sidenav-lock-scroll',
    focusTrap: 'data-kp-sidenav-focus-trap',
    content: 'data-kp-sidenav-content',
    /** The older spelling of `data-kp-remember`, still read [js/remember.js]. */
    remember: 'data-kp-sidenav-remember',
    toggle: 'data-kp-sidenav-toggle',
    slimToggle: 'data-kp-sidenav-slim-toggle',
    slimHide: 'data-kp-sidenav-slim-hide',
    slimShow: 'data-kp-sidenav-slim-show',
    expanded: 'data-kp-sidenav-expanded',
    overBelow: 'data-kp-sidenav-over-below',
    narrow: 'data-kp-sidenav-narrow',
};

/**
 * The width at and below which a panel with `data-kp-sidenav-over-below`
 * and no length of its own becomes an `over` panel [scope-80]: the 40rem
 * the bar collapses at and the table falls into cards at, so the package
 * steps at one width rather than at two [TH104, TH26].
 */
const NARROW_STEP = '40rem';

/** @type {WeakMap<Element, Sidenav>} */
const handles = new WeakMap();

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
function wantsName(toggler) {
    if (toggler.getAttribute('aria-label') !== null) return true;
    const clone = /** @type {Element} */ (toggler.cloneNode(true));
    for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
    return (clone.textContent ?? '').trim() === '';
}

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Wire every `.kp-sidenav` under `root`.
 *
 * @param {ParentNode} root
 * @param {{ strings?: Partial<import('./strings.js').Strings>, ownedBy?: string, store?: Storage | null }} [options]
 * @returns {() => void} detach
 */
export function attachSidenavs(root = document, { strings, ownedBy = SIDENAV_OWNED, store } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];

    for (const element of root.querySelectorAll('.kp-sidenav')) {
        const panel = /** @type {HTMLElement} */ (element);
        if (panel.dataset.kpSidenavAttached !== undefined) continue;
        panel.dataset.kpSidenavAttached = '';
        if (!panel.id) panel.id = `kp-sidenav-${Math.random().toString(36).slice(2, 8)}`;

        const doc = panel.ownerDocument;
        const read = (/** @type {string} */ attribute) => panel.getAttribute(attribute);
        const on = (/** @type {string} */ attribute, /** @type {boolean} */ fallback) => {
            const value = read(attribute);
            return value === null ? fallback : value !== 'false';
        };
        // What this panel remembers, and where: the name comes off the
        // element, never from here [Kenny, 2026-09-16]. The paint happens
        // before anything below reads the markup, so the starting state is
        // read from the memory the same way it is read from the markup.
        const memory = paintRemembered(panel, 'sidenav', { storage: store });

        /** @type {HTMLElement | null} */
        let backdrop = null;
        /** @type {Element | null} */
        let restoreFocusTo = null;

        const mode = () => read(OPTIONS.mode) ?? 'side';
        const isOpen = () => panel.getAttribute(OPTIONS.open) !== 'false' && (mode() === 'side' || panel.getAttribute(OPTIONS.open) === 'true');
        const covering = () => mode() === 'over';

        const togglers = () =>
            [...doc.querySelectorAll('[data-kp-sidenav-toggle]')].filter(
                (t) => (t.getAttribute('aria-controls') ?? '') === panel.id || t.getAttribute('aria-controls') === null,
            );

        /** The element a push or side mode makes room in. */
        const contentEl = () => {
            const selector = read(OPTIONS.content);
            return selector === null ? null : /** @type {HTMLElement | null} */ (doc.querySelector(selector));
        };

        /** @param {boolean} open */
        const offsetContent = (open) => {
            const target = contentEl();
            if (!target) return { property: null, value: '' };
            // side pads, push pushes — the reference's own distinction, and
            // it matters: padding keeps a background under the panel, a
            // margin moves the whole box.
            const property = mode() === 'push' ? 'marginInlineStart' : 'paddingInlineStart';
            // The panel's own painted width, not the token's default. The
            // knob is usually set on the panel, where the content element
            // cannot see it: a panel asked for 11rem moved its content by
            // 15rem, and the gap showed.
            const value = open && mode() !== 'over' ? getComputedStyle(panel).inlineSize : '';
            target.style.marginInlineStart = '';
            target.style.paddingInlineStart = '';
            target.style[property] = value;
            return { property, value };
        };

        /** @param {boolean} open */
        const say = (open) => {
            const s = { ...getStrings(), ...strings };
            for (const toggler of togglers()) {
                if (ownedBy !== '' && toggler.matches(ownedBy)) continue;
                toggler.setAttribute('aria-expanded', String(open));
                toggler.setAttribute('aria-controls', panel.id);
                if (wantsName(toggler)) {
                    toggler.setAttribute('aria-label', open ? s.closeSidebar : s.sidebar);
                }
            }
        };

        const dropBackdrop = () => {
            backdrop?.remove();
            backdrop = null;
        };

        const raiseBackdrop = () => {
            if (backdrop || !covering() || !on(OPTIONS.backdrop, true)) return;
            backdrop = doc.createElement('div');
            backdrop.className = `kp-sidenav__backdrop ${read(OPTIONS.backdropClass) ?? ''}`.trim();
            // The backdrop belongs to the same box the panel does. A panel
            // scoped to a container with an absolute position had a fixed
            // backdrop over the whole window, which dimmed a page that was
            // never asked about.
            if (read(OPTIONS.position) === 'absolute') backdrop.style.position = 'absolute';
            backdrop.addEventListener('click', () => close());
            panel.after(backdrop);
        };

        /** @param {KeyboardEvent} event */
        const onTrap = (event) => {
            if (event.key !== 'Tab' || !covering() || !isOpen() || !on(OPTIONS.focusTrap, true)) return;
            const stops = [.../** @type {NodeListOf<HTMLElement>} */ (panel.querySelectorAll(FOCUSABLE))].filter((el) => el.offsetParent !== null);
            if (stops.length === 0) return;
            const first = stops[0];
            const last = stops[stops.length - 1];
            const active = doc.activeElement;
            if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            } else if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
            }
        };

        /**
         * @param {boolean} open
         * @param {boolean} [moveFocus]
         * @param {boolean} [save] whether this is a state to remember — a
         *   person's choice is, an adaptation to the room the panel is in is
         *   not. A window narrowed past the step closes the panel; widening
         *   it again must not find it closed because of that [Kenny, 2026-09-16].
         */
        const set = (open, moveFocus = true, save = true) => {
            panel.setAttribute(OPTIONS.open, String(open));
            say(open);
            const offset = offsetContent(open);
            if (open) raiseBackdrop();
            else dropBackdrop();

            if (on(OPTIONS.lockScroll, false)) doc.documentElement.style.overflow = open && covering() ? 'hidden' : '';

            if (moveFocus && covering()) {
                if (open) {
                    restoreFocusTo = doc.activeElement;
                    /** @type {HTMLElement | null} */ (panel.querySelector(FOCUSABLE))?.focus();
                } else if (restoreFocusTo instanceof HTMLElement) {
                    restoreFocusTo.focus();
                    restoreFocusTo = null;
                }
            }

            if (save) memory?.write('open', open);
            panel.dispatchEvent(new CustomEvent(SIDENAV_TOGGLE_EVENT, { bubbles: true, detail: { open } }));
            panel.dispatchEvent(new CustomEvent(SIDENAV_MODE_EVENT, { bubbles: true, detail: { mode: mode(), offset } }));
        };

        /** @param {{ remember?: boolean }} [options] */
        const close = ({ remember = true } = {}) => set(false, true, remember);
        /** @param {{ remember?: boolean }} [options] */
        const open = ({ remember = true } = {}) => set(true, true, remember);

        /**
         * The buttons that collapse and expand this rail without a line of
         * script [gap-12]: `data-kp-sidenav-slim-toggle`, pointed at the panel
         * by `aria-controls` — or at every rail, when it names none, the way
         * `data-kp-sidenav-toggle` does.
         */
        const slimTogglers = () =>
            [...doc.querySelectorAll(`[${OPTIONS.slimToggle}]`)].filter(
                (t) => (t.getAttribute('aria-controls') ?? '') === panel.id || t.getAttribute('aria-controls') === null,
            );

        /** @param {boolean} collapsed */
        const saySlim = (collapsed) => {
            if (read(OPTIONS.slim) === null) return;
            const s = { ...getStrings(), ...strings };
            for (const toggler of slimTogglers()) {
                if (ownedBy !== '' && toggler.matches(ownedBy)) continue;
                // Expanded is the state a button reports: pressed, a
                // collapsed rail widens [ARIA disclosure].
                toggler.setAttribute('aria-expanded', String(!collapsed));
                toggler.setAttribute('aria-controls', panel.id);
                if (wantsName(toggler)) {
                    toggler.setAttribute('aria-label', collapsed ? s.expandRail : s.collapseRail);
                }
            }
        };

        /** @param {boolean} [collapsed] */
        const setSlim = (collapsed) => {
            if (read(OPTIONS.slim) === null) return;
            const next = collapsed ?? panel.getAttribute(OPTIONS.slimCollapsed) === null;
            panel.toggleAttribute(OPTIONS.slimCollapsed, next);
            saySlim(next);
            memory?.write('rail', next);
            panel.dispatchEvent(new CustomEvent(SIDENAV_SLIM_EVENT, { bubbles: true, detail: { collapsed: next } }));
        };

        /** @param {'over' | 'side' | 'push'} next */
        const setMode = (next) => {
            panel.setAttribute(OPTIONS.mode, next);
            set(isOpen(), false, false);
        };

        // Categories. The accordion option is the reference's: with it on,
        // opening one closes the others.
        const saveGroups = () => {
            if (memory === null) return;
            /** @type {Record<string, boolean>} */
            const state = {};
            for (const { group, id } of sidenavGroups(panel)) state[id] = group.hasAttribute(OPTIONS.expanded);
            memory.write('groups', state);
        };

        /** @param {Event} event */
        const onCategory = (event) => {
            const toggle = /** @type {HTMLElement | null} */ (
                event.target instanceof Element ? event.target.closest('.kp-sidenav__category-toggle') : null
            );
            if (!toggle || !panel.contains(toggle)) return;
            const category = toggle.closest('.kp-sidenav__category');
            if (!category) return;
            const expanded = category.hasAttribute(OPTIONS.expanded);
            if (!expanded && on(OPTIONS.accordion, false)) {
                for (const other of panel.querySelectorAll('.kp-sidenav__category[data-kp-sidenav-expanded]')) {
                    other.removeAttribute(OPTIONS.expanded);
                    other.querySelector('.kp-sidenav__category-toggle')?.setAttribute('aria-expanded', 'false');
                }
            }
            category.toggleAttribute(OPTIONS.expanded, !expanded);
            toggle.setAttribute('aria-expanded', String(!expanded));
            saveGroups();
        };

        /** @param {Event} event */
        const onToggleClick = (event) => {
            const toggler = /** @type {Element | null} */ (event.target instanceof Element ? event.target.closest('[data-kp-sidenav-toggle]') : null);
            if (!toggler) return;
            if (ownedBy !== '' && toggler.matches(ownedBy)) return;
            const controls = toggler.getAttribute('aria-controls');
            if (controls !== null && controls !== panel.id) return;
            set(!isOpen());
        };

        /** @param {Event} event */
        const onSlimClick = (event) => {
            const toggler = /** @type {Element | null} */ (event.target instanceof Element ? event.target.closest(`[${OPTIONS.slimToggle}]`) : null);
            if (!toggler) return;
            if (ownedBy !== '' && toggler.matches(ownedBy)) return;
            const controls = toggler.getAttribute('aria-controls');
            if (controls !== null && controls !== panel.id) return;
            setSlim();
        };

        /** @param {KeyboardEvent} event */
        const onEsc = (event) => {
            if (event.key !== 'Escape' || !on(OPTIONS.closeOnEsc, true) || mode() === 'side' || !isOpen()) return;
            close();
        };

        // Narrow [scope-80]. A rail beside the content is right on a wide
        // screen and a column of its own on a phone, so a panel that says
        // `data-kp-sidenav-over-below` — with a length, or the package's
        // 40rem — becomes the `over` panel while the box it lives in is that
        // wide or narrower: away until its toggle opens it, with the focus
        // trap, Escape, the backdrop and the focus return that mode already
        // has, and its words back even when the rail was collapsed to
        // icons. Above the width it is what the markup declared again, slim
        // state included. The box is the panel's parent, as the bar measures
        // its own wrapper [TH104]; an over panel is fixed, so it does not
        // change the width it is measured by.
        //
        // The controls follow the state, through `hidden`, which the package
        // lets win over every display rule [KT13]: this panel's
        // `data-kp-sidenav-toggle` buttons — the one in the bar and the close
        // inside the panel, which is the way out while the panel covers the
        // bar — are shown only while narrow, and its slim toggles only while
        // wide. Markup that starts them `hidden` stays right without the
        // module. `data-kp-sidenav-narrow` on the panel says which it is.
        const overBelow = read(OPTIONS.overBelow);
        /** @type {{ mode: string | null, slim: boolean } | null} */
        let declared = null;
        /** @type {Map<HTMLElement, boolean>} */
        const hiddenAtAttach = new Map();
        /** @param {Element} control @param {boolean} hide */
        const hideControl = (control, hide) => {
            if (!(control instanceof HTMLElement) || (ownedBy !== '' && control.matches(ownedBy))) return;
            if (!hiddenAtAttach.has(control)) hiddenAtAttach.set(control, control.hasAttribute('hidden'));
            control.toggleAttribute('hidden', hide);
        };
        const threshold = () => {
            const length = (overBelow ?? '').trim() || NARROW_STEP;
            const size = parseFloat(length);
            if (length.endsWith('rem')) return size * parseFloat(getComputedStyle(doc.documentElement).fontSize);
            if (length.endsWith('em')) return size * parseFloat(getComputedStyle(panel.parentElement ?? panel).fontSize);
            return size;
        };
        /** Change the mode without the slide: a resize is not an opening. @param {() => void} change */
        const still = (change) => {
            const before = panel.style.transition;
            panel.style.transition = 'none';
            change();
            void panel.offsetWidth;
            panel.style.transition = before;
        };
        const applyNarrow = () => {
            const box = panel.parentElement;
            if (overBelow === null || box === null) return;
            const narrow = box.clientWidth <= threshold();
            for (const control of togglers()) hideControl(control, !narrow);
            if (read(OPTIONS.slim) !== null) for (const control of slimTogglers()) hideControl(control, narrow);
            if (narrow === (declared !== null)) return;
            still(() => {
                if (narrow) {
                    declared = { mode: read(OPTIONS.mode), slim: panel.hasAttribute(OPTIONS.slimCollapsed) };
                    panel.setAttribute(OPTIONS.narrow, '');
                    panel.removeAttribute(OPTIONS.slimCollapsed);
                    panel.setAttribute(OPTIONS.mode, 'over');
                    set(false, false, false);
                } else {
                    const was = /** @type {{ mode: string | null, slim: boolean }} */ (declared);
                    declared = null;
                    panel.removeAttribute(OPTIONS.narrow);
                    if (was.mode === null) panel.removeAttribute(OPTIONS.mode);
                    else panel.setAttribute(OPTIONS.mode, was.mode);
                    panel.toggleAttribute(OPTIONS.slimCollapsed, was.slim);
                    saySlim(was.slim);
                    set(mode() === 'side', false, false);
                }
            });
        };
        const narrowWatch =
            overBelow !== null && panel.parentElement !== null && typeof ResizeObserver === 'function' ? new ResizeObserver(applyNarrow) : null;

        // The starting state. A side panel is there unless told otherwise;
        // the two that cover are away until asked, which is the reference's
        // `hidden` default written as a mode rather than as a flag.
        let start = mode() === 'side';
        if (panel.hasAttribute(OPTIONS.open)) start = panel.getAttribute(OPTIONS.open) === 'true';
        if (read(OPTIONS.slimCollapsed) !== null) panel.setAttribute(OPTIONS.slimCollapsed, '');
        set(start, false, false);
        saySlim(panel.getAttribute(OPTIONS.slimCollapsed) !== null);
        applyNarrow();
        if (narrowWatch !== null && panel.parentElement !== null) narrowWatch.observe(panel.parentElement);

        for (const toggle of panel.querySelectorAll('.kp-sidenav__category-toggle')) {
            const category = toggle.closest('.kp-sidenav__category');
            toggle.setAttribute('aria-expanded', String(category?.hasAttribute('data-kp-sidenav-expanded') ?? false));
        }

        doc.addEventListener('click', onToggleClick);
        doc.addEventListener('click', onSlimClick);
        panel.addEventListener('click', onCategory);
        doc.addEventListener('keydown', /** @type {EventListener} */ (onEsc));
        panel.addEventListener('keydown', /** @type {EventListener} */ (onTrap));

        /** @type {Sidenav} */
        const handle = {
            element: panel,
            open,
            close,
            toggle: ({ remember = true } = {}) => set(!isOpen(), true, remember),
            setMode,
            setSlim,
            isOpen,
            destroy: () => {},
        };

        const detach = () => {
            narrowWatch?.disconnect();
            if (declared !== null) {
                panel.removeAttribute(OPTIONS.narrow);
                if (declared.mode === null) panel.removeAttribute(OPTIONS.mode);
                else panel.setAttribute(OPTIONS.mode, declared.mode);
                panel.toggleAttribute(OPTIONS.slimCollapsed, declared.slim);
                declared = null;
            }
            for (const [control, hidden] of hiddenAtAttach) control.toggleAttribute('hidden', hidden);
            doc.removeEventListener('click', onToggleClick);
            doc.removeEventListener('click', onSlimClick);
            panel.removeEventListener('click', onCategory);
            doc.removeEventListener('keydown', /** @type {EventListener} */ (onEsc));
            panel.removeEventListener('keydown', /** @type {EventListener} */ (onTrap));
            dropBackdrop();
            offsetContent(false);
            if (on(OPTIONS.lockScroll, false)) doc.documentElement.style.overflow = '';
            panel.removeAttribute(OPTIONS.open);
            for (const toggler of togglers()) {
                toggler.removeAttribute('aria-expanded');
                toggler.removeAttribute('aria-label');
            }
            if (read(OPTIONS.slim) !== null) {
                for (const toggler of slimTogglers()) {
                    if (ownedBy !== '' && toggler.matches(ownedBy)) continue;
                    toggler.removeAttribute('aria-expanded');
                    toggler.removeAttribute('aria-label');
                }
            }
            delete panel.dataset.kpSidenavAttached;
            handles.delete(panel);
        };
        handle.destroy = detach;
        handles.set(panel, handle);
        cleanups.push(detach);
    }

    return () => {
        for (const c of cleanups) c();
    };
}
