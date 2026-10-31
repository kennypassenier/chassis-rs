// A toggle's parts and its voice: the attributes it stamps, the label wrapped only when something stands beside it, the
// tick, the count, the hint, the spinner, the group's live line and its Clear button.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { made, stateOf, toggleGroup, togglePressedKeys } from './group.js';

/** A burst of changes within this time is said as one line [ms]. */
const SAY_AFTER_MS = 40;
/** The digits a count holds room for, at least, so growing a digit moves nothing. */
const COUNT_DIGITS = 2;

export class ToggleParts extends Controller {
    /** @param {HTMLElement} button @param {import('../toggle.js').ToggleOptions} [options] */
    constructor(button, options = {}) {
        super(button, options);
        this.button = button;
        this.doc = button.ownerDocument;
        this.s = getStrings();
        /** @type {HTMLElement | null} */
        this.label = null;
        /** The tick, kept in step with `data-kp-pressed-mark` while the toggle lives. @type {HTMLElement | null} */
        this.mark = null;
        /** @type {HTMLElement | null} */
        this.count = null;
        /** @type {HTMLElement | null} */
        this.hint = null;
        /** The refusal's word, laid over the button while it is shown. @type {HTMLElement | null} */
        this.refusedWord = null;
        /** The spinner, laid over the button while it works. @type {HTMLElement | null} */
        this.spinner = null;
        /** @type {number | undefined} */
        this.sayTimer = undefined;
    }

    /** Set an attribute the page left out, and take it off again on detach. @param {string} name @param {string} value */
    stamp(name, value) {
        if (this.button.hasAttribute(name)) return;
        this.button.setAttribute(name, value);
        this.own(() => this.button.removeAttribute(name));
    }

    /** The words are wrapped only when there is something to put beside them, so a plain toggle keeps its markup. */
    ensureLabel() {
        if (this.label) return;
        const label = made(this.doc, 'kp-toggle__label');
        for (const node of [...this.button.childNodes]) if (!(node instanceof HTMLElement && node.className.startsWith('kp-toggle__'))) label.append(node);
        this.button.append(label);
        this.label = label;
        this.own(() => this.label?.replaceWith(...this.label.childNodes));
    }

    syncMark() {
        const want = this.button.dataset.kpPressedMark === 'check';
        if (want && !this.mark) {
            this.ensureLabel();
            this.mark = made(this.doc, 'kp-toggle__mark');
            this.mark.setAttribute('aria-hidden', 'true');
            this.button.prepend(this.mark);
        } else if (!want && this.mark) {
            this.mark.remove();
            this.mark = null;
        }
    }

    makeCount() {
        this.count = made(this.doc, 'kp-toggle__count');
        this.button.append(this.count);
    }

    /** A count made by the page's script (setCount) on a toggle whose markup had none. */
    ensureCount() {
        if (this.count) return;
        this.count = made(this.doc, 'kp-toggle__count');
        this.ensureLabel();
        this.button.append(this.count);
        this.button.setAttribute('data-kp-count', '');
    }

    /** The refusal's word over the button, with the app's reason as its title. @param {string} word @param {string} [message] */
    showRefused(word, message) {
        this.refusedWord?.remove();
        this.refusedWord = made(this.doc, 'kp-toggle__refused');
        this.refusedWord.textContent = word;
        if (message) this.button.title = message;
        this.button.setAttribute('data-kp-refused', '');
        this.button.append(this.refusedWord);
    }

    /** @param {string} [message] */
    hideRefused(message) {
        this.refusedWord?.remove();
        this.refusedWord = null;
        this.button.removeAttribute('data-kp-refused');
        if (message) this.button.removeAttribute('title');
    }

    makeHint() {
        this.hint = made(this.doc, 'kp-toggle__hint');
        this.hint.setAttribute('aria-hidden', 'true');
        this.button.append(this.hint);
    }

    /** The exact number beside the label, a skeleton while it is counted, or none. @param {number | 'loading' | null} n */
    writeCount(n) {
        const count = this.count;
        if (!count) return;
        count.replaceChildren();
        count.removeAttribute('data-kp-state');
        if (n === 'loading') {
            count.setAttribute('data-kp-state', 'loading');
            const bone = made(this.doc, 'kp-skeleton kp-toggle__bone');
            bone.setAttribute('role', 'img');
            bone.setAttribute('aria-label', this.s.toggleCounting);
            count.append(bone);
            count.style.setProperty('--kp-toggle-digits', String(COUNT_DIGITS));
            this.button.removeAttribute('data-kp-count-value');
        } else if (n === null) {
            count.hidden = true;
            this.button.removeAttribute('data-kp-count-value');
        } else {
            count.hidden = false;
            count.textContent = String(n);
            // The room for the next digit is held, so a count growing a digit moves nothing.
            count.style.setProperty('--kp-toggle-digits', String(Math.max(COUNT_DIGITS, String(n).length)));
            this.button.setAttribute('data-kp-count-value', String(n));
        }
    }

    writeHint() {
        // The words stay in while it is off (unseen, css/components.css), so the button keeps the width of its longest line.
        if (this.hint) this.hint.textContent = this.button.getAttribute('data-kp-pressed-hint') ?? '';
    }

    labelText() {
        return (this.label ?? this.button).textContent?.trim() ?? '';
    }

    /** The group's live line (or the parent's, for a lone toggle), made once per container. @param {ReturnType<typeof toggleGroup>} g */
    regionOf(g) {
        const host = g?.container ?? this.button.parentElement;
        if (!host) return null;
        let region = /** @type {HTMLElement | null} */ (host.querySelector(':scope > .kp-toggle__live'));
        if (!region) {
            region = made(this.doc, 'kp-sr-only kp-toggle__live');
            region.setAttribute('role', 'status');
            region.setAttribute('aria-live', 'polite');
            host.append(region);
        }
        return region;
    }

    /** @param {string} text */
    say(text) {
        if ((this.button.closest('[data-kp-announce]')?.getAttribute('data-kp-announce') ?? 'state') === 'off') return;
        const region = this.regionOf(toggleGroup(this.button));
        if (!region) return;
        // A burst of changes in one tick is one line.
        window.clearTimeout(this.sayTimer);
        this.sayTimer = window.setTimeout(() => {
            region.textContent = text;
        }, SAY_AFTER_MS);
    }

    /** The Clear button and its count, kept in step by whichever member changed last. */
    paintClear() {
        const container = toggleGroup(this.button)?.container;
        if (!container || !container.hasAttribute('data-kp-toggle-clear')) return;
        let clear = /** @type {HTMLButtonElement | null} */ (container.querySelector(':scope > .kp-toggle__clear'));
        if (!clear) {
            clear = /** @type {HTMLButtonElement} */ (made(this.doc, 'kp-button kp-button--ghost kp-toggle__clear', 'button'));
            clear.type = 'button';
            clear.addEventListener('click', () => {
                const first = toggleGroup(this.button)?.members.find((m) => stateOf(m) === 'true' && !m.hasAttribute('data-kp-toggle-all'));
                if (first) this.clearGroup(first);
            });
            container.append(clear);
        }
        const n = togglePressedKeys(this.button).length;
        clear.textContent = this.s.toggleClear(n);
        clear.toggleAttribute('data-kp-idle', n === 0);
        clear.inert = n === 0;
        clear.setAttribute('aria-hidden', String(n === 0));
    }

    /** Everything off but the All member (a Clear press, or pressing All). @param {HTMLElement} from */
    clearGroup(from) {
        const g = toggleGroup(from);
        if (g) this.press(g.all ?? from, true);
    }

    /** The press; ToggleControl gives it. @param {HTMLElement} _member @param {boolean} [_forceClear] */
    press(_member, _forceClear = false) {}

    /** @param {boolean} on */
    setBusy(on) {
        const button = this.button;
        if (!on) {
            button.removeAttribute('data-kp-busy');
            button.removeAttribute('aria-busy');
            button.removeAttribute('aria-disabled');
            this.spinner?.remove();
            this.spinner = null;
            return;
        }
        button.setAttribute('data-kp-busy', '');
        button.setAttribute('aria-busy', 'true');
        button.setAttribute('aria-disabled', 'true');
        if (!this.spinner) {
            this.spinner = made(this.doc, 'kp-button__busy');
            this.spinner.setAttribute('aria-hidden', 'true');
            this.spinner.append(made(this.doc, 'kp-spinner'));
            button.append(this.spinner);
        }
    }
}
