// A dialog that leaves the way it came, and boxes that ease to a new size
// instead of jumping, growing and shrinking alike [scope-142].
//
// Kenny, 2026-10-04, approving the formal demo (research/size-motion): "het
// openen van een dialog heeft al bepaalde snelheden per thema, baseer je op
// die snelheden om te weten hoe snel je kan sluiten/uitbreiden/krimpen. Maak
// direct alle componenten voor elk thema". So nothing here carries a speed
// of its own: every duration and curve is read from the theme's dialog
// entrance, the one motion every register already decided.
//
//   - Close: the dialog plays its own entrance backwards, in two thirds of
//     the entrance's time (formal: 300 ms in, 200 ms out). The curve is the
//     entrance's own, run in reverse, so an entrance that eases out leaves
//     easing in, and a stepped one leaves in steps.
//   - Size: a box eases from its old height to its new one in four fifths of
//     the entrance's time on the entrance's curve (formal: 240 ms).
//   - Both are capped (`--kp-close-max`, 600 ms; `--kp-size-max`, 480 ms),
//     because light's and dark's entrances run over two seconds and a close
//     or a row that takes that long is in the reader's way. `--kp-motion-scale`
//     on the root plays all of it slower or faster at once.
//   - A theme with no entrance (or a reader who asked for reduced motion)
//     gets none: the dialog closes and the box takes its size at once.
//   - A register that declares `--kp-open: reverse-close` (every register
//     since 2026-10-05; Kenny's pick on research/open-reverse for formal,
//     cyberpunk and titanium, then "showing should also be the reverse of
//     removing" for all) opens as it closes, turned around: the dialog
//     plays its entrance forwards in the close's time, and what arrives in
//     an eased box plays the theme's leave backwards, so frame t of the
//     opening is frame (T - t) of the close. Several that arrive at once
//     come one by one, the highest first: the row of leaves, mirrored.
//
// What moves: every `.kp-dialog` (closing, and growing or shrinking while
// open), the accordion's items, tabs, the data table, the toast stack, the
// upload list, the combobox list, the tree, the wizard, a field whose error
// comes and goes, and any element marked `data-kp-size-motion`. Boxes that
// appear later (a framework's render) are picked up as they arrive.

import { afterPaint, settling } from './as-of.js';

/** Any box a consumer wants eased, beside the components below. */
export const SIZE_ATTRIBUTE = 'data-kp-size-motion';

/** The boxes that ease to a new size. */
export const SIZE_SELECTOR = [
    '.kp-dialog',
    '.kp-tabs',
    '.kp-datatable',
    '.kp-toasts',
    '.kp-upload__list',
    '.kp-combobox__list',
    '.kp-tree',
    '.kp-wizard',
    '.kp-field',
    `[${SIZE_ATTRIBUTE}]`,
].join(', ');

/** The disclosures that unfold and fold back. */
export const FOLD_SELECTOR = '.kp-accordion__item';

/**
 * The attributes that give a row its stable id, in the order they are read,
 * for `data-kp-arrive="new"` [port spec G]: a row added back under the key
 * of a row that just left is the same row, repainted.
 */
export const ARRIVE_KEYS = /** @type {readonly string[]} */ (Object.freeze(['data-kp-key', 'data-kp-row-key', 'id']));

/** A loading placeholder: what replaces one is the data it waited for, not news. */
const SKELETON = '.kp-skeleton, [data-kp-skeleton]';

/** How many dialogs, boxes and folds motion watches now, for a test to read. */
let watching = 0;

/**
 * How many dialogs, boxes and disclosures motion is watching right now. A
 * diagnostic: after a page removes its boxes it returns to where it was,
 * because a box that leaves the page is let go.
 * @returns {number}
 */
export function motionWatchCount() {
    return watching;
}

const CLOSE_SHARE = 2 / 3;
const SIZE_SHARE = 4 / 5;

/** @param {Element} el @param {string} name @param {number} fallback */
const msOf = (el, name, fallback) => {
    const raw = getComputedStyle(el).getPropertyValue(name).trim();
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return fallback;
    return raw.endsWith('ms') ? n : n * 1000;
};

/** @param {string} raw a CSS duration list @returns {number} the first, in ms */
const firstMs = (raw) => {
    const first = raw.split(',')[0].trim();
    const n = parseFloat(first);
    if (Number.isNaN(n)) return 0;
    return first.endsWith('ms') ? n : n * 1000;
};

// The reader's motion preference, kept current: read once and updated on
// every change, so a reader who turns reduced motion on mid-page gets it on
// the next motion (DI7).
const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let reducedNow = reducedQuery?.matches ?? false;
reducedQuery?.addEventListener('change', (event) => {
    reducedNow = event.matches;
});

/** @returns {boolean} */
const reduced = () => reducedNow;

/**
 * The theme's motion, read from its dialog entrance: a dialog drawn for an
 * instant out of sight, in the theme `scope` wears.
 *
 * @param {Element} [scope] where the theme is read (its closest `[data-theme]` applies)
 * @returns {{ open: number, ease: string, close: number, size: number }} milliseconds, and the entrance's curve
 */
export function themeMotion(scope = document.documentElement) {
    if (reduced()) return { open: 0, ease: 'linear', close: 0, size: 0 };
    const host = scope.ownerDocument?.body ?? document.body;
    const probe = document.createElement('div');
    probe.className = 'kp-dialog';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;inset:auto;left:-9999px;top:0;visibility:hidden;pointer-events:none;';
    const themed = scope.closest('[data-theme]');
    // The register's dialog rules name `.kp-dialog` under the theme's root,
    // so the probe stands where the scope stands.
    (themed && themed !== document.documentElement && themed instanceof HTMLElement ? themed : host).append(probe);
    let open = 0;
    let ease = 'ease';
    try {
        const style = getComputedStyle(probe);
        if (style.animationName && style.animationName !== 'none') {
            open = firstMs(style.animationDuration);
            ease = style.animationTimingFunction.split(/,(?![^(]*\))/)[0].trim() || 'ease';
        }
    } finally {
        probe.remove();
    }
    const root = scope.ownerDocument?.documentElement ?? document.documentElement;
    // A page may play every motion slower or faster at once (a demo's slow
    // motion, a reader's own preference): `--kp-motion-scale`, default 1.
    const scale = parseFloat(getComputedStyle(root).getPropertyValue('--kp-motion-scale')) || 1;
    return {
        open,
        ease,
        close: Math.min(open * CLOSE_SHARE, msOf(root, '--kp-close-max', 600)) * scale,
        size: Math.min(open * SIZE_SHARE, msOf(root, '--kp-size-max', 480)) * scale,
    };
}

/* ------------------------------------------------------------- closing */

/** @type {WeakMap<HTMLDialogElement, { target: Element, keyframes: Keyframe[], easing: string, pseudoElement: string | null }[]>} */
const entrances = new WeakMap();
/** @type {WeakSet<HTMLDialogElement>} */
const closing = new WeakSet();
const nativeClose = typeof HTMLDialogElement === 'undefined' ? null : HTMLDialogElement.prototype.close;

/**
 * Keep the entrance the dialog just started, so its close can play it
 * backwards: a finished entrance with `fill: backwards` is gone from the
 * element by the time the dialog closes.
 * @param {HTMLDialogElement} dialog
 */
function rememberEntrance(dialog) {
    getComputedStyle(dialog).animationName;
    const kept = entranceOf(dialog).map((a) => {
        const effect = /** @type {KeyframeEffect} */ (a.effect);
        return {
            target: /** @type {Element} */ (effect.target),
            keyframes: effect.getKeyframes(),
            easing: String(effect.getTiming().easing ?? 'linear'),
            pseudoElement: effect.pseudoElement,
        };
    });
    entrances.set(dialog, kept);
}

/**
 * The CSS animations that make up the dialog's entrance: its own and those
 * of what is in it (grotesk rules the title in under its ::before), each
 * kept on its own element. A motion that never ends is no entrance (the
 * caret terminal blinks on a ghost button's ::after): it is left alone, so
 * it neither moves to the dialog nor stops.
 * @param {HTMLDialogElement} dialog
 * @returns {CSSAnimation[]}
 */
function entranceOf(dialog) {
    return /** @type {CSSAnimation[]} */ (
        dialog
            .getAnimations({ subtree: true })
            .filter(
                (a) =>
                    a instanceof CSSAnimation &&
                    a.effect instanceof KeyframeEffect &&
                    a.effect.target !== null &&
                    Number.isFinite(Number(a.effect.getComputedTiming().activeDuration)),
            )
    );
}

/**
 * Close a dialog the way it opened, backwards, then close it for real. With
 * no entrance to reverse (reduced motion, a theme without one) it closes at
 * once.
 *
 * @param {HTMLDialogElement} dialog
 * @param {string} [returnValue]
 * @returns {Promise<void>} settled once the dialog is closed
 */
export async function closeDialog(dialog, returnValue) {
    const close = () => nativeClose?.call(dialog, returnValue);
    if (!dialog.open || closing.has(dialog)) return;
    const { close: duration } = themeMotion(dialog);
    const kept = entrances.get(dialog) ?? [];
    if (duration <= 0) return void close();
    closing.add(dialog);
    /** @type {Animation[]} */
    const out = [];
    for (const { target, keyframes, easing, pseudoElement } of kept) {
        try {
            out.push(
                target.animate(keyframes, {
                    duration,
                    easing,
                    direction: 'reverse',
                    fill: 'forwards',
                    ...(pseudoElement ? { pseudoElement } : {}),
                }),
            );
        } catch {
            /* an engine that cannot animate that pseudo-element skips it */
        }
    }
    // The backdrop leaves with the dialog when the theme gave it no motion of its own.
    if (!kept.some((one) => one.target === dialog && one.pseudoElement === '::backdrop')) {
        try {
            out.push(
                dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease-in', fill: 'forwards', pseudoElement: '::backdrop' }),
            );
        } catch {
            /* as above */
        }
    }
    if (kept.length === 0) out.push(dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease-in', fill: 'forwards' }));
    await Promise.all(out.map((a) => a.finished.catch(() => undefined)));
    closing.delete(dialog);
    close();
    for (const a of out) a.cancel();
}

/**
 * Whether the theme `el` wears opens what closes as that close played
 * backwards: its register says `--kp-open: reverse-close` (every register
 * since 2026-10-05; Kenny's pick on research/open-reverse).
 * @param {Element} el
 */
const opensAsReversedClose = (el) => getComputedStyle(el).getPropertyValue('--kp-open').trim() === 'reverse-close';

/**
 * Open `dialog` as its close played backwards [research/open-reverse]:
 * closeDialog() plays each kept entrance with `direction: 'reverse'` in
 * themeMotion().close; this replaces the register's entrance with the same
 * keyframes on the same curve, forwards, in that same time, and the
 * backdrop's fade turned around, so frame t of the opening is frame
 * (close - t) of the close. Only in a theme that asks for it.
 * @param {HTMLDialogElement} dialog
 */
function openAsReversedClose(dialog) {
    if (!dialog.open || !opensAsReversedClose(dialog)) return;
    const { close: duration } = themeMotion(dialog);
    const kept = entrances.get(dialog) ?? [];
    if (duration <= 0) return;
    for (const a of entranceOf(dialog)) a.cancel();
    for (const { target, keyframes, easing, pseudoElement } of kept) {
        try {
            target.animate(keyframes, { duration, easing, fill: 'backwards', ...(pseudoElement ? { pseudoElement } : {}) });
        } catch {
            /* an engine that cannot animate that pseudo-element skips it, as the close does */
        }
    }
    const fade = /** @type {Keyframe[]} */ ([{ opacity: 1 }, { opacity: 0 }]);
    if (!kept.some((one) => one.target === dialog && one.pseudoElement === '::backdrop')) {
        try {
            dialog.animate(fade, { duration, easing: 'ease-in', direction: 'reverse', fill: 'backwards', pseudoElement: '::backdrop' });
        } catch {
            /* as above */
        }
    }
    if (kept.length === 0) dialog.animate(fade, { duration, easing: 'ease-in', direction: 'reverse', fill: 'backwards' });
}

/**
 * Give one dialog its leaving motion: its own `close()`, Escape and the
 * backdrop all play it. `dialog.open` stays true while it plays, and the
 * `close` event comes at its end, as it does for any closed dialog.
 * @param {HTMLDialogElement} dialog
 * @returns {() => void}
 */
function attachClose(dialog) {
    const own = /** @type {any} */ (dialog);
    if (own.__kpMotion) return () => {};
    own.__kpMotion = true;
    watching += 1;
    const showModal = dialog.showModal;
    const show = dialog.show;
    own.showModal = function () {
        showModal.call(dialog);
        rememberEntrance(dialog);
        openAsReversedClose(dialog);
    };
    own.show = function () {
        show.call(dialog);
        rememberEntrance(dialog);
        openAsReversedClose(dialog);
    };
    own.close = (/** @type {string | undefined} */ value) => void closeDialog(dialog, value);
    if (dialog.open) rememberEntrance(dialog);
    // Escape: unless a listener before this one already decided (a page that
    // keeps the dialog open, or the React channel, which closes through its
    // own state and so through `close()` above).
    const onCancel = (/** @type {Event} */ event) => {
        if (event.defaultPrevented) return;
        event.preventDefault();
        void closeDialog(dialog);
    };
    dialog.addEventListener('cancel', onCancel);
    return () => {
        if (!own.__kpMotion) return;
        watching -= 1;
        dialog.removeEventListener('cancel', onCancel);
        delete own.showModal;
        delete own.show;
        delete own.close;
        delete own.__kpMotion;
    };
}

/* -------------------------------------------------------------- sizing */

/**
 * A theme switch changes many sizes at once (a field's gap, a face's
 * metrics); none of that is content arriving, so nothing glides for it. The
 * box takes its new size, as the rest of the page does. Set for two frames
 * after the root's theme changes, and while the new register's faces load.
 */
let switching = 0;
if (typeof document !== 'undefined' && typeof MutationObserver === 'function') {
    new MutationObserver(() => {
        const mine = ++switching;
        const release = () => {
            if (switching === mine) switching = 0;
        };
        requestAnimationFrame(() => requestAnimationFrame(() => void document.fonts?.ready.then(release, release)));
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

/** The attribute playEntranceBackwards() sets while it turns an entrance around. */
export const REVERSING_ATTRIBUTE = 'data-kp-reversing';

/**
 * Play the CSS entrance `el` wears now backwards, then settle: a tooltip
 * that slid in slides out, a tour card that faded in fades out, each in its
 * entrance's own time on its curve turned around, so frame t of the going
 * is frame (T - t) of the coming (Kenny, 2026-10-05: "find out where else
 * there is a discrepancy between opening/closing"). The entrance is
 * restarted reversed on the element and its pseudo-elements
 * (`[data-kp-reversing]`, css/components.css), whatever its fill, so one
 * that already played out is turned around too. With no entrance (reduced
 * motion, a theme without one) it settles at once. The caller hides the
 * element when it settles true and then calls stopReversing(), which also
 * stops it early when the element is wanted back meanwhile.
 * @param {HTMLElement} el
 * @returns {Promise<boolean>} true once played out, false when there was nothing to play or it was stopped
 */
export function playEntranceBackwards(el) {
    stopReversing(el);
    if (reduced() || !el.isConnected) return Promise.resolve(false);
    const named = (/** @type {string | null} */ pseudo) => {
        const name = getComputedStyle(el, pseudo).animationName;
        return Boolean(name) && name !== 'none';
    };
    if (![null, '::before', '::after'].some(named)) return Promise.resolve(false);
    el.setAttribute(REVERSING_ATTRIBUTE, 'reset');
    for (const pseudo of [null, '::before', '::after']) getComputedStyle(el, pseudo).animationName;
    el.setAttribute(REVERSING_ATTRIBUTE, 'play');
    for (const pseudo of [null, '::before', '::after']) getComputedStyle(el, pseudo).animationName;
    // A loop on it (a pulse) never plays out; only the entrance is waited for.
    const plays = el
        .getAnimations({ subtree: true })
        .filter(
            (a) =>
                typeof CSSAnimation !== 'undefined' &&
                a instanceof CSSAnimation &&
                /** @type {KeyframeEffect} */ (a.effect)?.target === el &&
                a.effect?.getComputedTiming().iterations !== Infinity,
        );
    if (plays.length === 0) {
        el.removeAttribute(REVERSING_ATTRIBUTE);
        return Promise.resolve(false);
    }
    return new Promise((resolve) => {
        const own = /** @type {any} */ (el);
        own.__kpReversing = () => {
            // Wanted back halfway: the entrance goes on forwards from the
            // frame on screen instead of starting over or jumping.
            for (const a of plays) {
                if (a.playState !== 'running' || a.currentTime === null) continue;
                const end = Number(a.effect?.getComputedTiming().endTime) || 0;
                a.currentTime = Math.max(0, end - Number(a.currentTime));
            }
            resolve(false);
        };
        void Promise.all(plays.map((a) => a.finished)).then(
            () => {
                if (own.__kpReversing === undefined) return;
                delete own.__kpReversing;
                resolve(true);
            },
            () => undefined,
        );
    });
}

/**
 * Stop a playEntranceBackwards() on `el` (it is wanted back), or tidy up
 * after one that played out: a running one settles false, and the entrance
 * is the element's own again.
 * @param {HTMLElement} el
 */
export function stopReversing(el) {
    const own = /** @type {any} */ (el);
    const stop = own.__kpReversing;
    delete own.__kpReversing;
    stop?.();
    el.removeAttribute(REVERSING_ATTRIBUTE);
}

/* ------------------------------------------------- menus and popovers */

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
    const ghost = /** @type {HTMLElement} */ (el.cloneNode(true));
    for (const one of [ghost, ...ghost.querySelectorAll('[id]')]) one.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('popover', 'manual');
    ghost.setAttribute('data-kp-ghost', '');
    ghost.inert = true;
    Object.assign(ghost.style, {
        position: 'fixed',
        inset: 'auto',
        top: `${box.top}px`,
        left: `${box.left}px`,
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
    try {
        ghost.showPopover();
    } catch {
        ghost.remove();
        ghosted.delete(el);
        return;
    }
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
    el.addEventListener('beforetoggle', back);
    void playClose(ghost).then(() => {
        el.removeEventListener('beforetoggle', back);
        done();
    });
}

if (typeof document !== 'undefined') document.addEventListener('beforetoggle', closePopoverWithGhost, true);

/**
 * The entrance's curve without its overshoot: a size goes to its new value
 * and stops there (Kenny, 2026-10-04: pastel's and synthwave's cards "grow
 * too much and shrink again at the end, it should just grow to the correct
 * size"). A cubic-bezier's y values are held between 0 and 1.
 * @param {string} ease
 */
export function withoutOvershoot(ease) {
    const m = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(ease.trim());
    if (!m) return ease;
    const [x1, y1, x2, y2] = m.slice(1).map(Number);
    const hold = (/** @type {number} */ y) => Math.min(1, Math.max(0, y));
    return `cubic-bezier(${x1}, ${hold(y1)}, ${x2}, ${hold(y2)})`;
}

/**
 * The curve a size change runs on: the entrance's, without overshoot, or,
 * where the theme asks for it (`--kp-size-steps: line`, terminal), one step
 * per line of text the box gains or loses.
 * @param {HTMLElement} box @param {string} ease @param {number} change in px
 * @param {boolean} [plain] the entrance's curve alone, without the theme's size character (the accordion, approved as it is)
 */
function sizeEase(box, ease, change, plain = false) {
    // A shrink is its grow played backwards: the same duration on the curve
    // turned around, so frame t of the shrink is frame (T - t) of the grow
    // (Kenny, 2026-10-05: "find out where else there is a discrepancy
    // between opening/closing or shrink/grow"). A box that grew easing out
    // shrinks easing in, as a dialog's close already did.
    const way = (/** @type {string} */ curve) => withoutOvershoot(change < 0 ? reversedEase(curve) : curve);
    if (plain) return way(ease);
    const style = getComputedStyle(box);
    // A theme may give its sizes a curve of their own (`--kp-size-ease`),
    // still held from overshooting.
    const own = style.getPropertyValue('--kp-size-ease').trim();
    if (own) ease = own;
    if (style.getPropertyValue('--kp-size-steps').trim() === 'line') {
        const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3 || 20;
        return way(`steps(${Math.max(1, Math.round(Math.abs(change) / line))}, jump-end)`);
    }
    return way(ease);
}

/**
 * How long a stepped size motion takes in the theme `box` wears: a theme
 * that counts its time in steps (`--kp-size-step`, the ms of one step:
 * nostromo's 80 ms frame, terminal's 136 ms line) moves a box, a fold and
 * an unfold one step per that time, so the steps keep the theme's own clock
 * instead of dividing the size time among them (a fold of 400 ms in four
 * steps ran 100 ms a step, off nostromo's 80 ms frame). Any other curve, or
 * a theme without the knob, keeps `duration`.
 * @param {Element} box @param {string} easing @param {number} duration
 * @returns {number}
 */
function steppedDuration(box, easing, duration) {
    const steps = /^steps\(\s*(\d+)/.exec(easing.trim());
    if (!steps || duration <= 0) return duration;
    const step = msOf(box, '--kp-size-step', 0);
    if (step <= 0) return duration;
    const root = box.ownerDocument?.documentElement ?? document.documentElement;
    const scale = parseFloat(getComputedStyle(root).getPropertyValue('--kp-motion-scale')) || 1;
    return Number(steps[1]) * step * scale;
}

/**
 * A wait before a stepped fold, put on the theme's step clock
 * (`--kp-size-step`): a whole number of steps.
 * @param {Element} box @param {string} easing @param {number} ms
 */
function onStepClock(box, easing, ms) {
    if (!/^steps\(/.test(easing.trim())) return ms;
    const step = msOf(box, '--kp-size-step', 0);
    return step > 0 ? Math.round(ms / step) * step : ms;
}

/** The keywords as the curves they name, for reversedEase(). */
const NAMED_EASES = /** @type {Record<string, string>} */ ({
    ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    'ease-in': 'cubic-bezier(0.42, 0, 1, 1)',
    'ease-out': 'cubic-bezier(0, 0, 0.58, 1)',
    'ease-in-out': 'cubic-bezier(0.42, 0, 0.58, 1)',
    'step-start': 'steps(1, jump-start)',
    'step-end': 'steps(1, jump-end)',
});

/**
 * A timing function turned around: the curve that plays a motion backwards
 * as `direction: reverse` would, so a close, a shrink or a fold that runs
 * on it is its opening frame for frame in the other order. A cubic-bezier
 * is rotated half a turn (an ease-out becomes an ease-in, an overshoot past
 * the end becomes one before the start), steps that jump at the end jump at
 * the start, a `linear()` list runs from its other end; `linear` and the
 * symmetric curves stay themselves.
 * @param {string} ease a CSS easing function
 * @returns {string}
 */
export function reversedEase(ease) {
    const curve = NAMED_EASES[ease.trim()] ?? ease.trim();
    const bezier = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(curve);
    if (bezier) {
        const [x1, y1, x2, y2] = bezier.slice(1).map(Number);
        const r = (/** @type {number} */ n) => Math.round(n * 1e4) / 1e4;
        return `cubic-bezier(${r(1 - x2)}, ${r(1 - y2)}, ${r(1 - x1)}, ${r(1 - y1)})`;
    }
    const steps = /^steps\(\s*(\d+)\s*(?:,\s*([a-z-]+)\s*)?\)$/.exec(curve);
    if (steps) {
        const flip = /** @type {Record<string, string>} */ ({
            start: 'jump-end',
            'jump-start': 'jump-end',
            end: 'jump-start',
            'jump-end': 'jump-start',
        });
        const position = steps[2] ?? 'jump-end';
        return `steps(${steps[1]}, ${flip[position] ?? position})`;
    }
    const list = /^linear\((.*)\)$/.exec(curve);
    if (list) {
        // Each stop is an output and up to two input percentages; a list
        // with no percentages is evenly spaced, one with some is left alone.
        const stops = list[1].split(',').map((stop) => stop.trim().split(/\s+/));
        if (stops.every((s) => s.length === 1))
            return `linear(${stops
                .reverse()
                .map(([y]) => String(Math.round((1 - Number(y)) * 1e4) / 1e4))
                .join(', ')})`;
        if (stops.every((s) => s.length === 2 && s[1].endsWith('%')))
            return `linear(${stops
                .reverse()
                .map(([y, x]) => `${Math.round((1 - Number(y)) * 1e4) / 1e4} ${Math.round((100 - parseFloat(x)) * 100) / 100}%`)
                .join(', ')})`;
    }
    return curve;
}

/**
 * A box's layout height to the fraction: its border box as drawn when that
 * is the layout height rounded (a fold of 75.5 px glided to 76 and then
 * clicked half a pixel back, in formal), and `offsetHeight` when a
 * transform scales what is drawn (an entrance that zooms the box).
 * @param {HTMLElement} el
 */
function layoutHeight(el) {
    const whole = el.offsetHeight;
    const drawn = el.getBoundingClientRect().height;
    return Math.abs(drawn - whole) < 1 ? drawn : whole;
}

/**
 * The size motion of the theme `box` wears, for a box this module does not
 * glide itself (the tiles of a set, js/tiles.js): the duration and the curve
 * a change of `change` px runs on, with the theme's own size character
 * (`--kp-size-ease`, `--kp-size-steps`). A duration of 0 means: take the
 * new size at once (reduced motion, a theme without an entrance, or a theme
 * switch in progress).
 * @param {HTMLElement} box @param {number} change in px
 * @returns {{ duration: number, easing: string }}
 */
export function sizeMotion(box, change) {
    const { size, ease } = themeMotion(box);
    if (size <= 0 || switching) return { duration: 0, easing: 'linear' };
    const easing = sizeEase(box, ease, change);
    return { duration: steppedDuration(box, easing, size), easing };
}

/**
 * Glide `box` from one height to another. During the glide the box clips
 * what overflows it and measures its border box, so the last frame is the
 * size it keeps (a card with padding read its padding twice and then
 * clicked smaller, in forest and high-contrast).
 * @param {HTMLElement} box @param {number} from @param {number} to @param {number} duration @param {string} easing
 * @param {boolean} [plain] no `[data-kp-resizing]` character
 * @param {number} [delay] ms the box holds `from` before it moves
 */
function glide(box, from, to, duration, easing, plain = false, delay = 0) {
    box.style.setProperty('overflow', 'clip');
    box.style.setProperty('box-sizing', 'border-box');
    // While it glides the box says so, which way and for how long: a
    // register draws its own character on `[data-kp-resizing]` (an edge
    // that glows, a rule that draws, a shadow that lengthens) [scope-142].
    box.style.setProperty('--kp-resize-dur', `${Math.round(duration)}ms`);
    if (!plain) box.setAttribute('data-kp-resizing', to > from ? 'grow' : 'shrink');
    // A column of flex items would be squeezed by the gliding height rather
    // than clipped by it: the data table's scroll box shrank every frame,
    // which read as new content and restarted the glide from where it
    // stood, so a group of rows took five seconds to open and the squeezed
    // box scrolled on its own (Kenny, 2026-10-05). Meanwhile the items keep
    // their own size (`[data-kp-gliding='column'] > *`, css/components.css).
    const flow = getComputedStyle(box);
    if (/flex/.test(flow.display) && flow.flexDirection.startsWith('column')) box.setAttribute('data-kp-gliding', 'column');
    const mine = box.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing, delay, fill: 'backwards' });
    const own = /** @type {any} */ (box);
    own.__kpGlide = mine;
    const done = () => {
        // A glide cancelled for a newer one leaves the box to the newer one.
        if (own.__kpGlide !== mine) return;
        own.__kpGlide = null;
        box.style.removeProperty('overflow');
        box.style.removeProperty('box-sizing');
        box.style.removeProperty('--kp-resize-dur');
        box.removeAttribute('data-kp-resizing');
        box.removeAttribute('data-kp-gliding');
    };
    mine.addEventListener('cancel', done);
    return { animation: mine, done };
}

/**
 * The theme's own way of letting a small thing arrive: its toast entrance,
 * already decided per register, read from a toast drawn out of sight.
 * @param {Element} scope
 * @returns {string | null} an `animation` value, or null for none
 */
function arrival(scope) {
    if (reduced()) return null;
    const probe = document.createElement('div');
    probe.className = 'kp-toast';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;';
    const themed = scope.closest('[data-theme]');
    (themed && themed !== document.documentElement && themed instanceof HTMLElement ? themed : document.body).append(probe);
    try {
        const style = getComputedStyle(probe);
        if (!style.animationName || style.animationName === 'none') return null;
        const name = style.animationName.split(',')[0].trim();
        const cap = msOf(scope.ownerDocument?.documentElement ?? document.documentElement, '--kp-size-max', 480);
        const duration = Math.min(firstMs(style.animationDuration), cap);
        if (duration <= 0) return null;
        const ease = style.animationTimingFunction.split(/,(?![^(]*\))/)[0].trim();
        return `${name} ${duration}ms ${ease} backwards`;
    } finally {
        probe.remove();
    }
}

/**
 * Let `el` arrive the theme's way, once.
 * @param {HTMLElement} el @param {string | null} motion
 */
function arrive(el, motion) {
    if (!motion || el.style.animation || el.hasAttribute('data-kp-arriving') || el.hasAttribute('data-kp-leaving')) return;
    // A theme that opens as its close turned around lets it arrive as its
    // leave played backwards [research/open-reverse].
    if (opensAsReversedClose(el) && arriveAsReversedLeave(el)) return;
    // A register that has its own arrival draws it on `[data-kp-arriving]`;
    // one that has not lends its toast's.
    el.setAttribute('data-kp-arriving', '');
    const own = getComputedStyle(el).animationName;
    if (!own || own === 'none') el.style.animation = motion;
    const end = () => {
        el.style.removeProperty('animation');
        el.removeAttribute('data-kp-arriving');
    };
    void playedOut(el, 1500).then(end);
}

/**
 * Play backwards the arrival arrive() gives `el` in a theme where it does
 * not arrive as a leave turned around (a table row; Kenny, 2026-10-05: the
 * rows of a group unfolded the theme's way and folded away at once): the
 * register's own `[data-kp-arriving]`, else the theme's toast entrance, in
 * its own time on its curve turned around. The caller hides `el` once it
 * settles. Settles at once when there is no arrival to turn around.
 * @param {HTMLElement} el
 * @returns {Promise<void>}
 */
export async function playArrivalBackwards(el) {
    if (reduced() || !el.isConnected || el.hasAttribute('data-kp-leaving')) return;
    // One still arriving turns round from the frame it is at.
    const arriving = el.hasAttribute('data-kp-arriving');
    el.setAttribute('data-kp-arriving', '');
    const own = getComputedStyle(el).animationName;
    let lent = false;
    if (!own || own === 'none') {
        const motion = arrival(el);
        if (motion) {
            el.style.animation = motion;
            lent = true;
        }
    }
    if (arriving) for (const a of el.getAnimations()) if (a instanceof CSSAnimation) a.finish();
    await playEntranceBackwards(el);
    stopReversing(el);
    if (lent) el.style.removeProperty('animation');
    el.removeAttribute('data-kp-arriving');
}

/**
 * Settles once the CSS animations on `el` are `share` of the way through,
 * or when `done` settles, whichever is first.
 * @param {HTMLElement} el @param {number} share @param {Promise<unknown>} done
 * @returns {Promise<unknown>}
 */
function partway(el, share, done) {
    const css = el
        .getAnimations({ subtree: true })
        .filter((a) => typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation && /** @type {KeyframeEffect} */ (a.effect)?.target === el);
    const reached = new Promise((resolve) => {
        const tick = () => {
            const through = css.every((a) => {
                const timing = a.effect?.getComputedTiming();
                return a.playState === 'finished' || (timing?.progress ?? 0) >= share || (timing?.currentIteration ?? 0) > 0;
            });
            if (through) resolve(undefined);
            else requestAnimationFrame(tick);
        };
        tick();
    });
    return Promise.race([reached, done]);
}

/**
 * Settles when the CSS animations running on `el` have played out, at
 * whatever rate they play (a slowed-down review plays them at a quarter);
 * with none running, after `fallback` ms.
 * @param {HTMLElement} el @param {number} fallback
 * @returns {Promise<unknown>}
 */
function playedOut(el, fallback) {
    // Its pseudo-elements count too: a theme may draw its exit on ::after.
    const css = el
        .getAnimations({ subtree: true })
        .filter((a) => typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation && /** @type {KeyframeEffect} */ (a.effect)?.target === el);
    if (css.length === 0) return new Promise((resolve) => setTimeout(resolve, fallback));
    return Promise.all(css.map((a) => a.finished.catch(() => undefined)));
}

/**
 * The arrival `el` would play, as an animation name, duration and curve:
 * the register's own `[data-kp-arriving]`, else the theme's toast entrance.
 * @param {HTMLElement} el
 * @returns {{ name: string, duration: number, ease: string } | null}
 */
function arrivalOf(el) {
    if (reduced()) return null;
    const had = el.hasAttribute('data-kp-arriving');
    el.setAttribute('data-kp-arriving', '');
    const style = getComputedStyle(el);
    const own = style.animationName && style.animationName !== 'none';
    const read = own
        ? {
              name: style.animationName.split(',')[0].trim(),
              duration: firstMs(style.animationDuration),
              ease: style.animationTimingFunction.split(/,(?![^(]*\))/)[0].trim(),
          }
        : null;
    if (!had) el.removeAttribute('data-kp-arriving');
    if (read && read.duration > 0) return read;
    const toast = arrival(el);
    if (!toast) return null;
    const [name, duration, ...ease] = toast.split(' ');
    return { name, duration: parseFloat(duration), ease: ease.slice(0, -1).join(' ') };
}

/**
 * The space `el` takes, and nothing, as a leave folds it: in a row (a flex
 * row, an inline chip) its width, sideways; anywhere else its height, from
 * below; margins and paddings to 0, and the flex gap towards a neighbour
 * swallowed by a negative margin.
 * @param {HTMLElement} el @param {CSSStyleDeclaration} style its style while it carries `data-kp-leaving`
 * @returns {[Record<string, string>, Record<string, string>]}
 */
function foldFrames(el, style) {
    const parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
    const sideways =
        style.display.startsWith('inline') || (parent !== null && /flex/.test(parent.display) && !parent.flexDirection.startsWith('column'));
    /** @type {Record<string, string>} */
    const from = sideways
        ? {
              width: `${el.offsetWidth}px`,
              marginLeft: style.marginLeft,
              marginRight: style.marginRight,
              paddingLeft: style.paddingLeft,
              paddingRight: style.paddingRight,
          }
        : {
              height: `${el.offsetHeight}px`,
              marginTop: style.marginTop,
              marginBottom: style.marginBottom,
              paddingTop: style.paddingTop,
              paddingBottom: style.paddingBottom,
          };
    /** @type {Record<string, string>} */
    const to = Object.fromEntries(Object.keys(from).map((k) => [k, '0px']));
    // The gap a flex box keeps between its items stays until the item is
    // taken out, so a column of rows folded every row to nothing and then
    // jumped by a gap at each removal (15 px, measured in the leave
    // options' cards, 2026-10-05). A negative margin towards the
    // neighbour swallows the gap as the space closes.
    const gapOf = parent && /flex/.test(parent.display) ? parseFloat(sideways ? parent.columnGap : parent.rowGap) || 0 : 0;
    if (gapOf > 0) {
        const inFlow = (/** @type {Element | null} */ n) => {
            if (!n) return false;
            const s = getComputedStyle(n);
            return s.display !== 'none' && s.position !== 'absolute' && s.position !== 'fixed';
        };
        const near = (/** @type {'previousElementSibling' | 'nextElementSibling'} */ way) => {
            let n = el[way];
            while (n && !inFlow(n)) n = n[way];
            return n;
        };
        const rtl = sideways && style.direction === 'rtl';
        const start = sideways ? (rtl ? 'marginRight' : 'marginLeft') : 'marginTop';
        const end = sideways ? (rtl ? 'marginLeft' : 'marginRight') : 'marginBottom';
        if (near('previousElementSibling')) to[start] = `${-gapOf}px`;
        else if (near('nextElementSibling')) to[end] = `${-gapOf}px`;
    }
    return [from, to];
}

/**
 * The reverse arrivals playing now, each with the way to stop it, so a
 * leave that comes during one starts from the element as it stands.
 * @type {WeakMap<HTMLElement, () => void>}
 */
const entering = new WeakMap();

/**
 * The animation an element (or one of its pseudo-elements) wears, every
 * part a leave may turn around.
 * @param {Element} el @param {string | null} [pseudo]
 * @returns {string}
 */
const animationSignature = (el, pseudo = null) => {
    const style = getComputedStyle(el, pseudo);
    return [style.animationName, style.animationDirection, style.animationDuration, style.animationTimingFunction, style.animationFillMode].join(' ');
};

/**
 * The animations `el`'s pseudo-elements wear now. A pseudo-element
 * whose animation is the same with and without `[data-kp-leaving]` (a
 * toast's rule drawn in at rest, and the register gives the leave nothing
 * else for it) is part of the entrance, not of the exit: the leave plays it
 * backwards and the arrival forwards, so the two stay each other's mirror
 * (research/PACKAGE_FINDINGS.md, 2026-10-07: on the leave such a part did
 * not move, or jumped, because a CSS animation whose name does not change is
 * not restarted).
 * @param {Element} el
 * @returns {Record<string, string>}
 */
const pseudoNames = (el) => ({
    '::before': animationSignature(el, '::before'),
    '::after': animationSignature(el, '::after'),
});

/**
 * Whether `el` takes no space where it stands (placed absolutely or fixed,
 * or raised into the top layer): a fold of its space would show nothing but
 * a wait, with the element already gone or not yet there (a combobox list
 * unfolded nothing for 466 ms before its opening, blueprint).
 * @param {Element} el @param {CSSStyleDeclaration} style
 */
const floats = (el, style) => {
    if (style.position === 'absolute' || style.position === 'fixed') return true;
    try {
        return el.matches(':popover-open, :modal');
    } catch {
        return false;
    }
};

/** @param {PlaybackDirection | undefined} direction @returns {PlaybackDirection} */
const flipped = (direction) =>
    /** @type {Record<PlaybackDirection, PlaybackDirection>} */ ({
        normal: 'reverse',
        reverse: 'normal',
        alternate: 'alternate-reverse',
        'alternate-reverse': 'alternate',
    })[direction ?? 'normal'];

/**
 * Let `el` arrive as its leave played backwards [research/open-reverse;
 * Kenny's pick, every theme since 2026-10-05]: the
 * timeline leaveOne() would play for it in its theme (the register's exit
 * on `[data-kp-leaving]`, pseudo-elements included, and the fold of its
 * space a third of the way in, or after it, or under a stand-in), turned
 * around, so frame t of the arrival is frame (T - t) of the leave. Every
 * duration, delay and curve is the theme's, read as leaveOne() reads it.
 *
 * @param {HTMLElement} el
 * @returns {boolean} false when it has no leave to turn around (a table row,
 *   which a leave does not fold; a register with no exit of its own): the
 *   caller plays the theme's arrival instead
 */
function arriveAsReversedLeave(el) {
    if (el instanceof HTMLTableRowElement || !el.isConnected) return false;
    const { size, ease } = themeMotion(el);
    const before = getComputedStyle(el).animationName;
    const beforeSig = animationSignature(el);
    const rest = pseudoNames(el);
    el.setAttribute('data-kp-leaving', '');
    const style = getComputedStyle(el);
    const ownName = style.animationName;
    // The same keyframes turned around count as an exit of its own (see leaveOne()).
    if (!ownName || ownName === 'none' || (ownName === before && animationSignature(el) === beforeSig)) {
        el.removeAttribute('data-kp-leaving');
        return false;
    }
    el.setAttribute('data-kp-arriving', '');
    const lasts = firstMs(style.animationDuration);
    const fold = style.getPropertyValue('--kp-leave-fold').trim();
    // `ghost`: as in the leave, a stand-in of the same shape plays the exit
    // on top while the element itself, hidden, unfolds its space underneath.
    /** @type {HTMLElement} */
    let actor = el;
    if (fold === 'ghost' && lasts > 0) {
        actor = /** @type {HTMLElement} */ (el.cloneNode(true));
        actor.setAttribute('aria-hidden', 'true');
        actor.inert = true;
        Object.assign(actor.style, {
            position: 'absolute',
            top: `${el.offsetTop}px`,
            left: `${el.offsetLeft}px`,
            width: `${el.offsetWidth}px`,
            height: `${el.offsetHeight}px`,
            margin: '0',
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: '1',
        });
        el.after(actor);
        const want = el.getBoundingClientRect();
        const got = actor.getBoundingClientRect();
        actor.style.top = `${el.offsetTop + want.top - got.top}px`;
        actor.style.left = `${el.offsetLeft + want.left - got.left}px`;
        el.style.setProperty('visibility', 'hidden');
    }
    // The exit, read off the actor and taken over: its keyframes and timing.
    getComputedStyle(actor).animationName;
    const css = actor
        .getAnimations({ subtree: true })
        .filter((a) => a instanceof CSSAnimation && /** @type {KeyframeEffect} */ (a.effect)?.target === actor)
        .map((a) => /** @type {CSSAnimation} */ (a));
    const exits = css.map((a) => {
        const effect = /** @type {KeyframeEffect} */ (a.effect);
        const timing = effect.getTiming();
        // An entrance part (see pseudoNames()): the leave plays it backwards.
        const pseudo = effect.pseudoElement;
        if (pseudo && rest[pseudo] === animationSignature(actor, pseudo)) {
            timing.direction = flipped(timing.direction);
            // Played backwards in the leave, from its first frame: its own
            // wait comes after it there, so here it ends with the timeline.
            timing.delay = 0;
        }
        return {
            keyframes: effect.getKeyframes(),
            timing,
            // The whole of it, every iteration, from the leave's start.
            end: (Number(timing.delay) || 0) + (Number(effect.getComputedTiming().activeDuration) || 0),
            pseudoElement: effect.pseudoElement,
        };
    });
    for (const a of css) a.cancel();
    if (actor !== el) for (const a of el.getAnimations()) if (a instanceof CSSAnimation) a.cancel();
    const after = fold === 'after';
    const pause = parseFloat(style.getPropertyValue('--kp-leave-pause')) || 0;
    const foldFor = size > 0 && !floats(el, style) ? steppedDuration(el, withoutOvershoot(ease), Math.max(size, lasts) * 1.25) : 0;
    const foldAt = onStepClock(el, withoutOvershoot(ease), after ? lasts + pause : lasts / 3);
    // The leave is over when its last exit (a pseudo-element's may run
    // longer than the first) and its fold are.
    const total = Math.max(lasts, ...exits.map((exit) => exit.end), foldFor ? foldAt + foldFor : 0);
    /** @type {Animation[]} */
    const plays = [];
    for (const exit of exits) {
        // In the leave this exit ran from its delay to its end; turned
        // around it ends at the timeline's end. Its iterations play in the
        // opposite order, each backwards: a normal or reverse exit swaps
        // direction, an alternating one keeps its own for an even count.
        const { iterations = 1, direction = 'normal', easing = 'linear', duration } = exit.timing;
        const even = Number(iterations) % 2 === 0;
        /** @type {Record<PlaybackDirection, PlaybackDirection>} */
        const turned = {
            normal: 'reverse',
            reverse: 'normal',
            alternate: even ? 'alternate' : 'alternate-reverse',
            'alternate-reverse': even ? 'alternate-reverse' : 'alternate',
        };
        const back = turned[direction] ?? 'reverse';
        try {
            plays.push(
                actor.animate(exit.keyframes, {
                    duration: Number(duration) || 0,
                    iterations: Number(iterations),
                    delay: finiteMs(total - exit.end),
                    easing: String(easing),
                    direction: back,
                    fill: 'both',
                    ...(exit.pseudoElement ? { pseudoElement: exit.pseudoElement } : {}),
                }),
            );
        } catch {
            /* an engine that cannot animate that pseudo-element skips it, as the leave does */
        }
    }
    // When the leave would have let the next of a row go: leaveOne() waits
    // until every exit is `--kp-leave-stagger` of the way through, or over.
    const set = parseFloat(style.getPropertyValue('--kp-leave-stagger'));
    const stagger = Number.isNaN(set) ? 0.5 : set;
    const lag =
        lasts <= 0
            ? 0
            : stagger > 0 && stagger < 1
              ? Math.max(0, ...exits.map((exit) => reaches(exit.timing, exit.end, stagger)))
              : Math.max(lasts, ...exits.map((exit) => exit.end));
    if (foldFor > 0) {
        el.style.setProperty('overflow', 'clip');
        el.style.setProperty('box-sizing', 'border-box');
        const frames = foldFrames(el, style);
        if ('height' in frames[0]) heightFolds.add(el);
        plays.push(
            el.animate(frames, {
                duration: foldFor,
                delay: finiteMs(total - foldAt - foldFor),
                easing: withoutOvershoot(ease),
                direction: 'reverse',
                fill: 'backwards',
            }),
        );
    }
    let stopped = false;
    const stop = () => {
        if (stopped) return;
        stopped = true;
        entering.delete(el);
        heightFolds.delete(el);
        for (const a of plays) a.cancel();
        if (actor !== el) actor.remove();
        el.removeAttribute('data-kp-leaving');
        el.removeAttribute('data-kp-arriving');
        el.style.removeProperty('overflow');
        el.style.removeProperty('box-sizing');
        el.style.removeProperty('visibility');
        // It has arrived: the register's own entrance, which takes over as
        // the marks go, is already played (it would arrive a second time).
        getComputedStyle(el).animationName;
        for (const a of el.getAnimations({ subtree: true })) {
            if (
                a instanceof CSSAnimation &&
                /** @type {KeyframeEffect} */ (a.effect)?.target === el &&
                Number.isFinite(Number(a.effect?.getComputedTiming().activeDuration))
            )
                a.finish();
        }
    };
    entering.set(el, stop);
    void Promise.all(plays.map((a) => a.finished.catch(() => undefined))).then(stop);
    if (!arriving) {
        arriving = [];
        queueMicrotask(() => {
            const items = /** @type {Arriving[]} */ (arriving);
            arriving = null;
            arriveInTurn(items);
        });
    }
    arriving.push({ el, plays, total, lag });
    return true;
}

/** @typedef {{ el: HTMLElement, plays: Animation[], total: number, lag: number }} Arriving */
/** @type {Arriving[] | null} */
let arriving = null;

/** A delay the Web Animations API accepts: a finite number of ms, else 0 (an infinite exit has no end to count back from). @param {number} ms */
const finiteMs = (ms) => (Number.isFinite(ms) ? ms : 0);

/**
 * Several elements that arrive at once come one by one, the highest first:
 * the row of leaves leaveInTurn() plays (the lowest first, each starting
 * when the one before is `--kp-leave-stagger` through its exit) turned
 * around as a whole, so frame t of the arrivals is frame (S - t) of that
 * row of leaves, S being when its last leave ends (Kenny, 2026-10-05:
 * "showing should also be the reverse of removing").
 * @param {Arriving[]} items
 */
function arriveInTurn(items) {
    if (items.length < 2) return;
    items = items.filter((item) => Number.isFinite(item.total) && Number.isFinite(item.lag));
    if (items.length < 2) return;
    // Bottom first, as leaveInTurn() sorts them.
    items.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1));
    let start = 0;
    const ends = items.map((item) => {
        const end = start + item.total;
        start += item.lag;
        return end;
    });
    const last = Math.max(...ends);
    items.forEach((item, k) => {
        const later = last - ends[k];
        if (later <= 0) return;
        for (const play of item.plays) {
            const effect = play.effect;
            if (!effect) continue;
            effect.updateTiming({ delay: finiteMs((Number(effect.getTiming().delay) || 0) + later) });
        }
    });
}

/**
 * When an animation with `timing` (and its active phase ending at `end`)
 * is `share` of the way through, as partway() polls it: its progress at or
 * past `share`, its first iteration over, or itself over.
 * @param {EffectTiming} timing @param {number} end @param {number} share
 * @returns {number} ms from its start
 */
function reaches(timing, end, share) {
    if (!Number.isFinite(end)) return 0;
    if (typeof KeyframeEffect === 'undefined' || typeof Animation === 'undefined') return end * share;
    const effect = new KeyframeEffect(null, null, timing);
    const probe = new Animation(effect, null);
    for (let t = 0; t < end; t += 1) {
        probe.currentTime = t;
        const now = effect.getComputedTiming();
        if ((now.progress ?? 0) >= share || (now.currentIteration ?? 0) > 0) return t;
    }
    return end;
}

/**
 * Let `el` leave the theme's way, then take it out [scope-142; Kenny,
 * 2026-10-04: "die grow/shrink bewegingen moeten ook zijn als er opeens
 * nieuwe elementen bijkomen of weggaan"]: it plays its arrival backwards
 * while it folds shut, so what is under it closes up instead of jumping,
 * and the box around it shrinks with it. Under reduced motion, or in a theme
 * with no arrival, it goes at once.
 *
 * Elements told to leave in the same task leave one by one, bottom first.
 *
 * @param {HTMLElement} el
 * @param {{ hide?: boolean }} [options] `hide: true` sets `hidden` instead of removing it
 * @returns {Promise<void>} settled once it is gone
 */
export function leave(el, { hide = false } = {}) {
    return new Promise((resolve) => {
        if (!batch) {
            batch = [];
            queueMicrotask(() => {
                const items = /** @type {Leaving[]} */ (batch);
                batch = null;
                void leaveInTurn(items);
            });
        }
        batch.push({ el, hide, resolve });
    });
}

/** @typedef {{ el: HTMLElement, hide: boolean, resolve: () => void }} Leaving */
/** @type {Leaving[] | null} */
let batch = null;

/**
 * Several elements told to leave at once go one by one, the lowest first,
 * each starting as the one before has played its exit (Kenny, 2026-10-04:
 * "als er twee of meerdere elementen zijn, dan moeten die één voor één in
 * logische volgorde (pak van beneden naar boven) verwijderd worden").
 * @param {Leaving[]} items
 */
async function leaveInTurn(items) {
    items.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1));
    for (const item of items) {
        /** @type {Promise<void>} */
        const exited = new Promise((resolve) => {
            void leaveOne(item.el, item.hide, resolve).then(item.resolve);
        });
        await exited;
    }
}

/**
 * @param {HTMLElement} el @param {boolean} hide
 * @param {() => void} exited called once its exit has played, or at once when it has none
 * @returns {Promise<void>}
 */
async function leaveOne(el, hide, exited) {
    const gone = () => {
        if (hide) el.hidden = true;
        else el.remove();
    };
    // Told to leave while it still arrives as a leave turned around: it
    // leaves from where it stands.
    entering.get(el)?.();
    if (!el.isConnected || el.hasAttribute('data-kp-leaving')) return exited();
    const before = getComputedStyle(el).animationName;
    const beforeSig = animationSignature(el);
    const rest = pseudoNames(el);
    const arrival = arrivalOf(el);
    const { size, ease } = themeMotion(el);
    if (!arrival && size <= 0) {
        exited();
        return gone();
    }
    el.setAttribute('data-kp-leaving', '');
    // A register with a leave of its own draws it on `[data-kp-leaving]`
    // (Kenny, 2026-10-04: "kan je die ook meer on-theme maken met distincte
    // animaties per thema?"); one without plays its arrival backwards.
    const style = getComputedStyle(el);
    const ownName = style.animationName;
    // The same keyframes under the same name, turned around (forest's toast
    // arrives as its leave reversed): the browser does not restart an
    // animation whose name stays, so it is restarted here.
    const turned = ownName && ownName !== 'none' && ownName === before && animationSignature(el) !== beforeSig;
    if (turned) {
        el.setAttribute(REVERSING_ATTRIBUTE, 'reset');
        getComputedStyle(el).animationName;
        el.removeAttribute(REVERSING_ATTRIBUTE);
        getComputedStyle(el).animationName;
    }
    const own = ownName && ownName !== 'none' && (ownName !== before || turned) ? { duration: firstMs(style.animationDuration) } : null;
    /** @type {Promise<unknown>[]} */
    const running = [];
    const lasts = own ? own.duration : (arrival?.duration ?? 0);
    // `--kp-leave-fold: ghost` lets a stand-in of the same shape play the
    // exit on top while the element itself, hidden, folds its space shut
    // underneath, so neither squeezes the other (Kenny, 2026-10-04: "maak
    // een div die de vorm van het te verdwijnen element overneemt en pas
    // daar een animatie op toe").
    const fold = style.getPropertyValue('--kp-leave-fold').trim();
    /** @type {HTMLElement} */
    let actor = el;
    if (fold === 'ghost' && lasts > 0) {
        actor = /** @type {HTMLElement} */ (el.cloneNode(true));
        actor.setAttribute('aria-hidden', 'true');
        actor.inert = true;
        Object.assign(actor.style, {
            position: 'absolute',
            top: `${el.offsetTop}px`,
            left: `${el.offsetLeft}px`,
            width: `${el.offsetWidth}px`,
            height: `${el.offsetHeight}px`,
            margin: '0',
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: '1',
        });
        el.after(actor);
        // Offsets round to whole pixels and skip some borders; correct by
        // what the two boxes measure.
        const want = el.getBoundingClientRect();
        const got = actor.getBoundingClientRect();
        actor.style.top = `${el.offsetTop + want.top - got.top}px`;
        actor.style.left = `${el.offsetLeft + want.left - got.left}px`;
        el.style.setProperty('visibility', 'hidden');
        el.style.setProperty('animation', 'none');
    }
    if (!own && arrival) actor.style.animation = `${arrival.name} ${arrival.duration}ms ${arrival.ease} reverse forwards`;
    // The entrance parts (pseudoNames()) play backwards, from their end.
    // Restarted first: an arrival that took one over left none to read.
    if (Object.values(rest).some((sig) => !sig.startsWith('none '))) {
        const inline = actor.style.animation;
        actor.setAttribute(REVERSING_ATTRIBUTE, 'reset');
        for (const pseudo of [null, '::before', '::after']) getComputedStyle(actor, pseudo).animationName;
        actor.removeAttribute(REVERSING_ATTRIBUTE);
        actor.style.animation = inline;
    }
    getComputedStyle(actor).animationName;
    for (const a of actor.getAnimations({ subtree: true })) {
        const effect = /** @type {KeyframeEffect | null} */ (a.effect);
        const pseudo = effect?.pseudoElement;
        if (!(a instanceof CSSAnimation) || effect?.target !== actor || !pseudo || rest[pseudo] !== animationSignature(actor, pseudo)) continue;
        const timing = effect.getTiming();
        if (!Number.isFinite(Number(timing.iterations))) continue;
        const keyframes = effect.getKeyframes();
        a.cancel();
        try {
            running.push(
                actor
                    .animate(keyframes, {
                        duration: Number(timing.duration) || 0,
                        iterations: Number(timing.iterations),
                        easing: String(timing.easing ?? 'linear'),
                        direction: flipped(timing.direction),
                        fill: 'forwards',
                        pseudoElement: pseudo,
                    })
                    .finished.catch(() => undefined),
            );
        } catch {
            /* an engine that cannot animate that pseudo-element skips it */
        }
    }
    const exit = lasts > 0 ? playedOut(actor, lasts + 100) : Promise.resolve();
    // The next in a row of leaves starts once this one's exit is
    // `--kp-leave-stagger` of the way through (0.5 by default; 1 waits for
    // all of it), read off the animation itself so any playback rate holds.
    // Halfway unless the page says otherwise (Kenny's pick, 2026-10-04).
    const set = parseFloat(style.getPropertyValue('--kp-leave-stagger'));
    const stagger = Number.isNaN(set) ? 0.5 : set;
    if (lasts > 0 && stagger > 0 && stagger < 1) void partway(actor, stagger, exit).then(exited);
    else void exit.then(exited);
    running.push(exit);
    // A table row cannot be folded below its cells' content: it plays its
    // leave, and the table glides shut once it is out.
    if (size > 0 && !(el instanceof HTMLTableRowElement) && !floats(el, style)) {
        el.style.setProperty('overflow', 'clip');
        el.style.setProperty('box-sizing', 'border-box');
        const [from, to] = foldFrames(el, style);
        if ('height' in from) heightFolds.add(el);
        // The space closes slower than a plain resize, so the eye can follow
        // what closes up (Kenny, 2026-10-04: "ik zou het graag iets trager
        // zien gaan, zodat de animatie zichtbaar is"). `--kp-leave-fold`
        // says when: `together` starts it a third of the way into the
        // theme's exit, `after` once the exit is over, plus
        // `--kp-leave-pause` ms, so the exit is never hidden by the fold
        // (Kenny, 2026-10-04: "misschien moet je eerst de elementen laten
        // faden en dan pas die accordion").
        const after = fold === 'after';
        const pause = parseFloat(style.getPropertyValue('--kp-leave-pause')) || 0;
        const folding = el.animate([from, to], {
            duration: steppedDuration(el, withoutOvershoot(ease), Math.max(size, lasts) * 1.25),
            delay: onStepClock(el, withoutOvershoot(ease), after ? lasts + pause : lasts / 3),
            easing: withoutOvershoot(ease),
            fill: 'forwards',
        });
        running.push(folding.finished.catch(() => undefined));
    }
    await Promise.all(running);
    heightFolds.delete(el);
    if (actor !== el) actor.remove();
    gone();
    el.removeAttribute('data-kp-leaving');
    el.style.removeProperty('animation');
    el.style.removeProperty('overflow');
    el.style.removeProperty('box-sizing');
    el.style.removeProperty('visibility');
    for (const a of el.getAnimations()) a.cancel();
}

/**
 * @typedef {{ getAttribute: (name: string) => string | null, tagName: string, className: string, id?: string, nodeType: number, matches?: (selector: string) => boolean, querySelector?: (selector: string) => unknown }} RepaintNode
 */

/**
 * The added elements of one batch of changes that only repaint what was
 * there [port spec G; the homelab dashboard's `repaints()`, moved here]:
 * an element is a repaint when its parent lost, in the same batch, an
 * element with its key (the first of `keys` it carries) or, with no key,
 * one more element of its tag and class than it already took back. An
 * element added where a loading skeleton left (`.kp-skeleton`,
 * `[data-kp-skeleton]`) is not news either: it is the data the skeleton
 * waited for. Everything else is new content.
 *
 * Measured by the dashboard (8 quiet seconds per page): without this, a
 * live refresh that redrew its rows replayed the arrival on 158 cells of
 * one page, 112 on another and 72 on a third, though nothing new had come.
 *
 * @param {Iterable<{ type: string, target: unknown, addedNodes: ArrayLike<any>, removedNodes: ArrayLike<any> }>} records
 * @param {{ keys?: readonly string[] }} [options]
 * @returns {Set<any>} the added elements that are repaints
 */
export function repaintedIn(records, { keys = ARRIVE_KEYS } = {}) {
    const list = [...records].filter((r) => r.type === 'childList');
    /** @type {Map<unknown, { keys: Set<string>, sigs: Map<string, number>, skeleton: boolean }>} */
    const gone = new Map();
    const keyOf = (/** @type {RepaintNode} */ e) => {
        for (const name of keys) {
            const value = name === 'id' ? e.getAttribute('id') || e.id || null : e.getAttribute(name);
            if (value) return `${name}=${value}`;
        }
        return null;
    };
    const sigOf = (/** @type {RepaintNode} */ e) => `${e.tagName}.${e.className}`;
    const skeletal = (/** @type {RepaintNode} */ e) =>
        (typeof e.matches === 'function' && e.matches(SKELETON)) || (typeof e.querySelector === 'function' && e.querySelector(SKELETON) !== null);
    for (const r of list)
        for (const n of Array.from(r.removedNodes)) {
            if (n?.nodeType !== 1) continue;
            const g = gone.get(r.target) ?? { keys: new Set(), sigs: new Map(), skeleton: false };
            gone.set(r.target, g);
            const k = keyOf(n);
            if (k) g.keys.add(k);
            g.sigs.set(sigOf(n), (g.sigs.get(sigOf(n)) ?? 0) + 1);
            if (skeletal(n)) g.skeleton = true;
        }
    /** @type {Set<any>} */
    const out = new Set();
    for (const r of list)
        for (const n of Array.from(r.addedNodes)) {
            if (n?.nodeType !== 1) continue;
            const g = gone.get(r.target);
            if (!g) continue;
            if (g.skeleton) {
                out.add(n);
                continue;
            }
            const k = keyOf(n);
            const left = g.sigs.get(sigOf(n)) ?? 0;
            if (k ? g.keys.has(k) : left > 0) {
                out.add(n);
                if (!k) g.sigs.set(sigOf(n), left - 1);
            }
        }
    return out;
}

/** The value of `data-kp-folding` on what folds out of a box: it is gone from the box's layout once its fold has played. */
export const FOLDING_OUT = 'out';

/**
 * The height `box` settles at once what folds out of it is gone: the
 * elements marked `[data-kp-folding="out"]` (a data table's rows while
 * they play their arrival backwards) are taken out of the flow for one
 * read. The box then glides shut while they play, the mirror of its glide
 * open while they arrived (Kenny's form v21, 2026-10-05: the table box
 * snapped shut once the rows had gone).
 * @param {HTMLElement} box
 */
function settledHeight(box) {
    const out = /** @type {HTMLElement[]} */ ([...box.querySelectorAll(`[data-kp-folding="${FOLDING_OUT}"]`)]);
    if (out.length === 0) return box.offsetHeight;
    // Not `display: none`, which would cancel the very animations they are
    // playing: a table row collapses (its borders go with it, which taking
    // it out of the flow left a pixel of), anything else leaves the flow.
    const how = out.map((el) => (getComputedStyle(el).display === 'table-row' ? ['visibility', 'collapse'] : ['position', 'absolute']));
    const kept = out.map((el, k) => [el.style.getPropertyValue(how[k][0]), el.style.getPropertyPriority(how[k][0])]);
    out.forEach((el, k) => el.style.setProperty(how[k][0], how[k][1], 'important'));
    const height = box.offsetHeight;
    out.forEach((el, k) => {
        if (kept[k][0]) el.style.setProperty(how[k][0], kept[k][0], kept[k][1]);
        else el.style.removeProperty(how[k][0]);
    });
    return height;
}

/**
 * How long what folds out of `box` still plays, in ms: the box's glide
 * shut ends with it, as its glide open started with their arrival, so
 * frame t of the fold is frame (T - t) of the open.
 * @param {HTMLElement} box
 */
function foldingOutFor(box) {
    let left = 0;
    for (const el of box.querySelectorAll(`[data-kp-folding="${FOLDING_OUT}"]`))
        for (const a of el.getAnimations({ subtree: true })) {
            const timing = a.effect?.getComputedTiming();
            if (!timing || a.playState !== 'running' || timing.iterations === Infinity) continue;
            const rate = Math.abs(a.playbackRate) || 1;
            left = Math.max(left, (Number(timing.endTime) - Number(timing.localTime ?? 0)) / rate);
        }
    return Number.isFinite(left) ? left : 0;
}

/**
 * Elements whose leave (or arrival as a leave turned around) folds their
 * own height: the box around them follows that fold frame by frame.
 * @type {WeakSet<HTMLElement>}
 */
const heightFolds = new WeakSet();

/**
 * Whether something drawn in `box` folds its own height now, which the box
 * follows instead of gliding. A fold sideways (a button in a cell) or of
 * something not drawn (a hidden list) is not the box's height folding: it
 * held every glide of the box for as long as the page's first arrivals
 * played, ten seconds on the catalogue's tables, and the table snapped open
 * and shut meanwhile.
 * @param {HTMLElement} box
 */
const followsAFold = (box) =>
    [...box.querySelectorAll('[data-kp-leaving]')].some((el) => heightFolds.has(/** @type {HTMLElement} */ (el)) && el.getClientRects().length > 0);

/**
 * Which arrivals play under `el`: its closest `data-kp-arrive` (`all`,
 * `new` or `none`), else the attach's own default.
 * @param {Element} el @param {string} fallback
 * @returns {string}
 */
const arriveMode = (el, fallback) => el.closest('[data-kp-arrive]')?.getAttribute('data-kp-arrive') || fallback;

/**
 * Whether what changes in `el` now is still its first render, which is not
 * news [fix-100]: until two frames are painted after motion attached to it,
 * and while it is under a root that is settling (js/as-of.js; js/auto.js
 * holds the page's root so until every module it fetched has drawn). In
 * that time nothing in it arrives and its box takes its size at once, as a
 * fold already took its first state at once. Since every opposite motion
 * became a mirror (fff6fe45) a first render arrived as a leave turned
 * around: 263 elements on the catalogue's index in one queue of about ten
 * seconds, the data table's pager folded to a third of its width and its
 * bar 186 px tall instead of 52 until the first click redrew it.
 * @param {Element} el
 * @returns {() => boolean}
 */
function firstRender(el) {
    let painted = false;
    afterPaint(() => (painted = true));
    return () => !painted || settling(el);
}

/**
 * @typedef {object} SizeOptions
 * @property {'all' | 'new' | 'none'} [arrive] which added elements arrive the theme's way when no `data-kp-arrive` says otherwise: every one (`all`, the default), only those that are not a repaint of a row that just left under the same key (`new`), or none
 * @property {readonly string[]} [arriveKeys] more attributes that carry a row's stable id, read before `data-kp-key`, `data-kp-row-key` and `id`
 */

/**
 * Ease `box` to its new height whenever what is in it changes size, in both
 * directions; a change during a glide continues from where the box is.
 * @param {HTMLElement} box
 * @param {SizeOptions} [options]
 * @returns {() => void}
 */
export function easeSize(box, { arrive: fallback = 'all', arriveKeys = [] } = {}) {
    const own = /** @type {any} */ (box);
    if (own.__kpSize) return () => {};
    own.__kpSize = true;
    watching += 1;
    const keys = [...arriveKeys, ...ARRIVE_KEYS];
    let last = box.offsetHeight;
    /** @type {Animation | null} */
    let running = null;
    const fresh = firstRender(box);
    const settle = () => {
        if (!box.isConnected) return;
        // During a glide a child may change size only because the box's
        // height moves (a stretched or squeezed item): the size the content
        // asks for is the same, so the glide goes on. Restarting it there
        // started it again from where it stood on every frame, and the box
        // crept towards its size for seconds. The effect is lifted off the
        // box for one read, which leaves its timing alone.
        const effect = /** @type {KeyframeEffect | null} */ (running?.effect ?? null);
        if (running && effect) {
            effect.target = null;
            const natural = settledHeight(box);
            effect.target = box;
            if (Math.abs(natural - last) < 1) return;
        }
        const from = running ? box.offsetHeight : last;
        // Finished rather than cancelled: a page that awaits every
        // animation's `finished` must not see an AbortError for a glide a
        // newer one replaced (tests/register-dark-faults awaited one).
        running?.finish();
        running = null;
        const to = settledHeight(box);
        last = to;
        if (switching || fresh() || Math.abs(to - from) < 1 || from === 0 || to === 0) return;
        // Something in it is leaving and folds its height shut; the box
        // follows that fold frame by frame instead of gliding after it.
        if (followsAFold(box)) return;
        const { size, ease } = themeMotion(box);
        if (size <= 0) return;
        // Shutting while rows fold out of it, the box ends as they end: the
        // open started its glide and their arrival together.
        const delay = to < from ? Math.max(0, foldingOutFor(box) - size) : 0;
        const easing = sizeEase(box, ease, to - from);
        const { animation: mine, done } = glide(box, from, to, steppedDuration(box, easing, size), easing, false, delay);
        running = mine;
        mine.finished
            .then(() => {
                // done() leaves the box alone when a newer glide owns it.
                done();
                if (running === mine) running = null;
            })
            .catch(() => undefined);
    };
    // The children are watched, not the box: the box's own height is what
    // moves during a glide. Heights are layout heights (offsetHeight), not
    // painted ones: a theme's entrance that scales the box would otherwise
    // be read as its size (retro's zoom read 57px for a 227px dialog).
    //
    // The box itself is watched too, but only to keep `last` true: a box
    // stretched by its neighbours (cards in one grid row) or emptied by
    // rows that folded themselves shut changes size with no child of its
    // own changing, and a `last` left behind made the next change glide
    // from a height the reader never saw, or not glide at all (the leave
    // options' "Bring them back": one card jumped, one glided from 83 px
    // while it stood at 34; Kenny, 2026-10-05). A child's change in the
    // same callback goes first, so it still glides from what was painted.
    const sizes = new ResizeObserver((entries) => {
        if (entries.some((entry) => entry.target !== box)) settle();
        else if (!running) last = box.offsetHeight;
    });
    const watch = () => {
        sizes.disconnect();
        sizes.observe(box);
        for (const child of box.children) sizes.observe(child);
    };
    watch();
    // A child that leaves changes no child's size; the list itself is watched.
    // What arrives (a row added, a panel or a message shown) arrives the
    // theme's way.
    const list = new MutationObserver((records) => {
        // A live view that redraws its rows marks the box
        // `data-kp-arrive="none"`, or every refresh replays every arrival
        // (the homelab dashboard's live repaint, 2026-10-04); with
        // `data-kp-arrive="new"` a redrawn row stays still and only a row
        // with a key not seen a moment ago arrives [port spec G].
        // A first render arrives as nothing: it is the page, not news.
        const modeOf = (/** @type {Node} */ target) => (fresh() ? 'none' : arriveMode(target instanceof Element ? target : box, fallback));
        const any = records.some((record) => modeOf(record.target) !== 'none');
        const motion = records.length && any ? arrival(box) : null;
        /** @type {Set<any> | null} */
        let repainted = null;
        // Only what changed over the whole batch arrives: an element hidden
        // and shown again in one task was never gone (the data table hides
        // every row and shows its page again on each render, and every
        // shown row of every group replayed its arrival when one group
        // folded), and an element taken out and put back is moved, not new
        // (a sort appends its rows again). Kenny, 2026-10-05.
        /** @type {Map<Node, boolean>} */
        const hiddenBefore = new Map();
        /** @type {Set<Node>} */
        const moved = new Set();
        for (const record of records) {
            if (record.type === 'attributes' && !hiddenBefore.has(record.target)) hiddenBefore.set(record.target, record.oldValue !== null);
            if (record.type === 'childList') for (const node of record.removedNodes) moved.add(node);
        }
        for (const record of records) {
            const mode = modeOf(record.target);
            if (mode === 'none') continue;
            if (record.type === 'attributes' && record.target instanceof HTMLElement && !record.target.hidden && hiddenBefore.get(record.target)) {
                hiddenBefore.delete(record.target);
                arrive(record.target, motion);
            }
            // Added to the box, or to a list inside it (rows in a <ul>).
            if (record.type === 'childList')
                for (const node of record.addedNodes) {
                    if (!(node instanceof HTMLElement) || moved.has(node)) continue;
                    if (mode === 'new' && (repainted ??= repaintedIn(records, { keys })).has(node)) continue;
                    arrive(node, motion);
                }
        }
        watch();
        settle();
    });
    list.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
    return () => {
        if (!own.__kpSize) return;
        watching -= 1;
        sizes.disconnect();
        list.disconnect();
        running?.cancel();
        box.style.removeProperty('overflow');
        box.style.removeProperty('box-sizing');
        delete own.__kpSize;
    };
}

/**
 * Unfold a `<details>` from its summary's height to its open height, and
 * fold it back before `open` goes away.
 * @param {HTMLDetailsElement} details
 * @returns {() => void}
 */
function attachFold(details) {
    const own = /** @type {any} */ (details);
    if (own.__kpFold) return () => {};
    const summary = details.querySelector(':scope > summary');
    if (!summary) return () => {};
    own.__kpFold = true;
    watching += 1;
    /** @type {Animation | null} */
    let running = null;
    let folding = false;
    // A fold drawn for the first time takes the state it is given at once: a
    // page that rebuilds its groups paints each one's remembered state before
    // the first frame (port spec J3), and that is not a change to glide.
    const fresh = firstRender(details);
    const shutHeight = () => {
        const style = getComputedStyle(details);
        return (
            layoutHeight(/** @type {HTMLElement} */ (summary)) +
            parseFloat(style.borderBlockStartWidth || '0') +
            parseFloat(style.borderBlockEndWidth || '0')
        );
    };
    /** `open` set by the fold itself, which the watcher below does not answer. @param {boolean} value */
    const setOpen = (value) => {
        details.open = value;
        watcher.takeRecords();
    };
    /**
     * Glide open or shut from the height the fold stands at now. While it
     * folds shut it carries `data-kp-folding`, so what counts only what is
     * shown (a tile set, js/tiles.js) lets it go at the start of the fold
     * rather than at its end.
     * @param {boolean} opening @param {number} from @param {number} size @param {string} ease
     */
    const move = (opening, from, size, ease) => {
        running?.finish();
        folding = !opening;
        setOpen(true);
        const to = opening ? layoutHeight(details) : shutHeight();
        details.toggleAttribute('data-kp-folding', folding);
        // The accordion keeps the motion Kenny approved in every theme: the
        // entrance's curve, without a theme's size character.
        const { animation: mine, done } = glide(details, from, to, size, sizeEase(details, ease, to - from, true), true);
        running = mine;
        mine.finished
            .then(() => {
                done();
                if (running !== mine) return;
                running = null;
                if (folding) {
                    folding = false;
                    setOpen(false);
                }
                details.removeAttribute('data-kp-folding');
            })
            .catch(() => undefined);
    };
    const onClick = (/** @type {Event} */ event) => {
        const { size, ease } = themeMotion(details);
        if (size <= 0) return;
        event.preventDefault();
        move(!details.open || folding, layoutHeight(details), size, ease);
    };
    // `open` set from outside (a page that opens every group while a search
    // runs, a memory painted back when the search ends) glides too: it
    // jumped, the one jump left on the remembered board (Kenny, 2026-10-05:
    // "animation is too chunky, should be smooth").
    const watcher = new MutationObserver((records) => {
        const was = records[0].oldValue !== null;
        const now = details.open;
        if (fresh() || was === now || !details.isConnected) return;
        const { size, ease } = themeMotion(details);
        if (size <= 0) return;
        let from;
        if (running) from = layoutHeight(details);
        else if (now) from = shutHeight();
        else {
            setOpen(true);
            from = layoutHeight(details);
        }
        move(now, from, size, ease);
    });
    watcher.observe(details, { attributes: true, attributeFilter: ['open'], attributeOldValue: true });
    summary.addEventListener('click', onClick);
    return () => {
        if (!own.__kpFold) return;
        watching -= 1;
        watcher.disconnect();
        summary.removeEventListener('click', onClick);
        running?.cancel();
        details.style.removeProperty('overflow');
        details.removeAttribute('data-kp-folding');
        delete own.__kpFold;
    };
}

/* -------------------------------------------------------------- attach */

/**
 * Give every dialog its leaving motion and every box above its easing, under
 * `root` and in whatever is added to it later. A box, dialog or disclosure
 * that leaves the page is let go (its observers disconnected) a microtask
 * after it left, so a page that rebuilds itself on every navigation does not
 * keep the old boxes' watchers alive; one moved within the page stays.
 *
 * @param {ParentNode} [root]
 * @param {SizeOptions & { size?: string }} [options] `size`: more boxes to ease, as a selector, beside the package's own and `[data-kp-size-motion]` (a consumer's cards and panels, without marking each one); `arrive` and `arriveKeys` as for easeSize()
 * @returns {() => void} detach
 */
export function attachMotion(root = document, { size = '', arrive = 'all', arriveKeys = [] } = {}) {
    /** @type {Map<Element, () => void>} */
    const detaches = new Map();
    const sizeSelector = size.trim() ? `${SIZE_SELECTOR}, ${size}` : SIZE_SELECTOR;
    /** @param {Element} el @param {() => void} detach */
    const keep = (el, detach) => {
        const before = detaches.get(el);
        detaches.set(el, before ? () => (before(), detach()) : detach);
    };
    /** @param {ParentNode} scope */
    const scan = (scope) => {
        const all = (/** @type {string} */ selector) => [
            ...(scope instanceof Element && scope.matches(selector) ? [scope] : []),
            ...scope.querySelectorAll(selector),
        ];
        for (const el of all('dialog.kp-dialog')) keep(el, attachClose(/** @type {HTMLDialogElement} */ (el)));
        for (const el of all(sizeSelector)) keep(el, easeSize(/** @type {HTMLElement} */ (el), { arrive, arriveKeys }));
        for (const el of all(FOLD_SELECTOR)) if (el instanceof HTMLDetailsElement) keep(el, attachFold(el));
    };
    scan(root);
    let sweeping = false;
    const sweep = () => {
        sweeping = false;
        for (const [el, detach] of detaches)
            if (!el.isConnected) {
                detach();
                detaches.delete(el);
            }
    };
    const later = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) if (node instanceof Element) scan(node);
            if (record.removedNodes.length && !sweeping) {
                sweeping = true;
                queueMicrotask(sweep);
            }
        }
    });
    later.observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), { childList: true, subtree: true });
    return () => {
        later.disconnect();
        for (const one of detaches.values()) one();
        detaches.clear();
    };
}
