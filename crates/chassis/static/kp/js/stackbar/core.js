// One share bar's state and the parts of a draw that do not depend on its parts: the root's marks, the head, the footprint, and the loading and note states.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { setMeter } from '../kpi.js';
import { DEFAULT_LEGEND_ROWS } from './values.js';
import { langOf, stackbarParts } from './math.js';

/** @typedef {import('../stackbar.js').StackbarSpec} StackbarSpec */

/**
 * Everything one draw reads.
 * @typedef {object} StackbarDraw
 * @property {StackbarSpec} spec
 * @property {'ready' | 'loading' | 'empty' | 'error'} state
 * @property {ReturnType<typeof getStrings>} strings
 * @property {string | undefined} lang
 * @property {(value: number) => string} format
 * @property {ReturnType<typeof stackbarParts>} calc
 * @property {boolean} pickable
 * @property {Set<string>} pickedKeys
 * @property {string | undefined} focusedKey the key of the part that had the focus
 * @property {HTMLElement} bar
 * @property {boolean} legendWanted
 * @property {boolean} noted an empty or failed bar is one note over the whole footprint
 * @property {Node[]} nodes what the root will hold
 */

export class StackbarCore extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        this.doc = host.ownerDocument;
        /** How many legend rows the last ready draw had, for the loading legend. */
        this.parts = DEFAULT_LEGEND_ROWS;
        /** The height the bar and its legend had, kept by an empty or failed note. */
        this.height = 0;
    }

    /** @param {string} className @param {string} [tag] */
    make(className, tag = 'span') {
        const node = this.doc.createElement(tag);
        node.className = className;
        return node;
    }

    /** @param {number} count the legend rows a ready draw has */
    setParts(count) {
        this.parts = count;
    }

    /** Read everything a draw needs from the spec and the page. @param {StackbarSpec} spec @returns {StackbarDraw} */
    context(spec) {
        const lang = langOf(this.host);
        const calc = stackbarParts(spec.parts ?? [], spec.total, spec.other ?? 0);
        const state = spec.state ?? 'ready';
        const legendWanted = spec.legend !== false;
        return {
            spec,
            state,
            strings: getStrings(),
            lang,
            format: spec.format ?? ((value) => new Intl.NumberFormat(lang).format(value)),
            calc,
            pickable: Array.isArray(spec.picked),
            pickedKeys: new Set(spec.picked ?? []),
            focusedKey: /** @type {HTMLElement | null} */ (this.host.querySelector('.kp-stackbar__seg:focus'))?.dataset.kpStackbarKey,
            bar: this.make('kp-stackbar__bar', 'div'),
            legendWanted,
            noted: (state === 'empty' || state === 'error' || (state === 'ready' && calc.parts.length === 0)) && legendWanted,
            nodes: [],
        };
    }

    /** The root's own marks for this state. @param {'ready' | 'loading' | 'empty' | 'error'} state */
    markRoot(state) {
        const el = this.host;
        el.classList.add('kp-stackbar');
        el.setAttribute('data-kp-stackbar', '');
        el.setAttribute('data-kp-state', state);
        if (state === 'loading') el.setAttribute('aria-busy', 'true');
        else el.removeAttribute('aria-busy');
    }

    /** The line over the bar: the title, and the sum over the whole. @param {StackbarDraw} c */
    head(c) {
        const { spec, calc, state, format } = c;
        if (spec.title === undefined) return;
        const head = this.make('kp-stackbar__head', 'div');
        const title = this.make('kp-stackbar__title');
        title.textContent = spec.title;
        head.append(title);
        const summaryText = spec.summary ?? (state === 'ready' && calc.whole > 0 ? `${format(calc.sum)} / ${format(calc.whole)}` : '');
        const summary = this.make('kp-stackbar__total');
        summary.textContent = summaryText;
        head.append(summary);
        c.nodes.push(head);
    }

    /** The footprint of the bar and its legend, kept by an empty or failed note. */
    measure() {
        const rects = [...this.host.querySelectorAll(':scope > :is(.kp-stackbar__bar, .kp-stackbar__legend, .kp-stackbar__note)')].map((n) =>
            n.getBoundingClientRect(),
        );
        if (rects.length) this.height = Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top));
    }

    /** The meter's own loading picture at the bar's size, and the legend's waiting lines. @param {StackbarDraw} c */
    drawLoading(c) {
        const { bar, strings } = c;
        const wait = this.make('kp-meter kp-stackbar__wait');
        setMeter(wait, { loading: true });
        wait.removeAttribute('role');
        wait.removeAttribute('aria-valuetext');
        wait.setAttribute('aria-hidden', 'true');
        bar.append(wait);
        bar.setAttribute('role', 'img');
        bar.setAttribute('aria-label', strings.stackbarLoading);
        if (c.legendWanted) c.nodes.push(this.waitingLegend());
    }

    /** The legend as waiting lines. */
    waitingLegend() {
        const legend = this.make('kp-stackbar__legend', 'ul');
        legend.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < this.parts; i += 1) {
            const item = this.make('kp-stackbar__item', 'li');
            const swatch = this.make('kp-stackbar__swatch');
            swatch.style.setProperty('--kp-stackbar-colour', 'var(--muted)');
            const line = this.make('kp-stackbar__wait-line');
            line.append(this.make('kp-skeleton'));
            item.append(swatch, line);
            legend.append(item);
        }
        return legend;
    }

    /**
     * Empty or failed: one calm note over the whole footprint, or the track saying it when there is no legend.
     * @param {StackbarDraw} c
     * @returns {boolean} whether the focus was in the note and has to be put back on the root
     */
    drawNote(c) {
        const { bar, strings, spec } = c;
        const failed = c.state === 'error';
        const words = spec.message ?? (failed ? strings.stackbarError : strings.stackbarEmpty);
        if (!c.noted) {
            // No legend, no room for words: the track stays and says it.
            bar.setAttribute('role', 'img');
            bar.setAttribute('aria-label', words);
            bar.setAttribute('data-kp-hovercard', words);
            bar.setAttribute('tabindex', '0');
            return false;
        }
        const refocus = this.host.querySelector(':scope > .kp-stackbar__note')?.contains(this.doc.activeElement) ?? false;
        const note = this.make('kp-stackbar__note', 'div');
        if (this.height > 0) note.style.minBlockSize = `${this.height}px`;
        note.setAttribute('role', failed ? 'alert' : 'status');
        const said = this.make('kp-empty__title kp-stackbar__note-title', 'p');
        said.textContent = words;
        note.append(said);
        if (failed && spec.retry !== false) {
            const retry = this.make('kp-button kp-stackbar__retry', 'button');
            retry.setAttribute('type', 'button');
            retry.setAttribute('data-kp-stackbar-retry', '');
            retry.textContent = strings.stackbarRetry;
            note.append(retry);
        }
        c.nodes.push(note);
        return refocus;
    }
}
