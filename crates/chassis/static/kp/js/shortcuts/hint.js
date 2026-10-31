// The small cap a chord shows while it waits ("g …"), or the "no shortcut on g x" line after it.

import { getStrings } from '../strings.js';
import { SHORTCUT_HINT_PLACES } from './constants.js';

/** @typedef {import('../shortcuts.js').EngineOptions} EngineOptions */

export class ChordHint {
    /** @param {EngineOptions} config the board's settings, read each time */
    constructor(config) {
        this.config = config;
        /** @type {HTMLElement | null} */
        this.el = null;
        /** @type {number} */
        this.timer = 0;
    }

    /** @param {string} text @param {string} [role] */
    show(text, role = 'status') {
        if (typeof document === 'undefined') return;
        if (!this.el) {
            this.el = document.createElement('div');
            this.el.className = 'kp-shortcuts-pending';
            this.el.setAttribute('role', role);
        }
        // Over a modal dialog the page is inert and below it, so the hint stands inside the top one.
        const modal = [...document.querySelectorAll('dialog')].filter((d) => d.matches(':modal')).pop();
        const home = modal ?? document.body;
        if (this.el.parentElement !== home) home.append(this.el);
        this.place();
        this.el.textContent = text;
        this.el.hidden = false;
    }

    /** The cap's place: the engine's option, else the root's attribute (read by the stylesheet as well), else centre. */
    place() {
        if (!this.el) return;
        const wanted = this.config.hintPlace ?? document.documentElement.getAttribute('data-kp-shortcuts-hint') ?? 'centre';
        this.el.setAttribute('data-kp-shortcuts-place', SHORTCUT_HINT_PLACES.includes(/** @type {any} */ (wanted)) ? wanted : 'centre');
    }

    hide() {
        window.clearTimeout(this.timer);
        if (this.el) this.el.hidden = true;
    }

    /** Run `end` after `ms`, replacing any timer that was running. @param {() => void} end @param {number} ms */
    arm(end, ms) {
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(end, ms);
    }

    /** @param {string[]} typed @param {boolean} unknown */
    chord(typed, unknown) {
        if (!this.el) this.show('');
        const hint = this.el;
        if (!hint) return;
        this.place();
        hint.replaceChildren();
        for (const key of typed) {
            const cap = document.createElement('kbd');
            cap.className = 'kp-kbd';
            cap.textContent = key;
            hint.append(cap);
        }
        if (unknown) hint.replaceChildren(getStrings().shortcutsUnknown(typed.join(' ')));
        else this.appendWaiting(hint);
        hint.hidden = false;
    }

    /** The "…" cap and its words for a screen reader. @param {HTMLElement} hint */
    appendWaiting(hint) {
        const more = document.createElement('kbd');
        more.className = 'kp-kbd kp-kbd--wait';
        more.textContent = '…';
        more.setAttribute('aria-hidden', 'true');
        hint.append(more);
        const sr = document.createElement('span');
        sr.className = 'kp-sr-only';
        sr.textContent = getStrings().shortcutsPending;
        hint.append(sr);
    }
}
