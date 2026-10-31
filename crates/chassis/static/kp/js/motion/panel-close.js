// Closing menus and popovers as their opening reversed, and the ghost that plays a browser-hidden popover's close.
import { reduced } from './timing.js';
import { playedOut } from './fold.js';
import { playEntranceBackwards, stopReversing } from './reverse.js';

/** The attribute a panel carries while playClose() plays its close. */
export const CLOSING_ATTRIBUTE = 'data-kp-closing';
/** The panels that hang from a trigger and close as their opening reversed. */
export const PANEL_SELECTOR = '.kp-popover:not(.kp-tooltip), .kp-menu, .kp-combobox__list, .kp-datepicker__panel';
/**
 * Play the close of a panel that is about to be hidden (a menu, a popover):
 * its opening played backwards, frame for frame, in the opening's own time
 * (Kenny, 2026-10-06: every close is its open played backwards; menus and
 * popovers hid at once until now, research/PACKAGE_FINDINGS.md). The panel
 * carries `[data-kp-closing]` meanwhile, so a register can draw a close of
 * its own there instead (blueprint: the same trace under a second name, so
 * the browser restarts it) or run its transitions to the closed state
 * (synthwave). The caller hides the panel once this settles true, then calls
 * stopClose(); a stopClose() before that (the panel wanted back) settles it
 * false and leaves the opening where it stands.
 * @param {HTMLElement} el
 * @returns {Promise<boolean>} true once the close played out (or there was nothing to play)
 */
export async function playClose(el) {
    stopClose(el);
    if (reduced() || !el.isConnected) return true;
    const before = getComputedStyle(el).animationName;
    el.setAttribute(CLOSING_ATTRIBUTE, '');
    const now = getComputedStyle(el).animationName;
    const own = Boolean(now) && now !== 'none' && now !== before;
    let stopped = false;
    const me = /** @type {any} */ (el);
    /** @type {Promise<unknown>[]} */
    const waits = [];
    if (own) {
        waits.push(playedOut(el, 0));
    } else {
        waits.push(playEntranceBackwards(el));
    }
    // Transitions to the closed state (a register keying them on
    // `[data-kp-closing]`) are waited for as well.
    for (const a of el.getAnimations({ subtree: true })) {
        if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) waits.push(a.finished.catch(() => undefined));
    }
    me.__kpClosing = () => {
        stopped = true;
        stopReversing(el);
        el.removeAttribute(CLOSING_ATTRIBUTE);
    };
    await Promise.all(waits);
    if (me.__kpClosing === undefined) return false;
    delete me.__kpClosing;
    return !stopped;
}
/**
 * Tidy up after playClose() (call it once the panel is hidden), or stop one
 * still playing because the panel is wanted back: it turns round from the
 * frame on screen.
 * @param {HTMLElement} el
 */
export function stopClose(el) {
    const me = /** @type {any} */ (el);
    const stop = me.__kpClosing;
    delete me.__kpClosing;
    stop?.();
    stopReversing(el);
    el.removeAttribute(CLOSING_ATTRIBUTE);
}
/** Panels a ghost is closing now, so a second hide does not start another. */
const ghosted = new WeakSet();
/**
 * A popover the browser hides (light dismiss, Escape, a second press of its
 * trigger, `hidePopover()`) is gone before any script can play its close.
 * So, as it is about to be hidden, a copy of it takes its place in the top
 * layer for exactly as long as its close plays, and plays it. Only a panel
 * that has an opening of its own is copied; one that closes by a transition
 * (synthwave, `display … allow-discrete`) already plays its close itself.
 * @param {Event} event a `beforetoggle`
 */
function closePopoverWithGhost(event) {
    const toggle = /** @type {ToggleEvent} */ (event);
    const el = /** @type {HTMLElement} */ (toggle.target);
    if (toggle.newState !== 'closed' || !(el instanceof HTMLElement) || !el.matches(PANEL_SELECTOR)) return;
    if (reduced() || ghosted.has(el) || !el.matches(':popover-open')) return;
    const animated = [null, '::before', '::after'].some((pseudo) => {
        const name = getComputedStyle(el, pseudo).animationName;
        return Boolean(name) && name !== 'none';
    });
    const before = getComputedStyle(el).animationName;
    el.setAttribute(CLOSING_ATTRIBUTE, '');
    const leaveOwn = getComputedStyle(el).animationName;
    el.removeAttribute(CLOSING_ATTRIBUTE);
    if (!animated && (!leaveOwn || leaveOwn === 'none' || leaveOwn === before)) return;
    const box = el.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return;
    const sized = getComputedStyle(el);
    // A turned panel (phantom's tilt) draws a bounding box larger than itself: the copy, which turns the
    // same way, goes where the layout box is, centred in the drawn one (at the corner it sat 2 px off).
    // A panel that is not turned keeps the drawn box as it is.
    const matrix = sized.transform === 'none' ? null : new DOMMatrixReadOnly(sized.transform);
    const isTurned =
        (matrix !== null && (Math.abs(matrix.b) > 1e-3 || Math.abs(matrix.c) > 1e-3)) || (sized.rotate !== 'none' && sized.rotate !== '0deg');
    const turned =
        isTurned && el instanceof HTMLElement ? { x: (box.width - el.offsetWidth) / 2, y: (box.height - el.offsetHeight) / 2 } : { x: 0, y: 0 };
    const ghost = /** @type {HTMLElement} */ (el.cloneNode(true));
    for (const one of [ghost, ...ghost.querySelectorAll('[id]')]) one.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('popover', 'manual');
    ghost.setAttribute('data-kp-ghost', '');
    ghost.inert = true;
    Object.assign(ghost.style, {
        position: 'fixed',
        inset: 'auto',
        top: `${box.top + turned.y}px`,
        left: `${box.left + turned.x}px`,
        width: sized.width,
        height: sized.height,
        margin: '0',
        boxSizing: sized.boxSizing,
        pointerEvents: 'none',
        positionAnchor: 'none',
        positionArea: 'none',
    });
    el.after(ghost);
    ghosted.add(el);
    const done = () => {
        ghost.remove();
        ghosted.delete(el);
    };
    // Wanted back meanwhile: the ghost goes at once, the panel opens again.
    const back = (/** @type {Event} */ e) => {
        if (/** @type {ToggleEvent} */ (e).newState !== 'open') return;
        el.removeEventListener('beforetoggle', back);
        stopClose(ghost);
        done();
    };
    const play = () => {
        el.addEventListener('beforetoggle', back);
        void playClose(ghost).then(() => {
            el.removeEventListener('beforetoggle', back);
            done();
        });
    };
    // Firefox refuses to show a popover while another one is being hidden
    // ("Cannot show a popover during the show or hide of another popover"),
    // which is exactly now: it takes the ghost one task later, before the
    // next frame in practice. Chromium takes it at once.
    try {
        ghost.showPopover();
        play();
    } catch {
        setTimeout(() => {
            if (!ghost.isConnected || el.matches(':popover-open')) return done();
            try {
                ghost.showPopover();
            } catch {
                return done();
            }
            play();
        }, 0);
    }
}
if (typeof document !== 'undefined') document.addEventListener('beforetoggle', closePopoverWithGhost, true);
