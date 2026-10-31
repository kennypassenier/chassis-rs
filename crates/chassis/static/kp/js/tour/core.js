// A tour run's state on the instance and its steps: the target that is marked, the card that is placed beside it, and a step shown, in place or by the theme's update moment.

import { Controller } from '../controller.js';
import { resolveStrings } from '../strings.js';
import { markUpdating, unmarkUpdating, updateIdea, updatePlays, updateTiming } from '../update.js';
import { buildCard, fixShape } from './build.js';
import { isShown, resolveTarget, tourCardPlace } from './place.js';

/** @typedef {import('../tour.js').TourStep} TourStep */
/**
 * @typedef {object} TourRunOptions
 * @property {TourStep[]} live the steps that are on the page
 * @property {number} start the step to open on
 * @property {ReturnType<typeof buildCard>} ui the card and its parts
 * @property {HTMLElement | null} [returnFocus]
 * @property {Partial<import('../strings.js').Strings>} [strings]
 * @property {string} [remember]
 * @property {(part: HTMLElement, info: import('../tour.js').TourDecorateInfo) => void} [decorate]
 * @property {(finished: boolean) => void} [onEnd]
 */

/** How long the step-change mark stays when the theme's update moment names no duration, in ms. */
const STEP_MARK_FALLBACK_MS = 1200;

export class TourCore extends Controller {
    /**
     * @param {HTMLElement} host the tour's card (a dialog); the controller's host
     * @param {TourRunOptions} options
     */
    constructor(host, options) {
        super(host, options);
        this.card = /** @type {HTMLDialogElement} */ (host);
        this.doc = host.ownerDocument;
        this.view = /** @type {Window} */ (this.doc.defaultView);
        this.strings = resolveStrings(options.strings);
        this.ui = options.ui;
        this.remember = options.remember;
        this.decorate = options.decorate;
        this.onEnd = options.onEnd;
        /** The steps that are on the page; one that vanishes is left out. @type {TourStep[]} */
        this.live = options.live;
        this.back = /** @type {HTMLElement | null} */ (options.returnFocus ?? (this.doc.activeElement instanceof HTMLElement ? this.doc.activeElement : null));
        this.index = Math.min(Math.max(0, options.start), this.live.length - 1);
        /** The element the card talks about. @type {HTMLElement | null} */
        this.target = null;
        /** Takes the step-change mark off the card early (a step after a step). */
        this.unmarkStep = () => {};
    }

    /** Ends the tour; the running tour overrides it. @param {boolean} _finished */
    finish(_finished) {}

    unmark() {
        if (!this.target) return;
        this.target.removeAttribute('data-kp-tour-target');
        this.target = null;
    }

    /** @param {HTMLElement} el */
    mark(el) {
        this.unmark();
        this.target = el;
        el.setAttribute('data-kp-tour-target', '');
    }

    /** A target replaced or hidden by a live update: find it again, or leave its step out. @returns {boolean} whether the step has a target again */
    refind() {
        const again = resolveTarget(/** @type {TourStep} */ (this.live[this.index]), this.doc);
        if (again) {
            this.mark(again);
            return true;
        }
        this.skipMissing(false);
        return false;
    }

    /** Leave the current step out, and end the tour when none is left. @param {boolean} scroll */
    skipMissing(scroll) {
        this.live = this.live.filter((_, i) => i !== this.index);
        if (!this.live.length) {
            this.finish(false);
            return;
        }
        this.show(Math.min(this.index, this.live.length - 1), scroll);
    }

    /** Put the card beside its target. */
    place() {
        const card = this.card;
        if (!this.target || !card.open) return;
        if (!isShown(this.target) && !this.refind()) return;
        const at = tourCardPlace(/** @type {HTMLElement} */ (this.target).getBoundingClientRect(), card.getBoundingClientRect(), {
            width: this.view.innerWidth,
            height: this.view.innerHeight,
        });
        card.style.left = `${at.left}px`;
        card.style.top = `${at.top}px`;
    }

    /**
     * The card changes in place on a step after the first: it carries the
     * theme's update moment (js/update.js, `[data-kp-updating]` with the
     * idea the register's `--kp-update` names), so the next step reads as
     * news the way any value updated in place does.
     */
    markStep() {
        this.unmarkStep();
        const card = this.card;
        const view = this.doc.defaultView;
        if (!view) return;
        const idea = updateIdea(view.getComputedStyle(card).getPropertyValue('--kp-update'));
        if (!updatePlays(idea)) return;
        const timing = updateTiming(card);
        // The mark that just came off is read once, so setting it again starts the register's keyframes again.
        void view.getComputedStyle(card).animationName;
        const before = markUpdating(card, idea, timing);
        const done = view.setTimeout(() => this.unmarkStep(), timing.duration || STEP_MARK_FALLBACK_MS);
        this.unmarkStep = () => {
            view.clearTimeout(done);
            unmarkUpdating(card, before);
            this.unmarkStep = () => {};
        };
    }

    /** The card goes where the target is: into an open modal dialog when the target is in one, or it would sit behind it, inert. @param {HTMLElement} el */
    seat(el) {
        const card = this.card;
        const host = el.closest('dialog[open]') ?? this.doc.body;
        if (card.parentElement !== host) {
            if (card.open) card.close();
            host.append(card);
        }
        if (!card.open) card.show();
    }

    /** The words, the count and the buttons of a step. @param {TourStep} step @param {boolean} stepping */
    writeStep(step, stepping) {
        const { title, text, count, back, next } = this.ui;
        title.textContent = step.title;
        text.textContent = step.text;
        if (stepping) {
            this.card.setAttribute('data-kp-tour-stepping', '');
            this.markStep();
        }
        count.textContent = this.strings.tourCount(this.index + 1, this.live.length);
        back.hidden = this.index === 0;
        const last = this.index === this.live.length - 1;
        next.textContent = last ? this.strings.tourDone : this.strings.tourNext;
        next.title = last ? this.strings.tourDoneTitle : this.strings.tourNextTitle;
    }

    /** Scroll the target into view unless it is already all in the window. @param {HTMLElement} el */
    scrollInto(el) {
        const { view, doc } = this;
        const rect = el.getBoundingClientRect();
        const inView =
            rect.top >= 0 &&
            rect.bottom <= (view.innerHeight || doc.documentElement.clientHeight) &&
            rect.left >= 0 &&
            rect.right <= (view.innerWidth || doc.documentElement.clientWidth);
        if (!inView) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    }

    /** Show a step: mark its target, seat the card, write the words, scroll and place. @param {number} i @param {boolean} [scroll] */
    show(i, scroll = true) {
        const card = this.card;
        const stepping = card.open;
        this.index = i;
        const step = /** @type {TourStep} */ (this.live[this.index]);
        const el = resolveTarget(step, this.doc);
        if (!el) {
            this.skipMissing(scroll);
            return;
        }
        this.mark(el);
        this.seat(el);
        if (!stepping) fixShape(card, this.live, this.ui.title, this.ui.text);
        this.writeStep(step, stepping);
        if (scroll) this.scrollInto(el);
        this.place();
        this.ui.next.focus({ preventScroll: true });
    }
}
