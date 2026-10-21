// A text box that knows its place in a configuration file [wish-1120, homelab 94; the hub's Files editor].
//
// A multiline field marked `data-kp-code-field` (YAML, TOML, INI, anything that is lines of text) shows where the caret is ("Line 3,
// column 12 · YAML"), numbers its lines in a gutter, indents with Tab, and marks the line a problem is on. It does not parse: a parser for
// YAML or TOML is not this package's to ship, so the page (or its server) says what is wrong, and the field draws it.
//
//   <textarea class="kp-field__input kp-field__input--multiline" id="conf" name="conf" data-kp-code-field="yaml" rows="10"></textarea>
//
//   area.addEventListener('kp-code-field-check', (event) => {
//       const problem = myParser(event.detail.value);                 // { line, column, message } or null
//       if (problem) event.detail.error(problem.line, problem.column, problem.message);
//   });
//   // or, later and from anywhere (a server answered):  setCodeFieldError(area, 3, 12, 'mapping values are not allowed here');
//   //                                                    setCodeFieldError(area, null);   // all well again
//
// The error marks its line in the gutter, says "Line 3, column 12: mapping values are not allowed here" under the field, holds the form back
// (`setCustomValidity`) and sets `aria-invalid`; a field inside a `.kp-field` with a `[data-kp-field-error]` slot puts the sentence there
// (js/forms.js). `kp-code-field-check` comes 300 ms after typing stops, on blur and once at attach; the error of the text before it is taken
// back at that moment, so a handler that finds nothing leaves the field clean. The field is drawn with the JSON field's look
// (`.kp-jsonfield`, js/json-field.js), so every theme already dresses it.
//
// Options, as attributes on the textarea (read again when they change):
//
//   data-kp-code-field   the language's name, printed in the readout: `yaml` | `toml` | `ini` | `json` | any word (default: none)
//   data-kp-code-check   `input` (default, debounced 300 ms) | `blur`
//   data-kp-code-indent  `2` (default) | `4` | `tab`: what Tab writes
//   data-kp-code-gutter  on by default; `false` takes the line numbers away
//   data-kp-code-wrap    long lines wrap (the gutter follows); default they scroll inside the field
//   data-kp-code-block   `false`: an error does not hold the form back (default: it does)
//   rows                 the least height in lines (default 6); the field grows with its text to 20
//
// Tab indents, Shift+Tab takes one indent off, Esc and then Tab leaves the field. Events (bubbling, on the textarea):
//   kp-code-field-check  { value, language, error(line, column, message) }   time to check the text
//   kp-code-field-state  { state, line, column, message }                    `ready` | `invalid`, when it changed
//   kp-code-field-caret  { line, column }                                    the caret moved to another line or column
// Nothing runs on import; attachCodeFields(root) returns a detach.

import { getStrings } from './strings.js';
import { showError, clearError } from './forms.js';

/** The fields this module looks after. */
export const CODE_FIELD = 'textarea[data-kp-code-field]';
/** Fired on the textarea, bubbling, when it is time to check the text: `{ value, language, error(line, column, message) }`. */
export const CODE_FIELD_CHECK_EVENT = 'kp-code-field-check';
/** Fired on the textarea, bubbling, when the field's state changed: `{ state, line, column, message }`, state `ready` or `invalid`. */
export const CODE_FIELD_STATE_EVENT = 'kp-code-field-state';
/** Fired on the textarea, bubbling, when the caret moved to another line or column: `{ line, column }`. */
export const CODE_FIELD_CARET_EVENT = 'kp-code-field-caret';
/** The debounce of the check while typing [ms]. */
export const CODE_FIELD_CHECK_MS = 300;
/** The most lines the field grows to. */
export const CODE_FIELD_MAX_ROWS = 20;

/**
 * @typedef {object} CodeFieldHandle
 * @property {() => { line: number, column: number }} position the caret's line and column, counted from 1
 * @property {(line: number | null, column?: number | null, message?: string) => void} setError mark the problem the page found; `null` takes it back
 * @property {() => void} check ask the page to check the text now
 * @property {() => { state: 'ready' | 'invalid', line: number | null, column: number | null, message: string }} state
 */

/** @type {WeakMap<Element, CodeFieldHandle>} */
const HANDLES = new WeakMap();
let serial = 0;

/**
 * The line and column (from 1) of an offset in a text.
 * @param {string} text @param {number} offset
 * @returns {{ line: number, column: number }}
 */
export function caretPosition(text, offset) {
    const before = text.slice(0, Math.max(0, offset));
    const line = before.split('\n').length;
    return { line, column: before.length - before.lastIndexOf('\n') };
}

/**
 * @param {HTMLTextAreaElement} area
 * @returns {() => void}
 */
function attachOne(area) {
    if (HANDLES.has(area)) return () => undefined;
    const doc = area.ownerDocument;
    const view = doc.defaultView;
    const strings = getStrings();
    const language = () => (area.getAttribute('data-kp-code-field') ?? '').trim();
    const getWhen = () => (area.getAttribute('data-kp-code-check') === 'blur' ? 'blur' : 'input');
    const getIndent = () => {
        const raw = area.getAttribute('data-kp-code-indent') ?? '2';
        return raw === 'tab' ? '\t' : ' '.repeat(raw === '4' ? 4 : 2);
    };
    const gutterWanted = () => area.getAttribute('data-kp-code-gutter') !== 'false';
    const blocks = () => area.getAttribute('data-kp-code-block') !== 'false';
    let wrap = area.hasAttribute('data-kp-code-wrap') && area.getAttribute('data-kp-code-wrap') !== 'false';
    const minRows = Math.max(2, Number(area.getAttribute('rows')) || 6);

    const id = area.id || (area.id = `kp-codefield-${(serial += 1)}`);
    const root = doc.createElement('div');
    root.className = 'kp-jsonfield kp-codefield';
    root.setAttribute('data-kp-json-wrap', String(wrap));
    root.toggleAttribute('data-kp-json-gutter', gutterWanted());
    const tools = doc.createElement('div');
    tools.className = 'kp-jsonfield__tools';
    const frame = doc.createElement('div');
    frame.className = 'kp-jsonfield__frame';
    const gutter = doc.createElement('div');
    gutter.className = 'kp-jsonfield__gutter';
    gutter.setAttribute('aria-hidden', 'true');
    gutter.setAttribute('data-label', strings.jsonGutter);
    const numbers = doc.createElement('div');
    numbers.className = 'kp-jsonfield__numbers';
    gutter.append(numbers);
    const status = doc.createElement('p');
    status.className = 'kp-jsonfield__status';
    status.id = `${id}-status`;
    status.setAttribute('role', 'status');
    const readout = doc.createElement('p');
    readout.className = 'kp-codefield__readout kp-field__help';
    readout.id = `${id}-readout`;
    const help = doc.createElement('p');
    help.className = 'kp-jsonfield__help kp-field__help';
    help.id = `${id}-help`;
    help.textContent = strings.jsonTabHint;
    const mirror = doc.createElement('div');
    mirror.className = 'kp-jsonfield__mirror';
    mirror.setAttribute('aria-hidden', 'true');

    /** @param {string} label @param {string} which */
    const tool = (label, which) => {
        const b = /** @type {HTMLButtonElement} */ (doc.createElement('button'));
        b.type = 'button';
        b.className = 'kp-button kp-button--sm kp-button--ghost';
        b.dataset.kpCodeTool = which;
        b.textContent = label;
        return b;
    };
    const toolWrap = tool(strings.jsonWrap, 'wrap');
    toolWrap.setAttribute('aria-pressed', String(wrap));
    const toolCopy = tool('', 'copy');
    const word = doc.createElement('span');
    word.className = 'kp-code__word';
    word.setAttribute('data-kp-code-words', [strings.jsonCopy, strings.copied, strings.copyBlocked].join('\n'));
    word.textContent = strings.jsonCopy;
    toolCopy.append(word);
    tools.append(toolWrap, toolCopy);

    area.before(root);
    frame.append(gutter, area, mirror);
    root.append(tools, frame, readout, status, help);
    const describedBefore = area.getAttribute('aria-describedby');
    area.setAttribute('aria-describedby', [describedBefore, readout.id, status.id, help.id].filter(Boolean).join(' '));
    area.setAttribute('spellcheck', 'false');
    area.setAttribute('autocapitalize', 'off');
    area.setAttribute('autocomplete', 'off');
    area.classList.add('kp-jsonfield__input');

    /** @type {{ line: number | null, column: number | null, message: string } | null} */
    let problem = null;
    let errorLine = 0;
    /** @type {number | undefined} */
    let debounce;
    /** @type {number | undefined} */
    let copyTimer;
    let escaped = false;
    let lastCaret = '';
    const field = area.closest('.kp-field');
    const holder = /** @type {HTMLElement | null} */ (field?.querySelector('[data-kp-field-error]') ?? null);

    const lineHeight = () => {
        const n = Number.parseFloat(view?.getComputedStyle(area).lineHeight ?? '');
        return Number.isFinite(n) ? n : 20;
    };
    /** @param {string[]} lines @returns {number[]} */
    const lineHeights = (lines) => {
        const lh = lineHeight();
        if (!wrap) return lines.map(() => lh);
        const cs = view?.getComputedStyle(area);
        mirror.style.width = `${area.clientWidth}px`;
        mirror.style.font = cs?.font ?? '';
        mirror.style.letterSpacing = cs?.letterSpacing ?? '';
        mirror.style.tabSize = cs?.tabSize ?? '';
        mirror.style.paddingInline = cs?.paddingInline ?? '';
        mirror.replaceChildren(
            ...lines.map((line) => {
                const row = doc.createElement('div');
                row.textContent = line === '' ? ' ' : line;
                return row;
            }),
        );
        return [...mirror.children].map((row) => row.getBoundingClientRect().height || lh);
    };
    const drawGutter = () => {
        if (!gutterWanted()) return;
        const lines = area.value.split('\n');
        const heights = lineHeights(lines);
        numbers.replaceChildren(
            ...lines.map((_, i) => {
                const n = doc.createElement('span');
                n.className = 'kp-jsonfield__number';
                if (i + 1 === errorLine) n.classList.add('is-error');
                n.style.blockSize = `${heights[i]}px`;
                n.textContent = String(i + 1);
                return n;
            }),
        );
        root.style.setProperty('--kp-json-digits', String(String(lines.length).length));
        numbers.style.transform = `translateY(${-area.scrollTop}px)`;
    };
    const grow = () => {
        const cs = view?.getComputedStyle(area);
        if (!cs) return;
        const lh = lineHeight();
        const px = (/** @type {string} */ v) => Number.parseFloat(v) || 0;
        const chrome = px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
        const text = lineHeights(area.value.split('\n')).reduce((sum, h) => sum + h, 0);
        const bar = Math.max(0, area.offsetHeight - area.clientHeight - px(cs.borderTopWidth) - px(cs.borderBottomWidth));
        const content = text + chrome + bar;
        const least = minRows * lh + chrome;
        const most = Math.max(CODE_FIELD_MAX_ROWS, minRows) * lh + chrome;
        const height = Math.ceil(Math.min(most, Math.max(least, content)));
        area.style.blockSize = `${height}px`;
        area.style.overflowY = content > height + 1 ? 'auto' : 'hidden';
    };

    /** "Line 3, column 12 · YAML": where the caret is. */
    const drawReadout = () => {
        const at = caretPosition(area.value, area.selectionStart ?? 0);
        const name = language();
        const text = strings.codeFieldPosition(at.line, at.column) + (name ? ` · ${name.toUpperCase()}` : '');
        if (readout.textContent !== text) readout.textContent = text;
        const key = `${at.line}:${at.column}`;
        if (key !== lastCaret) {
            lastCaret = key;
            area.dispatchEvent(new CustomEvent(CODE_FIELD_CARET_EVENT, { bubbles: true, detail: at }));
        }
    };

    /** @param {number | null} line @param {number | null} [column] @param {string} [message] */
    const setError = (line, column = null, message = '') => {
        const before = problem;
        if (line === null && !message) problem = null;
        else problem = { line, column: column ?? null, message };
        errorLine = problem?.line ?? 0;
        const broken = problem !== null;
        const sentence = !problem
            ? ''
            : problem.line !== null && problem.column !== null
              ? strings.codeFieldError(problem.line, problem.column, problem.message)
              : problem.line !== null
                ? strings.codeFieldErrorLine(problem.line, problem.message)
                : strings.codeFieldErrorPlain(problem.message);
        root.setAttribute('data-kp-json-state', broken ? 'invalid' : 'valid');
        area.setCustomValidity(broken && blocks() ? strings.codeFieldBlocked : '');
        if (holder) {
            status.textContent = '';
            if (broken) showError(area, sentence);
            else clearError(area);
        } else {
            status.textContent = sentence;
            if (broken) area.setAttribute('aria-invalid', 'true');
            else area.removeAttribute('aria-invalid');
        }
        field?.classList.toggle('kp-field--invalid', broken);
        drawGutter();
        if (before?.message !== problem?.message || before?.line !== problem?.line || before?.column !== problem?.column || (before === null) !== (problem === null))
            area.dispatchEvent(
                new CustomEvent(CODE_FIELD_STATE_EVENT, {
                    bubbles: true,
                    detail: { state: broken ? 'invalid' : 'ready', line: problem?.line ?? null, column: problem?.column ?? null, message: sentence },
                }),
            );
    };

    const check = () => {
        // The error of the text before is taken back; the handler, or a server answering later, says it again if it still holds.
        if (problem !== null) setError(null);
        area.dispatchEvent(
            new CustomEvent(CODE_FIELD_CHECK_EVENT, {
                bubbles: true,
                detail: { value: area.value, language: language(), error: (/** @type {number} */ line, /** @type {number} */ column, /** @type {string} */ message) => setError(line, column, message) },
            }),
        );
    };

    const onInput = () => {
        grow();
        drawGutter();
        drawReadout();
        if (getWhen() !== 'input') return;
        view?.clearTimeout(debounce);
        debounce = view?.setTimeout(check, CODE_FIELD_CHECK_MS);
    };
    const onBlur = () => {
        view?.clearTimeout(debounce);
        check();
    };
    /** @param {WheelEvent} event */
    const onGutterWheel = (event) => {
        const before = area.scrollTop;
        area.scrollTop +=
            event.deltaMode === 1 ? event.deltaY * lineHeight() : event.deltaMode === 2 ? event.deltaY * area.clientHeight : event.deltaY;
        if (area.scrollTop !== before) event.preventDefault();
    };
    const onScroll = () => {
        numbers.style.transform = `translateY(${-area.scrollTop}px)`;
    };
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        const mod = event.ctrlKey || event.metaKey;
        if (event.key === 'Escape') {
            escaped = true;
            return;
        }
        if (event.key === 'Tab' && !mod && !event.altKey) {
            if (escaped) {
                escaped = false;
                return;
            }
            event.preventDefault();
            const { selectionStart: a, selectionEnd: b, value } = area;
            if (event.shiftKey) {
                const from = value.lastIndexOf('\n', a - 1) + 1;
                const lineText = value.slice(from);
                const indent = getIndent();
                const strip = lineText.startsWith(indent) ? indent.length : lineText.startsWith('\t') ? 1 : (lineText.match(/^ {1,4}/)?.[0].length ?? 0);
                if (strip > 0) {
                    area.setRangeText('', from, from + strip, 'preserve');
                    area.setSelectionRange(Math.max(from, a - strip), Math.max(from, b - strip));
                    area.dispatchEvent(new Event('input', { bubbles: true }));
                }
                return;
            }
            area.setRangeText(getIndent(), a, b, 'end');
            area.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
        escaped = false;
    };
    /** @param {MouseEvent} event */
    const onTool = async (event) => {
        const button = event.target instanceof Element ? /** @type {HTMLButtonElement | null} */ (event.target.closest('[data-kp-code-tool]')) : null;
        if (!button || button.disabled) return;
        if (button.dataset.kpCodeTool === 'wrap') {
            wrap = !wrap;
            root.setAttribute('data-kp-json-wrap', String(wrap));
            button.setAttribute('aria-pressed', String(wrap));
            drawGutter();
            grow();
        } else {
            view?.clearTimeout(copyTimer);
            try {
                await navigator.clipboard.writeText(area.value);
                word.textContent = strings.copied;
            } catch {
                word.textContent = strings.copyBlocked;
            }
            copyTimer = view?.setTimeout(() => (word.textContent = strings.jsonCopy), 1500);
        }
    };
    const lock = () => {
        const off = area.disabled || area.readOnly;
        for (const b of tools.querySelectorAll('button')) b.disabled = off && b.dataset.kpCodeTool !== 'copy';
        root.toggleAttribute('data-kp-json-off', off);
    };
    const attrs =
        view && 'MutationObserver' in view
            ? new view.MutationObserver((records) => {
                  if (records.some((r) => r.attributeName === 'disabled' || r.attributeName === 'readonly')) lock();
                  if (records.some((r) => r.attributeName?.startsWith('data-kp-code'))) {
                      root.toggleAttribute('data-kp-json-gutter', gutterWanted());
                      drawReadout();
                      drawGutter();
                      grow();
                  }
              })
            : null;
    attrs?.observe(area, { attributes: true, attributeFilter: ['disabled', 'readonly', 'data-kp-code-field', 'data-kp-code-gutter', 'data-kp-code-indent', 'data-kp-code-check'] });
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => drawGutter()) : null;
    resize?.observe(area);
    const reset = () =>
        view?.setTimeout(() => {
            setError(null);
            drawGutter();
            drawReadout();
            grow();
        }, 0);
    area.form?.addEventListener('reset', reset);

    area.addEventListener('input', onInput);
    area.addEventListener('blur', onBlur);
    area.addEventListener('scroll', onScroll, { passive: true });
    area.addEventListener('keyup', drawReadout);
    area.addEventListener('click', drawReadout);
    area.addEventListener('focus', drawReadout);
    doc.addEventListener('selectionchange', drawReadout);
    gutter.addEventListener('wheel', onGutterWheel, { passive: false });
    area.addEventListener('keydown', onKey);
    area.addEventListener('pointerdown', () => (escaped = false));
    tools.addEventListener('click', onTool);
    lock();
    root.setAttribute('data-kp-json-state', 'valid');
    drawGutter();
    drawReadout();
    grow();

    HANDLES.set(area, {
        position: () => caretPosition(area.value, area.selectionStart ?? 0),
        setError,
        check,
        state: () => ({ state: problem ? 'invalid' : 'ready', line: problem?.line ?? null, column: problem?.column ?? null, message: problem?.message ?? '' }),
    });
    // Once at attach, after the page had its chance to listen.
    queueMicrotask(check);
    return () => {
        view?.clearTimeout(debounce);
        view?.clearTimeout(copyTimer);
        area.removeEventListener('input', onInput);
        area.removeEventListener('blur', onBlur);
        area.removeEventListener('scroll', onScroll);
        area.removeEventListener('keyup', drawReadout);
        area.removeEventListener('click', drawReadout);
        area.removeEventListener('focus', drawReadout);
        doc.removeEventListener('selectionchange', drawReadout);
        gutter.removeEventListener('wheel', onGutterWheel);
        area.removeEventListener('keydown', onKey);
        area.form?.removeEventListener('reset', reset);
        attrs?.disconnect();
        resize?.disconnect();
        area.setCustomValidity('');
        area.removeAttribute('aria-invalid');
        if (describedBefore) area.setAttribute('aria-describedby', describedBefore);
        else area.removeAttribute('aria-describedby');
        area.style.blockSize = '';
        area.style.overflowY = '';
        root.replaceWith(area);
        HANDLES.delete(area);
    };
}

/**
 * The handle of a field that has been attached.
 * @param {Element} area
 * @returns {CodeFieldHandle | null}
 */
export function codeField(area) {
    return HANDLES.get(area) ?? null;
}

/**
 * Mark the problem the page found in a code field: its line in the gutter, "Line 3, column 12: why" under the field, the form held back.
 * `setCodeFieldError(area, null)` takes it back.
 * @param {Element} area an attached `textarea[data-kp-code-field]`
 * @param {number | null} line from 1; null: no problem
 * @param {number | null} [column] from 1
 * @param {string} [message]
 */
export function setCodeFieldError(area, line, column = null, message = '') {
    HANDLES.get(area)?.setError(line, column, message);
}

/**
 * Give every `textarea[data-kp-code-field]` under `root` its gutter, readout and error line.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachCodeFields(root = document) {
    const found = /** @type {HTMLTextAreaElement[]} */ ([
        ...(root instanceof HTMLTextAreaElement && root.matches(CODE_FIELD) ? [root] : []),
        ...root.querySelectorAll(CODE_FIELD),
    ]);
    const undo = found.map((area) => attachOne(area));
    return () => undo.forEach((u) => u());
}
