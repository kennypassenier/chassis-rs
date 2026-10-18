// A card in four data states [kpadopt4-rows; JobTracker's `Card` with
// `state` and `body={filled, empty, loading, error}`, homelab's `failBox`].
//
// A card that shows data read from somewhere is in one of four states, and
// it keeps its place and its size in all of them (UI principles: "loading,
// empty, error and filled take the same footprint"):
//
//   <section class="kp-card" data-kp-state="loading" aria-labelledby="files-t">
//       <div class="kp-card__header">
//           <h2 class="kp-card__title" id="files-t">Files</h2>
//           <div class="kp-card__actions">…the card's tools…</div>
//       </div>
//       <p class="kp-card__body">Everything in this application's folder.</p>
//       <div class="kp-card__stage">
//           <div class="kp-card__data">…the data, drawn by the page…</div>
//       </div>
//   </section>
//
// The stage holds the data and, on top of it in the same grid cell, the
// state's note, so a state never moves the header, the footer or the card
// beside it:
//
//   loading  the data table's own loading card (js/busy-card.js) centred over
//            the stage, the data under it dimmed and inert (stale data stays
//            readable while it is read again); the stage keeps at least
//            `--kp-card-stage-min` so a first load has room for the card;
//   empty    the package's empty state (`.kp-empty`) filling the stage: a
//            title, a sentence and an optional action;
//   error    the destructive alert: what could not be read, why, and Try
//            again, which fires `kp-card-retry` on the card;
//   ready    the data.
//
// In empty and error the data keeps its room (hidden, not removed), so a
// failed refresh of a full card does not collapse it; clear the data when it
// no longer holds and the stage falls back to its least height. The page decides what
// a retry is (usually: set loading, read again, set ready). When the focused
// Try again goes with its state, the focus moves to the stage, so the
// keyboard keeps its place.
//
// setCardState(card, state, { words, title, text, action }) is the way in for
// a page that draws with the DOM; a framework that writes `data-kp-state`
// itself is followed by attachCardStates(root), and may render its own note
// inside `.kp-card__state` (the module then leaves its content alone). Every
// word the module adds is in js/strings.js.

import { openBusyCard } from './busy-card.js';
import { getStrings } from './strings.js';

/** The cards this module looks after. */
export const CARD_STATE = '.kp-card[data-kp-state]';
/** The four states, in the order a read goes through them. */
export const CARD_STATES = /** @type {const} */ (['loading', 'empty', 'error', 'ready']);
/** Fired on the card, bubbling, when its state changed after attach: `{ card, state, previous }`. */
export const CARD_STATE_EVENT = 'kp-card-state';
/** Fired on the card, bubbling, when its Try again is pressed: `{ card }`. */
export const CARD_RETRY_EVENT = 'kp-card-retry';

/**
 * @typedef {'loading' | 'empty' | 'error' | 'ready'} CardState
 * @typedef {object} CardStateOptions
 * @property {string} [words] what the loading card says under its spinner (default `cardLoading`, or the card's `data-kp-loading-words`)
 * @property {string} [title] the empty or error note's first line, in bold: "No appointments yet", "Could not list the files"
 * @property {string} [text] its sentence: why, or what fills it
 * @property {Node | null} [action] a button or link under an empty note ("Add an appointment"); an error note always has Try again
 * @property {boolean} [retry] false leaves Try again out of an error note (a read the page cannot repeat)
 */

/** The state each card was last synced to. @type {WeakMap<Element, CardState>} */
const synced = new WeakMap();
/** The busy card of each loading card. @type {WeakMap<Element, import('./busy-card.js').BusyCard>} */
const cards = new WeakMap();
/** The cards drawn once already: the first loading card does not arrive. @type {WeakSet<Element>} */
const drawn = new WeakSet();
/** The options a card's note was last built from. @type {WeakMap<Element, CardStateOptions>} */
const given = new WeakMap();

/** @param {unknown} state @returns {CardState} */
const known = (state) => (CARD_STATES.includes(/** @type {any} */ (state)) ? /** @type {CardState} */ (state) : 'ready');

/** @param {Document} doc @param {string} className @param {string} [tag] */
const el = (doc, className, tag = 'div') => {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
};

/**
 * The card's stage, its data area and its note, made where they are missing.
 * @param {HTMLElement} card
 */
function partsOf(card) {
    const doc = card.ownerDocument;
    let stage = /** @type {HTMLElement | null} */ (card.querySelector(':scope > .kp-card__stage'));
    if (!stage) {
        stage = el(doc, 'kp-card__stage');
        const footer = card.querySelector(':scope > .kp-card__footer');
        if (footer) footer.before(stage);
        else card.append(stage);
    }
    let data = /** @type {HTMLElement | null} */ (stage.querySelector(':scope > .kp-card__data'));
    if (!data) {
        data = el(doc, 'kp-card__data');
        stage.prepend(data);
    }
    let note = /** @type {HTMLElement | null} */ (stage.querySelector(':scope > .kp-card__state'));
    if (!note) {
        note = el(doc, 'kp-card__state');
        note.setAttribute('data-kp-card-built', '');
        stage.append(note);
    }
    return { stage, data, note };
}

/**
 * Write the empty or error note, unless the page drew its own.
 * @param {HTMLElement} note
 * @param {'empty' | 'error'} state
 * @param {CardStateOptions} options
 */
function buildNote(note, state, options) {
    if (!note.hasAttribute('data-kp-card-built')) return;
    const doc = note.ownerDocument;
    const s = getStrings();
    const title = el(doc, 'kp-card__state-title', 'strong');
    title.textContent = options.title ?? (state === 'error' ? s.cardFailed : s.cardEmpty);
    /** @type {HTMLElement[]} */
    const lines = [title];
    if (options.text) {
        const text = el(doc, 'kp-card__state-text', 'span');
        text.textContent = options.text;
        lines.push(text);
    }
    if (state === 'empty') {
        const box = el(doc, 'kp-empty kp-card__empty');
        box.append(...lines);
        if (options.action) {
            const actions = el(doc, 'kp-card__state-actions');
            actions.append(options.action);
            box.append(actions);
        }
        note.setAttribute('role', 'status');
        note.replaceChildren(box);
        return;
    }
    const alert = el(doc, 'kp-alert kp-alert--destructive kp-card__failure');
    const body = el(doc, 'kp-alert__body');
    body.append(...lines);
    alert.append(body);
    if (options.retry !== false) {
        const button = el(doc, 'kp-button kp-button--sm kp-card__retry', 'button');
        /** @type {HTMLButtonElement} */ (button).type = 'button';
        button.setAttribute('data-kp-card-retry', '');
        button.textContent = s.cardRetry;
        alert.append(button);
    }
    note.setAttribute('role', 'alert');
    note.replaceChildren(alert);
}

/**
 * Bring a card's parts, its loading card and its note in step with its
 * `data-kp-state`, and tell the page when it changed.
 * @param {HTMLElement} card
 * @param {{ announce?: boolean, options?: CardStateOptions }} [how]
 * @returns {CardState}
 */
function syncCard(card, { announce = false, options } = {}) {
    const state = known(card.getAttribute('data-kp-state'));
    if (card.getAttribute('data-kp-state') !== state) card.setAttribute('data-kp-state', state);
    const { stage, data, note } = partsOf(card);
    const previous = synced.get(card);
    const opts = options ?? given.get(card) ?? {};
    if (options) given.set(card, options);

    // The focus leaves a part that is about to be hidden or made inert, for the stage.
    const doc = card.ownerDocument;
    const active = doc.activeElement;
    const leaving = active instanceof HTMLElement && ((state !== 'ready' && data.contains(active)) || (note.contains(active) && previous !== state));
    if (leaving) {
        stage.tabIndex = -1;
        stage.focus({ preventScroll: true });
    }

    const loading = state === 'loading';
    data.toggleAttribute('inert', loading);
    if (loading) data.setAttribute('aria-busy', 'true');
    else data.removeAttribute('aria-busy');

    if (state === 'empty' || state === 'error') {
        if (previous !== state || options || !note.hasChildNodes()) buildNote(note, state, opts);
        note.hidden = false;
    } else {
        note.hidden = true;
        if (note.hasAttribute('data-kp-card-built')) {
            note.removeAttribute('role');
            note.replaceChildren();
        }
    }

    const busy = cards.get(card);
    if (loading && !busy) {
        const words = opts.words ?? card.getAttribute('data-kp-loading-words') ?? getStrings().cardLoading;
        cards.set(card, openBusyCard(stage, { words, area: () => [stage], className: 'kp-card__busy', arrive: drawn.has(card) }));
    } else if (!loading && busy) {
        cards.delete(card);
        void busy.close();
    }
    drawn.add(card);

    synced.set(card, state);
    if (announce && previous !== undefined && previous !== state)
        card.dispatchEvent(new CustomEvent(CARD_STATE_EVENT, { bubbles: true, detail: { card, state, previous } }));
    return state;
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
    return syncCard(card, { announce: true, options });
}

/**
 * Sync every card with a `data-kp-state` under `root`, follow the attribute
 * later, and turn a press on Try again into `kp-card-retry`. A card rendered
 * after this ran is attached by calling it on that subtree.
 * @param {ParentNode} [root]
 * @returns {() => void} detach: stops following; a loading card's busy card is taken out
 */
export function attachCardStates(root = document) {
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(CARD_STATE) ? [root] : []),
        ...root.querySelectorAll(CARD_STATE),
    ]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const card of found) {
        syncCard(card);
        /** @param {Event} event */
        const press = (event) => {
            const button = event.target instanceof Element ? event.target.closest('[data-kp-card-retry]') : null;
            if (!button || !card.contains(button) || button.closest('.kp-card') !== card) return;
            card.dispatchEvent(new CustomEvent(CARD_RETRY_EVENT, { bubbles: true, detail: { card } }));
        };
        card.addEventListener('click', press);
        undo.push(() => card.removeEventListener('click', press));
    }
    const watch =
        typeof MutationObserver === 'undefined' || found.length === 0
            ? null
            : new MutationObserver((records) => {
                  for (const record of records) {
                      const card = /** @type {HTMLElement} */ (record.target);
                      if (synced.get(card) !== card.getAttribute('data-kp-state')) syncCard(card, { announce: true });
                  }
              });
    for (const card of found) watch?.observe(card, { attributes: true, attributeFilter: ['data-kp-state'] });
    return () => {
        watch?.disconnect();
        undo.forEach((u) => u());
        for (const card of found) {
            cards.get(card)?.remove();
            cards.delete(card);
        }
    };
}
