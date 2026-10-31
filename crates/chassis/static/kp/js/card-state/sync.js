// A card's state: the parts, the loading card and the note brought in step with `data-kp-state`, per card and kept before any attach.

import { openBusyCard } from '../busy-card.js';
import { getStrings } from '../strings.js';
import { CARD_STATES, CARD_STATE_EVENT } from './values.js';
import { partsOf } from './parts.js';
import { buildNote } from './note.js';

/** @typedef {import('../card-state.js').CardState} CardState */
/** @typedef {import('../card-state.js').CardStateOptions} CardStateOptions */

/** @param {unknown} state @returns {CardState} */
const known = (state) => (CARD_STATES.includes(/** @type {any} */ (state)) ? /** @type {CardState} */ (state) : 'ready');

/** What one card remembers between syncs: its last state, its busy card, whether it was drawn, the options of its note. */
export class CardSync {
    /** @param {HTMLElement} card */
    constructor(card) {
        this.card = card;
        /** The state the card was last synced to. @type {CardState | undefined} */
        this.state = undefined;
        /** The busy card of a loading card. @type {import('../busy-card.js').BusyCard | undefined} */
        this.busy = undefined;
        /** Whether the card was drawn once already: the first loading card does not arrive. */
        this.drawn = false;
        /** The options the card's note was last built from. @type {CardStateOptions | undefined} */
        this.given = undefined;
    }

    /**
     * Bring the card's parts, its loading card and its note in step with its
     * `data-kp-state`, and tell the page when it changed.
     * @param {{ announce?: boolean, options?: CardStateOptions }} [how]
     * @returns {CardState}
     */
    sync({ announce = false, options } = {}) {
        const { card } = this;
        const state = known(card.getAttribute('data-kp-state'));
        if (card.getAttribute('data-kp-state') !== state) card.setAttribute('data-kp-state', state);
        const parts = partsOf(card);
        const previous = this.state;
        const opts = options ?? this.given ?? {};
        if (options) this.given = options;

        this.leaveFocus(parts, state, previous);
        const loading = state === 'loading';
        parts.data.toggleAttribute('inert', loading);
        if (loading) parts.data.setAttribute('aria-busy', 'true');
        else parts.data.removeAttribute('aria-busy');
        this.showNote(parts.note, state, previous, options, opts);
        this.syncBusy(parts.stage, loading, opts);
        this.drawn = true;

        this.state = state;
        if (announce && previous !== undefined && previous !== state)
            card.dispatchEvent(new CustomEvent(CARD_STATE_EVENT, { bubbles: true, detail: { card, state, previous } }));
        return state;
    }

    /**
     * The focus leaves a part that is about to be hidden or made inert, for the stage.
     * @param {{ stage: HTMLElement, data: HTMLElement, note: HTMLElement }} parts
     * @param {CardState} state
     * @param {CardState | undefined} previous
     */
    leaveFocus({ stage, data, note }, state, previous) {
        const active = this.card.ownerDocument.activeElement;
        const leaving = active instanceof HTMLElement && ((state !== 'ready' && data.contains(active)) || (note.contains(active) && previous !== state));
        if (!leaving) return;
        stage.tabIndex = -1;
        stage.focus({ preventScroll: true });
    }

    /**
     * @param {HTMLElement} note
     * @param {CardState} state
     * @param {CardState | undefined} previous
     * @param {CardStateOptions | undefined} options the options this sync was given, if any
     * @param {CardStateOptions} opts the options the note is built from
     */
    showNote(note, state, previous, options, opts) {
        if (state === 'empty' || state === 'error') {
            if (previous !== state || options || !note.hasChildNodes()) buildNote(note, state, opts);
            note.hidden = false;
            return;
        }
        note.hidden = true;
        if (note.hasAttribute('data-kp-card-built')) {
            note.removeAttribute('role');
            note.replaceChildren();
        }
    }

    /** A loading card gets the busy card over its stage; leaving the state takes it out. @param {HTMLElement} stage @param {boolean} loading @param {CardStateOptions} opts */
    syncBusy(stage, loading, opts) {
        if (loading && !this.busy) {
            const words = opts.words ?? this.card.getAttribute('data-kp-loading-words') ?? getStrings().cardLoading;
            this.busy = openBusyCard(stage, { words, area: () => [stage], className: 'kp-card__busy', arrive: this.drawn });
        } else if (!loading && this.busy) {
            const busy = this.busy;
            this.busy = undefined;
            void busy.close();
        }
    }

    /** Take the busy card out at once (a detach), without its leaving motion. */
    dropBusy() {
        this.busy?.remove();
        this.busy = undefined;
    }
}

/** The sync of each card, made at the first look. @type {WeakMap<Element, CardSync>} */
const syncs = new WeakMap();

/**
 * The sync of a card, made when it has none.
 * @param {HTMLElement} card
 * @returns {CardSync}
 */
export function syncOf(card) {
    let sync = syncs.get(card);
    if (!sync) syncs.set(card, (sync = new CardSync(card)));
    return sync;
}

/**
 * Put a card in a state. The options are kept for the card, so a later
 * `data-kp-state` change written by a framework builds the same note.
 * @param {HTMLElement} card a `.kp-card`
 * @param {CardState} state
 * @param {CardStateOptions} [options]
 * @returns {CardState}
 */
export function setCardState(card, state, options) {
    card.setAttribute('data-kp-state', known(state));
    return syncOf(card).sync({ announce: true, options });
}
