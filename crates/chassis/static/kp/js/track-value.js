// The tracked value of a custom control: what the unsaved-changes bar counts for a control that is not a form field [forms-1102].
//
// The bar (js/unsaved.js) counts inputs, selects, text areas and the package's quantity, time field and tag input. A control
// a page builds itself (a chip group, a colour row, a drawing) holds its value in its own state, so the bar never saw it change
// and Discard could not put it back. Such a control now says what it holds in one attribute, and the bar does the rest:
//
//   <div class="my-swatches" data-kp-track-value="sage" data-kp-track-text="Sage green"> … </div>
//
//   data-kp-track-value    what the control holds now, as a string (a list or an object as JSON)
//   data-kp-track-text     the same in words, for the bar's list of changes ("Sage green"); the value itself when absent
//   data-kp-track-default  the saved value the bar compares with; written once by setTrackValue(…, { initial: true }), or in
//                          the markup, and moved by the bar after a save. Absent: the value the control first had
//   data-kp-track-default-text  the saved value in words, written with it
//
// The control calls setTrackValue(el, value, { text }) after a person changed it: the attributes move and `kp-track-change`
// bubbles from the control, which the bar hears as it hears `input`. Discard, Revert and Undo write the old value back with
// writeTrackValue(): the attributes move and `kp-track-write` `{ value }` fires on the control, which repaints itself from the
// value (onTrackWrite(el, fn) listens for it). A control inside another tracked control is counted with its outer one.
//
// The package's own chip group, weekday picker and repeating row editor do this themselves once the attribute is on them
// (write `data-kp-track-value` with no value; the control fills it in). Without the attribute nothing changes for them.
//
// Nothing runs on import. No storage, no network: the attribute is the whole contract.

/** What a tracked control holds now. */
export const TRACK_VALUE = 'data-kp-track-value';
/** The same in words, for the list of changes. */
export const TRACK_TEXT = 'data-kp-track-text';
/** The saved value the bar compares with. */
export const TRACK_DEFAULT = 'data-kp-track-default';
/** The saved value in words, written with it when the control gives words. */
export const TRACK_DEFAULT_TEXT = 'data-kp-track-default-text';
/** Any tracked control. */
export const TRACKED = `[${TRACK_VALUE}]`;
/** Fired (bubbling) on a tracked control after a person changed it: `{ value, text }`. */
export const TRACK_EVENT = 'kp-track-change';
/** Fired on a tracked control when its value is written back from outside (Discard, Revert, Undo, a kept draft): `{ value }`. */
export const TRACK_WRITE_EVENT = 'kp-track-write';

/** Whether an element is a tracked control. @param {Element} el */
export const isTracked = (el) => el.hasAttribute(TRACK_VALUE);

/** What a tracked control holds now ('' when it says nothing yet). @param {Element} el */
export const readTrackValue = (el) => el.getAttribute(TRACK_VALUE) ?? '';

/** What a tracked control's value reads as in words. @param {Element} el */
export const readTrackText = (el) => el.getAttribute(TRACK_TEXT) ?? readTrackValue(el);

/**
 * The outermost tracked control around a node (itself included), or null: a control inside another counts with the outer one.
 * @param {Element} node
 * @returns {HTMLElement | null}
 */
export function outerTracked(node) {
    /** @type {HTMLElement | null} */
    let found = null;
    for (let at = /** @type {Element | null} */ (node); at; at = at.parentElement?.closest(TRACKED) ?? null) {
        if (at.matches(TRACKED)) found = /** @type {HTMLElement} */ (at);
    }
    return found;
}

/**
 * Say what a control holds. With `announce` (the default) `kp-track-change` bubbles from it, as a person's change; without it
 * the attributes move silently (the page set the control, nothing was changed by a person). `initial` also writes the saved
 * value, unless the markup already holds one.
 * @param {HTMLElement} el
 * @param {string} value
 * @param {{ text?: string, announce?: boolean, initial?: boolean }} [options]
 */
export function setTrackValue(el, value, { text, announce = true, initial = false } = {}) {
    el.setAttribute(TRACK_VALUE, value);
    if (text === undefined || text === value) el.removeAttribute(TRACK_TEXT);
    else el.setAttribute(TRACK_TEXT, text);
    if (initial && !el.hasAttribute(TRACK_DEFAULT)) {
        el.setAttribute(TRACK_DEFAULT, value);
        if (text !== undefined && text !== value) el.setAttribute(TRACK_DEFAULT_TEXT, text);
    }
    if (announce) el.dispatchEvent(new CustomEvent(TRACK_EVENT, { bubbles: true, detail: { value, text: text ?? value } }));
}

/**
 * Write a value back into a tracked control from outside: the attribute moves and `kp-track-write` asks the control to show it.
 * A control that does not listen keeps its look; that is the page's to wire (onTrackWrite).
 * @param {HTMLElement} el
 * @param {string} value
 */
export function writeTrackValue(el, value) {
    el.setAttribute(TRACK_VALUE, value);
    el.removeAttribute(TRACK_TEXT);
    el.dispatchEvent(new CustomEvent(TRACK_WRITE_EVENT, { detail: { value } }));
}

/**
 * Listen for a value written back into a control (Discard, Revert, Undo). The handler repaints the control from the value and
 * may call setTrackValue(el, value, { text, announce: false }) to give the words back.
 * @param {HTMLElement} el
 * @param {(value: string) => void} handler
 * @returns {() => void} detach
 */
export function onTrackWrite(el, handler) {
    const listener = (/** @type {Event} */ event) => {
        if (event.target === el) handler(String(/** @type {CustomEvent} */ (event).detail?.value ?? ''));
    };
    el.addEventListener(TRACK_WRITE_EVENT, listener);
    return () => el.removeEventListener(TRACK_WRITE_EVENT, listener);
}
