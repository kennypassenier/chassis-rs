// One bullet list: its clicks, the state it was drawn in, and the drawing of the loading, empty, error and ready states.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { openBusyCard } from '../busy-card.js';
import { buildNote } from './note.js';
import { buildRow } from './row.js';
import { waitingList } from './waiting.js';
import { make } from './make.js';
import { BULLETS_PICK_EVENT, BULLETS_RETRY_EVENT, DEFAULT_LOADING_ROWS, DEFAULT_MAX_THRESHOLDS } from './values.js';

/** @typedef {import('../bullets.js').BulletsSpec} BulletsSpec */

export class BulletList extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        this.doc = host.ownerDocument;
        /** What the list remembers between draws: the rows shown last, whether they had leads, the busy card and the height. */
        this.rows = DEFAULT_LOADING_ROWS;
        this.leads = false;
        /** @type {import('../busy-card.js').BusyCard | null} */
        this.card = null;
        this.drawn = false;
        /** The spec waiting for the busy card to go. @type {BulletsSpec | null} */
        this.pending = null;
        this.height = 0;
    }

    connect() {
        this.listen(this.host, 'click', (event) => this.onClick(event));
    }

    /** @param {Event} event */
    onClick(event) {
        const el = this.host;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-kp-bullets-retry]')) el.dispatchEvent(new CustomEvent(BULLETS_RETRY_EVENT, { bubbles: true }));
        const pick = /** @type {HTMLElement | null} */ (target?.closest('button.kp-bullets__link'));
        if (pick) el.dispatchEvent(new CustomEvent(BULLETS_PICK_EVENT, { bubbles: true, detail: { key: pick.dataset.kpBulletsKey } }));
    }

    /**
     * Draw (or redraw) the list.
     * @param {BulletsSpec} spec
     */
    set(spec) {
        const el = this.host;
        el.classList.add('kp-bullets');
        el.setAttribute('data-kp-bullets', '');
        if ((spec.state ?? 'ready') === 'loading') {
            this.pending = null;
            this.drawLoading(spec);
            return;
        }
        // Leaving the loading state: the data is drawn once the card has gone, so nothing stands under a card on its way out.
        if (this.card) {
            const card = this.card;
            this.card = null;
            this.pending = spec;
            void card.close().then(() => {
                if (this.pending !== spec) return;
                this.pending = null;
                this.draw(spec);
            });
            return;
        }
        this.draw(spec);
    }

    /** @param {BulletsSpec} spec */
    drawLoading(spec) {
        const el = this.host;
        el.setAttribute('aria-busy', 'true');
        el.setAttribute('data-kp-state', 'loading');
        const leads = this.leads || (spec.rows ?? []).some((row) => row.lead !== undefined);
        const list = waitingList(this.doc, spec.loadingRows ?? this.rows, leads);
        const keep = this.card?.layer;
        for (const child of [...el.childNodes]) if (child !== keep) child.remove();
        el.prepend(list);
        if (this.card) {
            this.card.place();
            return;
        }
        this.card = openBusyCard(el, {
            words: spec.loadingWords ?? getStrings().bulletsLoading,
            // The list as it stands now: a second loading call draws a new list under the same card.
            area: () => [el.querySelector(':scope > .kp-bullets__list') ?? list],
            className: 'kp-bullets__busy',
            arrive: this.drawn,
        });
        this.drawn = true;
    }

    /** @param {BulletsSpec} spec */
    draw(spec) {
        const el = this.host;
        const state = spec.state ?? 'ready';
        const rows = [...(spec.rows ?? [])];
        el.removeAttribute('aria-busy');
        this.drawn = true;
        const focusedKey = /** @type {HTMLElement | null} */ (el.querySelector('.kp-bullets__link:focus'))?.dataset.kpBulletsKey;
        if (state === 'error' || state === 'empty' || rows.length === 0) this.drawNote(spec, state === 'error');
        else this.drawRows(spec, rows, focusedKey);
    }

    /** @param {BulletsSpec} spec @param {boolean} failed */
    drawNote(spec, failed) {
        const el = this.host;
        el.setAttribute('data-kp-state', failed ? 'error' : 'empty');
        // The note takes the list's whole footprint: the height the rows (or the note before it) had.
        const was = el.querySelector(':scope > :is(.kp-bullets__list, .kp-bullets__note)')?.getBoundingClientRect().height ?? 0;
        this.height = Math.max(was, this.height);
        // A focused Retry that goes with its note leaves the focus on the list, so the keyboard keeps its place.
        const refocus = el.querySelector(':scope > .kp-bullets__note')?.contains(this.doc.activeElement) ?? false;
        el.replaceChildren(buildNote(this.doc, spec, getStrings(), failed, this.height));
        if (refocus) {
            el.tabIndex = -1;
            el.focus({ preventScroll: true });
        }
    }

    /** @param {BulletsSpec} spec @param {import('./row.js').BulletRow[]} rows @param {string | undefined} focusedKey */
    drawRows(spec, rows, focusedKey) {
        const el = this.host;
        el.setAttribute('data-kp-state', 'ready');
        const { threshold } = spec;
        const format =
            spec.format ??
            ((/** @type {number} */ value) => new Intl.NumberFormat(/** @type {HTMLElement | null} */ (el.closest('[lang]'))?.lang || undefined).format(value));
        if (spec.sort !== 'none') rows.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
        this.rows = rows.length;
        this.leads = rows.some((row) => row.lead !== undefined);
        const ctx = { threshold, max: spec.max ?? threshold * DEFAULT_MAX_THRESHOLDS, bad: spec.bad, format, leads: this.leads, strings: getStrings() };
        const list = make(this.doc, 'kp-bullets__list', 'ul');
        for (const row of rows) list.append(buildRow(this.doc, row, ctx));
        el.replaceChildren(list);
        this.height = list.getBoundingClientRect().height;
        if (focusedKey !== undefined)
            /** @type {HTMLElement | null} */ (
                [...el.querySelectorAll('.kp-bullets__link')].find((link) => /** @type {HTMLElement} */ (link).dataset.kpBulletsKey === focusedKey)
            )?.focus();
    }
}
