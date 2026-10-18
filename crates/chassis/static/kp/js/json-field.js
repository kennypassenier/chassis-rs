// A text box that knows JSON [kpadopt5; kyu's publish box, homelab's action arguments, the chassis test body].
//
// A multiline field marked `data-kp-json` checks what is typed while it is typed,
// says what is wrong and where ("Line 3, column 12: expected ','", with the line
// marked in a gutter of line numbers), formats and minifies on request, and holds
// the form back while the JSON is broken.
//
//   <div class="kp-field">
//       <label class="kp-field__label" for="body">Message</label>
//       <textarea class="kp-field__input kp-field__input--multiline" id="body" name="body"
//           data-kp-json="strict" placeholder='{"hello":"world"}'></textarea>
//   </div>
//
// Options, as attributes on the textarea and as the second argument of
// attachJsonFields():
//
//   data-kp-json            `strict` (default: text that is not JSON blocks the form) | `allow-text` (it may be sent, and the line says so);
//                           decided per field, never for the whole package
//   data-kp-json-check      `input` (default, debounced 300 ms) | `blur`
//   data-kp-json-format     `button` (default: Format and Minify beside the field) | `on-blur` (valid JSON is laid out when the field loses focus) | `off`
//   data-kp-json-indent     `2` (default) | `4` | `tab`
//   data-kp-json-gutter     on by default; `data-kp-json-gutter="false"` takes the line numbers away
//   data-kp-json-wrap       long lines wrap (the gutter then follows the wrapped lines); default they scroll inside the field
//   data-kp-json-schema     a URL or inline JSON handed to the page in `kp-json-validate`, whose handler may refuse a value that parses
//   rows                    the least height in lines (default 6); the field grows with its text to 20
//
// A valid text says so quietly ("Valid JSON · 3 keys"); an empty one says
// "Empty" (and is valid unless the field is `required`). Tab indents, Shift+Tab
// takes one indent off, Esc and then Tab leaves the field, so the keyboard is
// never trapped; Mod+Shift+F formats. The message is in a status line under the
// field, `aria-describedby`; a field inside a `.kp-field` that has a
// `[data-kp-field-error]` slot (js/forms.js) puts the problem there instead.
// While the field is disabled or read-only the tools stand still.

import { getStrings } from './strings.js';
import { showError, clearError } from './forms.js';

/** The fields this module looks after. */
export const JSON_FIELD = 'textarea[data-kp-json]';
/** Fired on the textarea, bubbling, when its state changed: `{ state, line, column, message, keys }`, state `empty` | `valid` | `invalid` | `text`. */
export const JSON_STATE_EVENT = 'kp-json-state';
/**
 * Fired on the textarea, bubbling, for a text that parses: `{ value, text, schema, refuse(why) }`. A handler that calls `refuse` makes the field invalid with that sentence.
 */
export const JSON_VALIDATE_EVENT = 'kp-json-validate';
/** The debounce of the check while typing [ms]. */
export const JSON_CHECK_MS = 300;
/** The most lines the field grows to. */
export const JSON_MAX_ROWS = 20;
/** How long "Copied" stays on the button [ms]. */
export const JSON_COPIED_MS = 1500;

/**
 * @typedef {object} JsonFieldOptions
 * @property {'strict' | 'allow-text'} [mode]
 * @property {'input' | 'blur'} [check]
 * @property {'button' | 'on-blur' | 'off'} [format]
 * @property {'2' | '4' | 'tab'} [indent]
 * @property {boolean} [gutter]
 * @property {boolean} [wrap]
 */

/**
 * @typedef {object} JsonFieldHandle
 * @property {() => 'empty' | 'valid' | 'invalid' | 'text'} state
 * @property {() => void} check
 * @property {() => boolean} format lay it out; false when it is not JSON
 * @property {() => boolean} minify
 * @property {() => unknown} value the parsed value, or `undefined`
 */

/** @type {WeakMap<Element, JsonFieldHandle>} */
const HANDLES = new WeakMap();
let serial = 0;

/**
 * What is wrong with `text`, and where: the engines word it differently.
 * @param {string} text
 * @returns {{ ok: true, value: unknown } | { ok: false, why: string, line: number | null, column: number | null }}
 */
export function explainJson(text) {
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        let line = null;
        let column = null;
        const at = /line (\d+) column (\d+)/i.exec(raw);
        if (at) {
            line = Number(at[1]);
            column = Number(at[2]);
        } else {
            const position = /position (\d+)/i.exec(raw);
            if (position) {
                const before = text.slice(0, Number(position[1]));
                line = before.split('\n').length;
                column = before.length - before.lastIndexOf('\n');
            }
        }
        const why = raw
            .replace(/^JSON\.parse:\s*/i, '')
            .replace(/\s+at line \d+ column \d+( of the JSON data)?/i, '')
            .replace(/\s+in JSON at position \d+( \(line \d+ column \d+\))?/i, '')
            .replace(/\s*\(line \d+ column \d+\)/i, '')
            .replace(/^./, (c) => c.toLowerCase());
        return { ok: false, why, line, column };
    }
}

/**
 * @param {HTMLTextAreaElement} area
 * @param {JsonFieldOptions} options
 * @returns {() => void}
 */
function attachOne(area, options) {
    if (HANDLES.has(area)) return () => undefined;
    const doc = area.ownerDocument;
    const view = doc.defaultView;
    const strings = getStrings();
    // The options are read when they are used: a page that flips an attribute is heard at once.
    const getMode = () => ((options.mode ?? area.getAttribute('data-kp-json')) === 'allow-text' ? 'allow-text' : 'strict');
    const getWhen = () => ((options.check ?? area.getAttribute('data-kp-json-check')) === 'blur' ? 'blur' : 'input');
    const getFormat = () =>
        options.format ??
        (area.getAttribute('data-kp-json-format') === 'off' ? 'off' : area.getAttribute('data-kp-json-format') === 'on-blur' ? 'on-blur' : 'button');
    const getIndent = () => {
        const raw = options.indent ?? area.getAttribute('data-kp-json-indent') ?? '2';
        return raw === 'tab' ? '\t' : ' '.repeat(raw === '4' ? 4 : 2);
    };
    const gutterWanted = () => options.gutter ?? area.getAttribute('data-kp-json-gutter') !== 'false';
    let wrap = options.wrap ?? (area.hasAttribute('data-kp-json-wrap') && area.getAttribute('data-kp-json-wrap') !== 'false');
    const minRows = Math.max(2, Number(area.getAttribute('rows')) || 6);
    const schemaRaw = area.getAttribute('data-kp-json-schema');
    /** @type {unknown} */
    let schema = null;
    if (schemaRaw) {
        try {
            schema = JSON.parse(schemaRaw);
        } catch {
            schema = schemaRaw;
        }
    }

    // The frame: the gutter, the textarea, and under them the status and the help.
    const id = area.id || (area.id = `kp-json-${(serial += 1)}`);
    const root = doc.createElement('div');
    root.className = 'kp-jsonfield';
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
        b.dataset.kpJsonTool = which;
        b.textContent = label;
        return b;
    };
    const toolFormat = tool(strings.jsonFormat, 'format');
    const toolMinify = tool(strings.jsonMinify, 'minify');
    const toolWrap = tool(strings.jsonWrap, 'wrap');
    toolWrap.setAttribute('aria-pressed', String(wrap));
    const toolCopy = tool('', 'copy');
    const word = doc.createElement('span');
    word.className = 'kp-code__word';
    word.setAttribute('data-kp-code-words', [strings.jsonCopy, strings.copied, strings.copyBlocked].join('\n'));
    word.textContent = strings.jsonCopy;
    toolCopy.append(word);
    tools.append(toolFormat, toolMinify, toolWrap, toolCopy);
    toolFormat.hidden = toolMinify.hidden = getFormat() === 'off';

    area.before(root);
    frame.append(gutter, area, mirror);
    root.append(tools, frame, status, help);
    const describedBefore = area.getAttribute('aria-describedby');
    area.setAttribute('aria-describedby', [describedBefore, status.id, help.id].filter(Boolean).join(' '));
    area.setAttribute('spellcheck', 'false');
    area.setAttribute('autocapitalize', 'off');
    area.setAttribute('autocomplete', 'off');
    area.classList.add('kp-jsonfield__input');

    /** @type {'empty' | 'valid' | 'invalid' | 'text'} */
    let state = 'empty';
    /** @type {unknown} */
    let parsed;
    let errorLine = 0;
    /** @type {number | undefined} */
    let debounce;
    let escaped = false;

    const field = area.closest('.kp-field');
    const holder = /** @type {HTMLElement | null} */ (field?.querySelector('[data-kp-field-error]') ?? null);

    const lineHeight = () => {
        const cs = view?.getComputedStyle(area);
        const n = Number.parseFloat(cs?.lineHeight ?? '');
        return Number.isFinite(n) ? n : 20;
    };

    /**
     * The height of each line: one line height, or with wrapping what the line wraps to, measured in the box's own mirror.
     * @param {string[]} lines
     * @returns {number[]}
     */
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

    /** Rows of the gutter: one number per line; with wrapping, as tall as the line wraps. */
    const drawGutter = () => {
        if (!gutterWanted()) return;
        const lines = area.value.split('\n');
        const heights = lineHeights(lines);
        const nodes = lines.map((_, i) => {
            const n = doc.createElement('span');
            n.className = 'kp-jsonfield__number';
            if (i + 1 === errorLine) n.classList.add('is-error');
            n.style.blockSize = `${heights[i]}px`;
            n.textContent = String(i + 1);
            return n;
        });
        numbers.replaceChildren(...nodes);
        root.style.setProperty('--kp-json-digits', String(String(lines.length).length));
        numbers.style.transform = `translateY(${-area.scrollTop}px)`;
    };

    // The box grows with its text up to JSON_MAX_ROWS lines, then scrolls inside itself (wheel, keys and scrollbar). Its height
    // comes from the lines it holds and the mirror, never from a measuring twin in the page's body: a twin there is hidden by
    // a host that shows only part of the page (the review dialog), measures 0 and left the box at its least height with
    // `overflow: hidden`, so Long could not be scrolled [kpadopt5-r3].
    const grow = () => {
        const cs = view?.getComputedStyle(area);
        if (!cs) return;
        const lh = lineHeight();
        const px = (/** @type {string} */ v) => Number.parseFloat(v) || 0;
        const chrome = px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
        const text = lineHeights(area.value.split('\n')).reduce((sum, h) => sum + h, 0);
        // A horizontal scrollbar takes room from the lines: count it, or the last line sits under it.
        const bar = Math.max(0, area.offsetHeight - area.clientHeight - px(cs.borderTopWidth) - px(cs.borderBottomWidth));
        const content = text + chrome + bar;
        const least = minRows * lh + chrome;
        const most = Math.max(JSON_MAX_ROWS, minRows) * lh + chrome;
        const height = Math.ceil(Math.min(most, Math.max(least, content)));
        area.style.blockSize = `${height}px`;
        area.style.overflowY = content > height + 1 ? 'auto' : 'hidden';
    };

    /** @param {'empty' | 'valid' | 'invalid' | 'text'} next @param {string} message @param {{ line?: number | null, column?: number | null, keys?: number | null }} [where] */
    const set = (next, message, where = {}) => {
        const changed = next !== state || status.textContent !== message;
        state = next;
        root.setAttribute('data-kp-json-state', next);
        errorLine = next === 'invalid' ? (where.line ?? 0) : 0;
        const broken = next === 'invalid';
        // The form is held back while the JSON is broken (a field that allows plain text is never broken).
        area.setCustomValidity(broken ? strings.jsonBlocked : '');
        if (holder) {
            status.textContent = broken ? '' : message;
            if (broken) showError(area, message);
            else clearError(area);
        } else {
            status.textContent = message;
            if (broken) area.setAttribute('aria-invalid', 'true');
            else area.removeAttribute('aria-invalid');
        }
        field?.classList.toggle('kp-field--invalid', broken);
        if (changed)
            area.dispatchEvent(
                new CustomEvent(JSON_STATE_EVENT, {
                    bubbles: true,
                    detail: { state: next, line: where.line ?? null, column: where.column ?? null, message, keys: where.keys ?? null },
                }),
            );
    };

    const check = () => {
        const text = area.value;
        parsed = undefined;
        if (text.trim() === '') {
            if (area.required) set('invalid', strings.jsonInvalidPlain(strings.jsonEmpty), { line: 1, column: 1 });
            else set('empty', strings.jsonEmpty);
            drawGutter();
            return;
        }
        const result = explainJson(text);
        if (result.ok) {
            parsed = result.value;
            const count = Array.isArray(result.value)
                ? strings.jsonValidItems(result.value.length)
                : result.value && typeof result.value === 'object'
                  ? strings.jsonValidKeys(Object.keys(result.value).length)
                  : strings.jsonValidValue;
            let refused = '';
            area.dispatchEvent(
                new CustomEvent(JSON_VALIDATE_EVENT, {
                    bubbles: true,
                    detail: { value: result.value, text, schema, refuse: (/** @type {string} */ why) => (refused = why) },
                }),
            );
            if (refused) set('invalid', strings.jsonSchemaFailed(refused), { line: null, column: null });
            else set('valid', count, { keys: result.value && typeof result.value === 'object' ? Object.keys(result.value).length : null });
        } else if (getMode() === 'allow-text') {
            set('text', strings.jsonPlainText);
        } else {
            set(
                'invalid',
                result.line !== null && result.column !== null
                    ? strings.jsonInvalid(result.line, result.column, result.why)
                    : strings.jsonInvalidPlain(result.why),
                {
                    line: result.line,
                    column: result.column,
                },
            );
        }
        drawGutter();
    };

    /** @param {string} text */
    const write = (text) => {
        area.value = text;
        area.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const format = () => {
        const result = explainJson(area.value);
        if (!result.ok) return false;
        write(JSON.stringify(result.value, null, getIndent()));
        view?.clearTimeout(debounce);
        check();
        grow();
        return true;
    };
    const minify = () => {
        const result = explainJson(area.value);
        if (!result.ok) return false;
        write(JSON.stringify(result.value));
        view?.clearTimeout(debounce);
        check();
        grow();
        return true;
    };

    /** @param {Event} event */
    const onInput = (event) => {
        void event;
        grow();
        drawGutter();
        if (getWhen() !== 'input') return;
        view?.clearTimeout(debounce);
        debounce = view?.setTimeout(check, JSON_CHECK_MS);
    };
    const onBlur = () => {
        view?.clearTimeout(debounce);
        check();
        if (getFormat() === 'on-blur' && state === 'valid') format();
    };
    // The wheel over the line numbers scrolls the text, as it does over the box [kpadopt5-r3].
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
        if (mod && event.shiftKey && event.key.toLowerCase() === 'f' && getFormat() !== 'off') {
            event.preventDefault();
            format();
            return;
        }
        if (event.key === 'Tab' && !mod && !event.altKey) {
            // Esc, then Tab, leaves the field: the keyboard is never trapped.
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
                const strip = lineText.startsWith(indent)
                    ? indent.length
                    : lineText.startsWith('\t')
                      ? 1
                      : (lineText.match(/^ {1,4}/)?.[0].length ?? 0);
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
        const button = event.target instanceof Element ? /** @type {HTMLButtonElement | null} */ (event.target.closest('[data-kp-json-tool]')) : null;
        if (!button || button.disabled) return;
        const which = button.dataset.kpJsonTool;
        if (which === 'format') format();
        else if (which === 'minify') minify();
        else if (which === 'wrap') {
            wrap = !wrap;
            root.setAttribute('data-kp-json-wrap', String(wrap));
            button.setAttribute('aria-pressed', String(wrap));
            drawGutter();
            grow();
        } else if (which === 'copy') {
            view?.clearTimeout(copyTimer);
            try {
                await navigator.clipboard.writeText(area.value);
                word.textContent = strings.copied;
            } catch {
                word.textContent = strings.copyBlocked;
            }
            copyTimer = view?.setTimeout(() => (word.textContent = strings.jsonCopy), JSON_COPIED_MS);
        }
    };
    /** @type {number | undefined} */
    let copyTimer;

    const lock = () => {
        const off = area.disabled || area.readOnly;
        for (const b of tools.querySelectorAll('button')) b.disabled = off && b.dataset.kpJsonTool !== 'copy';
        root.toggleAttribute('data-kp-json-off', off);
    };
    const syncOptions = () => {
        root.toggleAttribute('data-kp-json-gutter', gutterWanted());
        toolFormat.hidden = toolMinify.hidden = getFormat() === 'off';
        check();
        grow();
    };
    const attrs =
        view && 'MutationObserver' in view
            ? new view.MutationObserver((records) => {
                  if (records.some((r) => r.attributeName === 'disabled' || r.attributeName === 'readonly')) lock();
                  if (records.some((r) => r.attributeName?.startsWith('data-kp-json'))) syncOptions();
              })
            : null;
    attrs?.observe(area, {
        attributes: true,
        attributeFilter: [
            'disabled',
            'readonly',
            'data-kp-json',
            'data-kp-json-check',
            'data-kp-json-format',
            'data-kp-json-indent',
            'data-kp-json-gutter',
        ],
    });
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => drawGutter()) : null;
    resize?.observe(area);
    // A form that is reset brings the field back to its first value.
    const reset = () =>
        view?.setTimeout(() => {
            check();
            grow();
        }, 0);
    area.form?.addEventListener('reset', reset);

    area.addEventListener('input', onInput);
    area.addEventListener('blur', onBlur);
    area.addEventListener('scroll', onScroll, { passive: true });
    gutter.addEventListener('wheel', onGutterWheel, { passive: false });
    area.addEventListener('keydown', onKey);
    area.addEventListener('pointerdown', () => (escaped = false));
    tools.addEventListener('click', onTool);
    lock();
    check();
    grow();

    HANDLES.set(area, { state: () => state, check, format, minify, value: () => parsed });
    return () => {
        view?.clearTimeout(debounce);
        view?.clearTimeout(copyTimer);
        area.removeEventListener('input', onInput);
        area.removeEventListener('blur', onBlur);
        area.removeEventListener('scroll', onScroll);
        gutter.removeEventListener('wheel', onGutterWheel);
        area.removeEventListener('keydown', onKey);
        area.form?.removeEventListener('reset', reset);
        attrs?.disconnect();
        resize?.disconnect();
        area.setCustomValidity('');
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
 * @returns {JsonFieldHandle | null}
 */
export function jsonField(area) {
    return HANDLES.get(area) ?? null;
}

/**
 * Give every `textarea[data-kp-json]` under `root` its checking, gutter and tools.
 * @param {ParentNode} [root]
 * @param {JsonFieldOptions} [options]
 * @returns {() => void} detach
 */
export function attachJsonFields(root = document, options = {}) {
    const found = /** @type {HTMLTextAreaElement[]} */ ([
        ...(root instanceof HTMLTextAreaElement && root.matches(JSON_FIELD) ? [root] : []),
        ...root.querySelectorAll(JSON_FIELD),
    ]);
    const undo = found.map((area) => attachOne(area, options));
    return () => undo.forEach((u) => u());
}
