// A short guided tour over the page, and the help drawer it starts from [scope-143].
//
// The homelab dashboard's tour (port spec I.3), moved into the package.
// startTour(steps) walks the reader over the page, one card per step, beside
// the part it talks about:
//
//   startTour([
//       { target: '[data-area="nav"]', title: 'The areas', text: 'Five areas, always in the same place.' },
//       { target: () => document.querySelector('#search'), title: 'Search', text: 'Find a pump house by its name.' },
//   ], { remember: 'network', returnFocus: helpButton });
//
// What it keeps:
//   - The count is exact: a step whose target is not on the page (absent, or
//     hidden) is left out before counting, so six steps with one missing read
//     `1 of 5` … `5 of 5`. With no step left there is no tour (null).
//   - The card (`.kp-tour`) is a non-modal dialog: the page stays usable. It
//     sits 12 px under its target, or over it when the target is in the lower
//     half of the window, so it never covers what it talks about; 16 px from
//     the window's edges; and it follows the target when the page scrolls or
//     the window resizes. When the target is inside an open modal dialog, the
//     card goes into that dialog, or it would sit behind it, inert.
//   - The target gets `data-kp-tour-target`: a ring in the focus colour, and
//     the rest of the page dimmed around it.
//   - Back, Skip and Next (Done on the last step), ← and → on the card, and
//     Esc anywhere end or move it. When it ends, the focus goes back where it
//     was (or to `returnFocus`), and a finished or skipped tour is remembered
//     under `remember` through js/remember.js, if the browser lets it.
//
// shouldStartTour({ search, remembered, automated }) says whether a page
// starts it by itself: `?tour` (or `?tour=3`) always does; otherwise only a
// first visit by a person, not a browser driven by a script.
//
// `.kp-drawer` (the Help it starts from) and `.kp-help` are markup and CSS
// only. Every word is in the dictionary (`tour…` in js/strings.js).
// `decorate(part, info)` is called with the card's three buttons each time a
// tour builds them. Nothing runs on import.

import { playEntranceBackwards, stopReversing } from './motion.js';
import { REMEMBER_ATTRIBUTE, memoryFor } from './remember.js';
import { resolveStrings } from './strings.js';
import { markUpdating, unmarkUpdating, updateIdea, updatePlays, updateTiming } from './update.js';

/** @typedef {import('./strings.js').Strings} Strings */

/**
 * One step of a tour: the part of the page it is about (a selector, whose
 * first shown match is taken, or a function), and what the card says.
 * @typedef {object} TourStep
 * @property {string | (() => Element | null)} target
 * @property {string} title
 * @property {string} text
 */

/**
 * What `decorate` is told about the control it is handed: the same shape every kp module's `decorate` takes.
 * `kind` is `tour-next`, `tour-back` or `tour-skip`; `host` is the tour's card.
 * @typedef {{ kind: 'tour-next' | 'tour-back' | 'tour-skip', host: HTMLElement, key?: string, index?: number, label?: string, value?: string }} TourDecorateInfo
 */

/**
 * @typedef {object} TourOptions
 * @property {number} [start] the step to open on, counted from 0 among the steps that are on the page
 * @property {string} [remember] the name a finished or skipped tour is remembered under (js/remember.js, component `tour`)
 * @property {(part: HTMLElement, info: TourDecorateInfo) => void} [decorate] called with the card's buttons each time a tour builds them [R-DRIVE]
 * @property {HTMLElement | null} [returnFocus] where the focus goes when the tour ends; the focused element when it started, by default
 * @property {(finished: boolean) => void} [onEnd] called once when it ends: `true` when Done was pressed on the last step
 * @property {Partial<Strings>} [strings] any of the dictionary's `tour…` words, for this tour only
 */

/** What startTour hands back: end it, or go to a step (counted from 0 among the steps on the page). @typedef {{ end: () => void, goto: (i: number) => void }} TourHandle */

/** The distance from the card to the window's edges, and from the card to its target, in px. */
export const TOUR_GUTTER = 16;
export const TOUR_GAP = 12;

/** The slot a tour's memory is kept under. */
const TOUR_SLOT = 'done';

/**
 * The tour's memory, through js/remember.js: component `tour`, the tour's
 * name as the element's name. A tour has no element of its own, so a
 * stand-in answers to the name; it is never in a document, so two tours of
 * one name never refuse each other.
 * @param {string} name
 * @param {Storage | null} [storage]
 */
function tourMemory(name, storage) {
    const holder = /** @type {Element} */ (
        /** @type {unknown} */ ({ getAttribute: (/** @type {string} */ attr) => (attr === REMEMBER_ATTRIBUTE ? name : null), isConnected: false })
    );
    return memoryFor(holder, 'tour', storage === undefined ? {} : { storage });
}

/**
 * The storage key a finished tour writes, as js/remember.js composes it:
 * `kp-remember:tour:<name>:done` with the default prefix.
 * @param {string} name
 * @returns {string}
 */
export const tourMemoryKey = (name) => tourMemory(name)?.key(TOUR_SLOT) ?? '';

/**
 * Whether the tour of this name was taken before (finished or skipped).
 * @param {string} name
 * @param {{ storage?: Storage | null }} [options]
 * @returns {boolean}
 */
export const tourRemembered = (name, { storage } = {}) => tourMemory(name, storage)?.read(TOUR_SLOT, /** @type {unknown} */ (false)) === true;

/**
 * Forget that the tour of this name was taken, so it starts by itself again.
 * @param {string} name
 * @param {{ storage?: Storage | null }} [options]
 */
export const forgetTour = (name, { storage } = {}) => tourMemory(name, storage)?.forget(TOUR_SLOT);

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

/** @param {Document} doc @returns {boolean} */
const reducedMotion = (doc) => !!doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Is `el` laid out (not hidden, not inside something hidden)? @param {Element | null} el */
const isShown = (el) => !!el && el.isConnected && el.getClientRects().length > 0;

/** @param {TourStep} step @param {Document} doc @returns {HTMLElement | null} */
function resolveTarget(step, doc) {
    if (typeof step.target === 'function') {
        const el = step.target();
        return el instanceof HTMLElement && isShown(el) ? el : null;
    }
    return /** @type {HTMLElement | null} */ ([...doc.querySelectorAll(step.target)].find((el) => isShown(el)) ?? null);
}

let idSeq = 0;
/** @param {string} prefix */
const nextId = (prefix) => `${prefix}-${(idSeq += 1)}`;

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc
 * @param {K} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    el.className = className;
    if (text != null) el.textContent = text;
    return el;
};

/** The tour that runs now: a second one ends it first. @type {(() => void) | null} */
let endRunning = null;

/**
 * Walk the reader over the page, one card per step, beside its target.
 * Steps whose target is not on the page are left out before counting, so the
 * count is exact. The card is a non-modal dialog: the page stays usable. Esc
 * or Skip ends it, the focus goes back where it was, and a tour that ended
 * is remembered (`remember`), if the browser lets it.
 * @param {TourStep[]} steps
 * @param {TourOptions} [options]
 * @returns {TourHandle | null} null when no step has a target on the page
 */
export function startTour(steps, { start = 0, remember, decorate, returnFocus, onEnd, strings: own } = {}) {
    endRunning?.();
    const doc = document;
    const view = /** @type {Window} */ (doc.defaultView);
    const strings = resolveStrings(own);
    let live = tourStepsOnPage(steps, (s) => resolveTarget(s, doc));
    if (!live.length) return null;
    const back = /** @type {HTMLElement | null} */ (returnFocus ?? (doc.activeElement instanceof HTMLElement ? doc.activeElement : null));
    let index = Math.min(Math.max(0, start), live.length - 1);
    /** @type {HTMLElement | null} */
    let target = null;
    let targetPosition = '';
    const card = /** @type {HTMLDialogElement} */ (make(doc, 'dialog', 'kp-tour'));
    const title = make(doc, 'h3', 'kp-tour__title');
    title.id = nextId('kp-tour-title');
    const text = make(doc, 'p', 'kp-tour__text');
    text.id = nextId('kp-tour-text');
    card.setAttribute('aria-labelledby', title.id);
    card.setAttribute('aria-describedby', text.id);
    const foot = make(doc, 'footer', 'kp-tour__foot');
    const count = make(doc, 'span', 'kp-tour__count');
    const buttons = make(doc, 'span', 'kp-tour__buttons');
    const backButton = make(doc, 'button', 'kp-button kp-button--sm', strings.tourBack);
    backButton.type = 'button';
    backButton.title = strings.tourBackTitle;
    const skipButton = make(doc, 'button', 'kp-button kp-button--sm kp-button--ghost', strings.tourSkip);
    skipButton.type = 'button';
    skipButton.title = strings.tourSkipTitle;
    const nextButton = make(doc, 'button', 'kp-button kp-button--sm kp-button--primary', strings.tourNext);
    nextButton.type = 'button';
    buttons.append(backButton, skipButton, nextButton);
    foot.append(count, buttons);
    card.append(title, text, foot);
    decorate?.(nextButton, { kind: 'tour-next', host: card });
    decorate?.(backButton, { kind: 'tour-back', host: card });
    decorate?.(skipButton, { kind: 'tour-skip', host: card });

    const unmark = () => {
        if (!target) return;
        target.removeAttribute('data-kp-tour-target');
        target.style.position = targetPosition;
        target = null;
    };
    /** @param {HTMLElement} el */
    const mark = (el) => {
        unmark();
        target = el;
        targetPosition = el.style.position;
        el.setAttribute('data-kp-tour-target', '');
        // The ring and the dimming paint over what follows the target only
        // when it is positioned; a static one becomes relative while marked.
        if (view.getComputedStyle(el).position === 'static') el.style.position = 'relative';
    };
    const place = () => {
        if (!target || !card.open) return;
        // A target replaced or hidden by a live update: find it again, or
        // leave its step out.
        if (!isShown(target)) {
            const again = resolveTarget(live[index], doc);
            if (again) mark(again);
            else {
                live = live.filter((_, i) => i !== index);
                if (!live.length) {
                    finish(false);
                    return;
                }
                show(Math.min(index, live.length - 1), false);
                return;
            }
        }
        const at = tourCardPlace(/** @type {HTMLElement} */ (target).getBoundingClientRect(), card.getBoundingClientRect(), {
            width: view.innerWidth,
            height: view.innerHeight,
        });
        card.style.left = `${at.left}px`;
        card.style.top = `${at.top}px`;
    };
    /** Takes the step-change mark off the card early (a step after a step). */
    let unmarkStep = () => {};
    /**
     * The card changes in place on a step after the first: it carries the
     * theme's update moment (js/update.js, `[data-kp-updating]` with the
     * idea the register's `--kp-update` names), so the next step reads as
     * news the way any value updated in place does.
     */
    const markStep = () => {
        unmarkStep();
        const view = doc.defaultView;
        if (!view) return;
        const idea = updateIdea(view.getComputedStyle(card).getPropertyValue('--kp-update'));
        if (!updatePlays(idea)) return;
        const timing = updateTiming(card);
        // The mark that just came off is read once, so setting it again
        // starts the register's keyframes again.
        void view.getComputedStyle(card).animationName;
        const before = markUpdating(card, idea, timing);
        const done = view.setTimeout(() => unmarkStep(), timing.duration || 1200);
        unmarkStep = () => {
            view.clearTimeout(done);
            unmarkUpdating(card, before);
            unmarkStep = () => {};
        };
    };
    /** @param {number} i @param {boolean} [scroll] */
    const show = (i, scroll = true) => {
        const stepping = card.open;
        index = i;
        const step = live[index];
        const el = resolveTarget(step, doc);
        if (!el) {
            live = live.filter((_, k) => k !== index);
            if (!live.length) {
                finish(false);
                return;
            }
            show(Math.min(index, live.length - 1), scroll);
            return;
        }
        mark(el);
        // The card goes where the target is: into an open modal dialog when
        // the target is in one, or it would sit behind it, inert.
        const host = el.closest('dialog[open]') ?? doc.body;
        if (card.parentElement !== host) {
            if (card.open) card.close();
            host.append(card);
        }
        if (!card.open) card.show();
        title.textContent = step.title;
        text.textContent = step.text;
        if (stepping) markStep();
        count.textContent = strings.tourCount(index + 1, live.length);
        backButton.hidden = index === 0;
        const last = index === live.length - 1;
        nextButton.textContent = last ? strings.tourDone : strings.tourNext;
        nextButton.title = last ? strings.tourDoneTitle : strings.tourNextTitle;
        if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion(doc) ? 'auto' : 'smooth' });
        place();
        nextButton.focus({ preventScroll: true });
    };
    let ended = false;
    /** @param {boolean} finished */
    const finish = (finished) => {
        // Once: a handle's end() after the tour already ended does nothing.
        if (ended) return;
        ended = true;
        unmark();
        unmarkStep();
        // The card goes as it came: its entrance played backwards, then it
        // is closed and taken out (Kenny, 2026-10-05: it faded in and
        // vanished at once).
        card.inert = true;
        void playEntranceBackwards(card).then(() => {
            if (card.open) card.close();
            card.remove();
            stopReversing(card);
        });
        view.removeEventListener('keydown', onKey, true);
        view.removeEventListener('resize', onMove);
        doc.removeEventListener('scroll', onMove, true);
        endRunning = null;
        // A tour that ended, finished or skipped, does not start by itself
        // again; Help can start it.
        if (remember) tourMemory(remember)?.write(TOUR_SLOT, true);
        if (back?.isConnected) back.focus();
        onEnd?.(finished);
    };
    let frame = 0;
    const onMove = () => {
        if (frame) return;
        frame = view.requestAnimationFrame(() => {
            frame = 0;
            place();
        });
    };
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        if (event.key === 'Escape') {
            // Capture, on the window: Esc ends the tour alone, not a dialog
            // the tour runs in.
            event.preventDefault();
            event.stopPropagation();
            finish(false);
            return;
        }
        if (!card.contains(/** @type {Node} */ (event.target))) return;
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            nextButton.click();
        } else if (event.key === 'ArrowLeft' && index > 0) {
            event.preventDefault();
            backButton.click();
        }
    };
    nextButton.addEventListener('click', () => (index >= live.length - 1 ? finish(true) : show(index + 1)));
    backButton.addEventListener('click', () => index > 0 && show(index - 1));
    skipButton.addEventListener('click', () => finish(false));
    view.addEventListener('keydown', onKey, true);
    view.addEventListener('resize', onMove);
    doc.addEventListener('scroll', onMove, true);
    endRunning = () => finish(false);
    show(index);
    return {
        end: () => finish(false),
        goto: (i) => {
            if (!ended) show(Math.min(Math.max(0, i), live.length - 1));
        },
    };
}
