// An undo toast's state on the instance and its clock: the seconds that run down, held while the pointer or the focus is on the toast and going on where it stopped.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { UNDO_TOAST_EVENT, CLOCK_TICK_MS } from './values.js';

/** @typedef {import('../undo-toast.js').UndoToast} UndoToast */
/** @typedef {import('../undo-toast.js').UndoToastOptions} UndoToastOptions */
/** @typedef {'counting' | 'committing' | 'failed' | 'undone' | 'done'} UndoState */
/** @typedef {'committed' | 'undone' | 'failed' | 'left'} UndoOutcome */

/**
 * @typedef {object} UndoRunOptions
 * @property {UndoToastOptions} options what the caller passed
 * @property {ReturnType<typeof import('./build.js').readSettings>} settings
 * @property {ReturnType<typeof import('./build.js').buildBody>} ui the content of the toast
 */

export class UndoCore extends Controller {
    /**
     * @param {HTMLElement} host the toast (it carries `dismiss`)
     * @param {UndoRunOptions} run
     */
    constructor(host, run) {
        super(host, run);
        this.toast = /** @type {HTMLElement & { dismiss: () => void }} */ (host);
        this.doc = host.ownerDocument;
        this.view = this.doc.defaultView;
        this.strings = getStrings();
        this.given = run.options;
        this.settings = run.settings;
        this.ui = run.ui;
        /** @type {UndoState} */
        this.state = 'counting';
        /** Settles `done`. @type {(how: UndoOutcome) => void} */
        this.finish = () => undefined;
        /** @type {Promise<UndoOutcome>} */
        this.done = new Promise((resolve) => (this.finish = resolve));
        /** The time left in the window, in ms. */
        this.remaining = run.settings.ms;
        this.startedAt = 0;
        this.timer = 0;
        this.tick = 0;
        /** Whether the pointer, or the focus, is on the toast. */
        this.pointer = false;
        this.focus = false;
    }

    /** Move to another state; the toast's attribute follows where the caller sets it. @param {UndoState} next */
    enterState(next) {
        this.state = next;
    }

    stopClocks() {
        this.view?.clearTimeout(this.timer);
        this.view?.clearInterval(this.tick);
    }

    /** @param {string} line */
    setLine(line) {
        this.ui.words.textContent = line;
        this.ui.said.textContent = line;
    }

    /** @param {UndoOutcome} how */
    announce(how) {
        this.toast.parentElement?.dispatchEvent(new CustomEvent(UNDO_TOAST_EVENT, { bubbles: true, detail: { toast: this.toast, outcome: how } }));
    }

    /** The seconds on the toast, written from what is left. */
    writeSeconds() {
        const { secs } = this.ui;
        if (!secs) return;
        const left = Math.max(0, Math.ceil((this.remaining - (performance.now() - this.startedAt)) / 1000));
        secs.textContent = this.settings.clock === 'ring' ? String(left) : this.strings.undoToastClock(left);
    }

    /** Start the clock: the commit after what is left, and the seconds every tick. */
    run() {
        this.startedAt = performance.now();
        this.timer = this.view?.setTimeout(() => void this.accept(), this.remaining) ?? 0;
        if (this.ui.secs) {
            this.tick = this.view?.setInterval(() => this.writeSeconds(), CLOCK_TICK_MS) ?? 0;
            this.writeSeconds();
        }
    }

    /** Commit now; the running toast overrides it. @returns {Promise<void>} */
    async accept() {}

    /** The pointer or the focus came: stop the clock where it is. */
    hold() {
        if (this.state !== 'counting' || this.toast.hasAttribute('data-kp-paused')) return;
        this.remaining = Math.max(0, this.remaining - (performance.now() - this.startedAt));
        this.stopClocks();
        this.toast.setAttribute('data-kp-paused', '');
    }

    /** Both left: go on where it stopped. */
    go() {
        if (this.state !== 'counting' || !this.toast.hasAttribute('data-kp-paused')) return;
        this.toast.removeAttribute('data-kp-paused');
        this.run();
    }

    attended() {
        if (this.pointer || this.focus) this.hold();
        else this.go();
    }

    /** The pointer came or left. @param {boolean} on */
    setPointer(on) {
        this.pointer = on;
        this.attended();
    }

    /** The focus came or left. @param {boolean} on */
    setFocus(on) {
        this.focus = on;
        this.attended();
    }
}
