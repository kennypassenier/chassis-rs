// An element arriving: glide, arrive and the grouped glide.
import { firstMs, msOf, reduced, themeMotion } from './timing.js';
import { opensAsReversedClose } from './close.js';
import { playEntranceBackwards, stopReversing } from './reverse.js';
import { switching } from './switching.js';
import { arriveAsReversedLeave } from './reversed-leave.js';
import { playedOut } from './fold.js';
import { layoutHeight, sizeEase } from './size.js';
import { heightFolds } from './fold-size.js';

/**
 * Glide `box` from one height to another. During the glide the box clips
 * what overflows it and measures its border box, so the last frame is the
 * size it keeps (a card with padding read its padding twice and then
 * clicked smaller, in forest and the removed high-contrast).
 * @param {HTMLElement} box @param {number} from @param {number} to @param {number} duration @param {string} easing
 * @param {boolean} [plain] no `[data-kp-resizing]` character
 * @param {number} [delay] ms the box holds `from` before it moves
 */
export function glide(box, from, to, duration, easing, plain = false, delay = 0) {
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
export function arrival(scope) {
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
export function arrive(el, motion) {
    if (
        !motion ||
        el.style.animation ||
        el.hasAttribute('data-kp-arriving') ||
        el.hasAttribute('data-kp-leaving') ||
        el.hasAttribute('data-kp-ghost')
    )
        return;
    // A theme that opens as its close turned around lets it arrive as its
    // leave played backwards [research/open-reverse].
    // A theme that says `--kp-arrive-unseen: skip` lets what takes no box
    // (display none) arrive as nothing: its arrival would only hold back,
    // in the row of arrivals, the visible part that was added with it.
    if (getComputedStyle(el).getPropertyValue('--kp-arrive-unseen').trim() === 'skip' && el.getClientRects().length === 0) return;
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
 * Let `el` arrive the theme's way, now: for a part a script brings back by
 * itself (an alert dismissed and shown again), outside any box motion
 * watches. A part that already arrives, or leaves, is left alone.
 * @param {HTMLElement} el
 */
export function arriveShown(el) {
    arrive(el, arrival(el));
}
/** The attribute a group carries while glideGroup() moves its height. */
export const GROUP_FOLDING_ATTRIBUTE = 'data-kp-group-folding';
/** @type {WeakMap<HTMLElement, Animation>} */
const groupGlides = new WeakMap();
/**
 * Open or shut a group whose shut state is not drawn (a tree branch's
 * children, `display: none` while `aria-expanded="false"`) by gliding its
 * height, the accordion's way: the theme's growth curve and time, and the
 * same curve turned around to shut, so the close is the open played
 * backwards. `apply()` flips the state (the caller's attribute); the group
 * is kept drawn through a shutting glide by the theme's rule on
 * `[data-kp-group-folding]`. The box around it follows the group instead of
 * gliding itself (followsAFold()). Under reduced motion, in a theme that
 * switches, or inside a group that glides already, the state is applied at
 * once and the box glides as it always did.
 * @param {HTMLElement} group @param {boolean} opening @param {() => void} apply
 */
export function glideGroup(group, opening, apply) {
    const { size, ease } = themeMotion(group);
    if (size <= 0 || switching || !group.isConnected || group.parentElement?.closest(`[${GROUP_FOLDING_ATTRIBUTE}]`)) return apply();
    const own = groupGlides.get(group);
    // Turned round mid-glide: from the height it stands at.
    const standing = own ? group.getBoundingClientRect().height : null;
    own?.cancel();
    const from = standing ?? (opening ? 0 : layoutHeight(group));
    group.setAttribute(GROUP_FOLDING_ATTRIBUTE, '');
    group.style.setProperty('overflow', 'clip');
    group.style.setProperty('box-sizing', 'border-box');
    heightFolds.add(group);
    apply();
    const to = opening ? layoutHeight(group) : 0;
    const easing = sizeEase(group, ease, to - from, true);
    const mine = group.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: size, easing, fill: 'forwards' });
    groupGlides.set(group, mine);
    const done = () => {
        if (groupGlides.get(group) !== mine) return;
        groupGlides.delete(group);
        heightFolds.delete(group);
        group.removeAttribute(GROUP_FOLDING_ATTRIBUTE);
        group.style.removeProperty('overflow');
        group.style.removeProperty('box-sizing');
        mine.cancel();
    };
    void mine.finished.then(done, () => undefined);
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
