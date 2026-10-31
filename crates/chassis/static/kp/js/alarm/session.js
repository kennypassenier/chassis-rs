// One raised alarm: the ways out (its button, Escape, the countdown), the focus it takes and gives back, and the promise it settles.

import { Controller } from '../controller.js';
import { writeCountdown } from './countdown.js';
import { ALARM_CLOSE_EVENT, ALARM_OPEN_EVENT, SECOND_MS, TICK_MS } from './values.js';

/** @typedef {import('../alarm.js').AlarmReason} AlarmReason */
/**
 * @typedef {object} SessionOptions
 * @property {HTMLButtonElement} ack
 * @property {HTMLButtonElement} keep
 * @property {HTMLElement} when
 * @property {HTMLElement} left
 * @property {import('../strings.js').Strings} strings
 * @property {string} action
 * @property {number} seconds
 * @property {'ack' | 'auto'} mode
 * @property {boolean} escape
 * @property {HTMLElement | null} trigger
 * @property {(reason: AlarmReason) => void} resolve
 */

export class AlarmSession extends Controller {
    /**
     * @param {HTMLDialogElement} host the dialog
     * @param {SessionOptions} options
     */
    constructor(host, options) {
        super(host, options);
        this.dialog = host;
        this.o = options;
        /** @type {AlarmReason} */
        this.reason = 'escape';
        this.timer = 0;
    }

    connect() {
        const { dialog, o } = this;
        this.listen(o.ack, 'click', () => this.close('ack'));
        this.listen(o.keep, 'click', () => this.onKeep());
        this.listen(dialog, 'cancel', (event) => this.onCancel(event));
        // Firefox and Chromium let a second Escape past a prevented cancel when there was no activation in between; the keydown is
        // the door that stays shut.
        this.listen(dialog, 'keydown', (event) => {
            if (/** @type {KeyboardEvent} */ (event).key === 'Escape' && !this.escapeAllowed()) event.preventDefault();
        });
        this.listen(dialog, 'close', () => this.onClosed());
        this.own(() => window.clearInterval(this.timer));
    }

    /** @param {AlarmReason} why */
    close(why) {
        this.reason = why;
        if (this.dialog.open) this.dialog.close(why);
    }

    escapeAllowed() {
        return this.dialog.dataset.kpAlarmMode === 'auto' || this.o.escape;
    }

    /** Keep open stops the countdown and turns the alarm into an acknowledged one. */
    onKeep() {
        const { dialog, o } = this;
        window.clearInterval(this.timer);
        dialog.dataset.kpAlarmMode = 'ack';
        dialog.setAttribute('closedby', o.escape ? 'closerequest' : 'none');
        o.when.textContent = o.strings.alarmKeptOpen(o.action);
        o.ack.focus();
    }

    /** @param {Event} event */
    onCancel(event) {
        if (!this.escapeAllowed()) event.preventDefault();
        else this.reason = 'escape';
    }

    /** The alarm closed: the focus goes back, the page hears why, the promise settles, and the session is over. */
    onClosed() {
        const { dialog, o, reason } = this;
        window.clearInterval(this.timer);
        dialog.remove();
        const trigger = o.trigger;
        if (trigger?.isConnected) trigger.focus();
        (trigger?.isConnected ? trigger : document).dispatchEvent(new CustomEvent(ALARM_CLOSE_EVENT, { bubbles: true, detail: { reason, id: dialog.id } }));
        o.resolve(reason);
        this.destroy();
    }

    /** Put the alarm on the screen and take the focus. */
    open() {
        const { dialog, o } = this;
        document.body.append(dialog);
        dialog.showModal();
        dialog.scrollTop = 0;
        // The acknowledged alarm focuses its one way out. The auto alarm focuses itself, so an Enter meant for the page presses
        // nothing, and the first Tab reaches Keep open.
        if (o.mode === 'auto') dialog.focus({ preventScroll: true });
        else o.ack.focus({ preventScroll: true });
        dialog.scrollTop = 0;
        dialog.dispatchEvent(new CustomEvent(ALARM_OPEN_EVENT, { bubbles: true, detail: { id: dialog.id, mode: dialog.dataset.kpAlarmMode } }));
        if (o.mode === 'auto') this.startCountdown();
    }

    startCountdown() {
        const total = this.o.seconds * SECOND_MS;
        const began = performance.now();
        const tick = () => {
            const { dialog, o } = this;
            const remaining = Math.max(0, total - (performance.now() - began));
            const whole = Math.ceil(remaining / SECOND_MS);
            writeCountdown(dialog, o.left, remaining / total, whole / o.seconds, o.strings.alarmCountdown(whole));
            if (remaining <= 0) this.close('timeout');
        };
        this.timer = window.setInterval(tick, TICK_MS);
        tick();
    }
}
