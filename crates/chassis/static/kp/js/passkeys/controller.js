// One passkey list: its rows, what is busy, being renamed or refused, and the removal and rename flows [kpadopt5-people].

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { openConfirmation } from '../components.js';
import { DEFAULT_WAIT_ROWS, PASSKEYS_REGISTER_EVENT, PASSKEYS_REMOVE_EVENT, PASSKEYS_RENAME_EVENT, PASSKEYS_RETRY_EVENT } from './constants.js';
import { actionOf } from './dom.js';
import { passkeyOptions } from './options.js';
import { draw, drawLoading } from './paint.js';

/** What a thrown value says: its message, or the fallback words. @param {unknown} error @param {string} fallback */
const reasonOf = (error, fallback) => (error instanceof Error && error.message ? error.message : fallback);

/** The controller of one `.kp-passkeys` root: the rows, the flows and the painting. */
export class PasskeysController extends Controller {
    /**
     * @param {HTMLElement} host the root
     * @param {{ spec?: import('./constants.js').PasskeysSpec }} [options] the first spec
     */
    constructor(host, options = {}) {
        super(host, options);
        /** The spec of the last setPasskeys() call. @type {import('./constants.js').PasskeysSpec} */
        this.spec = options.spec ?? {};
        /** The rows as the page gave them (and as removals and renames changed them). @type {import('./constants.js').PasskeyRow[]} */
        this.rows = [];
        /** How many rows were shown last: the waiting rows of a loading list copy it. */
        this.rowCount = DEFAULT_WAIT_ROWS;
        /** The tallest height the list had, kept by the empty and failed notes. */
        this.height = 0;
        /** The busy card of a loading list. @type {import('../busy-card.js').BusyCard | null} */
        this.card = null;
        /** Whether the list has been drawn once (the busy card then arrives softly). */
        this.drawn = false;
        /** The spec waiting for the busy card to leave. @type {import('./constants.js').PasskeysSpec | null} */
        this.pending = null;
        /** The key of the row being renamed. @type {string | null} */
        this.renaming = null;
        /** A row's server refusal, by key. @type {Map<string, string>} */
        this.refused = new Map();
        /** Keys being removed or renamed. @type {Set<string>} */
        this.busy = new Set();
        /** What the live line says on the next draw. */
        this.announce = '';
    }

    connect() {
        this.listen(this.host, 'click', (event) => this.onClick(event));
        this.listen(this.host, 'keydown', (event) => this.onKeydown(/** @type {KeyboardEvent} */ (event)));
    }

    /** Whether removing a row would leave no way in. */
    isLast() {
        return this.rows.length <= 1;
    }

    /**
     * Show a new spec: the waiting rows, or the list once the busy card has left.
     * @param {import('./constants.js').PasskeysSpec} spec
     */
    update(spec) {
        this.spec = spec;
        if ((spec.state ?? 'ready') === 'loading') {
            this.pending = null;
            drawLoading(this, spec);
            return;
        }
        if (spec.rows) this.rows = [...spec.rows];
        if (!this.card) {
            draw(this);
            return;
        }
        const card = this.card;
        this.card = null;
        this.pending = spec;
        void card.close().then(() => {
            if (this.pending !== spec) return;
            this.pending = null;
            draw(this);
        });
    }

    /** The row a control sits in. @param {Element} inside */
    rowAround(inside) {
        const key = inside.closest('[data-kp-passkey]')?.getAttribute('data-kp-passkey');
        return this.rows.find((r) => r.key === key);
    }

    /** @param {Event} event */
    onClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('[data-kp-passkeys-retry]')) this.host.dispatchEvent(new CustomEvent(PASSKEYS_RETRY_EVENT, { bubbles: true }));
        if (target.closest('[data-kp-passkeys-register]')) this.host.dispatchEvent(new CustomEvent(PASSKEYS_REGISTER_EVENT, { bubbles: true }));
        const act = /** @type {HTMLElement | null} */ (target.closest('[data-kp-passkeys-act]'));
        if (!act) return;
        const row = this.rowAround(act);
        if (!row) return;
        const what = act.getAttribute('data-kp-passkeys-act');
        if (what === 'remove') this.askRemove(row, act);
        else if (what === 'rename') this.startRename(row);
        else if (what === 'cancel') this.stopRename(row.key, true);
        else if (what === 'save') void this.saveRename(row);
    }

    /** Enter saves a rename, Escape drops it. @param {KeyboardEvent} event */
    onKeydown(event) {
        const input = event.target instanceof HTMLInputElement && event.target.matches('.kp-passkeys__rename-input') ? event.target : null;
        if (!input) return;
        const row = this.rowAround(input);
        if (!row) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            void this.saveRename(row);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.stopRename(row.key, true);
        }
    }

    /** Ask before removing: a dialog, or the exact name typed for the one in use and the last way in. @param {import('./constants.js').PasskeyRow} row @param {HTMLElement} button */
    askRemove(row, button) {
        const options = passkeyOptions(this.host, this.spec);
        const strings = getStrings();
        if (this.busy.has(row.key)) return;
        const last = this.isLast();
        if (last && options.protectLast === 'refuse') return;
        const typed = options.confirm === 'type-name' || Boolean(row.current) || (last && options.protectLast === 'confirm');
        const loses = [strings.passkeysLosesWay(row.label)];
        if (last) loses.push(strings.passkeysLosesLast);
        else if (row.current) loses.push(strings.passkeysLosesCurrent);
        openConfirmation(button, {
            phrase: strings.passkeysRemoveTitle(row.label),
            acceptLabel: strings.passkeysRemove,
            ...(typed ? { typeName: row.label, loses } : {}),
            onAccept: () => void this.removeWay(row),
        });
    }

    /** Remove a way: the page's `remove`, or the cancelable event; a rejection is shown on the row. @param {import('./constants.js').PasskeyRow} row */
    async removeWay(row) {
        const strings = getStrings();
        this.busy.add(row.key);
        this.refused.delete(row.key);
        draw(this);
        try {
            const given = this.spec.remove;
            if (given) await given(row);
            else {
                const go = this.host.dispatchEvent(new CustomEvent(PASSKEYS_REMOVE_EVENT, { bubbles: true, cancelable: true, detail: { key: row.key, row } }));
                // The page does the removal itself and draws the list again.
                if (!go) {
                    this.busy.delete(row.key);
                    return;
                }
            }
            // The list updates at once.
            this.rows = this.rows.filter((r) => r.key !== row.key);
            this.busy.delete(row.key);
            this.announce = strings.passkeysRemoved(row.label);
            if (this.rows.length === 0) this.spec = { ...this.spec, state: 'empty' };
            draw(this);
        } catch (error) {
            this.busy.delete(row.key);
            this.refused.set(row.key, strings.passkeysRefused(reasonOf(error, strings.passkeysRefusedFallback)));
            draw(this);
            actionOf(this.host, row.key, 'remove')?.focus();
        }
    }

    /** @param {import('./constants.js').PasskeyRow} row */
    startRename(row) {
        if (this.busy.has(row.key)) return;
        this.renaming = row.key;
        this.refused.delete(row.key);
        draw(this);
        const input = /** @type {HTMLInputElement | null} */ (this.host.querySelector('.kp-passkeys__rename-input'));
        input?.focus();
        input?.select();
    }

    /** @param {string} key @param {boolean} focus whether the Rename button takes the focus back */
    stopRename(key, focus) {
        this.renaming = null;
        draw(this);
        if (focus) actionOf(this.host, key, 'rename')?.focus();
    }

    /** The rename field, when one is drawn. */
    renameInput() {
        return /** @type {HTMLInputElement | null} */ (this.host.querySelector('.kp-passkeys__rename-input'));
    }

    /** Save the new name: the page's `rename`, or the cancelable event; an empty name is refused, an unchanged one just closes. @param {import('./constants.js').PasskeyRow} row */
    async saveRename(row) {
        const strings = getStrings();
        const input = this.renameInput();
        if (!input) return;
        const label = input.value.trim();
        if (label === '') {
            this.refused.set(row.key, strings.passkeysNameRequired);
            draw(this);
            this.renameInput()?.focus();
            return;
        }
        if (label === row.label) {
            this.stopRename(row.key, true);
            return;
        }
        this.busy.add(row.key);
        draw(this);
        try {
            const given = this.spec.rename;
            if (given) await given(row, label);
            else this.host.dispatchEvent(new CustomEvent(PASSKEYS_RENAME_EVENT, { bubbles: true, cancelable: true, detail: { key: row.key, row, label } }));
            this.rows = this.rows.map((r) => (r.key === row.key ? { ...r, label } : r));
            this.busy.delete(row.key);
            this.refused.delete(row.key);
            this.announce = strings.passkeysRenamed(label);
            this.stopRename(row.key, true);
        } catch (error) {
            this.busy.delete(row.key);
            this.refused.set(row.key, strings.passkeysRenameRefused(reasonOf(error, strings.passkeysRefusedFallback)));
            draw(this);
            this.renameInput()?.focus();
        }
    }
}
