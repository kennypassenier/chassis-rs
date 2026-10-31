// The tour's pure rules and its target lookups: whether a tour starts by itself, which steps are on the page, where the card goes, and which element a step points at.

/** @typedef {import('../tour.js').TourStep} TourStep */

/** The distance from the card to the window's edges, and from the card to its target, in px. */
export const TOUR_GUTTER = 16;
export const TOUR_GAP = 12;

/**
 * Whether a tour starts by itself, and at which step: `?tour` (or `?tour=3`,
 * counted from 1) always does; otherwise only a first visit by a person
 * (not a browser driven by a script).
 * @param {{ search?: string, remembered?: boolean, automated?: boolean }} context
 * @returns {number | null} the step to start on, counted from 0, or null for no tour
 */
export function shouldStartTour({ search = '', remembered = false, automated = false }) {
    const asked = new URLSearchParams(search).get('tour');
    if (asked != null) return Math.max(0, (Number.parseInt(asked, 10) || 1) - 1);
    if (remembered || automated) return null;
    return 0;
}

/**
 * The steps a tour shows: those whose target `find` finds, in order. The
 * count on the card is taken from these, so it is exact.
 * @template {TourStep} S
 * @param {readonly S[]} steps
 * @param {(step: S) => unknown} find
 * @returns {S[]}
 */
export const tourStepsOnPage = (steps, find) => steps.filter((step) => !!find(step));

/**
 * Where the card goes: centred on its target, kept `gutter` px inside the
 * window, and `gap` px under the target, or over it when the target's middle
 * is in the lower half of the window. Not rounded: a target at a fractional
 * position keeps the card exactly `gap` px from it.
 * @param {{ top: number, bottom: number, left: number, width: number, height: number }} target the target's box in the window
 * @param {{ width: number, height: number }} card
 * @param {{ width: number, height: number }} view
 * @param {{ gutter?: number, gap?: number }} [options]
 * @returns {{ left: number, top: number }}
 */
export function tourCardPlace(target, card, view, { gutter = TOUR_GUTTER, gap = TOUR_GAP } = {}) {
    const left = Math.max(gutter, Math.min(view.width - card.width - gutter, target.left + target.width / 2 - card.width / 2));
    const top = target.top + target.height / 2 > view.height / 2 ? target.top - gap - card.height : target.bottom + gap;
    return { left, top };
}

/** Is `el` laid out (not hidden, not inside something hidden)? @param {Element | null} el */
export const isShown = (el) => !!el && el.isConnected && el.getClientRects().length > 0;

/** @param {TourStep} step @param {Document} doc @returns {HTMLElement | null} */
export function resolveTarget(step, doc) {
    if (typeof step.target === 'function') {
        const el = step.target();
        return el instanceof HTMLElement && isShown(el) ? el : null;
    }
    return /** @type {HTMLElement | null} */ ([...doc.querySelectorAll(step.target)].find((el) => isShown(el)) ?? null);
}
