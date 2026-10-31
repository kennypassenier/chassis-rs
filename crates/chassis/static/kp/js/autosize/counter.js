// The character and line counter under a box, and the polite line that announces 90 % and 100 % of `maxlength`.

import { COUNTER_WARN_SHARE, LEVEL_FULL, LEVEL_NEAR, LEVEL_NONE } from './constants.js';

/** The counter of one box. It knows what to draw and where it sits; the controller tells it when. */
export class CounterLine {
    /**
     * @param {HTMLTextAreaElement} area
     * @param {() => HTMLElement | null} frame the busy card's frame while there is one: the counter sits after it, else after the box
     * @param {Intl.NumberFormat} number
     * @param {import('../strings.js').Strings} strings
     */
    constructor(area, frame, number, strings) {
        this.area = area;
        this.frame = frame;
        this.number = number;
        this.strings = strings;
        /** @type {HTMLElement | null} */
        this.counter = null;
        /** @type {HTMLElement | null} */
        this.live = null;
        /** The level last announced: none, near or full. */
        this.announced = LEVEL_NONE;
    }

    /** The counter's words for a mode. @param {'chars' | 'lines' | 'both'} mode @param {{ chars: number, lines: number }} counts @param {number} max */
    words(mode, { chars, lines }, max) {
        const { number, strings } = this;
        if (max > 0 && mode !== 'lines') return strings.autosizeOf(number.format(chars), number.format(max));
        if (mode === 'lines') return strings.autosizeLines(lines, number.format(lines));
        if (mode === 'both') return strings.autosizeBoth(chars, number.format(chars), lines, number.format(lines));
        return strings.autosizeChars(chars, number.format(chars));
    }

    /** Draw it for the box's counts, or take it away when the mode is off. @param {'off' | 'chars' | 'lines' | 'both'} mode @param {{ chars: number, lines: number }} counts */
    draw(mode, counts) {
        if (mode === 'off') {
            this.remove();
            return;
        }
        const doc = this.area.ownerDocument;
        if (!this.counter) {
            this.counter = doc.createElement('p');
            this.counter.className = 'kp-autosize__counter';
            (this.frame() ?? this.area).after(this.counter);
        }
        const counter = this.counter;
        const max = this.area.maxLength > 0 ? this.area.maxLength : 0;
        const text = this.words(mode, counts, max);
        if (counter.textContent !== text) counter.textContent = text;
        const share = max > 0 ? counts.chars / max : 0;
        if (max > 0 && share >= COUNTER_WARN_SHARE) counter.setAttribute('data-kp-tone', 'warning');
        else counter.removeAttribute('data-kp-tone');
        if (max > 0) this.announce(share, counts.chars, max);
    }

    /** Announced politely at 90 % and 100 % only, not on every key. @param {number} share @param {number} chars @param {number} max */
    announce(share, chars, max) {
        const { number, strings } = this;
        let level = LEVEL_NONE;
        if (share >= 1) level = LEVEL_FULL;
        else if (share >= COUNTER_WARN_SHARE) level = LEVEL_NEAR;
        if (level === this.announced) return;
        this.announced = level;
        if (level === LEVEL_NONE) {
            if (this.live) this.live.textContent = '';
            return;
        }
        if (!this.live) {
            this.live = this.area.ownerDocument.createElement('span');
            this.live.className = 'kp-sr-only';
            this.live.setAttribute('role', 'status');
            this.counter?.after(this.live);
        }
        this.live.textContent = level === LEVEL_FULL ? strings.autosizeFull(number.format(max)) : strings.autosizeNear(number.format(chars), number.format(max));
    }

    /** Take the counter and its live line away. */
    remove() {
        this.counter?.remove();
        this.live?.remove();
        this.counter = null;
        this.live = null;
    }
}
