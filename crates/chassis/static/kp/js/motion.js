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
//
// What moves: every `.kp-dialog` (closing, and growing or shrinking while
// open), the accordion's items, tabs, the data table, the toast stack, the
// upload list, the combobox list, the tree, the wizard, a field whose error
// comes and goes, and any element marked `data-kp-size-motion`. Boxes that
// appear later (a framework's render) are picked up as they arrive.

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

/** @returns {boolean} */
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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

/** @type {WeakMap<HTMLDialogElement, { keyframes: Keyframe[], easing: string, pseudoElement: string | null }[]>} */
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
    const kept = dialog
        .getAnimations({ subtree: true })
        .filter((a) => a instanceof CSSAnimation && a.effect instanceof KeyframeEffect)
        .map((a) => {
            const effect = /** @type {KeyframeEffect} */ (a.effect);
            return { keyframes: effect.getKeyframes(), easing: String(effect.getTiming().easing ?? 'linear'), pseudoElement: effect.pseudoElement };
        });
    entrances.set(dialog, kept);
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
    for (const { keyframes, easing, pseudoElement } of kept) {
        try {
            out.push(
                dialog.animate(keyframes, {
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
    if (!kept.some((one) => one.pseudoElement === '::backdrop')) {
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
    const showModal = dialog.showModal;
    const show = dialog.show;
    own.showModal = function () {
        showModal.call(dialog);
        rememberEntrance(dialog);
    };
    own.show = function () {
        show.call(dialog);
        rememberEntrance(dialog);
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
    const style = getComputedStyle(box);
    if (plain) return withoutOvershoot(ease);
    // A theme may give its sizes a curve of their own (`--kp-size-ease`),
    // still held from overshooting.
    const own = style.getPropertyValue('--kp-size-ease').trim();
    if (own) ease = own;
    if (style.getPropertyValue('--kp-size-steps').trim() === 'line') {
        const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3 || 20;
        return `steps(${Math.max(1, Math.round(Math.abs(change) / line))}, jump-end)`;
    }
    return withoutOvershoot(ease);
}

/**
 * Glide `box` from one height to another. During the glide the box clips
 * what overflows it and measures its border box, so the last frame is the
 * size it keeps (a card with padding read its padding twice and then
 * clicked smaller, in forest and high-contrast).
 * @param {HTMLElement} box @param {number} from @param {number} to @param {number} duration @param {string} easing
 * @param {boolean} [plain] no `[data-kp-resizing]` character
 */
function glide(box, from, to, duration, easing, plain = false) {
    box.style.setProperty('overflow', 'clip');
    box.style.setProperty('box-sizing', 'border-box');
    // While it glides the box says so, which way and for how long: a
    // register draws its own character on `[data-kp-resizing]` (an edge
    // that glows, a rule that draws, a shadow that lengthens) [scope-142].
    box.style.setProperty('--kp-resize-dur', `${Math.round(duration)}ms`);
    if (!plain) box.setAttribute('data-kp-resizing', to > from ? 'grow' : 'shrink');
    const mine = box.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing });
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
    if (!el.isConnected || el.hasAttribute('data-kp-leaving')) return exited();
    const before = getComputedStyle(el).animationName;
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
    const own = ownName && ownName !== 'none' && ownName !== before ? { duration: firstMs(style.animationDuration) } : null;
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
    if (size > 0 && !(el instanceof HTMLTableRowElement)) {
        // In a row (a flex row, an inline chip) the space closes sideways;
        // anywhere else it closes from below.
        const parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
        const sideways =
            style.display.startsWith('inline') || (parent !== null && /flex/.test(parent.display) && !parent.flexDirection.startsWith('column'));
        el.style.setProperty('overflow', 'clip');
        el.style.setProperty('box-sizing', 'border-box');
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
        const to = Object.fromEntries(Object.keys(from).map((k) => [k, '0px']));
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
            duration: Math.max(size, lasts) * 1.25,
            delay: after ? lasts + pause : lasts / 3,
            easing: withoutOvershoot(ease),
            fill: 'forwards',
        });
        running.push(folding.finished.catch(() => undefined));
    }
    await Promise.all(running);
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
 * Ease `box` to its new height whenever what is in it changes size, in both
 * directions; a change during a glide continues from where the box is.
 * @param {HTMLElement} box
 * @returns {() => void}
 */
export function easeSize(box) {
    const own = /** @type {any} */ (box);
    if (own.__kpSize) return () => {};
    own.__kpSize = true;
    let last = box.offsetHeight;
    /** @type {Animation | null} */
    let running = null;
    const settle = () => {
        if (!box.isConnected) return;
        const from = running ? box.offsetHeight : last;
        // Finished rather than cancelled: a page that awaits every
        // animation's `finished` must not see an AbortError for a glide a
        // newer one replaced (tests/register-dark-faults awaited one).
        running?.finish();
        running = null;
        const to = box.offsetHeight;
        last = to;
        if (switching || Math.abs(to - from) < 1 || from === 0 || to === 0) return;
        // Something in it is leaving and folds itself shut; the box follows
        // that fold frame by frame instead of gliding after it.
        if (box.querySelector('[data-kp-leaving]')) return;
        const { size, ease } = themeMotion(box);
        if (size <= 0) return;
        const { animation: mine, done } = glide(box, from, to, size, sizeEase(box, ease, to - from));
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
    const sizes = new ResizeObserver(settle);
    const watch = () => {
        sizes.disconnect();
        for (const child of box.children) sizes.observe(child);
    };
    watch();
    // A child that leaves changes no child's size; the list itself is watched.
    // What arrives (a row added, a panel or a message shown) arrives the
    // theme's way.
    const list = new MutationObserver((records) => {
        // A live view that redraws its rows marks the box
        // `data-kp-arrive="none"`, or every refresh replays every arrival
        // (the homelab dashboard's live repaint, 2026-10-04).
        const quiet = box.closest('[data-kp-arrive="none"]') !== null;
        const motion = records.length && !quiet ? arrival(box) : null;
        for (const record of records) {
            if (record.type === 'childList' && record.target === box)
                for (const node of record.addedNodes) if (node instanceof HTMLElement) arrive(node, motion);
            if (record.type === 'attributes' && record.target instanceof HTMLElement && !record.target.hidden) arrive(record.target, motion);
            // A list inside the box (rows in a <ul>) brings its rows too.
            if (record.type === 'childList' && record.target !== box)
                for (const node of record.addedNodes) if (node instanceof HTMLElement) arrive(node, motion);
        }
        watch();
        settle();
    });
    list.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    return () => {
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
    own.__kpFold = true;
    const summary = details.querySelector(':scope > summary');
    if (!summary) return () => {};
    /** @type {Animation | null} */
    let running = null;
    let folding = false;
    const onClick = (/** @type {Event} */ event) => {
        const { size, ease } = themeMotion(details);
        if (size <= 0) return;
        event.preventDefault();
        const from = details.offsetHeight;
        running?.finish();
        const opening = !details.open || folding;
        folding = !opening;
        details.open = true;
        const full = details.offsetHeight;
        const shut =
            /** @type {HTMLElement} */ (summary).offsetHeight +
            parseFloat(getComputedStyle(details).borderBlockStartWidth || '0') +
            parseFloat(getComputedStyle(details).borderBlockEndWidth || '0');
        const to = opening ? full : shut;
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
                    details.open = false;
                }
            })
            .catch(() => undefined);
    };
    summary.addEventListener('click', onClick);
    return () => {
        summary.removeEventListener('click', onClick);
        running?.cancel();
        details.style.removeProperty('overflow');
        delete own.__kpFold;
    };
}

/* -------------------------------------------------------------- attach */

/**
 * Give every dialog its leaving motion and every box above its easing, under
 * `root` and in whatever is added to it later.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachMotion(root = document) {
    /** @type {(() => void)[]} */
    const detaches = [];
    /** @param {ParentNode} scope */
    const scan = (scope) => {
        const all = (/** @type {string} */ selector) => [
            ...(scope instanceof Element && scope.matches(selector) ? [scope] : []),
            ...scope.querySelectorAll(selector),
        ];
        for (const el of all('dialog.kp-dialog')) detaches.push(attachClose(/** @type {HTMLDialogElement} */ (el)));
        for (const el of all(SIZE_SELECTOR)) detaches.push(easeSize(/** @type {HTMLElement} */ (el)));
        for (const el of all(FOLD_SELECTOR)) if (el instanceof HTMLDetailsElement) detaches.push(attachFold(el));
    };
    scan(root);
    const later = new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) scan(node);
    });
    later.observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), { childList: true, subtree: true });
    return () => {
        later.disconnect();
        for (const one of detaches) one();
    };
}
