// Running work behind the button: busy while it runs, then its result for a moment, then back to rest.

import { toast } from '../overlays.js';
import { getStrings } from '../strings.js';
import { FlashFaces } from './faces.js';
import { settle } from './outcome.js';
import { attr, num } from './read.js';
import { FLASH_ERROR_MS, FLASH_EVENT, FLASH_MS, SAY_DELAY_MS } from './values.js';

/** @typedef {import('../flash.js').FlashOptions} FlashOptions */

export class FlashRun extends FlashFaces {
    /**
     * @param {HTMLElement} host the button
     * @param {FlashOptions} [options]
     */
    constructor(host, options) {
        super(host, options);
        /** The timer that takes the result away, and whether work is running. */
        this.timer = 0;
        this.running = false;
    }

    connect() {
        super.connect();
        // Registered last, so it runs first on detach, as the old unwire did: the timer goes before the faces.
        this.own(() => window.clearTimeout(this.timer));
    }

    /**
     * @param {'rest' | 'busy' | 'success' | 'refused'} state
     * @param {Record<string, unknown>} [detail]
     */
    setState(state, detail = {}) {
        const button = this.host;
        button.setAttribute('data-kp-flash-state', state);
        if (state === 'busy') {
            button.setAttribute('aria-busy', 'true');
            button.setAttribute('aria-disabled', 'true');
        } else {
            button.removeAttribute('aria-busy');
            button.removeAttribute('aria-disabled');
        }
        button.dispatchEvent(new CustomEvent(FLASH_EVENT, { bubbles: true, detail: { state, ...detail } }));
    }

    /** The press starts: the old result goes, the options the page passed are stamped, and the button is busy. @param {FlashOptions} options */
    begin(options) {
        const button = this.host;
        this.running = true;
        window.clearTimeout(this.timer);
        if (this.ownLine) this.line.hidden = true;
        this.line.textContent = '';
        this.line.removeAttribute('data-kp-tone');
        if (options.width) button.setAttribute('data-kp-width', options.width);
        if (options.refusal) button.setAttribute('data-kp-refusal', options.refusal);
        this.setState('busy');
        const label = options.busyLabel ?? button.getAttribute('data-kp-busy-label') ?? '';
        if (label !== '') this.status.textContent = label;
    }

    /**
     * Run `work` behind the button.
     * @param {() => Promise<import('../flash.js').FlashAnswer> | import('../flash.js').FlashAnswer} work
     * @param {FlashOptions} [options]
     * @returns {Promise<{ ok: boolean, word: string, line: string } | null>} null when the press was ignored (already busy)
     */
    async run(work, options = {}) {
        if (this.running) return null;
        this.begin(options);
        const outcome = await settle(this.host, work);
        this.showOutcome(outcome, options);
        return outcome;
    }

    /** The result on the button, the line under it, the words said, and the timer back to rest. @param {{ ok: boolean, word: string, line: string }} outcome @param {FlashOptions} options */
    showOutcome({ ok, word, line }, options) {
        const button = this.host;
        const refusal = /** @type {'line' | 'button' | 'toast'} */ (options.refusal ?? attr(button, 'data-kp-refusal', 'line'));
        const onButton = !ok && refusal === 'button' ? line : '';
        this.result.replaceChildren();
        const glyph = button.ownerDocument.createElement('span');
        glyph.className = 'kp-flash__glyph';
        glyph.textContent = ok ? '✓' : '✕';
        this.result.append(glyph, ` ${onButton || word}`);
        // A width a page set by hand (`data-kp-width="grow"`, or `keep`) stays: only the grow this refusal asked for is taken back.
        const handWidth = button.getAttribute('data-kp-width');
        if (onButton) button.setAttribute('data-kp-width', 'grow');
        this.status.textContent = '';
        window.setTimeout(() => {
            this.status.textContent = line ? `${word}. ${line}` : word;
        }, SAY_DELAY_MS);
        if (line && (ok || refusal === 'line')) {
            this.line.textContent = line;
            this.line.setAttribute('data-kp-tone', ok ? 'success' : 'destructive');
            this.line.hidden = false;
        }
        if (!ok && refusal === 'toast' && line) toast(line);
        this.running = false;
        this.setState(ok ? 'success' : 'refused', { ok, word, line });
        const ms = ok ? num(button, 'data-kp-flash-ms', options.flashMs ?? FLASH_MS) : num(button, 'data-kp-flash-error-ms', options.errorMs ?? FLASH_ERROR_MS);
        this.timer = window.setTimeout(() => this.backToRest(onButton !== '', handWidth, options), ms);
    }

    /** Back to rest; a width the refusal grew is taken back unless the page chose one. @param {boolean} grown @param {string | null} handWidth @param {FlashOptions} options */
    backToRest(grown, handWidth, options) {
        const button = this.host;
        if (this.destroyed) return;
        if (grown && options.width === undefined) {
            if (handWidth === null) button.removeAttribute('data-kp-width');
            else button.setAttribute('data-kp-width', handWidth);
        }
        this.setState('rest');
    }
}
