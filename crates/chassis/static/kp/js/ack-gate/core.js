// An acknowledge gate's state on the instance and what is drawn from it: why the tick is off, the reason a control gives, the paint and the held height.

import { Controller } from '../controller.js';
import { openBusyCard } from '../busy-card.js';
import { getStrings } from '../strings.js';
import { buildParts } from './build.js';
import { AckNotes } from './notes.js';
import { open, siblingsOf } from './targets.js';
import { SAY_DELAY_MS } from './values.js';

/** Numbers the gates of a page that have no id, for the id of their tick. */
let counter = 0;

export class AckCore extends Controller {
    /** @param {HTMLElement} gate */
    constructor(gate) {
        super(gate);
        this.doc = gate.ownerDocument;
        this.s = getStrings();
        this.id = `kp-ack-${++counter}`;
        this.ui = buildParts(this.doc, gate, this.s, this.id);
        this.locked = gate.hasAttribute('data-kp-ack-locked');
        this.startedAt = performance.now();
        this.linkOpened = false;
        /** What the gate last decided: the browser flips the box before its change event, so the box cannot say what changed. */
        this.ticked = false;
        /** The busy card over the gate while the notes are looked up: the card a loading data table lays over its rows [wish-1120]. @type {import('../busy-card.js').BusyCard | null} */
        this.busy = null;
        /** @type {number | undefined} */
        this.sayTimer = undefined;
        /** @type {number | undefined} */
        this.waitTimer = undefined;
        /** The handle a page gets, made when the gate is wired. @type {import('../ack-gate.js').AckHandle | null} */
        this.handle = null;
        this.notes = new AckNotes(gate, this.ui.live, this.s, () => this.paint());
    }

    key() {
        return this.host.getAttribute('data-kp-ack-key') ?? this.host.id ?? this.id;
    }
    labelText() {
        return this.host.getAttribute('data-kp-ack-label') ?? this.s.ackLabel;
    }
    mode() {
        return this.host.getAttribute('data-kp-ack-mode') === 'all' ? 'all' : 'each';
    }
    minMs() {
        return Number(this.host.getAttribute('data-kp-ack-min-ms')) || 0;
    }

    /** Why the tick cannot be set now, or ''. */
    tickBlock() {
        const { host, s } = this;
        const state = host.getAttribute('data-kp-state');
        if (state === 'loading') return s.ackLooking;
        if (this.locked) return s.ackLocked;
        if (host.hasAttribute('data-kp-ack-require-link') && !this.linkOpened) return s.ackOpenFirst;
        if (host.hasAttribute('data-kp-ack-require-notes') && this.notes.fold !== null && !this.notes.opened) return s.ackOpenNotes;
        if (this.minMs() > 0 && !this.linkOpened && !this.notes.opened && performance.now() - this.startedAt < this.minMs()) return s.ackOpenFirst;
        return '';
    }

    /** The reason a control gives while it is off. */
    reasonFor() {
        const { host, s } = this;
        const mine = siblingsOf(host).filter(open);
        if (mine.length === 0) return '';
        const all = siblingsOf(host).filter((g) => g.getAttribute('data-kp-state') !== 'empty' && !g.hidden);
        if (all.length > 1) return s.ackReasonMany(mine.length, all.length);
        return s.ackReason(this.labelText());
    }

    /** Say what changed in the live region, after a short pause. @param {string} text */
    say(text) {
        window.clearTimeout(this.sayTimer);
        this.sayTimer = window.setTimeout(() => (this.ui.live.textContent = text), SAY_DELAY_MS);
    }

    /** The loading state's busy card, laid over the gate and taken off the way the theme's busy table's card leaves. @param {string | null} state */
    paintBusy(state) {
        if (state === 'loading') {
            this.busy ??= openBusyCard(this.host, { words: this.s.ackLooking, area: () => [this.host], className: 'kp-ack__busy', arrive: true });
        } else if (this.busy !== null) {
            const leaving = this.busy;
            this.busy = null;
            void leaving.close();
        }
    }

    /** Take the busy card off at once. */
    dropBusy() {
        this.busy?.remove();
        this.busy = null;
    }

    /** Remember what the tick was set to; true when that is a change. @param {boolean} checked */
    flip(checked) {
        const changed = this.ticked !== checked;
        this.ticked = checked;
        return changed;
    }

    /** An empty gate hides itself and remembers that it did. @param {string | null} state */
    paintEmpty(state) {
        const { host } = this;
        if (state === 'empty') {
            if (!host.hidden) host.setAttribute('data-kp-ack-hid', '');
            host.hidden = true;
        } else if (host.hasAttribute('data-kp-ack-hid')) {
            host.hidden = false;
            host.removeAttribute('data-kp-ack-hid');
        }
    }

    paint() {
        const { host, ui, s } = this;
        ui.words.textContent = this.labelText();
        const block = this.tickBlock();
        ui.box.disabled = block !== '';
        if (block) ui.tick.setAttribute('data-kp-reason', block);
        else ui.tick.removeAttribute('data-kp-reason');
        ui.tick.title = block;
        const state = host.getAttribute('data-kp-state');
        this.paintBusy(state);
        host.toggleAttribute('aria-busy', state === 'loading');
        this.paintEmpty(state);
        ui.problem.hidden = state !== 'error';
        ui.retry.hidden = !(state === 'error' && host.hasAttribute('data-kp-ack-retry'));
        ui.problemText.textContent = state === 'error' ? s.ackNoLink : '';
        if (ui.anchor) ui.anchor.hidden = state === 'error';
        host.toggleAttribute('data-kp-checked', ui.box.checked);
    }

    /** Keep the alert's height through a state that stands in for its words. */
    keepHeight() {
        const state = this.host.getAttribute('data-kp-state');
        if (state === null || state === 'ready') this.host.style.setProperty('--kp-ack-keep', `${this.host.offsetHeight}px`);
    }
}
