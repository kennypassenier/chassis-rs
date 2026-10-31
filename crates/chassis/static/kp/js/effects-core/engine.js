// One attach of the effects: the dispatch of the reveals, the arrival decision, the theme buses and the handle it returns.

import { EffectsBase } from './base.js';
import { buildContext } from './context.js';
import { CARET_KNOB, MEASURE_KNOB, POINTER_KNOB, PRESS_KNOB, ROOT_ATTRIBUTE } from './knobs.js';
import { arrivalsOnScreen, started } from './registry.js';
import { ARRIVALS, HOOKS, REVEALS, ROUTINES } from './vocabulary.js';
import { presentUnder } from '../as-of.js';

/** @typedef {import('../effects.js').EffectsHandle} EffectsHandle */
/** @typedef {import('../effects.js').EffectsOptions} EffectsOptions */

/** The press styles a theme can ask for. */
const PRESS_STYLES = ['point', 'size', 'hold'];

export class EffectsEngine extends EffectsBase {
    /** @param {Document | Element} root @param {EffectsOptions} options */
    constructor(root, options) {
        super(root, options);
        /** What the page's arrival will do, decided before the scan [scope-86]. */
        this.arrival = { routine: '', performed: false, plays: false };
        this.pointerArmed = false;
        this.pressArmed = false;
        /** The one `change` handler of the motion preference; same identity for add and remove. */
        this.preferenceHandler = () => this.onPreference();
    }

    /** Attach the reveals under the root and return the handle. @returns {EffectsHandle} */
    start() {
        const { root, html, query } = this;
        if (this.manageRoot) html.setAttribute(ROOT_ATTRIBUTE, '');
        // The subscription to the preference is deliberately not in
        // `cleanups`: onPreference empties that list to stop the observers and
        // listeners the routines made, and it must not unsubscribe itself
        // while doing so. detach() drops it explicitly [G8].
        if (query) query.addEventListener('change', this.preferenceHandler);
        this.decideArrival();
        this.setContext(buildContext(this));
        this.holdPresent(presentUnder(root));
        this.scan(root);
        this.askForHooks();
        // What observe() asks for later reads the page as it is then.
        this.holdPresent(null);
        return this.handle();
    }

    /** @param {string} name */
    asked(name) {
        return this.rootStyle ? this.rootStyle.getPropertyValue(name).trim() : '';
    }

    /**
     * Whether this attach puts up the arrival, decided before the scan so
     * the headline the scan finds already knows to wait for it [scope-86].
     * The arrival itself is built at the end of attach, as before.
     */
    decideArrival() {
        const { html, doc } = this;
        const arrivalAsked = this.asked(ROUTINES.arrival);
        const routine = arrivalAsked === '' || ARRIVALS.includes(arrivalAsked) ? arrivalAsked : this.reportUnknownRoutine(html, ROUTINES.arrival, arrivalAsked, ARRIVALS);
        const performed = (routine === 'boot' || routine === 'card') && Boolean(doc.body);
        const plays = performed && !this.reduced() && !this.seen(html, 'arrival');
        if (plays && !arrivalsOnScreen.has(doc)) arrivalsOnScreen.set(doc, new Set());
        this.arrival = { routine, performed, plays };
    }

    /** @param {Element} el */
    startOne(el) {
        if (started.has(el)) return;
        this.checkValues(el);
        const reveal = el.getAttribute(HOOKS.reveal);
        if (reveal === null || !REVEALS.includes(reveal)) return;
        started.add(el);
        if (reveal === 'headline') this.startHeadline(el);
        else if (reveal === 'emphasis') this.run('emphasis', (hook) => hook.emphasis(el));
        else this.run('rule', (hook) => hook.rule(el));
    }

    /**
     * The headline waits for the arrival [scope-86]: started under
     * the overlay it was over before the overlay went, so a first
     * visit never saw it. It starts when the overlay is removed,
     * whether the arrival ran its course, was skipped or clicked
     * away; with no arrival on screen it starts now, as before.
     * @param {Element} el
     */
    startHeadline(el) {
        const { state } = this;
        const held = arrivalsOnScreen.get(this.doc);
        if (!held) {
            this.run('headline', (hook) => hook.headline(el));
            return;
        }
        state.pending++;
        let waiting = true;
        const go = () => {
            if (!waiting) return;
            waiting = false;
            held.delete(go);
            state.pending--;
            // Detached while held: the text was never touched, so the
            // element only needs its rest record.
            if (state.detached) this.use('headline').then((hook) => hook.headline(el, true));
            else this.run('headline', (hook) => hook.headline(el));
        };
        held.add(go);
        this.finishers.push(go);
    }

    /** @param {ParentNode | Element} scope */
    scan(scope) {
        if (scope instanceof Element && scope.hasAttribute(HOOKS.reveal)) this.startOne(scope);
        if (scope instanceof Element && scope.hasAttribute(HOOKS.surface)) this.checkValues(scope);
        for (const el of scope.querySelectorAll(`[${HOOKS.surface}], [${HOOKS.reveal}]`)) this.startOne(el);
        this.scanCounts(scope);
        if ((scope instanceof Element && scope.matches('mark')) || scope.querySelector('mark')) this.run('emphasis', (hook) => hook.looseMarks(scope));
        this.done();
    }

    /**
     * Counting numbers [feat-count-1]. Armed once each: an element
     * already counted keeps its number when the module is attached a
     * second time, which js/auto.js does over React.
     * @param {ParentNode | Element} scope
     */
    scanCounts(scope) {
        if (scope instanceof Element && scope.hasAttribute(HOOKS.count) && !started.has(scope)) {
            started.add(scope);
            this.run('count', (hook) => hook.countUp(scope));
        }
        for (const el of scope.querySelectorAll(`[${HOOKS.count}]`)) {
            if (started.has(el)) continue;
            started.add(el);
            this.run('count', (hook) => hook.countUp(el));
        }
    }

    /** Stop the timers, frames and observers the reveals started. */
    stopRunning() {
        const { state } = this;
        for (const id of this.timers) clearTimeout(id);
        this.timers.clear();
        for (const id of this.frames) this.view?.cancelAnimationFrame(id);
        this.frames.clear();
        state.io?.disconnect();
        state.io = null;
        // Everything the module started, not only the rule's observer
        // [G8, 2026-09-08]. The draw routine keeps its own observer, the
        // marquee keeps one per band, and the caret and the measuring
        // lines hold listeners; leaving those running meant a reveal
        // still fired after somebody asked for the motion to stop, and
        // the count went negative when it did.
        state.ioHeadline?.disconnect();
        state.ioHeadline = null;
        for (const cleanup of this.cleanups.splice(0)) cleanup();
    }

    /** Reduced motion switched on mid-session: every running reveal resolves to its rest state at once [DI7]. */
    onPreference() {
        if (!this.reduced()) return;
        this.stopRunning();
        for (const finish of this.finishers.splice(0)) finish();
        this.state.pending = 0;
        this.done();
    }

    /**
     * The pointer and press buses depend on the theme, and a theme can
     * arrive after attach: the reader switches, a lazily loaded register
     * lands, a framework renders its own switcher. They used to be armed
     * only if the theme active at attach asked, so dark's oxide film stood
     * still in every app that attached before dark was on [fix-81]. Each is
     * armed once, the first time a theme asks for it.
     */
    armThemeBuses() {
        const wantPointer = !this.pointerArmed && this.asked(POINTER_KNOB) === 'track';
        const wantPress = !this.pressArmed && PRESS_STYLES.includes(this.asked(PRESS_KNOB));
        if (!wantPointer && !wantPress) return;
        this.pointerArmed ||= wantPointer;
        this.pressArmed ||= wantPress;
        this.run('pointer', (hook) => {
            if (wantPointer) hook.pointerBus();
            if (wantPress) hook.pressBus();
        });
    }

    /** Watch for a theme that arrives after attach. */
    watchThemes() {
        const { html } = this;
        if (!this.rootStyle || typeof MutationObserver !== 'function') return;
        const watch = new MutationObserver(() => this.armThemeBuses());
        watch.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
        const onRegister = () => this.armThemeBuses();
        html.addEventListener('kp-register-load', onRegister);
        this.cleanups.push(() => {
            watch.disconnect();
            html.removeEventListener('kp-register-load', onRegister);
        });
    }

    /**
     * The hooks a theme or the page asks for once, in the order the closure
     * always ran them. Each module still decides for itself; the checks here
     * only save the download when the answer is certainly no.
     */
    askForHooks() {
        const { root } = this;
        if (this.asked(CARET_KNOB) === 'block' && root.querySelector('input.kp-field__input')) this.run('caret', (hook) => hook.caret());
        this.armThemeBuses();
        this.watchThemes();
        if (this.asked(MEASURE_KNOB) === 'live' && root.querySelector(`[${HOOKS.reveal}='headline']`)) this.run('measure', (hook) => hook.measure());
        if (root.querySelector(`[${HOOKS.marquee}]`)) this.run('marquee', (hook) => hook.marquee());
        if (this.arrival.performed) this.run('arrival', (hook) => hook.arrival());
    }

    /** Stop everything the module started and remove the root attribute; safe to call twice. */
    detach() {
        const { state } = this;
        if (state.detached) return;
        state.detached = true;
        this.stopRunning();
        this.query?.removeEventListener('change', this.preferenceHandler);
        // Every reveal that was still running ends at its rest state
        // [G7, 2026-09-08]. Without this a page that navigated away
        // mid-decipher left the headline as a row of glyphs — and
        // because `started` remembered it, re-attaching never fixed
        // it. A consumer's route change is not a reason to leave
        // somebody's words scrambled.
        for (const finish of this.finishers.splice(0)) finish();
        state.pending = 0;
        if (this.manageRoot) this.html.removeAttribute(ROOT_ATTRIBUTE);
    }

    /** @returns {EffectsHandle} */
    handle() {
        const engine = this;
        return {
            // Every hook asked for so far has arrived and run [scope-117]. A
            // reveal still plays over its own time after that; this is only the
            // moment the code is in, which a caller that reads straight after
            // attach — a test, a wrapper counting listeners — waits for.
            get ready() {
                return Promise.all(engine.arriving).then(() => undefined);
            },
            detach: () => engine.detach(),
            observe(element) {
                if (engine.state.detached) return;
                engine.scan(element);
            },
        };
    }
}
