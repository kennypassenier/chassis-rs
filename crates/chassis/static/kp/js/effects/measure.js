// The measure hook of js/effects.js, in a module of its own [scope-117].
//
// Fetched the first time a theme asks for it, so a page that never asks for it never downloads it. What it shares with the
// rest of the attach arrives through `ctx`. The hook is a MeasureHook, one per attach, and each measured headline is one
// MeasureFrame (closure-pattern B, js/effects-core/hook.js).

import { HOOKS, MEASURE_KNOB } from '../effects.js';
import { EffectHook } from '../effects-core/hook.js';
import { getStrings } from '../strings.js';

/** The bracket corners, and how long a resize settles before the readout is measured again (ms). */
const CORNERS = ['tl', 'tr', 'bl', 'br'];
const RESIZE_SETTLE = 100;

/** One headline in its frame: four corner brackets and the readout of its true rendered size. */
class MeasureFrame {
    /** @param {import('../effects.js').EffectsContext} ctx @param {Element} h1 */
    constructor(ctx, h1) {
        this.ctx = ctx;
        this.h1 = h1;
        this.words = getStrings();
        /** The span around the headline that the brackets and the readout sit in. */
        this.wrap = ctx.doc.createElement('span');
        /** The readout under the box. */
        this.readout = ctx.doc.createElement('span');
        /** The settle timer of the last resize. @type {ReturnType<typeof setTimeout> | undefined} */
        this.timer = undefined;
    }

    /** Wrap the headline, draw the brackets and the readout, and keep the readout true. @param {(undo: () => void) => void} own */
    build(own) {
        const { ctx, h1, wrap, readout } = this;
        const { doc, view } = ctx;
        wrap.setAttribute('data-kp-measured', '');
        h1.replaceWith(wrap);
        wrap.append(h1);
        for (const corner of CORNERS) {
            const bracket = doc.createElement('i');
            bracket.setAttribute('data-kp-measure-bracket', corner);
            bracket.setAttribute('aria-hidden', 'true');
            wrap.append(bracket);
        }
        readout.setAttribute('data-kp-measure', '');
        readout.setAttribute('aria-hidden', 'true');
        readout.textContent = this.words.measureLoading;
        wrap.append(readout);
        this.update();
        const schedule = () => this.schedule();
        view?.addEventListener('resize', schedule);
        own(() => {
            clearTimeout(this.timer);
            view?.removeEventListener('resize', schedule);
        });
        this.afterFonts();
    }

    update() {
        const box = this.h1.getBoundingClientRect();
        this.readout.textContent = this.words.measureBox(Math.round(box.width), Math.round(box.height));
        // The state a test or a consumer can read at any time, rather than a moment they had to be listening for [KT16].
        this.wrap.setAttribute('data-kp-measured', 'live');
    }

    schedule() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.update(), RESIZE_SETTLE);
    }

    /** Measure again once the web fonts have loaded; without the font-loading API the load-time measurement stands. */
    afterFonts() {
        const { doc } = this.ctx;
        try {
            if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(() => this.update());
        } catch {
            // no font-loading API: the load-time measurement stands
        }
    }
}

/**
 * The measurement frame [scope-18]: blueprint's own. A theme answers `--kp-measure: live` on the root. It replaced two
 * dimension lines on 2026-09-11: Kenny saw the command-table demo's brackets and found them better ("dan is de demo hier
 * niet voor niks geweest", scope-18). The brackets report the box they hold rather than one edge of it, which is why one
 * readout replaces two labels. Runs once, after scan() has already put the headline at its rest text, so nothing here fights
 * the decipher, type or word routines for the same child nodes.
 */
class MeasureHook extends EffectHook {
    measure() {
        const { root, view, rootStyle } = this.ctx;
        const routine = rootStyle ? rootStyle.getPropertyValue(MEASURE_KNOB).trim() : '';
        if (routine !== 'live' || !view) return;
        const headlines = [...root.querySelectorAll(`[${HOOKS.reveal}='headline']`)].filter((h) => !h.closest('[data-kp-measured]'));
        for (const h1 of headlines) new MeasureFrame(this.ctx, h1).build((undo) => this.own(undo));
    }
}

/** Make the measure hook of one attach. @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    return new MeasureHook(ctx).connect();
}
