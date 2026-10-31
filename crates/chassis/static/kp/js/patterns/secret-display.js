// One secret display field [kpadopt4]: shown as a mask, shown in full on request for a few seconds, copied without being shown.
import { watchOptions } from '../live-options.js';
import { SECRET_MASK, SECRET_TTL } from './constants.js';
import { readSecret, reasonOf } from './secret-read.js';
import { secrets } from './secret-api.js';
import { LAST_CALL_SECONDS, SecretBase } from './secret-base.js';
import { buildDisplay, make } from './secret-parts.js';
import { paintState, writeLine } from './secret-paint.js';
/** @typedef {import('./types.js').SecretLoad} SecretLoad */
/** @typedef {import('./types.js').SecretState} SecretState */
/** @typedef {import('./secret-base.js').SecretOptions} SecretOptions */

/** The options read again when their attribute changes [live-options-1019]. */
const LIVE = ['data-kp-secret-ttl', 'data-kp-secret-reveal-on', 'data-kp-secret-mask', 'data-kp-secret-mask-char'];

/** A display field: its state, its options, the countdown and the ticket that drops a read answered too late. */
export class SecretControl extends SecretBase {
    /** @param {HTMLElement} host @param {SecretOptions} [options] */
    constructor(host, options = {}) {
        super(host, options);
        this.load = options.load;
        /** @type {SecretState} */
        this.state = 'hidden';
        /** Whether the value shows only while Reveal is held. */
        this.hold = false;
        this.mask = '';
        /** Whether the countdown waits (the reader selects the value or holds the focus in it). */
        this.paused = false;
        /** Raised by every show and hide; a read that comes back to an older ticket is dropped. */
        this.ticket = 0;
        /** The field's parts, built in connect(). */
        this.parts = /** @type {ReturnType<typeof buildDisplay>} */ (/** @type {unknown} */ (null));
    }

    connect() {
        const field = this.host;
        this.parts = buildDisplay(field, this.s, this.built);
        const { value, reveal, copy } = this.parts;
        this.spoken = this.parts.spoken;
        this.own(() => {
            this.ticket += 1;
            value.textContent = this.mask;
            for (const part of this.built) part.remove();
            delete field.dataset.kpSecretState;
            secrets.delete(field);
        });
        this.register();
        field.classList.add('kp-secret');
        if (!field.hasAttribute('role')) field.setAttribute('role', 'group');
        if (!field.hasAttribute('aria-label') && !field.hasAttribute('aria-labelledby'))
            field.setAttribute('aria-label', field.dataset.kpSecretLabel ?? this.s.secretLabel);
        this.readOptions();
        value.classList.add('kp-masked');
        value.textContent = this.mask;
        field.style.setProperty('--kp-secret-ttl', `${this.seconds}s`);
        const lines = Number.parseInt(field.dataset.kpSecretLines ?? '', 10);
        if (lines > 0) field.style.setProperty('--kp-secret-lines', String(lines));
        this.wire(reveal, copy);
        this.setState(this.disabledWhy() !== undefined ? 'disabled' : 'hidden');
        this.writeLine();
        this.watch();
    }

    /** @param {HTMLButtonElement} reveal @param {HTMLButtonElement | null} copy */
    wire(reveal, copy) {
        const { doc, host: field } = this;
        const holdUp = () => this.hold && this.hide('hold');
        this.listen(reveal, 'click', () => this.onReveal());
        this.listen(reveal, 'pointerdown', (event) => this.onHoldDown(/** @type {PointerEvent} */ (event)));
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.listen(reveal, type, holdUp);
        this.listen(reveal, 'keydown', (event) => this.onHoldKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(reveal, 'keyup', (event) => this.onHoldKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(reveal, 'blur', holdUp);
        if (copy) this.listen(copy, 'click', () => this.onCopy(copy));
        this.listen(field, 'focusin', (event) => event.target === this.parts.value && this.pause(true));
        this.listen(field, 'focusout', (event) => event.target === this.parts.value && !this.selected() && this.pause(false));
        this.listen(doc, 'selectionchange', () => this.state === 'shown' && this.pause(this.selected() || doc.activeElement === this.parts.value));
        this.listen(doc, 'visibilitychange', () => doc.visibilityState === 'hidden' && this.hide('away'));
    }

    /** Follow a later change of the reason (the page grants or takes the right) and of the live options. */
    watch() {
        const field = this.host;
        this.observe(
            new MutationObserver(() => {
                if (this.disabledWhy() !== undefined) this.hide('call');
                this.setState(this.disabledWhy() !== undefined ? 'disabled' : this.state === 'disabled' ? 'hidden' : this.state);
                this.writeLine();
            }),
        ).observe(field, { attributes: true, attributeFilter: ['data-kp-secret-disabled'] });
        this.own(watchOptions(field, LIVE, (names) => this.onOptions(names)));
    }

    /** The three options; `readOptions()` is the one place that reads them. */
    readOptions() {
        const field = this.host;
        this.hold = field.dataset.kpSecretRevealOn === 'hold';
        const ttl = Math.max(0, Number.parseInt(field.dataset.kpSecretTtl ?? '', 10));
        this.seconds = Number.isFinite(ttl) ? ttl : SECRET_TTL;
        const maskLength = Math.max(1, Number.parseInt(field.dataset.kpSecretMask ?? '', 10) || SECRET_MASK);
        this.mask = (field.dataset.kpSecretMaskChar ?? '•').repeat(maskLength);
    }

    /** @param {string[]} names the live option attributes that changed */
    onOptions(names) {
        const wasHold = this.hold;
        // A value shown the old way is hidden first: a held reveal has no timer, a timed one has no button to hold.
        if (names.includes('data-kp-secret-reveal-on') && (this.state === 'shown' || this.state === 'loading')) this.hide('call');
        this.readOptions();
        this.host.style.setProperty('--kp-secret-ttl', `${this.seconds}s`);
        if (this.hold !== wasHold) this.setState(this.state);
        if ((names.includes('data-kp-secret-mask') || names.includes('data-kp-secret-mask-char')) && this.state !== 'shown')
            this.parts.value.textContent = this.mask;
        if (this.state !== 'shown' || !names.includes('data-kp-secret-ttl')) return;
        // The new time starts now, and the drain with it.
        this.stop();
        this.unpause();
        this.restartDrain(this.parts.drain);
        if (!this.hold) this.startTicking(() => this.tick());
        else this.left = this.seconds;
        this.writeLine();
    }

    disabledWhy() {
        return this.host.dataset.kpSecretDisabled;
    }

    unpause() {
        this.paused = false;
        this.host.removeAttribute('data-kp-secret-paused');
    }

    /** @param {SecretState} next */
    setState(next) {
        this.state = next;
        paintState(this);
    }

    writeLine() {
        writeLine(this);
    }

    /** @param {string} [reason] */
    hide(reason = 'press') {
        if (this.state !== 'shown' && this.state !== 'loading') return;
        this.ticket += 1;
        this.stop();
        this.unpause();
        const was = this.state;
        this.setState('hidden');
        this.writeLine();
        if (was !== 'shown') return;
        this.say(this.s.secretHidden);
        this.announce(false, reason);
    }

    tick() {
        if (this.paused) return;
        this.left -= 1;
        if (this.left === LAST_CALL_SECONDS && this.seconds > LAST_CALL_SECONDS) this.say(this.s.secretHidesIn(LAST_CALL_SECONDS));
        if (this.left <= 0) this.hide('timer');
        else this.writeLine();
    }

    /** Read the value and show it; a read that comes back after a hide is dropped. @param {string} [reason] */
    async show(reason = 'press') {
        if (this.disabledWhy() !== undefined || this.state === 'loading' || this.state === 'shown') return;
        const mine = (this.ticket += 1);
        this.setState('loading');
        this.writeLine();
        let text = '';
        try {
            text = await this.read('reveal');
        } catch (error) {
            if (mine !== this.ticket) return;
            this.setState('error');
            this.parts.words.textContent = this.s.secretFailed(reasonOf(error, this.s));
            this.say(this.parts.words.textContent);
            return;
        }
        if (mine === this.ticket) this.showText(text, reason);
    }

    /** @param {string} text @param {string} reason */
    showText(text, reason) {
        const { host: field, parts } = this;
        const shown = make(this.doc, 'span', 'kp-secret__text');
        shown.textContent = text;
        parts.value.replaceChildren(shown);
        parts.value.classList.remove('kp-masked');
        parts.value.tabIndex = 0;
        // A value longer than its box scrolls inside it; the fade at its end says there is more.
        field.toggleAttribute('data-kp-secret-overflow', parts.value.scrollWidth > parts.value.clientWidth + 1);
        this.left = this.seconds;
        this.paused = false;
        this.setState('shown');
        this.restartDrain(parts.drain);
        this.writeLine();
        this.say(this.s.secretShown(this.seconds));
        this.announce(true, reason);
        if (!this.hold) this.startTicking(() => this.tick());
    }

    /** @param {'reveal' | 'copy'} purpose */
    read(purpose) {
        return readSecret(this.host, purpose, this.load, this.s);
    }

    /** @param {boolean} on */
    pause(on) {
        if (this.state !== 'shown' || this.paused === on || this.seconds === 0) return;
        this.paused = on;
        this.host.toggleAttribute('data-kp-secret-paused', on);
        this.writeLine();
    }

    /** Whether the reader has selected text inside the shown value. */
    selected() {
        const selection = this.doc.getSelection();
        return selection !== null && !selection.isCollapsed && this.parts.value.contains(selection.anchorNode);
    }

    onReveal() {
        if (this.hold) return;
        if (this.state === 'shown') this.hide('press');
        else void this.show('press');
    }

    /** @param {PointerEvent} event */
    onHoldDown(event) {
        if (!this.hold || event.button !== 0) return;
        this.parts.reveal.setPointerCapture?.(event.pointerId);
        void this.show('hold');
    }

    /** @param {KeyboardEvent} event */
    onHoldKey(event) {
        if (!this.hold || (event.key !== ' ' && event.key !== 'Enter')) return;
        event.preventDefault();
        if (event.type === 'keydown' && !event.repeat) void this.show('hold');
        if (event.type === 'keyup') this.hide('hold');
    }

    /** The value already shown is copied as it stands; a hidden one is read, copied and never drawn. @param {HTMLButtonElement} copy */
    onCopy(copy) {
        if (this.disabledWhy() !== undefined) return;
        const idle = this.s.secretCopy;
        const name = this.host.getAttribute('aria-label') ?? this.s.secretLabel;
        const read = () => (this.state === 'shown' ? (this.parts.value.textContent ?? '') : this.read('copy'));
        void this.copyOut(copy, read, name, () => {
            copy.textContent = idle;
            delete copy.dataset.kpCopied;
        });
    }
}
