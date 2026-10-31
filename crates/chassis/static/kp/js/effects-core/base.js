// The services of one attach: the page's settings read once, the timers it started, the once-per-session memo, the unknown values
// it reports and the hooks it fetches. EffectsEngine (engine.js) adds the dispatch on top.

import { asOf } from '../as-of.js';
import { DONE_ATTRIBUTE, MEMO_PREFIX, REVEAL_EVENT, REVEAL_STATE, UNKNOWN_EVENT } from './knobs.js';
import { HOOKS, REVEALS, ROUTINES, SURFACES } from './vocabulary.js';
import { unknownReported } from './registry.js';

/** @typedef {import('../effects.js').EffectsContext} EffectsContext */
/** @typedef {import('../effects.js').EffectsOptions} EffectsOptions */
/** @typedef {import('../effects.js').EffectsState} EffectsState */

/** The default reveal threshold, the decipher rate, the lead, the swap odds, the stagger, the delay, the word stagger and the card hold, used when neither the options nor the theme say. */
const DEFAULTS = { threshold: 0.6, cps: 26, lead: 260, swap: 0.5, stagger: 260, delay: 1500, wordStagger: 60, cardHold: 300 };

/** The hooks, each in a module of its own, fetched the first time something asks [scope-117]. @type {Record<string, () => Promise<{ install: (ctx: EffectsContext) => Record<string, any> }>>} */
const LOADERS = {
    headline: () => import('../effects/headline.js'),
    emphasis: () => import('../effects/emphasis.js'),
    rule: () => import('../effects/rule.js'),
    count: () => import('../effects/count.js'),
    caret: () => import('../effects/caret.js'),
    pointer: () => import('../effects/pointer.js'),
    measure: () => import('../effects/measure.js'),
    marquee: () => import('../effects/marquee.js'),
    arrival: () => import('../effects/arrival.js'),
};

/** How many characters of an element's text key its memo [AR44]. */
const MEMO_TEXT = 64;

export class EffectsBase {
    /** @param {Document | Element} root @param {EffectsOptions} options */
    constructor(root, options) {
        this.root = root;
        this.options = options;
        this.doc = root.ownerDocument ?? /** @type {Document} */ (root);
        this.html = this.doc.documentElement;
        this.manageRoot = options.manageRoot ?? true;
        this.view = this.doc.defaultView;
        const { view } = this;
        this.query = view && typeof view.matchMedia === 'function' ? view.matchMedia('(prefers-reduced-motion: reduce)') : null;
        this.rootStyle = view ? view.getComputedStyle(this.html) : null;
        // The knobs are read once per attach, not per element [AR43].
        this.cfg = {
            threshold: options.threshold ?? this.knob('--kp-reveal-threshold', DEFAULTS.threshold),
            cps: options.cps ?? this.knob('--kp-decipher-cps', DEFAULTS.cps),
            lead: this.knob('--kp-decipher-lead', DEFAULTS.lead),
            swap: this.knob('--kp-decipher-swap', DEFAULTS.swap),
            stagger: options.stagger ?? this.knob('--kp-reveal-stagger', DEFAULTS.stagger),
            delay: options.delay ?? this.knob('--kp-classified-delay', DEFAULTS.delay),
            // The word routines: ms between one word arriving and the next.
            wordStagger: this.knob('--kp-word-stagger', DEFAULTS.wordStagger),
            // The card arrival: how long the word holds after its bar has run.
            cardHold: this.knob('--kp-card-hold', DEFAULTS.cardHold),
        };
        /** @type {Set<ReturnType<typeof setTimeout>>} */
        this.timers = new Set();
        /** @type {Set<number>} */
        this.frames = new Set();
        /** @type {Array<() => void>} */
        this.cleanups = [];
        /** @type {Array<() => void>} */
        this.finishers = [];
        /**
         * The attach's four mutable variables as one object [scope-117]: the
         * hooks live in modules of their own, and every one of them must
         * write the same binding. `ioHeadline` is the headline's own on-view
         * watcher [S48], kept apart from `io` (the rule hook's) so a page whose
         * rule reveal is quiet still gets a working headline draw.
         * @type {EffectsState}
         */
        this.state = { detached: false, io: null, ioHeadline: null, pending: 0 };
        /** @type {Record<string, Promise<Record<string, any>>>} */
        this.installed = {};
        /** @type {Promise<void>[]} */
        this.arriving = [];
        /**
         * The page as attach found it, for the hooks asked for during attach: a
         * hook that arrives after a React component has mounted must not wire it
         * [js/as-of.js]. Taken once scan has run; a hook asked for later, by
         * observe(), reads the page as it is then.
         * @type {WeakSet<Element> | null}
         */
        this.present = null;
        /** What a hook module receives; built by `setContext` once the attach has decided its arrival. @type {EffectsContext | null} */
        this.ctx = null;
    }

    /** @param {WeakSet<Element> | null} present the page as attach found it, or null once attach is over */
    holdPresent(present) {
        this.present = present;
    }

    /** @param {EffectsContext} ctx */
    setContext(ctx) {
        this.ctx = ctx;
    }

    reduced() {
        return this.options.reduceMotion ?? ((this.query ? this.query.matches : false) || this.html.hasAttribute('data-kp-calm'));
    }

    /** @param {string} name @param {number} fallback */
    knob(name, fallback) {
        const n = this.rootStyle ? parseFloat(this.rootStyle.getPropertyValue(name)) : NaN;
        return Number.isFinite(n) ? n : fallback;
    }

    done() {
        if (this.state.detached || this.state.pending > 0) return;
        this.html.setAttribute(DONE_ATTRIBUTE, '');
    }

    /** @param {Element} el @param {string} reveal @param {string} routine @param {boolean} skipped */
    announce(el, reveal, routine, skipped) {
        // The readable half of the announcement [TF2]. The event is the
        // moment; this is the record of it, and it outlives the moment.
        el.setAttribute(REVEAL_STATE, skipped ? 'rest' : 'played');
        el.dispatchEvent(new CustomEvent(REVEAL_EVENT, { bubbles: true, detail: { reveal, routine, skipped } }));
    }

    /** @param {() => void} fn @param {number} ms */
    later(fn, ms) {
        const id = setTimeout(() => {
            this.timers.delete(id);
            if (!this.state.detached) fn();
        }, ms);
        this.timers.add(id);
    }

    /** @param {Element} el @param {'headline' | 'emphasis' | 'rule' | 'arrival'} reveal */
    routineOf(el, reveal) {
        return this.view ? this.view.getComputedStyle(el).getPropertyValue(ROUTINES[reveal]).trim() : '';
    }

    /**
     * The memo key: the path, the hook, and the element's position among
     * its kind — so the hero's marks and the dossier's are two memos, and
     * a second headline on the page is its own [AR44].
     *
     * @param {Element} el @param {string} reveal
     */
    memoKey(el, reveal) {
        const path = this.view?.location.pathname ?? '';
        // Identity, not position [G16, 2026-09-08]. The key used to be the
        // element's index among its siblings of the same reveal, taken
        // over the whole document — so a page that rendered a second
        // headline above the first shifted every index and elements
        // inherited each other's memo: one stopped playing, another played
        // twice. The element's own id when it has one, else its text,
        // which is what a reveal is about in the first place.
        if (reveal === 'emphasis' && el.matches('mark')) return `${MEMO_PREFIX}${path}:${reveal}:loose`;
        const id = el.getAttribute('id');
        const own = id || (el.textContent ?? '').trim().slice(0, MEMO_TEXT);
        // Two elements of the same reveal can open with the same words —
        // the concept page carries two dossiers whose first sixty-four
        // characters match — so the ordinal among the ones sharing this
        // key keeps them apart. It is not the element's position on the
        // page, which was the fault: inserting a headline above another
        // used to renumber every one of them.
        const siblings = id
            ? []
            : [...this.doc.querySelectorAll(`[${HOOKS.reveal}='${reveal}']`)].filter((n) => (n.textContent ?? '').trim().slice(0, MEMO_TEXT) === own);
        const kind = siblings.length > 1 ? `${own}#${siblings.indexOf(el)}` : own;
        return `${MEMO_PREFIX}${path}:${reveal}:${kind}`;
    }

    /** @param {Element} el @param {string} reveal @returns {boolean} true when this page already ran the reveal this session */
    seen(el, reveal) {
        if (el.getAttribute(HOOKS.revealEvery) === 'load') return false;
        try {
            const key = this.memoKey(el, reveal);
            const storage = this.view?.sessionStorage;
            if (!storage) return false;
            if (storage.getItem(key)) return true;
            storage.setItem(key, '1');
            return false;
        } catch {
            return false;
        }
    }

    // ── Unknown values [AR44] ─────────────────────────────────────────
    /**
     * Report a routine name nothing answers to, once per name, and hand
     * back the empty string so the element rests [G6, 2026-09-08]. Same
     * event and same shape as an unknown surface or reveal: heard, never
     * thrown [AR44].
     *
     * @param {Element} el @param {string} knob @param {string} value @param {readonly string[]} accepted
     * @returns {string}
     */
    reportUnknownRoutine(el, knob, value, accepted) {
        const key = `${knob}=${value}`;
        if (!unknownReported.has(key)) {
            unknownReported.add(key);
            el.dispatchEvent(new CustomEvent(UNKNOWN_EVENT, { bubbles: true, detail: { hook: knob, value, accepted: [...accepted] } }));
        }
        return '';
    }

    /** @param {Element} el */
    checkValues(el) {
        /** @type {[string, readonly string[]][]} */
        const pairs = [
            [HOOKS.surface, SURFACES],
            [HOOKS.reveal, REVEALS],
        ];
        for (const [hook, accepted] of pairs) {
            const value = el.getAttribute(hook);
            if (value === null || accepted.includes(value)) continue;
            const key = `${hook}=${value}`;
            if (unknownReported.has(key)) continue;
            unknownReported.add(key);
            el.dispatchEvent(new CustomEvent(UNKNOWN_EVENT, { bubbles: true, detail: { hook, value, accepted: [...accepted] } }));
        }
    }

    // ── The hooks, fetched when asked for [scope-117] ──────────────────
    // Each hook lives in js/effects/<hook>.js. A page that carries no
    // headline never downloads the decipher; a theme that declares no
    // pointer never downloads the light. A hook's module is fetched the
    // first time something asks for it and installed once; `state.pending`
    // is held while it is on its way, so the done attribute still waits for
    // every reveal that has not started yet.
    /** @param {string} name */
    use(name) {
        return (this.installed[name] ??= LOADERS[name]().then((module) => module.install(/** @type {EffectsContext} */ (this.ctx))));
    }

    /** @param {string} name @param {(hook: Record<string, any>) => void} fn */
    run(name, fn) {
        const { state, root } = this;
        state.pending++;
        const asked = this.present;
        const arrived = this.use(name)
            .then((hook) => {
                if (state.detached) return;
                if (asked) asOf(root, asked, () => fn(hook));
                else fn(hook);
            })
            .catch((error) => console.error(error))
            .finally(() => {
                state.pending = Math.max(0, state.pending - 1);
                this.done();
            });
        this.arriving.push(arrived);
    }
}
