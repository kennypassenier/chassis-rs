// One secret input [wish-1028]: a token or a password a person types, its typing hidden; reveal, paste, copy, mask and clear.
import { watchOptions } from '../live-options.js';
import { SECRET_TTL, clearDelay } from './constants.js';
import { secretInputs, secrets } from './secret-api.js';
import { LAST_CALL_SECONDS, SecretBase, TICK_MS } from './secret-base.js';
import { buildInput } from './secret-parts.js';
/** @typedef {import('./secret-base.js').SecretOptions} SecretOptions */

/** An input field: whether its typing shows, and the words of the last failed paste. */
export class SecretInputControl extends SecretBase {
    /** @param {HTMLElement} host @param {SecretOptions} [options] */
    constructor(host, options = {}) {
        super(host, options);
        /** What the field is called, for the input's label and the copy announcement. */
        this.name = host.getAttribute('aria-label') ?? host.dataset.kpSecretLabel ?? this.s.secretLabel;
        /** Whether the typing is shown. */
        this.shown = false;
        /** The words of the last failed paste, until the next key. */
        this.pasteProblem = '';
        /** The field's parts, built in connect(). */
        this.parts = /** @type {ReturnType<typeof buildInput>} */ (/** @type {unknown} */ (null));
    }

    connect() {
        const field = this.host;
        this.parts = buildInput(field, this.name, this.built);
        const { input, authored, reveal, paste, copy } = this.parts;
        this.spoken = this.parts.spoken;
        this.own(() => {
            this.shown = false;
            input.value = '';
            input.type = 'password';
            for (const part of this.built) part.remove();
            if (authored) input.classList.remove('kp-secret__input');
            delete field.dataset.kpSecretState;
            secrets.delete(field);
            secretInputs.delete(field);
        });
        this.register();
        field.classList.add('kp-secret');
        if (!field.hasAttribute('role')) field.setAttribute('role', 'group');
        if (!field.hasAttribute('aria-label') && !field.hasAttribute('aria-labelledby')) field.setAttribute('aria-label', this.name);
        secretInputs.set(field, input);
        this.readOptions();
        this.listen(input, 'input', () => this.onInput());
        this.listen(reveal, 'click', () => this.onReveal());
        if (paste) this.listen(paste, 'click', () => void this.onPaste());
        if (copy) this.listen(copy, 'click', () => this.onCopy(copy));
        this.listen(field, 'focusout', (event) => this.onFocusOut(/** @type {FocusEvent} */ (event)));
        this.listen(this.doc, 'visibilitychange', () => this.doc.visibilityState === 'hidden' && this.hidesOnBlur() && this.hide('away'));
        this.paint();
        this.watch();
    }

    /** Follow the reasons the page sets (off, invalid) and the live ttl. */
    watch() {
        const field = this.host;
        this.observe(
            new MutationObserver(() => {
                if (field.dataset.kpSecretDisabled !== undefined) this.hide('call');
                this.paint();
            }),
        ).observe(field, { attributes: true, attributeFilter: ['data-kp-secret-disabled', 'data-kp-secret-invalid'] });
        const stopOptions = watchOptions(field, ['data-kp-secret-ttl'], () => {
            this.readOptions();
            if (this.shown) {
                this.stop();
                this.startTicking(() => this.tick());
            }
            this.paint();
        });
        this.own(stopOptions);
    }

    /** The ttl takes any duration (`45`, `90s`, `5min`); shown typing stays this many whole seconds. */
    readOptions() {
        this.seconds = Math.round(clearDelay(this.host.dataset.kpSecretTtl, SECRET_TTL * TICK_MS) / TICK_MS);
    }

    hidesOnBlur() {
        return !['false', 'off'].includes(this.host.dataset.kpSecretHideOnBlur ?? '');
    }

    /** Draw the field: its state, the input's type and marks, the buttons and the line. */
    paint() {
        const { host: field, parts, s } = this;
        const { input, reveal, paste, copy } = parts;
        const why = field.dataset.kpSecretDisabled;
        const bad = field.dataset.kpSecretInvalid;
        const empty = input.value === '';
        field.dataset.kpSecretState = why !== undefined ? 'disabled' : bad !== undefined || this.pasteProblem ? 'error' : this.shown ? 'shown' : 'hidden';
        input.type = this.shown ? 'text' : 'password';
        input.disabled = why !== undefined;
        if (bad !== undefined) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
        reveal.textContent = this.shown ? s.secretHide : s.secretReveal;
        reveal.setAttribute('aria-pressed', String(this.shown));
        reveal.disabled = why !== undefined || empty;
        if (paste) {
            paste.textContent = s.secretPaste;
            paste.disabled = why !== undefined;
        }
        if (copy && !copy.hasAttribute('data-kp-copied')) copy.textContent = s.secretCopy;
        if (copy) copy.disabled = why !== undefined || empty;
        parts.words.textContent = why ?? bad ?? (this.pasteProblem || this.lineWords(empty));
    }

    /** The line while nothing is wrong: the countdown, or the hint, or how many characters were typed. @param {boolean} empty */
    lineWords(empty) {
        const s = this.s;
        if (this.shown) return this.seconds === 0 ? s.secretStaysShown : s.secretHidesIn(this.left);
        return empty ? s.secretInputHint : s.secretInputCount(this.parts.input.value.length);
    }

    /** @param {string} [reason] */
    hide(reason = 'press') {
        if (!this.shown) return;
        this.shown = false;
        this.stop();
        this.paint();
        this.say(this.s.secretHidden);
        this.announce(false, reason);
    }

    tick() {
        this.left -= 1;
        if (this.left === LAST_CALL_SECONDS && this.seconds > LAST_CALL_SECONDS) this.say(this.s.secretHidesIn(LAST_CALL_SECONDS));
        if (this.left <= 0) this.hide('timer');
        else this.paint();
    }

    /** @param {string} [reason] */
    show(reason = 'press') {
        if (this.shown || this.host.dataset.kpSecretDisabled !== undefined || this.parts.input.value === '') return;
        this.shown = true;
        this.left = this.seconds;
        this.restartDrain(this.parts.drain);
        this.paint();
        this.say(this.s.secretShown(this.seconds));
        this.announce(true, reason);
        this.startTicking(() => this.tick());
    }

    onReveal() {
        if (this.shown) this.hide('press');
        else this.show('press');
        this.parts.input.focus();
    }

    onInput() {
        this.pasteProblem = '';
        if (this.parts.input.value === '' && this.shown) this.hide('call');
        else this.paint();
    }

    /** Paste the clipboard over the selection; a refused read says so on the line until the next key. */
    async onPaste() {
        const input = this.parts.input;
        let text = '';
        try {
            text = await navigator.clipboard.readText();
        } catch {
            this.pasteProblem = this.s.secretPasteBlocked;
            this.paint();
            this.say(this.pasteProblem);
            input.focus();
            return;
        }
        this.pasteProblem = '';
        const from = input.selectionStart ?? input.value.length;
        const to = input.selectionEnd ?? from;
        input.setRangeText(text, from, to, 'end');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        this.say(this.s.secretPasted(text.length));
        input.focus();
    }

    /** @param {HTMLButtonElement} copy */
    onCopy(copy) {
        if (this.parts.input.value === '') return;
        const text = this.parts.input.value;
        void this.copyOut(copy, () => text, this.name, () => {
            delete copy.dataset.kpCopied;
            this.paint();
        });
    }

    /** Leaving the field hides the typing (unless `data-kp-secret-hide-on-blur="false"`). @param {FocusEvent} event */
    onFocusOut(event) {
        if (!this.shown || !this.hidesOnBlur()) return;
        const next = event.relatedTarget;
        if (next instanceof Node && this.host.contains(next)) return;
        this.hide('away');
    }
}
