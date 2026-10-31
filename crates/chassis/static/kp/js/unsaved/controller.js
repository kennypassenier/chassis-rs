// One unsaved-changes bar: builds it, paints the count, runs Save, Discard, Undo and Revert, and hands the page its handle.

import { getStrings } from '../strings.js';
import { toast } from '../overlays.js';
import { attachMenuButtons, setMenu, MENU_SELECT_EVENT } from '../menu-button.js';
import { Controller } from '../controller.js';
import {
    ANNOUNCE_DELAY_MS,
    SAVED_TOAST_MS,
    UNSAVED_CHANGE_EVENT,
    UNSAVED_DISCARD_EVENT,
    UNSAVED_REVERT_EVENT,
    UNSAVED_SAVE_EVENT,
    UNSAVED_UNDO_EVENT,
    readSettings,
} from './config.js';
import { nextBarNumber } from './state.js';
import { fire, readValue, writeValue } from './values.js';
import { buildParts } from './parts.js';
import { applySaved, discardChanges, jumpTo, markAllClean, revertOne, saveChanges, setSaving } from './actions.js';
import { paintBar } from './paint.js';
import { ChangeTracker } from './changes.js';
import { ChangeKeeper } from './keeper.js';
import { ChangesPanel } from './panel.js';
import { BarDock } from './dock.js';
import { WIDGET_EVENTS } from './widgets.js';
import { LeaveGuard } from './leave.js';

/** @typedef {import('./config.js').UnsavedChange} UnsavedChange */
/** @typedef {import('./config.js').UnsavedHandle} UnsavedHandle */

/** An unsaved-changes bar. */
export class UnsavedController extends Controller {
    /**
     * @param {HTMLElement} host the bar
     * @param {import('./config.js').UnsavedConfig} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        this.el = host;
        this.doc = host.ownerDocument;
        this.win = this.doc.defaultView ?? window;
        this.s = getStrings();
        /** The bar's id, and what its markup asks for. Both are read in `connect()`. */
        this.id = '';
        this.settings = /** @type {ReturnType<typeof readSettings>} */ (/** @type {unknown} */ (null));
        this.parts = /** @type {ReturnType<typeof buildParts>} */ (/** @type {unknown} */ (null));
        this.tracker = /** @type {ChangeTracker} */ (/** @type {unknown} */ (null));
        this.keeper = new ChangeKeeper(this);
        this.panel = new ChangesPanel(this);
        this.dock = new BarDock(this);
        this.guard = new LeaveGuard(this);
        /** Whether the page is saving, and how many changes it was sent. */
        this.saving = false;
        this.savedCount = 0;
        /** The count last painted; -1 before the first paint, so the first paint raises no event. */
        this.lastCount = -1;
        this.announceTimer = 0;
        /** What the last Discard changed, for Undo. @type {{ control: HTMLInputElement, value: string }[]} */
        this.undoStack = [];
        /** The handle the page gets back from `unsaved(el)`. @type {UnsavedHandle | null} */
        this.handle = null;
    }

    /** The scratch region read out to screen readers. */
    get live() {
        return this.parts.live;
    }

    connect() {
        const { el } = this;
        this.id = el.id || `kp-unsaved-${nextBarNumber()}`;
        this.settings = readSettings(el, this.id);
        this.tracker = new ChangeTracker(el, this.settings.scope, this.s, /** @type {import('./config.js').UnsavedConfig} */ (this.options).show);
        this.keeper.connect();
        el.classList.add('kp-unsaved');
        el.dataset.kpUnsavedAttached = '';
        this.own(() => this.release());
        this.mount();
        this.tracker.capture();
        this.handle = this.makeHandle();
        this.dock.connect();
        this.wire();
        // What a browser put back into a reloaded form is an unsaved change too.
        if (this.settings.auto) for (const c of this.tracker.baseline.keys()) this.tracker.track(/** @type {HTMLInputElement} */ (c));
        this.keeper.restore();
        this.paint();
    }

    /** Undo what `connect()` put on the host itself. */
    release() {
        const { el } = this;
        el.replaceChildren();
        el.removeAttribute('data-kp-docked');
        el.removeAttribute('data-kp-state');
        el.style.removeProperty('--kp-unsaved-w');
        el.style.removeProperty('--kp-unsaved-h');
        delete el.dataset.kpUnsavedAttached;
    }

    /** Build the bar into the host and give its menu button life. */
    mount() {
        const { el } = this;
        this.parts = buildParts(this.doc, this.s, this.id);
        const { bar, problem, panel, live } = this.parts;
        el.replaceChildren(bar, problem, panel, live);
        this.own(attachMenuButtons(el));
        this.own(() => clearTimeout(this.announceTimer));
        this.own(() => this.panel.lower?.());
    }

    /** The listeners on the bar's own buttons, the scope and the document. */
    wire() {
        const { chip, first, discard, save, more, panel } = this.parts;
        const { scope } = this.settings;
        this.listen(chip, 'click', () => (panel.hidden ? this.panel.open() : void this.panel.close()));
        this.listen(first, 'click', () => {
            const ch = this.tracker.changes()[0];
            if (ch) this.jump(ch);
        });
        this.listen(discard, 'click', () => this.discard());
        this.listen(save, 'click', () => this.save());
        this.listen(more, MENU_SELECT_EVENT, (event) => {
            const value = /** @type {CustomEvent} */ (event).detail?.value;
            if (value === 'discard') this.discard();
            else if (value === 'review') this.panel.open();
        });
        if (typeof MutationObserver !== 'undefined') {
            const mutation = this.observe(
                new MutationObserver(() => {
                    if (this.tracker.changes().length !== this.lastCount) this.paint();
                }),
            );
            mutation.observe(scope, { attributes: true, attributeFilter: ['data-kp-changed'], subtree: true });
            this.observe(new MutationObserver(() => this.dock.place())).observe(this.el, { attributes: true, attributeFilter: ['data-kp-placement'] });
        }
        this.listen(scope, 'input', (event) => this.onEdit(event));
        this.listen(scope, 'change', (event) => this.onEdit(event));
        // A quantity, a time field and a combobox write their inputs silently and say what changed in their own event [homelab 37].
        for (const name of WIDGET_EVENTS) this.listen(scope, name, (event) => this.onEdit(event));
        this.listen(this.doc, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(this.doc, 'pointerdown', (event) => this.onOutside(/** @type {PointerEvent} */ (event)), true);
        this.guard.connect();
    }

    /** @param {Event} event */
    onEdit(event) {
        if (!this.settings.auto) return;
        const c = this.tracker.controlFor(event.target);
        if (!c) return;
        this.tracker.track(c);
        this.paint();
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
            if (this.tracker.changes().length === 0 && !this.saving) return;
            event.preventDefault();
            this.save();
        } else if (event.key === 'Escape' && !this.parts.panel.hidden) {
            event.preventDefault();
            void this.panel.close();
        }
    }

    /** @param {PointerEvent} event */
    onOutside(event) {
        const { panel, chip } = this.parts;
        if (panel.hidden) return;
        const t = /** @type {Node} */ (event.target);
        if (panel.contains(t) || chip.contains(t)) return;
        void this.panel.close(false);
    }

    // ── painting and actions: the work is in paint.js and actions.js, these are the calls the other parts and the page make ──

    /** Bring the whole bar in line with the changes now. */
    paint() {
        paintBar(this);
    }

    /** Close the list and take the visitor to the changed row. @param {UnsavedChange} ch */
    jump(ch) {
        jumpTo(this, ch);
    }

    /** Put one change back, unless the page cancels it. @param {UnsavedChange} ch */
    revertOne(ch) {
        revertOne(this, ch);
    }

    /** Put every changed value back and offer Undo. */
    discard() {
        discardChanges(this);
    }

    /** Ask the page to save; if it does not cancel, the bar goes to work. */
    save() {
        saveChanges(this);
    }

    /** The page's answer to Save. @param {{ refused?: Record<string, string> }} [result] */
    saved(result = {}) {
        applySaved(this, result);
    }

    /** Take what the form holds now as the saved values. */
    markClean() {
        markAllClean(this);
    }

    /** @param {boolean} next */
    setSaving(next) {
        setSaving(this, next);
    }

    /** The handle the page gets back. @returns {UnsavedHandle} */
    makeHandle() {
        return {
            element: this.el,
            changes: () => this.tracker.changes(),
            state: () => (this.saving ? 'saving' : this.tracker.changes().length ? 'dirty' : 'clean'),
            discard: () => this.discard(),
            saved: (result) => this.saved(result),
            markClean: () => this.markClean(),
            setSaving: (next) => this.setSaving(next),
        };
    }
}
