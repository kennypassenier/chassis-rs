// One eased box: it glides to its new height whenever what is in it changes size, and what arrives in it arrives the theme's way.
import { Controller, attachOne, controllerOf } from '../controller.js';
import { motionState } from './state.js';
import { arrival, arrive, glide } from './arrive.js';
import { ARRIVE_KEYS } from './constants.js';
import { switching } from './switching.js';
import { themeMotion } from './timing.js';
import { sizeEase, steppedDuration } from './size.js';
import { repaintedIn } from './leave.js';
import { arriveMode, firstRender, foldingOutFor, followsAFold, settledHeight } from './fold-size.js';
/** @typedef {import('./fold-size.js').SizeOptions} SizeOptions */

/** How long after following a fold a theme that folds in whole ticks keeps the size the fold ended on, in ms. */
const FOLD_TICK_HOLD_MS = 300;
/** Less than a pixel of change is no change: no glide starts for it. */
const SAME_PX = 1;

/** One box that eases its height: the state of its glide sits on the instance. */
export class BoxSize extends Controller {
    /** @param {HTMLElement} box @param {SizeOptions} [options] */
    constructor(box, options = {}) {
        super(box, options);
        /** Which arrivals play when no `data-kp-arrive` says otherwise. */
        this.fallback = options.arrive ?? 'all';
        /** The attributes that carry a row's stable id, the page's own first. */
        this.keys = [...(options.arriveKeys ?? []), ...ARRIVE_KEYS];
        /** The height the box was last seen to settle at. */
        this.last = 0;
        /** The glide running now. @type {Animation | null} */
        this.running = null;
        /** When the box last left its size to a fold it follows. */
        this.followedAt = -Infinity;
        /** Whether a change now is still the box's first render. @type {() => boolean} */
        this.fresh = () => true;
        /** Watches the box and its children. @type {ResizeObserver | null} */
        this.sizes = null;
    }

    connect() {
        const box = this.host;
        motionState.watching += 1;
        // Registered first, so it runs last: the glide stops and the box gives back its style after the watchers went.
        this.own(() => this.release());
        this.last = box.offsetHeight;
        this.fresh = firstRender(box);
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
        this.sizes = this.observe(new ResizeObserver((entries) => this.onResize(entries)));
        this.watch();
        // A child that leaves changes no child's size; the list itself is watched.
        const list = this.observe(new MutationObserver((records) => this.onChange(records)));
        list.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
    }

    /** The glide stops and the box loses the style a glide gave it; motion watches one box fewer. */
    release() {
        motionState.watching -= 1;
        this.running?.cancel();
        this.host.style.removeProperty('overflow');
        this.host.style.removeProperty('box-sizing');
    }

    /** Watch the box and each of its children as they are now. */
    watch() {
        const sizes = /** @type {ResizeObserver} */ (this.sizes);
        sizes.disconnect();
        sizes.observe(this.host);
        for (const child of this.host.children) sizes.observe(child);
    }

    /** @param {ResizeObserverEntry[]} entries */
    onResize(entries) {
        if (entries.some((entry) => entry.target !== this.host)) this.settle();
        else if (!this.running) this.last = this.host.offsetHeight;
    }

    /**
     * During a glide a child may change size only because the box's height
     * moves (a stretched or squeezed item): the size the content asks for is
     * the same, so the glide goes on. Restarting it there started it again
     * from where it stood on every frame, and the box crept towards its size
     * for seconds. The effect is lifted off the box for one read, which
     * leaves its timing alone.
     * @returns {boolean} whether the content asks for the height already gliding to
     */
    asksTheSame() {
        const effect = /** @type {KeyframeEffect | null} */ (this.running?.effect ?? null);
        if (!this.running || !effect) return false;
        effect.target = null;
        const natural = settledHeight(this.host);
        effect.target = this.host;
        return Math.abs(natural - this.last) < SAME_PX;
    }

    /** Something in the box changed size: glide from the height on screen to the one it settles at. */
    settle() {
        const box = this.host;
        if (!box.isConnected || this.asksTheSame()) return;
        const from = this.running ? box.offsetHeight : this.last;
        // Finished rather than cancelled: a page that awaits every
        // animation's `finished` must not see an AbortError for a glide a
        // newer one replaced (tests/register-dark-faults awaited one).
        this.running?.finish();
        this.running = null;
        const to = settledHeight(box);
        this.last = to;
        if (this.holds(from, to)) return;
        const { size, ease } = themeMotion(box);
        if (size > 0) this.glideTo(from, to, size, ease);
    }

    /**
     * Whether the box takes `to` without a glide of its own: a theme switch, a first render, no change, an
     * empty end, or a fold in it that the box follows frame by frame.
     * @param {number} from @param {number} to
     */
    holds(from, to) {
        const box = this.host;
        if (switching || this.fresh() || Math.abs(to - from) < SAME_PX || from === 0 || to === 0) {
            // A fold that changes nothing in the box this tick (a panel
            // leaving while another arrives) is still a fold it follows.
            if (Math.abs(to - from) < SAME_PX && followsAFold(box)) this.followedAt = performance.now();
            return true;
        }
        // Something in it is leaving and folds its height shut; the box
        // follows that fold frame by frame instead of gliding after it.
        if (followsAFold(box)) {
            this.followedAt = performance.now();
            return true;
        }
        // A theme that folds in whole ticks (`--kp-leave-fold-ease`) leaves
        // the box at the size the fold ended on: a glide from the size of
        // its last tick would replay that tick's step after the fold.
        const ticks = getComputedStyle(box).getPropertyValue('--kp-leave-fold-ease').trim() !== '';
        if (performance.now() - this.followedAt < FOLD_TICK_HOLD_MS && ticks) {
            this.followedAt = -Infinity;
            return true;
        }
        return false;
    }

    /** @param {number} from @param {number} to @param {number} size @param {string} ease */
    glideTo(from, to, size, ease) {
        const box = this.host;
        // Shutting while rows fold out of it, the box ends as they end: the
        // open started its glide and their arrival together.
        const delay = to < from ? Math.max(0, foldingOutFor(box) - size) : 0;
        const easing = sizeEase(box, ease, to - from);
        const { animation: mine, done } = glide(box, from, to, steppedDuration(box, easing, size), easing, false, delay);
        this.running = mine;
        mine.finished
            .then(() => {
                // done() leaves the box alone when a newer glide owns it.
                done();
                if (this.running === mine) this.running = null;
            })
            // A glide replaced or stopped on destroy rejects with an AbortError: that is the intended end, not a fault.
            .catch(() => undefined);
    }

    /**
     * Which arrivals play for a change under `target`. A live view that
     * redraws its rows marks the box `data-kp-arrive="none"`, or every
     * refresh replays every arrival (the homelab dashboard's live repaint,
     * 2026-10-04); with `data-kp-arrive="new"` a redrawn row stays still and
     * only a row with a key not seen a moment ago arrives [port spec G].
     * A first render arrives as nothing: it is the page, not news.
     * @param {Node} target
     */
    modeOf(target) {
        return this.fresh() ? 'none' : arriveMode(target instanceof Element ? target : this.host, this.fallback);
    }

    /** What changed in the box arrives the theme's way; then the box settles. @param {MutationRecord[]} records */
    onChange(records) {
        const any = records.some((record) => this.modeOf(record.target) !== 'none');
        this.arriveAll(records, records.length && any ? arrival(this.host) : null);
        this.watch();
        this.settle();
    }

    /**
     * Only what changed over the whole batch arrives: an element hidden and
     * shown again in one task was never gone (the data table hides every row
     * and shows its page again on each render, and every shown row of every
     * group replayed its arrival when one group folded), and an element
     * taken out and put back is moved, not new (a sort appends its rows
     * again). Kenny, 2026-10-05.
     * @param {MutationRecord[]} records @param {ReturnType<typeof arrival> | null} motion
     */
    arriveAll(records, motion) {
        /** @type {Set<any> | null} */
        let repainted = null;
        const { hiddenBefore, moved } = batchOf(records);
        for (const record of records) {
            const mode = this.modeOf(record.target);
            if (mode === 'none') continue;
            const target = record.target;
            if (record.type === 'attributes' && target instanceof HTMLElement && !target.hidden && hiddenBefore.get(target)) {
                hiddenBefore.delete(target);
                arrive(target, motion);
            }
            // Added to the box, or to a list inside it (rows in a <ul>).
            if (record.type !== 'childList') continue;
            for (const node of record.addedNodes) {
                if (!(node instanceof HTMLElement) || moved.has(node) || node.hasAttribute('data-kp-ghost')) continue;
                if (mode === 'new' && (repainted ??= repaintedIn(records, { keys: this.keys })).has(node)) continue;
                arrive(node, motion);
            }
        }
    }
}

/**
 * What one batch of records says before any arrives: which targets were hidden before it, and which nodes it took out.
 * @param {MutationRecord[]} records
 */
function batchOf(records) {
    /** @type {Map<Node, boolean>} */
    const hiddenBefore = new Map();
    /** @type {Set<Node>} */
    const moved = new Set();
    for (const record of records) {
        if (record.type === 'attributes' && !hiddenBefore.has(record.target)) hiddenBefore.set(record.target, record.oldValue !== null);
        if (record.type === 'childList') for (const node of record.removedNodes) moved.add(node);
    }
    return { hiddenBefore, moved };
}

/**
 * Ease `box` to its new height whenever what is in it changes size, in both
 * directions; a change during a glide continues from where the box is.
 * @param {HTMLElement} box
 * @param {SizeOptions} [options]
 * @returns {() => void}
 */
export function easeSize(box, { arrive: fallback = 'all', arriveKeys = [] } = {}) {
    // A box already eased belongs to the call that eased it: this one gets a detach that does nothing.
    if (controllerOf(box, BoxSize)) return () => {};
    const control = attachOne(box, BoxSize, { arrive: fallback, arriveKeys });
    return () => control?.destroy();
}
