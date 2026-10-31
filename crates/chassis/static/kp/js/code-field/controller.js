// One wired code field: the chrome put round the textarea and taken off again, typing, Tab, the gutter's wheel, the tools and the handle a page gets.

import { CodeFieldProblems } from './problem.js';
import { mountChrome } from './build.js';
import { CODE_FIELD_CHECK_MS, caretPosition } from './values.js';

/** How long the copy tool's answer ("Copied") stays before the word comes back, in ms. */
const COPY_ANSWER_MS = 1500;
/** The most spaces Shift+Tab takes off a line that is not indented the way the field indents. */
const MOST_STRIPPED = 4;

export class CodeFieldControl extends CodeFieldProblems {
    /** @param {HTMLElement} host a `textarea[data-kp-code-field]` */
    constructor(host) {
        super(host);
        /** @type {number | undefined} */
        this.debounce = undefined;
        /** @type {number | undefined} */
        this.copyTimer = undefined;
        /** Esc was pressed: the next Tab leaves the field instead of indenting. */
        this.escaped = false;
        /** What `aria-describedby` was before the field added its own. @type {string | null} */
        this.describedBefore = null;
        /** The handle a page gets, made when the field is wired. @type {import('../code-field.js').CodeFieldHandle | null} */
        this.handle = null;
    }

    connect() {
        const { area, doc, view, ui } = this;
        if (!area.id) area.id = this.id;
        this.handle = this.makeHandle();
        this.describedBefore = mountChrome(area, ui);
        this.own(() => this.unmount());
        this.watchAttributes();
        if (typeof ResizeObserver === 'function') this.observe(new ResizeObserver(() => this.drawGutter())).observe(area);
        if (area.form) {
            this.listen(area.form, 'reset', () => view?.setTimeout(() => this.afterReset(), 0));
        }
        const readout = () => this.drawReadout();
        this.listen(area, 'input', () => this.onInput());
        this.listen(area, 'blur', () => this.onBlur());
        this.listen(area, 'scroll', () => (ui.numbers.style.transform = `translateY(${-area.scrollTop}px)`), { passive: true });
        this.listen(area, 'keyup', readout);
        this.listen(area, 'click', readout);
        this.listen(area, 'focus', readout);
        this.listen(doc, 'selectionchange', readout);
        this.listen(ui.gutter, 'wheel', (event) => this.onGutterWheel(/** @type {WheelEvent} */ (event)), { passive: false });
        this.listen(area, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(area, 'pointerdown', () => this.dropEscape());
        this.listen(ui.tools, 'click', (event) => void this.onTool(/** @type {MouseEvent} */ (event)));
        this.lock();
        ui.root.setAttribute('data-kp-json-state', 'valid');
        this.drawGutter();
        this.drawReadout();
        this.grow();
        // Once at attach, after the page had its chance to listen.
        queueMicrotask(() => {
            if (!this.destroyed) this.check();
        });
        this.own(() => {
            view?.clearTimeout(this.debounce);
            view?.clearTimeout(this.copyTimer);
        });
    }

    /** Makes the handle a page gets from `codeField(area)`. @returns {import('../code-field.js').CodeFieldHandle} */
    makeHandle() {
        const { area } = this;
        return {
            position: () => caretPosition(area.value, area.selectionStart ?? 0),
            setError: (line, column, message) => this.setError(line, column, message),
            check: () => this.check(),
            state: () => ({
                state: this.problem ? 'invalid' : 'ready',
                line: this.problem?.line ?? null,
                column: this.problem?.column ?? null,
                message: this.problem?.message ?? '',
            }),
        };
    }

    /** Takes the chrome and the marks the field added off the textarea again. */
    unmount() {
        const { area, ui } = this;
        area.setCustomValidity('');
        area.removeAttribute('aria-invalid');
        if (this.describedBefore) area.setAttribute('aria-describedby', this.describedBefore);
        else area.removeAttribute('aria-describedby');
        area.style.blockSize = '';
        area.style.overflowY = '';
        ui.root.replaceWith(area);
    }

    /** The tools, the gutter and the readout follow the attributes the page may change later. */
    watchAttributes() {
        const { area, view, ui } = this;
        if (!view || !('MutationObserver' in view)) return;
        const attrs = new view.MutationObserver((records) => {
            if (records.some((r) => r.attributeName === 'disabled' || r.attributeName === 'readonly')) this.lock();
            if (records.some((r) => r.attributeName?.startsWith('data-kp-code'))) {
                ui.root.toggleAttribute('data-kp-json-gutter', this.gutterWanted());
                this.drawReadout();
                this.drawGutter();
                this.grow();
            }
        });
        this.observe(attrs).observe(area, {
            attributes: true,
            attributeFilter: ['disabled', 'readonly', 'data-kp-code-field', 'data-kp-code-gutter', 'data-kp-code-indent', 'data-kp-code-check'],
        });
    }

    /** The form was reset: the problem goes and the field is drawn again. */
    afterReset() {
        this.setError(null);
        this.drawGutter();
        this.drawReadout();
        this.grow();
    }

    /** Esc then Tab leaves the field; any other key or a press puts Tab back to indenting. */
    dropEscape() {
        this.escaped = false;
    }

    onInput() {
        const { view } = this;
        this.grow();
        this.drawGutter();
        this.drawReadout();
        if (this.getWhen() !== 'input') return;
        view?.clearTimeout(this.debounce);
        this.debounce = view?.setTimeout(() => this.check(), CODE_FIELD_CHECK_MS);
    }

    onBlur() {
        this.view?.clearTimeout(this.debounce);
        this.check();
    }

    /** The gutter's wheel scrolls the text. @param {WheelEvent} event */
    onGutterWheel(event) {
        const { area } = this;
        const before = area.scrollTop;
        area.scrollTop += event.deltaMode === 1 ? event.deltaY * this.lineHeight() : event.deltaMode === 2 ? event.deltaY * area.clientHeight : event.deltaY;
        if (area.scrollTop !== before) event.preventDefault();
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const mod = event.ctrlKey || event.metaKey;
        if (event.key === 'Escape') {
            this.escaped = true;
            return;
        }
        if (event.key === 'Tab' && !mod && !event.altKey) {
            if (this.escaped) {
                this.escaped = false;
                return;
            }
            event.preventDefault();
            if (event.shiftKey) this.outdent();
            else this.indent();
            return;
        }
        this.escaped = false;
    }

    /** Tab writes one indent over the selection. */
    indent() {
        const { area } = this;
        area.setRangeText(this.getIndent(), area.selectionStart, area.selectionEnd, 'end');
        area.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /** Shift+Tab takes one indent off the start of the caret's line. */
    outdent() {
        const { area } = this;
        const { selectionStart: a, selectionEnd: b, value } = area;
        const from = value.lastIndexOf('\n', a - 1) + 1;
        const lineText = value.slice(from);
        const indent = this.getIndent();
        const loose = new RegExp(`^ {1,${MOST_STRIPPED}}`);
        const strip = lineText.startsWith(indent) ? indent.length : lineText.startsWith('\t') ? 1 : (lineText.match(loose)?.[0].length ?? 0);
        if (strip <= 0) return;
        area.setRangeText('', from, from + strip, 'preserve');
        area.setSelectionRange(Math.max(from, a - strip), Math.max(from, b - strip));
        area.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /** The wrap tool flips the wrapping; the copy tool copies the text and says how it went. @param {MouseEvent} event */
    async onTool(event) {
        const button = event.target instanceof Element ? /** @type {HTMLButtonElement | null} */ (event.target.closest('[data-kp-code-tool]')) : null;
        if (!button || button.disabled) return;
        if (button.dataset.kpCodeTool === 'wrap') {
            this.setWrap(!this.wrap);
            this.ui.root.setAttribute('data-kp-json-wrap', String(this.wrap));
            button.setAttribute('aria-pressed', String(this.wrap));
            this.drawGutter();
            this.grow();
            return;
        }
        this.view?.clearTimeout(this.copyTimer);
        const { word } = this.ui;
        try {
            await navigator.clipboard.writeText(this.area.value);
            word.textContent = this.strings.copied;
        } catch {
            word.textContent = this.strings.copyBlocked;
        }
        this.copyTimer = this.view?.setTimeout(() => (word.textContent = this.strings.jsonCopy), COPY_ANSWER_MS);
    }

    /** A disabled or read-only field switches its tools off, except Copy. */
    lock() {
        const { area, ui } = this;
        const off = area.disabled || area.readOnly;
        for (const b of ui.tools.querySelectorAll('button')) b.disabled = off && b.dataset.kpCodeTool !== 'copy';
        ui.root.toggleAttribute('data-kp-json-off', off);
    }
}
