// One `<details>` that unfolds from its summary's height to its open height, and folds back before `open` goes away.
import { Controller, attachOne, controllerOf } from '../controller.js';
import { motionState } from './state.js';
import { glide } from './arrive.js';
import { themeMotion } from './timing.js';
import { layoutHeight, sizeEase } from './size.js';
import { firstRender } from './fold-size.js';

/** One fold: whether it is folding shut and the glide it plays sit on the instance. */
export class FoldControl extends Controller {
    /** @param {HTMLElement} host a `<details>` with a summary @param {Record<string, unknown>} [options] */
    constructor(host, options = {}) {
        super(host, options);
        /** The details element this fold moves. */
        this.details = /** @type {HTMLDetailsElement} */ (host);
        const details = this.details;
        /** Its summary: the height it folds shut to. */
        this.summary = /** @type {HTMLElement} */ (details.querySelector(':scope > summary'));
        /** The glide running now. @type {Animation | null} */
        this.running = null;
        /** Whether the glide running now folds it shut. */
        this.folding = false;
        /** Whether a change now is still the fold's first render. @type {() => boolean} */
        this.fresh = () => true;
        /** Watches `open` set from outside. @type {MutationObserver | null} */
        this.watcher = null;
    }

    connect() {
        const details = this.details;
        motionState.watching += 1;
        // Registered first, so it runs last: the glide stops and the fold gives back its style after the watchers went.
        this.own(() => this.release());
        // A fold drawn for the first time takes the state it is given at once: a
        // page that rebuilds its groups paints each one's remembered state before
        // the first frame (port spec J3), and that is not a change to glide.
        this.fresh = firstRender(details);
        // `open` set from outside (a page that opens every group while a search
        // runs, a memory painted back when the search ends) glides too: it
        // jumped, the one jump left on the remembered board (Kenny, 2026-10-05:
        // "animation is too chunky, should be smooth").
        this.watcher = this.observe(new MutationObserver((records) => this.onOpenSet(records)));
        this.watcher.observe(details, { attributes: true, attributeFilter: ['open'], attributeOldValue: true });
        this.listen(this.summary, 'click', (event) => this.onClick(event));
    }

    /** The glide stops and the fold loses what a glide gave it; motion watches one fold fewer. */
    release() {
        motionState.watching -= 1;
        this.running?.cancel();
        this.details.style.removeProperty('overflow');
        this.details.removeAttribute('data-kp-folding');
    }

    /** The height of the fold shut: its summary and its borders. */
    shutHeight() {
        const style = getComputedStyle(this.details);
        return layoutHeight(this.summary) + parseFloat(style.borderBlockStartWidth || '0') + parseFloat(style.borderBlockEndWidth || '0');
    }

    /** `open` set by the fold itself, which the watcher does not answer. @param {boolean} value */
    setOpen(value) {
        this.details.open = value;
        this.watcher?.takeRecords();
    }

    /**
     * Glide open or shut from the height the fold stands at now. While it
     * folds shut it carries `data-kp-folding`, so what counts only what is
     * shown (a tile set, js/tiles.js) lets it go at the start of the fold
     * rather than at its end.
     * @param {boolean} opening @param {number} from @param {number} size @param {string} ease
     */
    move(opening, from, size, ease) {
        const details = this.details;
        this.running?.finish();
        this.folding = !opening;
        this.setOpen(true);
        const to = opening ? layoutHeight(details) : this.shutHeight();
        details.toggleAttribute('data-kp-folding', this.folding);
        // The accordion keeps the motion Kenny approved in every theme: the
        // entrance's curve, without a theme's size character.
        const { animation: mine, done } = glide(details, from, to, size, sizeEase(details, ease, to - from, true), true);
        this.running = mine;
        mine.finished
            .then(() => {
                done();
                if (this.running === mine) this.landed();
            })
            // A glide replaced or stopped on destroy rejects with an AbortError: that is the intended end, not a fault.
            .catch(() => undefined);
    }

    /** The glide that owned the fold played out: a fold shut lets go of `open` now. */
    landed() {
        this.running = null;
        if (this.folding) {
            this.folding = false;
            this.setOpen(false);
        }
        this.details.removeAttribute('data-kp-folding');
    }

    /** A press on the summary glides instead of jumping. @param {Event} event */
    onClick(event) {
        const { size, ease } = themeMotion(this.details);
        if (size <= 0) return;
        event.preventDefault();
        this.move(!this.details.open || this.folding, layoutHeight(this.details), size, ease);
    }

    /** `open` changed from outside: glide from where the fold stands. @param {MutationRecord[]} records */
    onOpenSet(records) {
        const details = this.details;
        const was = records[0].oldValue !== null;
        const now = details.open;
        if (this.fresh() || was === now || !details.isConnected) return;
        const { size, ease } = themeMotion(details);
        if (size <= 0) return;
        let from;
        if (this.running) from = layoutHeight(details);
        else if (now) from = this.shutHeight();
        else {
            this.setOpen(true);
            from = layoutHeight(details);
        }
        this.move(now, from, size, ease);
    }
}

/**
 * Unfold a `<details>` from its summary's height to its open height, and
 * fold it back before `open` goes away.
 * @param {HTMLDetailsElement} details
 * @returns {() => void}
 */
export function attachFold(details) {
    // A fold already wired belongs to the call that wired it, and one without a summary has nothing to fold to.
    if (controllerOf(details, FoldControl) || !details.querySelector(':scope > summary')) return () => {};
    const control = attachOne(details, FoldControl);
    return () => control?.destroy();
}
