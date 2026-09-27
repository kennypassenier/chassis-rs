// The component contracts, framework-free [L7, DI4, DI10].
//
// Kenny's standing rule 31, and DI10's own wording: drive it from
// attributes rather than per-button code, so a new button gets the
// behaviour by declaring it instead of by someone remembering.
//
// Two contracts are enforced here, both of them the kind that a review
// catches once and then stops catching:
//
//   1. A destructive button must offer an undo or a confirmation
//      (SC 3.3.4 Error Prevention, AA). It is an OR, not an AND.
//   2. A badge or alert carrying a semantic colour must also say what it
//      means in text (DI4). Seven pale plates are one plate to someone
//      who cannot tell the colours apart.
//
// A violation is reported, loudly, and the offending control is disarmed
// rather than left to delete something. It is not thrown: one bad button
// on a dashboard should not take the page down with it.
//
// Recoverable since 3.0.0 [KT6, decision D7]. The first version disabled
// a consumer's button, forgot what the button had been, offered no way
// to detach and never looked again — so markup that arrived a moment too
// late stayed dead for the life of the page. Now enforcement records
// what it changed, returns a detach that puts it back, re-evaluates when
// called again, exempts what the consumer marks, and says what it says
// through the dictionary. The rule is the same; the ownership moved.

import { getStrings } from './strings.js';

/** Dispatched on the offending element, bubbling, with the Violation as detail. */
export const VIOLATION_EVENT = 'kp-contract-violation';

/** @typedef {'DI10' | 'DI4'} Rule */
/** @typedef {{ rule: Rule, element: Element, message: string }} Violation */

/**
 * How long the `inline` variant stays armed.
 *
 * DI10's evidence, which is not the folklore: "undo beats confirmation"
 * has no controlled study behind it, while confirmations carrying a small
 * obstacle still worked for 44-74% of users after some twenty exposures,
 * against 20% or less for purely visual ones. Arm-then-act was that
 * obstacle until 4.0.0; it is now the `inline` variant, and the default
 * is the dialog TH107 asks for.
 *
 * Configurable rather than hard-coded, because it is an operational knob:
 * a dashboard whose users delete all day wants a longer window than a
 * settings page. Per element too, as `data-kp-confirm-ms`.
 */
export const CONFIRM_WINDOW_MS = 4000;

/** The two confirmation obstacles: the dialog TH107 asks for, and the arm-then-act 3.x shipped. */
export const CONFIRM_MODES = /** @type {const} */ (['dialog', 'inline']);

/** Marks a button whose confirmation another channel already owns [AR29]. */
export const CONFIRM_OWNED = '[data-kp-confirm-owner]';

/**
 * The one-shot lock AR27 is about.
 *
 * After Confirm the click is re-fired on the button, so a consumer
 * listening for an ordinary click needs to change nothing. Re-firing
 * naively does not work, and this was measured before it was decided:
 * the listener that opened the dialog catches the re-fired click and
 * opens it again — `["open", "confirm", "open"] posts: 0` — and re-firing
 * synchronously is worse, because the browser's in-flight-click flag
 * turns it into a silent no-op with no error and no clue.
 *
 * So the handler names the element here, the listener sees it, clears it,
 * and lets that one click through untouched. It is cleared on the tick it
 * is consumed and never on a timer: a lock that outlives its click leaves
 * that button unguarded for the rest of the page, and that failure is
 * invisible until someone deletes the wrong row.
 *
 * @type {Element | null}
 */
let unlocked = null;

/** Ids for the dialog's title and description, unique per page. */
let dialogSeq = 0;

/**
 * Open the modal confirmation for `button`, and call `onAccept` if it is
 * taken [TH107, T14, AR28].
 *
 * A native `<dialog>` shown with `showModal()`: the browser does the
 * focus trap, the Escape close and the focus return, which this package
 * already relies on twice. Escape and Cancel do nothing at all.
 *
 * **Written here rather than imported from `js/overlays.js`, on purpose.**
 * chassis-rs bakes six of this package's JavaScript modules into a Rust
 * binary, and the import closure of those six is exactly those six —
 * `js/overlays.js` is not among them. One import edge makes
 * `/static/kp/overlays.js` a 404, the module graph fail, and their whole
 * `chassis.js` die: the theme picker, the contract enforcer, the
 * confirmations and the skip links with it. `gates/check-closure.mjs`
 * holds that closure at six.
 *
 * @param {HTMLElement} button the control the confirmation belongs to
 * @param {{ phrase?: string, strings?: Partial<import('./strings.js').Strings>, onAccept?: () => void, onCancel?: () => void, className?: string, initialFocus?: 'cancel' | 'accept' }} [options]
 * @returns {HTMLDialogElement} the dialog, so a consumer can reach the state this set [KT6]
 */
export function openConfirmation(button, { phrase, strings, onAccept, onCancel, className = '', initialFocus = 'cancel' } = {}) {
    const s = { ...getStrings(), ...strings };
    const text = phrase ?? button.getAttribute('data-kp-confirm') ?? s.confirm;

    // showModal() light-dismisses every open `popover="auto"` — measured
    // for AR28: the menu goes open → closed, the button stays connected
    // but checkVisibility() is false, and focus lands on <body>. TH107
    // requires focus to return to the BUTTON, so the button has to be
    // visible again first. Not a knob: it is what the feature promises.
    const displaced = [...document.querySelectorAll('[popover]')].filter((el) => el.matches(':popover-open'));

    const id = `kp-confirm-${++dialogSeq}`;
    const dialog = document.createElement('dialog');
    dialog.className = `kp-dialog kp-confirm ${className}`.trim();
    dialog.setAttribute('data-kp-confirm-dialog', '');
    dialog.setAttribute('aria-labelledby', `${id}-phrase`);
    dialog.setAttribute('aria-describedby', `${id}-description`);

    const title = document.createElement('h2');
    title.className = 'kp-dialog__title';
    title.id = `${id}-phrase`;
    title.textContent = text;

    const description = document.createElement('p');
    description.className = 'kp-dialog__description';
    description.id = `${id}-description`;
    description.textContent = s.confirmDescription;

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'kp-button';
    cancel.setAttribute('data-kp-confirm-cancel', '');
    cancel.textContent = s.confirmCancel;
    cancel.addEventListener('click', () => dialog.close(''));

    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'kp-button kp-button--destructive';
    accept.setAttribute('data-kp-confirm-accept', '');
    accept.textContent = s.confirmAccept;
    accept.addEventListener('click', () => dialog.close('accept'));

    const actions = document.createElement('div');
    actions.className = 'kp-dialog__actions';
    actions.append(cancel, accept);
    dialog.append(title, description, actions);
    document.body.append(dialog);

    dialog.addEventListener('close', () => {
        const taken = dialog.returnValue === 'accept';
        dialog.remove();
        for (const popover of displaced) {
            if (popover.isConnected && !popover.matches(':popover-open')) /** @type {HTMLElement} */ (popover).showPopover();
        }
        if (button.isConnected) button.focus();
        if (taken) onAccept?.();
        else onCancel?.();
    });

    dialog.showModal();
    // The destructive answer must not be the one a stray Enter takes.
    // A consumer whose confirmation is not destructive says so [KT6].
    (initialFocus === 'accept' ? accept : cancel).focus();
    return dialog;
}

/** Markup the consumer excludes from enforcement: `data-kp-contract-ignore`. */
export const EXEMPT = '[data-kp-contract-ignore]';

/**
 * @param {ParentNode} root
 * @param {{ rules?: Rule[], exempt?: string }} [options]
 * @returns {Violation[]}
 */
export function findViolations(root = document, { rules = ['DI10', 'DI4'], exempt = EXEMPT } = {}) {
    /** @type {Violation[]} */
    const violations = [];
    const s = getStrings();

    if (rules.includes('DI10'))
        for (const el of root.querySelectorAll('[data-kp-destructive]')) {
            if (el.matches(exempt)) continue;
            if (!el.hasAttribute('data-kp-confirm') && !el.hasAttribute('data-kp-undo')) {
                violations.push({ rule: 'DI10', element: el, message: s.contractDestructive });
            }
        }

    if (rules.includes('DI4'))
        for (const el of root.querySelectorAll('[data-kp-semantic]')) {
            if (el.matches(exempt)) continue;
            // Text, or an image with an accessible name. An icon that is
            // aria-hidden carries nothing, which is the usual mistake.
            const text = (el.textContent ?? '').trim();
            const named = el.querySelector('[aria-label], [aria-labelledby], title');
            if (text === '' && named === null) {
                violations.push({ rule: 'DI4', element: el, message: s.contractSemantic });
            }
        }

    return violations;
}

/** What enforcement changed on an element, so detach can put it back. */
const changed = new WeakMap();

/**
 * Report the violations and disarm what they point at.
 *
 * Idempotent: calling it again first restores everything it changed
 * before and then looks afresh, so markup completed after the first
 * pass comes back to life. Returns a detach that restores without
 * re-evaluating. The list is also available on the return value, so a
 * test asserts on it rather than on console output.
 *
 * @param {ParentNode} root
 * @param {{ disable?: boolean, rules?: Rule[], exempt?: string, log?: ((message: string, element: Element) => void) | null }} [options]
 * @returns {(() => void) & { violations: Violation[] }}
 */
export function enforceContracts(
    root = document,
    { disable = true, rules, exempt, log = (message, element) => console.error(message, element) } = {},
) {
    // Restore first: a second pass over a repaired page must not carry
    // the marks of the first.
    for (const el of root.querySelectorAll('[data-kp-contract-error]')) restore(el);

    const violations = findViolations(root, { rules, exempt });
    for (const v of violations) {
        /** @type {{ disabled?: boolean }} */
        const before = {};
        if (disable && v.rule === 'DI10' && 'disabled' in v.element) {
            const button = /** @type {HTMLButtonElement} */ (v.element);
            before.disabled = button.disabled;
            button.disabled = true;
        }
        changed.set(v.element, before);
        v.element.setAttribute('data-kp-contract-error', v.rule);
        log?.(`[kp-themes ${v.rule}] ${v.message}`, v.element);
        v.element.dispatchEvent(new CustomEvent(VIOLATION_EVENT, { bubbles: true, detail: v }));
    }

    const detach = () => {
        for (const v of violations) restore(v.element);
    };
    return Object.assign(detach, { violations });
}

/** @param {Element} el */
function restore(el) {
    const before = changed.get(el);
    if (before !== undefined && 'disabled' in el) /** @type {HTMLButtonElement} */ (el).disabled = before.disabled ?? false;
    changed.delete(el);
    el.removeAttribute('data-kp-contract-error');
}

/**
 * Give every destructive button that asked for a confirmation its
 * obstacle [TH107, DI10, AR27, AR29].
 *
 * Default `dialog`: the click is swallowed, a modal `<dialog>` opens
 * carrying the attribute's phrase, Escape and Cancel do nothing, and
 * Confirm re-fires the click behind the one-shot lock above, so the
 * consumer's own handler runs exactly once. `inline` is the arm-then-act
 * of 3.x, kept as a variant rather than deleted; `data-kp-confirm-mode`
 * chooses per element.
 *
 * @param {ParentNode} root
 * @param {{ mode?: 'dialog' | 'inline', windowMs?: number, disarmOnBlur?: boolean, strings?: Partial<import('./strings.js').Strings>, ownedBy?: string, dialogClassName?: string }} [options]
 * @returns {() => void} detach
 */
export function attachConfirmations(
    root = document,
    { mode = 'dialog', windowMs = CONFIRM_WINDOW_MS, disarmOnBlur = true, strings, ownedBy = CONFIRM_OWNED, dialogClassName = '' } = {},
) {
    /** @type {(() => void)[]} */
    const cleanups = [];

    for (const el of root.querySelectorAll('[data-kp-confirm]')) {
        const button = /** @type {HTMLButtonElement} */ (el);
        // AR29, and it is a defect shipped today rather than a risk being
        // avoided: components/button.jsx writes `data-kp-confirm` too, and
        // js/auto.js runs this over the whole document in kyu, Almanac and
        // chassis alike. Measured in both browsers before the repair: the
        // two channels re-armed each other's button forever and the action
        // never fired at any number of clicks. A consumer who wants this
        // module over a React button anyway passes `ownedBy: ''`.
        if (ownedBy !== '' && button.matches(ownedBy)) continue;
        if (button.dataset.kpConfirmAttached === '1') continue;
        button.dataset.kpConfirmAttached = '1';

        const original = button.textContent ?? '';
        const phrase = button.dataset.kpConfirm || getStrings().confirm;
        const elementMode =
            button.dataset.kpConfirmMode === 'inline' || button.dataset.kpConfirmMode === 'dialog' ? button.dataset.kpConfirmMode : mode;
        // Per element beats per call: one page mixes a two-second window
        // on a list and a ten-second one on the account deletion.
        const window_ = Number(button.dataset.kpConfirmMs) || windowMs;
        let armed = false;
        let timer = 0;
        /** @type {HTMLDialogElement | null} */
        let open = null;

        const disarm = () => {
            armed = false;
            button.textContent = original;
            button.removeAttribute('data-kp-armed');
            clearTimeout(timer);
        };
        const onBlur = () => {
            if (disarmOnBlur) disarm();
        };

        /** @param {Event} event */
        const onDialogClick = (event) => {
            if (unlocked === button) {
                // The re-fired click, let through untouched, exactly once.
                unlocked = null;
                return;
            }
            // The click is the question, not the action, so it must not
            // reach anything else — capture and stop, rather than trust
            // that no other listener acts.
            event.preventDefault();
            event.stopImmediatePropagation();
            if (open?.open) return;
            open = openConfirmation(button, {
                phrase,
                strings,
                className: dialogClassName,
                onAccept: () => {
                    unlocked = button;
                    button.click();
                },
            });
        };

        /** @param {Event} event */
        const onInlineClick = (event) => {
            if (armed) {
                disarm();
                return; // the real handler runs: this click is the deliberate one
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            armed = true;
            button.textContent = phrase;
            button.setAttribute('data-kp-armed', 'true');
            timer = window.setTimeout(disarm, window_);
        };

        const onClick = elementMode === 'inline' ? onInlineClick : onDialogClick;
        button.addEventListener('click', onClick, { capture: true });
        if (elementMode === 'inline') button.addEventListener('blur', onBlur);
        cleanups.push(() => {
            button.removeEventListener('click', onClick, { capture: true });
            if (elementMode === 'inline') button.removeEventListener('blur', onBlur);
            delete button.dataset.kpConfirmAttached;
            // Nothing this module set outlives the detach [KT6]: not the
            // armed label, not an open dialog, and not the lock.
            if (unlocked === button) unlocked = null;
            open?.close('');
            disarm();
        });
    }

    return () => {
        for (const c of cleanups) c();
    };
}

/**
 * Move focus to the target of a skip link, adding `tabindex="-1"` if the
 * target cannot take focus on its own [KT6].
 *
 * JobTracker found the half a skip link needs and nothing here provided:
 * without a focusable target the browser scrolls and the next Tab goes
 * back into the menu, so the link has done nothing for the person it
 * exists for. Returns whether a target was found and focused.
 *
 * @param {string} href `#main`, or any same-page hash
 * @param {Document | Element} [root]
 * @returns {boolean}
 */
export function skipTo(href, root = document) {
    const id = href.startsWith('#') ? href.slice(1) : href;
    if (id === '') return false;
    const target = /** @type {HTMLElement | null} */ (root.querySelector(`#${CSS.escape(id)}`));
    if (target === null) return false;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
    return true;
}

/** Fired on the control when it appears or goes away: `{ shown }`. */
export const TO_TOP_EVENT = 'kp-to-top';

/** The attribute that marks a back-to-top control [feat-page-1]. */
export const TO_TOP = '[data-kp-to-top]';

/**
 * Wire every back-to-top control under `root` [feat-page-1].
 *
 * Two halves, and the second is the one usually missing: it takes the
 * reader back, and it takes the FOCUS back. A control that only scrolls
 * leaves a keyboard user at the bottom of the document with the view at
 * the top, which is worse than not moving at all.
 *
 * Where the focus lands is `data-kp-to-top-target`, a selector, and it
 * falls back to the document's own body — the top of the page, which is
 * what the control is named after. It is NOT the skip link's target: on a
 * page with anything tall above the content, focusing that landmark
 * scrolls straight back down to it and undoes the journey. Scrolling is
 * left to the browser: `scrollTo` follows the root's own scroll-behaviour,
 * which is the knob feat-layout-2 already put there and which a reader who
 * asked for less motion has already overruled.
 *
 * @param {ParentNode} root
 * @param {{ strings?: Partial<import('./strings.js').Strings>, after?: number }} [options]
 * @returns {() => void} detach
 */
export function attachToTop(root = document, { strings, after } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];

    for (const el of root.querySelectorAll(TO_TOP)) {
        const button = /** @type {HTMLElement} */ (el);
        if (button.dataset.kpToTopAttached !== undefined) continue;
        button.dataset.kpToTopAttached = '';
        const doc = button.ownerDocument;
        const view = doc.defaultView;
        if (!view) continue;

        const threshold = after ?? Number(button.getAttribute('data-kp-to-top-after') ?? '400');
        const target = button.getAttribute('data-kp-to-top-target') ?? '';
        const s = { ...getStrings(), ...strings };
        if (button.getAttribute('aria-label') === null && button.textContent?.trim() === '') {
            button.setAttribute('aria-label', s.backToTop);
        }
        // An empty control gets the package's glyph [gap-12]: written the
        // documented way it painted as an empty box. The element is empty
        // and hidden from the accessibility tree — the arrow is drawn by
        // css/components.css and the name above is what is read.
        /** @type {HTMLElement | null} */
        let glyph = null;
        if (button.children.length === 0 && button.textContent?.trim() === '') {
            glyph = doc.createElement('span');
            glyph.className = 'kp-to-top__glyph';
            glyph.setAttribute('aria-hidden', 'true');
            button.append(glyph);
        }

        let shown = false;
        let queued = false;
        const decide = () => {
            queued = false;
            const next = view.scrollY > threshold;
            if (next === shown) return;
            shown = next;
            button.toggleAttribute('data-kp-to-top-shown', next);
            button.dispatchEvent(new CustomEvent(TO_TOP_EVENT, { bubbles: true, detail: { shown: next } }));
        };
        const onScroll = () => {
            // One decision per frame: a scroll fires far more often than a
            // page can paint, and the answer cannot change in between.
            if (queued) return;
            queued = true;
            view.requestAnimationFrame(decide);
        };
        const onClick = () => {
            view.scrollTo({ top: 0 });
            // The focus goes too, and it goes WITHOUT scrolling. Focusing an
            // element normally brings it into view, which undid the journey:
            // on a page whose main landmark starts 2737px down, "back to
            // top" landed back at 3476. So the target is the top of the
            // document unless the page names another, and either way the
            // focus moves quietly while the scroll above does the travelling.
            const to = /** @type {HTMLElement | null} */ (target === '' ? null : doc.querySelector(target)) ?? doc.body;
            if (!to.hasAttribute('tabindex')) to.setAttribute('tabindex', '-1');
            to.focus({ preventScroll: true });
        };

        decide();
        view.addEventListener('scroll', onScroll, { passive: true });
        button.addEventListener('click', onClick);

        cleanups.push(() => {
            view.removeEventListener('scroll', onScroll);
            button.removeEventListener('click', onClick);
            button.removeAttribute('data-kp-to-top-shown');
            glyph?.remove();
            delete button.dataset.kpToTopAttached;
        });
    }

    return () => {
        for (const c of cleanups) c();
    };
}

/** Fired on the nav when its toggle opens or closes it: `{ open }`. */
export const NAV_TOGGLE_EVENT = 'kp-nav-toggle';

/** The mark the React NavBar puts on a toggle it wires itself [AR29]. */
export const NAV_OWNED = '[data-kp-nav-owner]';

/**
 * Wire the toggle a narrow navigation collapses into [scope-10, stage 1.3].
 *
 * Opt-in by the button being there: a nav without one keeps the behaviour
 * it had, which is what makes this additive for every page already built.
 * The CSS decides when the bar is narrow enough to collapse; this decides
 * nothing about width at all, so the two cannot disagree.
 *
 * Every state it sets has a way out [KT6]: the toggle itself, Escape while
 * the focus is inside the nav, a click outside it, and the `kp-nav-toggle`
 * event for a consumer who wants to persist or veto nothing but observe.
 * `detach` removes what attach stamped.
 *
 * @param {ParentNode} root
 * @param {{ strings?: Partial<import('./strings.js').Strings>, ownedBy?: string }} [options]
 * @returns {() => void} detach
 */
export function attachNavToggles(root = document, { strings, ownedBy = NAV_OWNED } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];

    for (const el of root.querySelectorAll('[data-kp-nav-toggle]')) {
        const button = /** @type {HTMLElement} */ (el);
        // AR29, and it is the fault that shipped once already: two channels
        // wiring the same button re-armed each other's state forever. The
        // React NavBar marks its own, and a consumer who wants this module
        // over a React nav anyway passes `ownedBy: ''`.
        if (ownedBy !== '' && button.matches(ownedBy)) continue;
        if (button.dataset.kpNavToggleAttached !== undefined) continue;
        button.dataset.kpNavToggleAttached = '';

        const nav = button.closest('.kp-nav') ?? button.parentElement;
        if (!nav) continue;
        const links = nav.querySelector('.kp-nav__links');

        // aria-controls needs an id, and a page that did not give one still
        // deserves the association rather than silence.
        if (links && !links.id) links.id = `kp-nav-links-${cleanups.length}-${Math.random().toString(36).slice(2, 8)}`;
        if (links) button.setAttribute('aria-controls', links.id);

        const label = () => {
            const s = { ...getStrings(), ...strings };
            return nav.hasAttribute('data-kp-nav-open') ? s.closeMenu : s.menu;
        };
        /** @param {boolean} open */
        const write = (open) => {
            nav.toggleAttribute('data-kp-nav-open', open);
            button.setAttribute('aria-expanded', String(open));
            button.setAttribute('aria-label', label());
        };
        /** @param {boolean} open */
        const set = (open) => {
            write(open);
            nav.dispatchEvent(new CustomEvent(NAV_TOGGLE_EVENT, { bubbles: true, detail: { open } }));
        };
        // Attaching is not a toggle. This wrote the starting state THROUGH
        // the dispatch, so every consumer listening heard a close that
        // nobody performed, on every page load — found by the first test
        // ever to listen.
        write(nav.hasAttribute('data-kp-nav-open'));

        const onClick = () => set(!nav.hasAttribute('data-kp-nav-open'));
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            if (event.key !== 'Escape' || !nav.hasAttribute('data-kp-nav-open')) return;
            set(false);
            button.focus();
        };
        /** @param {Event} event */
        const onOutside = (event) => {
            if (!nav.hasAttribute('data-kp-nav-open')) return;
            if (nav.contains(/** @type {Node} */ (event.target))) return;
            set(false);
        };

        button.addEventListener('click', onClick);
        nav.addEventListener('keydown', /** @type {EventListener} */ (onKey));
        document.addEventListener('click', onOutside, true);

        cleanups.push(() => {
            button.removeEventListener('click', onClick);
            nav.removeEventListener('keydown', /** @type {EventListener} */ (onKey));
            document.removeEventListener('click', onOutside, true);
            nav.removeAttribute('data-kp-nav-open');
            button.removeAttribute('aria-expanded');
            button.removeAttribute('aria-label');
            button.removeAttribute('aria-controls');
            delete button.dataset.kpNavToggleAttached;
        });
    }

    return () => {
        for (const c of cleanups) c();
    };
}

/** Fired on the wrapper when a sticky bar turns compact or back: `{ compact }`. */
export const NAV_COMPACT_EVENT = 'kp-nav-compact';

/** The mark the React NavBar puts on a sticky wrapper it wires itself [AR29]. */
export const NAV_STICKY_OWNED = '[data-kp-nav-sticky-owner]';

/**
 * The box that scrolls `el`: its nearest ancestor whose block overflow
 * scrolls, or the document's root element.
 *
 * @param {HTMLElement} el
 * @returns {HTMLElement}
 */
function scrollerOf(el) {
    const doc = el.ownerDocument;
    for (let at = el.parentElement; at !== null && at !== doc.body && at !== doc.documentElement; at = at.parentElement) {
        const overflow = getComputedStyle(at).overflowY;
        if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') return at;
    }
    return /** @type {HTMLElement} */ (doc.scrollingElement ?? doc.documentElement);
}

/**
 * Wire every sticky nav bar under `root` [scope-48 wave 2].
 *
 * Opt-in by the modifier `.kp-nav-wrap--sticky`; the CSS makes the bar
 * stick, this decides when it is compact and tells the scrolling box how
 * tall it is. Two things, both undone by `detach`:
 *
 * - `data-kp-nav-compact` on the wrapper once the box has scrolled further
 *   than `data-kp-nav-sticky-after` (px, and never less than the bar's own
 *   height at rest, which is the default), and off again once it is back
 *   within that distance less the bar's height. The gap between the two is not decoration: shrinking the
 *   bar moves the content under it up, the browser's scroll anchoring moves
 *   the scroll position with it, and without a gap at least that wide the
 *   bar would flip between its two heights at the threshold.
 * - `--kp-nav-sticky-height` and `data-kp-nav-sticky-root` on the scrolling
 *   box (the document's root, or the nearest ancestor that scrolls), which
 *   the box's `scroll-padding-block-start` reads, so an anchor or a focused
 *   element lands below the bar. A page's own `--kp-scroll-offset` wins.
 *
 * @param {ParentNode} root
 * @param {{ ownedBy?: string, after?: number }} [options]
 * @returns {() => void} detach
 */
export function attachStickyNavs(root = document, { ownedBy = NAV_STICKY_OWNED, after } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {HTMLElement[]} */
    const found = [];
    if (root instanceof HTMLElement && root.matches('.kp-nav-wrap--sticky')) found.push(root);
    for (const el of root.querySelectorAll('.kp-nav-wrap--sticky')) found.push(/** @type {HTMLElement} */ (el));

    for (const wrap of found) {
        if (ownedBy !== '' && wrap.matches(ownedBy)) continue;
        cleanups.push(stickyNav(wrap, after));
    }

    return () => {
        for (const c of cleanups) c();
    };
}

/**
 * One sticky bar; the React NavBar calls this for the wrapper it renders.
 *
 * @param {HTMLElement} wrap the `.kp-nav-wrap--sticky` element
 * @param {number} [after] px; overrides `data-kp-nav-sticky-after`
 * @returns {() => void} detach
 */
export function stickyNav(wrap, after) {
    if (wrap.dataset.kpNavStickyAttached !== undefined) return () => {};
    const doc = wrap.ownerDocument;
    const view = doc.defaultView;
    if (!view) return () => {};
    wrap.dataset.kpNavStickyAttached = '';

    const scroller = scrollerOf(wrap);
    const isDocument = scroller === doc.scrollingElement || scroller === doc.documentElement;
    const target = isDocument ? view : scroller;
    const offset = () => (isDocument ? view.scrollY : scroller.scrollTop);
    scroller.setAttribute('data-kp-nav-sticky-root', '');

    let compact = wrap.hasAttribute('data-kp-nav-compact');
    let restHeight = wrap.getBoundingClientRect().height;
    let queued = false;

    const measure = () => {
        const height = wrap.getBoundingClientRect().height;
        if (!compact) restHeight = height;
        scroller.style.setProperty('--kp-nav-sticky-height', `${height}px`);
    };

    const decide = () => {
        queued = false;
        const attribute = wrap.getAttribute('data-kp-nav-sticky-after');
        const asked = after ?? (attribute !== null && attribute !== '' ? Number(attribute) : 0);
        const threshold = Math.max(restHeight, Number.isFinite(asked) ? asked : 0);
        const at = offset();
        const next = compact ? at > Math.max(0, threshold - restHeight) : at > threshold;
        if (next === compact) return;
        compact = next;
        wrap.toggleAttribute('data-kp-nav-compact', next);
        wrap.dispatchEvent(new CustomEvent(NAV_COMPACT_EVENT, { bubbles: true, detail: { compact: next } }));
    };
    const onScroll = () => {
        // One decision per frame, as the back-to-top control does.
        if (queued) return;
        queued = true;
        view.requestAnimationFrame(decide);
    };

    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resize?.observe(wrap);
    measure();
    decide();
    target.addEventListener('scroll', onScroll, { passive: true });

    return () => {
        target.removeEventListener('scroll', onScroll);
        resize?.disconnect();
        wrap.removeAttribute('data-kp-nav-compact');
        scroller.removeAttribute('data-kp-nav-sticky-root');
        scroller.style.removeProperty('--kp-nav-sticky-height');
        delete wrap.dataset.kpNavStickyAttached;
    };
}

/** What a bar item's dropdown is, as opposed to its mega menu's panel. */
const DROPDOWN = ':scope > .kp-nav__menu:not(.kp-nav__menu--wide)';

/**
 * The box a bar's panel is actually seen in, in window coordinates
 * [fix-39].
 *
 * The window is only the outermost of them. Kenny's review of 2026-09-16
 * read the mega menu block inside the review dialog, whose stage carries
 * `contain: strict` and `overflow: auto` (catalogue/catalogue.css,
 * `.cat-review-dialog__stage`); the Account dropdown fitted the window by
 * 300px and the stage cut 70 to 83px off its right side all the same,
 * because the only reading anyone took was `clientWidth`. A consumer that
 * puts a bar in a panel that scrolls has the same box.
 *
 * Every ancestor that clips narrows the answer, read at its padding box —
 * a border and a scrollbar are not room to be seen in. The panel is
 * absolutely positioned, so every one of them is in its containing block's
 * chain and every one of them cuts it.
 *
 * @param {Element} element the panel
 * @returns {{ left: number, right: number }} the inline edges it must stay between
 */
const viewBox = (element) => {
    let left = 0;
    let right = document.documentElement.clientWidth;
    for (let node = element.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        // `contain` counts too, and on its own: `contain: paint` clips
        // while `overflow` still computes to `visible`.
        if (style.overflowX === 'visible' && !/\b(paint|strict|content)\b/.test(style.contain)) continue;
        const box = node.getBoundingClientRect();
        left = Math.max(left, box.left + node.clientLeft);
        right = Math.min(right, box.left + node.clientLeft + node.clientWidth);
    }
    return { left, right };
};

/**
 * How far a box lies outside the box that shows it, in pixels; 0 when inside.
 *
 * @param {DOMRect} box
 * @param {{ left: number, right: number }} view
 */
const overflowOf = (box, view) => Math.max(0, view.left - box.left) + Math.max(0, box.right - view.right);

/**
 * Slide a panel along the inline axis until it lies inside `view` [fix-39].
 *
 * Kenny, on the dropdown the review dialog cut: "Als er niet genoeg plaats
 * is moet het dropdown item naar links bewegen tot zijn rechterkant de
 * rechterkant van het venster is en alles dus zichtbaar is". So the panel
 * moves by exactly what hangs out, and never so far that the other side
 * leaves instead — a panel wider than the box keeps its start edge, where
 * a reader begins, rather than being centred on a cut.
 *
 * Written as `--kp-nav-menu-shift` (css/components.css), so the stylesheet
 * keeps the placement and this only corrects it.
 *
 * @param {Element} panel the panel, open and already on the edge it takes
 * @param {{ left: number, right: number }} view
 */
const slideIntoView = (panel, view) => {
    const element = /** @type {HTMLElement} */ (panel);
    element.style.removeProperty('--kp-nav-menu-shift');
    const box = element.getBoundingClientRect();
    if (box.width === 0) return;
    let shift = Math.min(0, view.right - box.right);
    // The start edge wins the tie: pulling it back in undoes as much of the
    // slide as it has to, and no more.
    if (box.left + shift < view.left) shift = view.left - box.left;
    // Sub-pixel shifts are the box's own rounding, not a cut.
    if (Math.abs(shift) < 1) return;
    element.style.setProperty('--kp-nav-menu-shift', `${Math.round(shift * 100) / 100}px`);
};

/**
 * Hang a bar item's open dropdown from whichever edge keeps it in the
 * window [fix-27].
 *
 * The panel hangs from its item's start edge. Under the last item of a bar
 * whose links sit at the window's end, that ran it past the window's right
 * edge in all 22 themes (grotesk's catalogue bar, Kenny's note of
 * 2026-09-14). A stylesheet cannot see where the window ends, so this
 * measures the open panel on both edges and keeps the one that lies less
 * outside — the start edge when both fit — writing
 * `data-kp-nav-menu-end` on the panel for the other. Both channels call it:
 * the module on hover and focus, the React NavBar from its item.
 *
 * Changing edges is not always enough, because the box that shows the bar
 * is not always the window [fix-39]: in a box that clips, both of an item's
 * edges can lie inside the window while the panel under it is cut. So the
 * edge is chosen against the box the panel is really seen in, and what
 * still hangs out afterwards is slid back in (`slideIntoView`).
 *
 * @param {Element} item the `.kp-nav__links > li` that holds the dropdown
 * @param {boolean} [retry] measure once more on the next frame when the panel is not open yet; default true
 * @returns {boolean} whether the panel now hangs from the end edge
 */
export function placeNavMenu(item, retry = true) {
    const menu = item.querySelector(DROPDOWN);
    if (!menu) return false;
    menu.removeAttribute('data-kp-nav-menu-end');
    /** @type {HTMLElement} */ (menu).style.removeProperty('--kp-nav-menu-shift');
    const start = menu.getBoundingClientRect();
    // Not open yet: a pointer that has just entered the item is not
    // `:hover` in the style until the next frame (measured in firefox), so
    // the panel is measured once more then. Still closed, nothing is written.
    if (start.width === 0) {
        if (retry) requestAnimationFrame(() => placeNavMenu(item, false));
        return false;
    }
    const view = viewBox(menu);
    const fromStart = overflowOf(start, view);
    let end = false;
    if (fromStart > 0) {
        menu.setAttribute('data-kp-nav-menu-end', '');
        end = overflowOf(menu.getBoundingClientRect(), view) < fromStart;
        if (!end) menu.removeAttribute('data-kp-nav-menu-end');
    }
    slideIntoView(menu, view);
    return end;
}

/**
 * Line an open mega menu's panel up with its bar's edges [scope-48].
 *
 * The panel is placed in whatever box contains it, and the registers
 * disagree about which box that is: the `.kp-nav-wrap` in the base, the
 * bar itself in eight registers, and cyberpunk's strip of links, which
 * must stay positioned because its cut-corner plate hangs from it. So the
 * bar is measured against that box, and the two offsets are written as
 * `--kp-nav-mega-start` and `--kp-nav-mega-end` on the panel.
 *
 * Lined up with its bar the panel is normally inside whatever shows the
 * bar, but it is placed against a box and judged against another, so it is
 * held to the same question the dropdown is [fix-39]: a bar wider than the
 * box that shows it would otherwise carry its panel out with it.
 *
 * @param {Element} panel the `.kp-nav__menu--wide`, open
 */
export function placeNavPanel(panel) {
    const element = /** @type {HTMLElement} */ (panel);
    const bar = element.closest('.kp-nav');
    const box = element.offsetParent;
    element.style.removeProperty('--kp-nav-menu-shift');
    if (!bar || !box || element.getBoundingClientRect().width === 0) return;
    const b = bar.getBoundingClientRect();
    const c = box.getBoundingClientRect();
    // Offsets are taken from the padding box, inside the border.
    const left = b.left - (c.left + box.clientLeft);
    const right = c.left + box.clientLeft + box.clientWidth - b.right;
    const rtl = getComputedStyle(element).direction === 'rtl';
    element.style.setProperty('--kp-nav-mega-start', `${rtl ? right : left}px`);
    element.style.setProperty('--kp-nav-mega-end', `${rtl ? left : right}px`);
    slideIntoView(element, viewBox(element));
}

/**
 * Wire every bar's dropdowns and mega menus [fix-27, scope-48].
 *
 * Dropdowns open on hover and on focus within, in CSS; this only places an
 * open one so it stays in the window (`placeNavMenu`), when it opens and
 * again when the window changes size.
 *
 * A mega menu is a `data-kp-nav-disclosure` button beside a
 * `.kp-nav__menu--wide` panel. The button gets `aria-expanded` and an
 * `aria-controls` naming the panel (an id is given when the panel has
 * none), and the panel shows while it says `true`. Every open state has a
 * way out [KT6]: the button again, Escape while the focus is in the bar
 * (the focus goes back to the button), a click outside the item, and the
 * focus leaving it. One panel is open at a time: opening one closes the
 * others. A button with no words of its own is named from the dictionary
 * (`navDisclosure`). The React NavBar wires its own bar and marks it
 * `data-kp-nav-owner`, so this module leaves that bar alone [AR29].
 *
 * @param {ParentNode} root
 * @param {{ strings?: Partial<import('./strings.js').Strings>, ownedBy?: string }} [options]
 * @returns {() => void} detach
 */
export function attachNavMenus(root = document, { strings, ownedBy = NAV_OWNED } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const navs = [...(root instanceof Element && root.matches('.kp-nav') ? [root] : []), ...root.querySelectorAll('.kp-nav')];

    for (const el of navs) {
        const nav = /** @type {HTMLElement} */ (el);
        if (ownedBy !== '' && nav.matches(ownedBy)) continue;
        if (nav.dataset.kpNavMenusAttached !== undefined) continue;
        nav.dataset.kpNavMenusAttached = '';

        /** @param {EventTarget | null} target */
        const itemOf = (target) => (target instanceof Element ? target.closest('.kp-nav__links > li') : null);

        /** @param {Event} event */
        const onEnter = (event) => {
            const item = itemOf(event.target);
            if (item && nav.contains(item) && item.querySelector(DROPDOWN)) placeNavMenu(item);
        };
        const placeOpen = () => {
            for (const item of nav.querySelectorAll('.kp-nav__links > li')) if (item.querySelector(DROPDOWN)) placeNavMenu(item, false);
            for (const panel of nav.querySelectorAll('.kp-nav__links > li > .kp-nav__menu--wide')) placeNavPanel(panel);
        };

        const buttons = /** @type {HTMLElement[]} */ ([...nav.querySelectorAll('[data-kp-nav-disclosure]')]);
        /** @type {Map<HTMLElement, { panel: Element | null, stamped: string[] }>} */
        const wired = new Map();
        for (const button of buttons) {
            const panel = button.parentElement?.querySelector(':scope > .kp-nav__menu--wide') ?? null;
            /** @type {string[]} */
            const stamped = ['aria-expanded'];
            if (panel && !panel.id) panel.id = `kp-nav-panel-${Math.random().toString(36).slice(2, 10)}`;
            if (panel && !button.hasAttribute('aria-controls')) {
                button.setAttribute('aria-controls', panel.id);
                stamped.push('aria-controls');
            }
            if (!(button.textContent ?? '').trim() && !button.hasAttribute('aria-label') && !button.hasAttribute('aria-labelledby')) {
                button.setAttribute('aria-label', { ...getStrings(), ...strings }.navDisclosure);
                stamped.push('aria-label');
            }
            button.setAttribute('aria-expanded', 'false');
            wired.set(button, { panel, stamped });
        }

        const openButton = () => buttons.find((b) => b.getAttribute('aria-expanded') === 'true') ?? null;
        /** @param {HTMLElement} button @param {boolean} open */
        const set = (button, open) => {
            if (open) for (const other of buttons) if (other !== button) other.setAttribute('aria-expanded', 'false');
            button.setAttribute('aria-expanded', String(open));
            const panel = wired.get(button)?.panel;
            if (open && panel) placeNavPanel(panel);
        };

        /** @param {Event} event */
        const onClick = (event) => {
            const button = /** @type {HTMLElement} */ (event.currentTarget);
            set(button, button.getAttribute('aria-expanded') !== 'true');
        };
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            const button = openButton();
            if (event.key !== 'Escape' || !button) return;
            set(button, false);
            button.focus();
        };
        /** @param {Event} event */
        const onOutside = (event) => {
            const button = openButton();
            if (!button) return;
            if (button.parentElement?.contains(/** @type {Node} */ (event.target))) return;
            set(button, false);
        };
        /** @param {FocusEvent} event */
        const onFocusOut = (event) => {
            const button = openButton();
            const to = event.relatedTarget;
            // A press on the panel's ground moves the focus nowhere; that is not leaving.
            if (!button || !(to instanceof Node)) return;
            if (button.parentElement?.contains(to)) return;
            set(button, false);
        };

        nav.addEventListener('pointerover', onEnter);
        nav.addEventListener('focusin', onEnter);
        nav.addEventListener('keydown', /** @type {EventListener} */ (onKey));
        nav.addEventListener('focusout', /** @type {EventListener} */ (onFocusOut));
        for (const button of buttons) button.addEventListener('click', onClick);
        document.addEventListener('click', onOutside, true);
        window.addEventListener('resize', placeOpen);
        placeOpen();

        cleanups.push(() => {
            nav.removeEventListener('pointerover', onEnter);
            nav.removeEventListener('focusin', onEnter);
            nav.removeEventListener('keydown', /** @type {EventListener} */ (onKey));
            nav.removeEventListener('focusout', /** @type {EventListener} */ (onFocusOut));
            document.removeEventListener('click', onOutside, true);
            window.removeEventListener('resize', placeOpen);
            for (const [button, { stamped }] of wired) {
                button.removeEventListener('click', onClick);
                for (const name of stamped) button.removeAttribute(name);
            }
            for (const menu of nav.querySelectorAll('[data-kp-nav-menu-end]')) menu.removeAttribute('data-kp-nav-menu-end');
            for (const menu of nav.querySelectorAll('.kp-nav__menu')) {
                /** @type {HTMLElement} */ (menu).style.removeProperty('--kp-nav-menu-shift');
            }
            for (const panel of nav.querySelectorAll('.kp-nav__menu--wide')) {
                /** @type {HTMLElement} */ (panel).style.removeProperty('--kp-nav-mega-start');
                /** @type {HTMLElement} */ (panel).style.removeProperty('--kp-nav-mega-end');
            }
            delete nav.dataset.kpNavMenusAttached;
        });
    }

    return () => {
        for (const c of cleanups) c();
    };
}

/**
 * Make every `.kp-skip-link` (or `[data-kp-skip]`) move focus, not only
 * the scroll position.
 *
 * @param {ParentNode} root
 * @returns {() => void} detach
 */
export function attachSkipLinks(root = document) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    for (const el of root.querySelectorAll('.kp-skip-link, [data-kp-skip]')) {
        const link = /** @type {HTMLAnchorElement} */ (el);
        if (link.dataset.kpSkipAttached !== undefined) continue;
        link.dataset.kpSkipAttached = '';
        /** @param {Event} event */
        const onClick = (event) => {
            if (skipTo(link.getAttribute('href') ?? '')) event.preventDefault();
        };
        link.addEventListener('click', onClick);
        cleanups.push(() => {
            link.removeEventListener('click', onClick);
            delete link.dataset.kpSkipAttached;
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}
