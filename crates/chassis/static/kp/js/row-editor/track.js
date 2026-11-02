// A row editor's tracked value [forms-1102]: with `data-kp-track-value` on the editor (written empty by the page), the rows and
// what their fields hold are one value the unsaved-changes bar counts, and Discard or Undo put the rows back as they were.
//
// The value is a JSON list with one list per row: the values of the row's fields in order (a time "08:00", a quantity "2", a
// weekday picker's "1,4" once it carries `data-kp-track-value` itself, a plain field's value). The words name each row's values
// ("08:00 Mon and Thu 1; 20:00 Every day 2"). Written back, the editor gets that many rows (added or taken away quietly, the
// focus stays where it is) and each field its value through the bar's own setter, once the new rows' controls are attached.

import { TRACK_EVENT, TRACK_TEXT, TRACK_VALUE, onTrackWrite, readTrackText, isTracked, setTrackValue } from '../track-value.js';
import { CONTROL } from '../unsaved/config.js';
import { WIDGET, WIDGET_EVENTS, showWidget } from '../unsaved/widgets.js';
import { fire, readValue, writeValue } from '../unsaved/values.js';
import { numberRow } from './dom.js';

/** The events after which the value is read again. */
const EDITS = ['input', 'change', 'kp-rows-change', ...WIDGET_EVENTS];

/** The fields of a row that count, outermost first: a field inside a composite field counts with it. @param {HTMLElement} row */
function fieldsOf(row) {
    const all = /** @type {HTMLElement[]} */ ([...row.querySelectorAll(`${CONTROL}, ${WIDGET}`)]);
    return all.filter((field) => {
        const outer = field.parentElement?.closest(WIDGET);
        return !outer || !row.contains(outer);
    });
}

/** A field's value in words. @param {HTMLElement} field */
const wordsOf = (field) => (isTracked(field) ? readTrackText(field) : showWidget(field, readValue(/** @type {HTMLInputElement} */ (field))));

/** The value and the words of the editor now. @param {import('../row-editor.js').RowEditor} editor */
function readRows(editor) {
    const rows = editor.rows().map((row) => fieldsOf(row));
    const value = JSON.stringify(rows.map((fields) => fields.map((f) => readValue(/** @type {HTMLInputElement} */ (f)))));
    const text = rows.map((fields) => fields.map(wordsOf).filter(Boolean).join(' ')).join('; ');
    return { value, text };
}

/** Bring the editor to `count` rows without moving the focus or saying anything; resolves once new rows are attached. @param {import('../row-editor.js').RowEditor} editor @param {number} count */
async function fitRows(editor, count) {
    const waits = [];
    for (const row of editor.rows().slice(count)) {
        editor.inside.get(row)?.();
        editor.inside.delete(row);
        row.remove();
    }
    const template = editor.template();
    while (template && editor.rows().length < count) {
        const row = /** @type {HTMLElement} */ (template.content.firstElementChild?.cloneNode(true));
        editor.serial += 1;
        numberRow(row, editor.serial);
        editor.list.append(row);
        waits.push(editor.wire(row));
    }
    editor.sync();
    await Promise.all(waits);
}

/** Put a written-back value into the rows. @param {import('../row-editor.js').RowEditor} editor @param {string} raw */
async function writeRows(editor, raw) {
    /** @type {unknown} */
    let parsed;
    try {
        parsed = JSON.parse(raw || '[]');
    } catch {
        console.warn('kp-rows: a written-back value is not JSON; the rows stay as they are', raw);
        return;
    }
    const rows = Array.isArray(parsed) ? parsed : [];
    await fitRows(editor, rows.length);
    editor.rows().forEach((row, at) => {
        const values = Array.isArray(rows[at]) ? rows[at] : [];
        fieldsOf(row).forEach((field, i) => {
            if (values[i] === undefined || readValue(/** @type {HTMLInputElement} */ (field)) === String(values[i])) return;
            writeValue(/** @type {HTMLInputElement} */ (field), String(values[i]));
            fire(field);
        });
    });
    track(editor, false);
    // The words of a new row's pickers come once they are attached: read once more on the next frame.
    requestAnimationFrame(() => track(editor, false));
}

/** Write the value into the attribute; `announce` for a person's change. @param {import('../row-editor.js').RowEditor} editor @param {boolean} announce */
function track(editor, announce) {
    const { value, text } = readRows(editor);
    setTrackValue(editor.host, value, { text, announce, initial: true });
}

/**
 * Keep a row editor's tracked value, when the page asked for it with `data-kp-track-value`.
 * @param {import('../row-editor.js').RowEditor} editor
 * @returns {() => void} detach
 */
export function trackRows(editor) {
    const host = editor.host;
    if (!host.hasAttribute(TRACK_VALUE)) return () => {};
    /** @type {Array<() => void>} */
    const undo = [];
    let writing = false;
    const onEdit = (/** @type {Event} */ event) => {
        // Its own change event is the one thing it must not answer.
        if (!(event.type === TRACK_EVENT && event.target === host) && !writing) track(editor, true);
    };
    for (const type of EDITS) {
        host.addEventListener(type, onEdit);
        undo.push(() => host.removeEventListener(type, onEdit));
    }
    undo.push(
        onTrackWrite(host, (value) => {
            writing = true;
            void writeRows(editor, value).finally(() => (writing = false));
        }),
    );
    // A picker inside a row that writes its value late (it was attached after the row came) is read again; a value that moved is said.
    const late = new MutationObserver((records) => {
        if (writing || !records.some((r) => r.target !== host)) return;
        const before = host.getAttribute(TRACK_VALUE);
        const { value, text } = readRows(editor);
        setTrackValue(host, value, { text, announce: value !== before });
    });
    late.observe(host, { subtree: true, attributes: true, attributeFilter: [TRACK_VALUE, TRACK_TEXT] });
    undo.push(() => late.disconnect());
    // The controls inside the first rows are attached by the page's boot: read once they are.
    const frame = requestAnimationFrame(() => track(editor, false));
    undo.push(() => cancelAnimationFrame(frame));
    track(editor, false);
    return () => undo.forEach((fn) => fn());
}
