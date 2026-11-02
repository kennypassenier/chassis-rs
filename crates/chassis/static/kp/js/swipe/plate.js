// The plate a swipe reveals [parts-1102]: the room the row's parts leave as they follow the finger, in the action's tone, with the
// action's words at the edge they left. The row keeps its own frame, so the list never moves under the finger. The slide home
// runs in the theme's own time and curve (--fx-duration, --fx-ease; css/components/swipe.css), and not at all under reduced motion.

/** @typedef {import('./constants.js').SwipeAction} SwipeAction */

/** The slide home is over by now even when no transition end comes [ms]. */
const SETTLE_FALLBACK_MS = 600;

/** The row's plate, made the first time. @param {HTMLElement} row */
function plateOf(row) {
    let plate = /** @type {HTMLElement | null} */ (row.querySelector(':scope > .kp-swipe__plate'));
    if (plate) return plate;
    plate = row.ownerDocument.createElement('span');
    plate.className = 'kp-swipe__plate';
    plate.setAttribute('aria-hidden', 'true');
    const words = row.ownerDocument.createElement('span');
    words.className = 'kp-swipe__words';
    plate.append(words);
    row.prepend(plate);
    return plate;
}

/**
 * Show the row moved by `dx` with the action's plate behind, armed past the threshold.
 * @param {HTMLElement} row @param {number} dx @param {SwipeAction | null} action @param {boolean} armed
 */
export function paintPlate(row, dx, action, armed) {
    const plate = plateOf(row);
    delete row.dataset.kpSwipeSettling;
    row.dataset.kpSwiping = '';
    row.dataset.kpSwipeSide = dx > 0 ? 'right' : 'left';
    row.dataset.kpSwipeTone = action?.tone ?? 'none';
    row.toggleAttribute('data-kp-swipe-armed', armed);
    row.style.setProperty('--kp-swipe-x', `${dx}px`);
    const words = /** @type {HTMLElement} */ (plate.firstElementChild);
    if (words.textContent !== (action?.label ?? '')) words.textContent = action?.label ?? '';
}

/** Whether the person asked for less motion. @param {HTMLElement} row */
const reduced = (row) => row.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches === true;

/** Slide the row home and take the plate away once it is there. @param {HTMLElement} row */
export function clearPlate(row) {
    const done = () => {
        if (row.dataset.kpSwiping !== undefined) return;
        delete row.dataset.kpSwipeSettling;
        delete row.dataset.kpSwipeSide;
        delete row.dataset.kpSwipeTone;
        row.style.removeProperty('--kp-swipe-x');
        row.querySelector(':scope > .kp-swipe__plate')?.remove();
    };
    delete row.dataset.kpSwiping;
    row.removeAttribute('data-kp-swipe-armed');
    if (reduced(row)) return done();
    row.dataset.kpSwipeSettling = '';
    row.style.setProperty('--kp-swipe-x', '0px');
    const onEnd = (/** @type {TransitionEvent} */ event) => {
        if (event.target !== row || event.propertyName !== '--kp-swipe-x') return;
        finishNow();
    };
    const finishNow = () => {
        row.removeEventListener('transitionend', onEnd);
        clearTimeout(timer);
        done();
    };
    const timer = setTimeout(finishNow, SETTLE_FALLBACK_MS);
    row.addEventListener('transitionend', onEnd);
}
