// One wired acknowledge gate: its markup put in and taken out, the tick that is set, the handle a page gets, and what makes the gate repaint.

import { mountParts } from './build.js';
import { AckSync } from './sync.js';
import { HANDLES, open, siblingsOf, targetsOf } from './targets.js';
import { ACK_EVENT, ACK_RETRY_EVENT, WAIT_SLACK_MS } from './values.js';

/** The tones a gate may carry; any other word is the default, `warning`. */
const TONES = ['warning', 'destructive', 'info'];

/** The attributes whose change makes the gate redraw. */
const WATCHED = [
    'data-kp-ack-key',
    'data-kp-ack-version',
    'data-kp-ack-label',
    'data-kp-state',
    'data-kp-ack-tone',
    'data-kp-ack-mode',
    'data-kp-ack-locked',
    'data-kp-ack-link-label',
];

export class AckGate extends AckSync {
    connect() {
        const { host, ui } = this;
        // Taken down last: once everything else is undone, the controls this gate held are let go and the gate leaves the registry.
        this.own(() => {
            for (const target of targetsOf(host)) target.removeAttribute('data-kp-ack-held');
            HANDLES.delete(host);
        });
        this.stamp();
        this.own(mountParts(host, ui));
        this.own(() => this.notes.remove());
        this.own(() => this.dropBusy());
        this.handle = this.makeHandle();
        HANDLES.set(host, this.handle);
        this.listen(ui.box, 'change', () => this.set(ui.box.checked, true));
        this.listen(host, 'kp-ack-sync', () => {
            this.syncTargets();
            this.paint();
        });
        if (ui.anchor) this.listen(ui.anchor, 'click', () => this.onLink());
        this.listen(ui.retry, 'click', () => host.dispatchEvent(new CustomEvent(ACK_RETRY_EVENT, { bubbles: true })));
        this.watchAttributes();
        this.watchHeight();
        this.own(() => {
            window.clearTimeout(this.waitTimer);
            window.clearTimeout(this.sayTimer);
        });
        this.paint();
        // Every gate of a page is attached in one pass: the controls are read once all of them are known.
        queueMicrotask(() => {
            if (this.destroyed) return;
            this.syncTargets();
            this.keepHeight();
        });
    }

    /** The classes, role and tone the host gets, and the class it gives back. */
    stamp() {
        const gate = this.host;
        gate.classList.add('kp-ack');
        this.own(() => gate.classList.remove('kp-ack'));
        if (!gate.classList.contains('kp-alert')) gate.classList.add('kp-alert');
        const tone = gate.getAttribute('data-kp-ack-tone') ?? 'warning';
        gate.classList.add(`kp-alert--${TONES.includes(tone) ? tone : 'warning'}`);
        gate.setAttribute('role', 'group');
    }

    /** The handle a page gets from `ackGate(gate)`. @returns {import('../ack-gate.js').AckHandle} */
    makeHandle() {
        const { host, ui } = this;
        return {
            element: host,
            checked: () => ui.box.checked,
            set: (checked) => this.set(checked, true),
            setNotes: (markdown) => this.notes.set(markdown),
            setState(state) {
                if (state === 'ready') host.removeAttribute('data-kp-state');
                else host.setAttribute('data-kp-state', state);
            },
            setLocked: (value) => {
                this.locked = value;
                host.toggleAttribute('data-kp-ack-locked', value);
                this.paint();
            },
            remaining: () => siblingsOf(host).filter(open).length,
        };
    }

    onLink() {
        this.linkOpened = true;
        this.paint();
    }

    /**
     * Set or clear the tick; a tick the gate does not allow yet is refused.
     * @param {boolean} checked @param {boolean} fire
     */
    set(checked, fire) {
        const { host, ui, s } = this;
        if (checked && this.tickBlock()) return;
        const changed = this.flip(checked);
        ui.box.checked = checked;
        if (changed && this.mode() === 'all') for (const other of siblingsOf(host)) if (other !== host) HANDLES.get(other)?.set(checked);
        this.paint();
        for (const g of siblingsOf(host)) g.dispatchEvent(new CustomEvent('kp-ack-sync'));
        this.syncTargets();
        if (changed && fire) {
            const remaining = siblingsOf(host).filter(open).length;
            host.dispatchEvent(new CustomEvent(ACK_EVENT, { bubbles: true, detail: { key: this.key(), checked, remaining, at: new Date().toISOString() } }));
            this.say(remaining === 0 ? s.ackEnabled : s.ackDisabled(remaining));
        }
    }

    /** What identifies the item the tick was set for: its key, version and words. */
    signature() {
        return `${this.key()}|${this.host.getAttribute('data-kp-ack-version') ?? ''}|${this.labelText()}`;
    }

    /** A changed item is a new decision: the tick clears (default), and a gate redraws when its words or state change. */
    watchAttributes() {
        const gate = this.host;
        let sig = this.signature();
        this.observe(
            new MutationObserver(() => {
                const next = this.signature();
                if (next !== sig && gate.getAttribute('data-kp-ack-reset') !== 'never' && this.ui.box.checked) this.set(false, true);
                sig = next;
                this.paint();
                this.syncTargets();
                if (gate.getAttribute('data-kp-state') === null) this.keepHeight();
            }),
        ).observe(gate, { attributes: true, attributeFilter: WATCHED });
    }

    /** A min-ms wait ends by itself; the held height follows the gate's size. */
    watchHeight() {
        if (this.minMs() > 0) this.waitTimer = window.setTimeout(() => this.paint(), this.minMs() + WAIT_SLACK_MS);
        if (typeof ResizeObserver === 'function') this.observe(new ResizeObserver(() => this.keepHeight())).observe(this.host);
    }
}
