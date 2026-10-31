// A range picker's state on the instance: the options read once, the window it holds, its words and the way it is set.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { setSegmentedValues } from '../segmented.js';
import { CHART_TIME_ZONE } from '../chart.js';
import { RANGE_EVENT, RANGE_PRESETS, presetMs, rangeMoment } from './values.js';
import { buildBar } from './build.js';

/**
 * @typedef {object} RangeValue
 * @property {string | null} preset the preset's key, or null for a custom window
 * @property {number} start ms
 * @property {number} end ms
 */

/** Numbers the pickers of a page, for the ids of their line and panel. */
let seq = 0;
/** The index of the preset a picker starts on when the markup names none (24h in the default list). */
const DEFAULT_PRESET_AT = 2;

export class RangeCore extends Controller {
    /**
     * @param {HTMLElement} el
     * @param {Record<string, unknown>} [options]
     */
    constructor(el, options = {}) {
        super(el, options);
        this.s = getStrings();
        this.doc = el.ownerDocument;
        this.id = `kp-range-${++seq}`;
        /** @type {() => number} */
        this.now = /** @type {(() => number) | undefined} */ (options.now) ?? (() => Date.now());
        this.zone = el.dataset.kpTimeZone || CHART_TIME_ZONE;
        this.presets = (el.dataset.kpRangePresets ?? RANGE_PRESETS.join(' ')).split(/\s+/).filter((k) => presetMs(k) > 0);
        this.withCustom = el.dataset.kpRangeCustom !== 'off';
        this.disabled = el.hasAttribute('data-kp-range-disabled');
        this.future = el.hasAttribute('data-kp-range-future');
        this.maxDays = Number(el.dataset.kpRangeMaxDays) || 0;
        const { bar, group } = buildBar(this.doc, this.s, this.presets, this.disabled);
        this.bar = bar;
        this.group = group;
        this.line = this.doc.createElement('p');
        /** The Custom… button; null in a presets-only picker. @type {HTMLButtonElement | null} */
        this.custom = null;
        /** @type {RangeValue} */
        this.value = {
            preset: this.presets.includes(el.dataset.kpRange ?? '') ? /** @type {string} */ (el.dataset.kpRange) : (this.presets[DEFAULT_PRESET_AT] ?? this.presets[0] ?? null),
            start: 0,
            end: 0,
        };
    }

    /** The line under the control: the window's name and its two moments. */
    describe() {
        const s = this.s;
        const name = this.value.preset ? s.rangePresetName(this.value.preset) : s.rangeCustomName;
        return s.rangeLabel(name, rangeMoment(this.value.start, this.zone), rangeMoment(this.value.end, this.zone));
    }

    /** Set the window: a preset's key (the span counts back from now) or a custom start and end. @param {RangeValue} next @param {boolean} fire */
    set(next, fire) {
        // Presets only: a window with no key cannot be named, so a script cannot set one either.
        if (!next.preset && !this.withCustom) return;
        if (next.preset) {
            const end = this.now();
            this.value = { preset: next.preset, start: end - presetMs(next.preset), end };
        } else this.value = next;
        const { value, host } = this;
        setSegmentedValues(this.group, value.preset ? [value.preset] : []);
        this.custom?.setAttribute('aria-pressed', String(value.preset === null));
        host.dataset.kpRangeValue = value.preset ?? 'custom';
        this.line.textContent = this.describe();
        if (fire) host.dispatchEvent(new CustomEvent(RANGE_EVENT, { bubbles: true, detail: this.detail() }));
    }

    /** What `kp-range-change` carries: the key or null, the two moments as ISO strings and the line. */
    detail() {
        const { value } = this;
        return { preset: value.preset, start: new Date(value.start).toISOString(), end: new Date(value.end).toISOString(), label: this.line.textContent };
    }
}
