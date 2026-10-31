// One undo toast: its states and attributes, Undo and the commit with its failure, Esc and close, and what happens when the page is left.

import { toast } from '../overlays.js';
import { UndoCore } from './core.js';
import { enter, keyName, leaveStack, live } from './stack.js';
import { UNDO_RESTORED_MS } from './values.js';

export class UndoRun extends UndoCore {
    /**
     * @param {HTMLElement} host the toast
     * @param {import('./core.js').UndoRunOptions} run
     */
    constructor(host, run) {
        super(host, run);
        /** What undoToast() hands back. @type {import('../undo-toast.js').UndoToast} */
        this.handle = {
            toast: this.toast,
            state: () => this.state,
            undo: () => this.undo(),
            accept: () => this.accept(),
            done: this.done,
        };
    }

    connect() {
        const { settings, toast: el } = this;
        const { ms, clock, mode, seconds, key, max } = settings;
        el.setAttribute('data-kp-undo-state', 'counting');
        el.setAttribute('data-kp-undo-clock', clock);
        el.setAttribute('data-kp-undo-mode', mode);
        el.style.setProperty('--kp-undo-ms', `${ms}ms`);
        el.style.setProperty('--kp-undo-steps', String(seconds));
        this.markButton(key);
        this.listenAttention();
        this.takeOverDismiss();
        this.listenLeaving();
        void this.done.then(() => this.destroy());
        if (ms === 0) {
            void this.accept();
            return;
        }
        enter({ handle: this.handle, key });
        // The oldest gives way: it is committed, and its toast goes.
        const standing = live.filter((e) => e.handle.state() === 'counting' || e.handle.state() === 'committing');
        for (const old of standing.slice(0, Math.max(0, standing.length - max))) void old.handle.accept();
        this.run();
    }

    /** The Undo button says which key undoes. @param {string | false} key */
    markButton(key) {
        const undoButton = /** @type {HTMLButtonElement | null} */ (this.toast.querySelector(':scope > .kp-button'));
        if (undoButton && key) undoButton.title = this.strings.undoToastKeyTitle(keyName(key));
        undoButton?.setAttribute('data-kp-undo-button', '');
    }

    /** The clock stops while the pointer or the focus is on the toast. */
    listenAttention() {
        const el = this.toast;
        this.listen(el, 'pointerenter', (event) => {
            if (/** @type {PointerEvent} */ (event).pointerType === 'touch') return;
            this.setPointer(true);
        });
        this.listen(el, 'pointerleave', () => this.setPointer(false));
        this.listen(el, 'focusin', () => this.setFocus(true));
        this.listen(el, 'focusout', (event) => {
            const to = /** @type {FocusEvent} */ (event).relatedTarget;
            if (to instanceof Node && el.contains(to)) return;
            this.setFocus(false);
        });
    }

    /** Esc or a close before the end accepts the action now. */
    takeOverDismiss() {
        const el = this.toast;
        const dismiss = el.dismiss;
        el.dismiss = () => {
            if (this.state === 'counting') {
                void this.accept();
                return;
            }
            if (this.state === 'committing') return;
            dismiss();
        };
    }

    /** What a pending action does when the page is left, by the `leave` setting. */
    listenLeaving() {
        const { view } = this;
        if (!view) return;
        this.listen(view, 'pagehide', () => this.onPageHide());
        this.listen(view, 'popstate', () => this.onSoftLeave());
        this.listen(view, 'hashchange', () => this.onSoftLeave());
    }

    onPageHide() {
        if (this.state !== 'counting') return;
        if (this.settings.leaves === 'cancel') this.undo();
        else if (this.settings.mode === 'defer') {
            // The page is going: commit as far as a script still can.
            try {
                void this.given.commit?.();
            } catch {
                // Nothing is left to say it to.
            }
            this.enterState('done');
            this.finish('left');
        }
        leaveStack(this.handle);
    }

    onSoftLeave() {
        if (this.state !== 'counting' || this.settings.leaves === 'carry') return;
        if (this.settings.leaves === 'cancel') this.undo();
        else void this.accept();
    }

    /** Undo now: the toast says "Restored", the page's reverse runs, and the toast goes after a moment. */
    undo() {
        if (this.state !== 'counting') return;
        const { toast: el, ui } = this;
        this.enterState('undone');
        this.stopClocks();
        leaveStack(this.handle);
        el.setAttribute('data-kp-undo-state', 'undone');
        el.removeAttribute('data-kp-paused');
        this.setLine(this.given.restored ?? this.strings.undoToastRestored);
        el.querySelector(':scope > .kp-button')?.remove();
        ui.ring?.remove();
        ui.secs?.remove();
        ui.body.querySelector('.kp-undo__bar')?.remove();
        try {
            void this.given.undo?.();
        } catch {
            // The page's reverse failed: the toast still says what it can.
        }
        this.announce('undone');
        this.finish('undone');
        this.view?.setTimeout(() => el.dismiss(), UNDO_RESTORED_MS);
    }

    /** The action is done for good: the toast says so and goes. @param {import('./core.js').UndoOutcome} how */
    settle(how) {
        this.enterState('done');
        leaveStack(this.handle);
        this.toast.setAttribute('data-kp-undo-state', 'done');
        this.announce(how);
        this.finish(how);
        this.toast.dismiss();
    }

    /** The commit failed: the toast turns into the problem and the row comes back. @param {unknown} error @param {HTMLElement} wheel */
    failed(error, wheel) {
        const el = this.toast;
        this.enterState('failed');
        leaveStack(this.handle);
        el.setAttribute('data-kp-undo-state', 'failed');
        el.classList.add('kp-toast--destructive');
        wheel.remove();
        const why = error instanceof Error ? error.message : String(error ?? '');
        this.setLine(this.given.failed ?? this.strings.undoToastFailed(why));
        try {
            void (this.given.restore ?? this.given.undo)?.();
        } catch {
            // Nothing more to do: the toast carries the problem.
        }
        const closer = this.doc.createElement('button');
        closer.type = 'button';
        closer.className = 'kp-button kp-button--ghost';
        closer.textContent = this.strings.undoToastDismiss;
        closer.addEventListener('click', () => el.dismiss());
        el.append(closer);
        this.announce('failed');
        this.finish('failed');
    }

    /** A wheel in the clock's place while the commit runs. @returns {HTMLElement} */
    spinner() {
        const { ring, secs, body } = this.ui;
        const wheel = this.doc.createElement('span');
        wheel.className = 'kp-spinner kp-undo__spinner';
        wheel.setAttribute('aria-hidden', 'true');
        if (ring) ring.replaceWith(wheel);
        else if (secs) secs.replaceWith(wheel);
        else body.prepend(wheel);
        body.querySelector('.kp-undo__bar')?.remove();
        return wheel;
    }

    /** Commit now. */
    async accept() {
        if (this.state !== 'counting') return;
        const el = this.toast;
        this.stopClocks();
        this.enterState('committing');
        el.setAttribute('data-kp-undo-state', 'committing');
        el.removeAttribute('data-kp-paused');
        el.querySelector(':scope > .kp-button')?.remove();
        if (this.settings.mode === 'revert' || !this.given.commit) {
            this.settle('committed');
            return;
        }
        const wheel = this.spinner();
        try {
            await this.given.commit();
        } catch (error) {
            this.failed(error, wheel);
            return;
        }
        this.settle('committed');
    }
}
