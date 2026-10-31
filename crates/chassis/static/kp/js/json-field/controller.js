// One JSON text box: its frame and tools, the check (debounced while typing), the gutter, the growing height, the keys and the live options [kpadopt5].

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { DEFAULT_ROWS, INDENT_NARROW, INDENT_WIDE, JSON_CHECK_MS, MIN_ROWS, WATCHED_ATTRIBUTES } from './constants.js';
import { explainJson } from './explain.js';
import { buildFrame } from './frame.js';
import { handleKey } from './keys.js';
import { drawGutter, grow, lineHeight } from './layout.js';
import { nextFieldNumber } from './state.js';
import { handleTool, lockTools } from './tools.js';
import { runCheck } from './validation.js';

/** The controller of one `textarea[data-kp-json]`. */
export class JsonFieldController extends Controller {
    /**
     * @param {HTMLElement} host the textarea
     * @param {import('./constants.js').JsonFieldOptions} [options] each field's own attributes fill what the page leaves out
     */
    constructor(host, options = {}) {
        super(host, options);
        this.area = /** @type {HTMLTextAreaElement} */ (host);
        this.options = options;
        this.doc = this.area.ownerDocument;
        this.view = this.doc.defaultView;
        this.strings = getStrings();
        this.wrap = options.wrap ?? (this.area.hasAttribute('data-kp-json-wrap') && this.area.getAttribute('data-kp-json-wrap') !== 'false');
        this.minRows = Math.max(MIN_ROWS, Number(this.area.getAttribute('rows')) || DEFAULT_ROWS);
        /** The schema the page's `kp-json-validate` handler is handed: parsed JSON, or the raw text. @type {unknown} */
        this.schema = this.readSchema();
        this.id = this.area.id || `kp-json-${nextFieldNumber()}`;
        this.parts = buildFrame(this.doc, this.id, this.strings, { wrap: this.wrap, gutter: this.gutterWanted() });
        /** @type {'empty' | 'valid' | 'invalid' | 'text'} */
        this.state = 'empty';
        /** The parsed value of a valid text. @type {unknown} */
        this.parsed = undefined;
        /** The line the error is on, 0 for none. */
        this.errorLine = 0;
        /** @type {number | undefined} */
        this.debounce = undefined;
        /** @type {number | undefined} */
        this.copyTimer = undefined;
        /** Whether Esc was pressed, so the next Tab leaves the field. */
        this.escaped = false;
        this.field = this.area.closest('.kp-field');
        /** The field's own error slot (js/forms.js), when it has one. */
        this.holder = /** @type {HTMLElement | null} */ (this.field?.querySelector('[data-kp-field-error]') ?? null);
        /** What a page gets back from jsonField(). @type {import('./constants.js').JsonFieldHandle} */
        this.handle = { state: () => this.state, check: () => this.check(), format: () => this.format(), minify: () => this.minify(), value: () => this.parsed };
    }

    // --- Options, read when they are used: a page that flips an attribute is heard at once. ---
    modeOption() {
        return (this.options.mode ?? this.area.getAttribute('data-kp-json')) === 'allow-text' ? 'allow-text' : 'strict';
    }

    checkOption() {
        return (this.options.check ?? this.area.getAttribute('data-kp-json-check')) === 'blur' ? 'blur' : 'input';
    }

    formatOption() {
        const raw = this.area.getAttribute('data-kp-json-format');
        return this.options.format ?? (raw === 'off' ? 'off' : raw === 'on-blur' ? 'on-blur' : 'button');
    }

    indent() {
        const raw = this.options.indent ?? this.area.getAttribute('data-kp-json-indent') ?? '2';
        return raw === 'tab' ? '\t' : ' '.repeat(raw === '4' ? INDENT_WIDE : INDENT_NARROW);
    }

    gutterWanted() {
        return this.options.gutter ?? this.area.getAttribute('data-kp-json-gutter') !== 'false';
    }

    /** The schema attribute: JSON when it parses, else the raw text, else none. */
    readSchema() {
        const raw = this.area.getAttribute('data-kp-json-schema');
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return raw;
        }
    }

    // --- Wiring. ---
    connect() {
        const area = this.area;
        const { root, frame, gutter, mirror, status, help, tools, toolFormat, toolMinify } = this.parts;
        if (!area.id) area.id = this.id;
        const describedBefore = area.getAttribute('aria-describedby');
        this.own(() => this.undoDom(describedBefore));
        toolFormat.hidden = toolMinify.hidden = this.formatOption() === 'off';
        area.before(root);
        frame.append(gutter, area, mirror);
        root.append(tools, frame, status, help);
        area.setAttribute('aria-describedby', [describedBefore, status.id, help.id].filter(Boolean).join(' '));
        area.setAttribute('spellcheck', 'false');
        area.setAttribute('autocapitalize', 'off');
        area.setAttribute('autocomplete', 'off');
        area.classList.add('kp-jsonfield__input');
        this.own(() => this.view?.clearTimeout(this.debounce));
        this.own(() => this.view?.clearTimeout(this.copyTimer));
        this.watchAttributes();
        this.watchEvents();
        lockTools(this);
        this.check();
        grow(this);
    }

    /** Watch the attributes (disabled, read-only, the options) and the width. */
    watchAttributes() {
        const view = this.view;
        if (view && 'MutationObserver' in view) {
            const attrs = this.observe(new view.MutationObserver((records) => this.onAttributes(records)));
            attrs.observe(this.area, { attributes: true, attributeFilter: WATCHED_ATTRIBUTES });
        }
        if (typeof ResizeObserver === 'function') this.observe(new ResizeObserver(() => drawGutter(this))).observe(this.area);
    }

    /** Listen to the box, the gutter, the tools and the form's reset. */
    watchEvents() {
        const area = this.area;
        const { gutter, tools } = this.parts;
        // A form that is reset brings the field back to its first value.
        if (area.form) {
            this.listen(area.form, 'reset', () =>
                this.view?.setTimeout(() => {
                    this.check();
                    grow(this);
                }, 0),
            );
        }
        this.listen(area, 'input', () => this.onInput());
        this.listen(area, 'blur', () => this.onBlur());
        this.listen(area, 'scroll', () => this.onScroll(), { passive: true });
        this.listen(gutter, 'wheel', (event) => this.onGutterWheel(/** @type {WheelEvent} */ (event)), { passive: false });
        this.listen(area, 'keydown', (event) => handleKey(this, /** @type {KeyboardEvent} */ (event)));
        this.listen(area, 'pointerdown', () => {
            this.escaped = false;
        });
        this.listen(tools, 'click', (event) => void handleTool(this, /** @type {MouseEvent} */ (event)));
    }

    /** Undo what the field got: validity, description, inline sizes and the frame. @param {string | null} describedBefore */
    undoDom(describedBefore) {
        const area = this.area;
        area.setCustomValidity('');
        if (describedBefore) area.setAttribute('aria-describedby', describedBefore);
        else area.removeAttribute('aria-describedby');
        area.style.blockSize = '';
        area.style.overflowY = '';
        this.parts.root.replaceWith(area);
    }

    // --- Actions. ---
    check() {
        runCheck(this);
    }

    /** Write a text as if typed. @param {string} text */
    write(text) {
        this.area.value = text;
        this.area.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /** Lay the JSON out with the indent; false when it is not JSON. */
    format() {
        const result = explainJson(this.area.value);
        if (!result.ok) return false;
        this.write(JSON.stringify(result.value, null, this.indent()));
        this.settle();
        return true;
    }

    /** Take the layout off; false when it is not JSON. */
    minify() {
        const result = explainJson(this.area.value);
        if (!result.ok) return false;
        this.write(JSON.stringify(result.value));
        this.settle();
        return true;
    }

    /** After a rewrite: no pending check, check now, size the box. */
    settle() {
        this.view?.clearTimeout(this.debounce);
        this.check();
        grow(this);
    }

    // --- Events. ---
    onInput() {
        grow(this);
        drawGutter(this);
        if (this.checkOption() !== 'input') return;
        this.view?.clearTimeout(this.debounce);
        this.debounce = this.view?.setTimeout(() => this.check(), JSON_CHECK_MS);
    }

    onBlur() {
        this.view?.clearTimeout(this.debounce);
        this.check();
        if (this.formatOption() === 'on-blur' && this.state === 'valid') this.format();
    }

    onScroll() {
        this.parts.numbers.style.transform = `translateY(${-this.area.scrollTop}px)`;
    }

    /** The wheel over the line numbers scrolls the text, as it does over the box [kpadopt5-r3]. @param {WheelEvent} event */
    onGutterWheel(event) {
        const area = this.area;
        const before = area.scrollTop;
        const lines = event.deltaMode === 1 ? event.deltaY * lineHeight(this) : event.deltaMode === 2 ? event.deltaY * area.clientHeight : event.deltaY;
        area.scrollTop += lines;
        if (area.scrollTop !== before) event.preventDefault();
    }

    /** @param {MutationRecord[]} records */
    onAttributes(records) {
        if (records.some((r) => r.attributeName === 'disabled' || r.attributeName === 'readonly')) lockTools(this);
        if (records.some((r) => r.attributeName?.startsWith('data-kp-json'))) this.syncOptions();
        if (records.some((r) => r.attributeName === 'data-kp-json-wrap')) this.syncWrap();
    }

    syncOptions() {
        const { root, toolFormat, toolMinify } = this.parts;
        root.toggleAttribute('data-kp-json-gutter', this.gutterWanted());
        toolFormat.hidden = toolMinify.hidden = this.formatOption() === 'off';
        this.check();
        grow(this);
    }

    /** The attribute names the wrap again, at run time [ALM 18]; the tool button's own toggle is not undone by another attribute. */
    syncWrap() {
        const want = this.options.wrap ?? (this.area.hasAttribute('data-kp-json-wrap') && this.area.getAttribute('data-kp-json-wrap') !== 'false');
        if (want === this.wrap) return;
        this.wrap = want;
        this.parts.root.setAttribute('data-kp-json-wrap', String(this.wrap));
        this.parts.toolWrap.setAttribute('aria-pressed', String(this.wrap));
        drawGutter(this);
        grow(this);
    }
}
