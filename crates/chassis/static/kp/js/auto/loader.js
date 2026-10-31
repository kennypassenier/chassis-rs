// One load of a root: the modules every page needs, the effects, then only the modules the root carries, the late ones last.

import { asOf, presentUnder, settleAfter } from '../as-of.js';
import { attachEffects } from '../effects.js';
import { attachRemembered, restoreRemembered } from '../remember.js';
import { attachDialogs, attachDismissals, attachScrollbars, attachTabs, attachTooltips } from '../overlays.js';
import { attachThemePickers } from '../theme-picker.js';
import { carries, drawing, everyUnder } from './draw.js';
import { NEEDS } from './needs.js';

/** @typedef {import('../auto.js').Need} Need */

export class AutoLoader {
    /** @param {ParentNode} root */
    constructor(root) {
        this.root = root;
        /** @type {unknown[]} */
        this.detaches = [];
        /** @type {{ detach: () => void } | null} */
        this.effects = null;
        /** @type {WeakSet<Element>} */
        this.present = new WeakSet();
        this.detached = false;
        /** @type {string[]} */
        this.modules = [];
        /** What the fetched modules drew while they attached. @type {WeakSet<Element>} */
        this.drawn = new WeakSet();
        /** A late module the page carries at load is fetched at once and attached later. @type {Map<Need, Promise<any>>} */
        this.prefetched = new Map();
        /** @type {Promise<void>[]} */
        this.pending = [];
        /** @type {Promise<void>} */
        this.ready = Promise.resolve();
        this.settled = () => {};
    }

    /** Attach what needs no markup check, then fetch what the root carries. @returns {(() => void) & { ready: Promise<void>, modules: string[] }} */
    start() {
        const { root } = this;
        // Before every attach: what a reader chose last time goes back onto the
        // markup, and each module then reads the markup it always read
        // [js/remember.js]. A subtree rendered after the boot is restored here.
        restoreRemembered(root);
        this.detaches = [
            attachRemembered(root),
            attachDialogs(root),
            attachDismissals(root),
            attachTooltips(root),
            attachScrollbars(root),
            attachTabs(root),
            attachThemePickers(root),
        ];
        // The effects handle is an object rather than a function [AR34]; its
        // detach is called with the others.
        this.effects = attachEffects(/** @type {Document | Element} */ (root));
        // Taken after the attaches above, so an element one of them added counts
        // as there, as it did when every module attached in one pass.
        this.present = presentUnder(root);
        this.fetchNeeded();
        this.ready = Promise.all(this.pending).then(() => this.attachLate());
        this.settle();
        const detach = () => this.detach();
        return Object.assign(detach, { ready: this.ready, modules: this.modules });
    }

    /** @param {Need} need @param {Promise<any>} loading @param {WeakSet<Element>} asked the elements it attaches against */
    attachOnce(need, loading, asked) {
        return loading.then((module) => {
            // Detached before the module arrived: attach nothing.
            if (this.detached) return;
            this.detaches.push(...drawing(this.root, this.drawn, () => asOf(this.root, asked, () => need.attach(module, this.root))));
        });
    }

    /** Fetch every module the root carries; a late one is fetched now and attached after the rest. */
    fetchNeeded() {
        for (const need of NEEDS) {
            if (!carries(this.root, need.when)) continue;
            this.modules.push(need.name);
            if (need.late) this.prefetched.set(need, need.load());
            else this.pending.push(this.attachOnce(need, need.load(), this.present));
        }
    }

    /**
     * The late modules, once the others have attached: asked for against what
     * was there at the start and what those modules drew or marked, and never
     * what a framework rendered since (js/as-of.js).
     */
    attachLate() {
        const { root } = this;
        const late = NEEDS.filter((need) => need.late && (this.prefetched.has(need) || carries(root, need.when)));
        if (this.detached || !late.length) return undefined;
        const asked = new WeakSet(everyUnder(root).filter((element) => this.present.has(element) || this.drawn.has(element)));
        /** @param {string} selector */
        const askedFor = (selector) =>
            [...(root instanceof Element && root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)].some((element) =>
                asked.has(element),
            );
        return Promise.all(
            late.map((need) => {
                const loading = this.prefetched.get(need);
                if (loading) return this.attachOnce(need, loading, asked);
                if (!askedFor(need.when)) return undefined;
                this.modules.push(need.name);
                return this.attachOnce(need, need.load(), asked);
            }),
        ).then(() => undefined);
    }

    /**
     * What the modules draw now is the page's first render, not news: the
     * root settles until they have all attached and two frames are painted,
     * and js/motion.js lets nothing arrive or glide under it meanwhile
     * [fix-100]. A module fetched later than motion (the data table, three
     * thousand lines) drew its whole chrome into an eased box, and 263
     * elements arrived on the catalogue's first frame.
     */
    settle() {
        const { root } = this;
        const mark = root instanceof Document ? root.documentElement : root instanceof Element ? root : null;
        this.settled = mark ? settleAfter(mark, this.ready) : () => undefined;
    }

    detach() {
        this.detached = true;
        this.settled();
        for (const one of this.detaches) if (typeof one === 'function') one();
        this.effects?.detach();
    }
}
