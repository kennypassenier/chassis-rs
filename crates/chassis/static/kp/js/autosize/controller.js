// One growing text box: its measure (CSS or JS engine), counter, draft, value hook, Mod+Enter, states and handle [kpadopt6-media].

import { Controller } from '../controller.js';
import { resolveLocale } from '../locale.js';
import { getStrings } from '../strings.js';
import { AUTOSIZE_EVENT, AUTOSIZE_MAX_LINES, AUTOSIZE_MIN_LINES, PHONE, PHONE_HEIGHT_SHARE } from './constants.js';
import { CounterLine } from './counter.js';
import { forgetDraft, keepDraft, restoreDraft } from './draft.js';
import { chromeOf, cssAutosizeSupported, dropTwin, fitTextarea, lineHeightOf } from './fit.js';
import { applyState, unframe } from './status.js';

/** One markup attribute's text, or the fallback. @param {Element} el @param {string} name @param {string} fallback */
const attr = (el, name, fallback) => el.getAttribute(name) ?? fallback;

/** The controller of one `textarea[data-kp-autosize]`. */
export class AutosizeController extends Controller {
    /**
     * @param {HTMLElement} host the textarea
     * @param {import('./constants.js').AutosizeOptions} [options] overrides the markup
     */
    constructor(host, options = {}) {
        super(host, options);
        this.area = /** @type {HTMLTextAreaElement} */ (host);
        this.doc = this.area.ownerDocument;
        this.view = /** @type {Window} */ (this.doc.defaultView);
        /** The words as they stood when the box attached. */
        this.strings = getStrings();
        this.options = options;
        /** @type {'ready' | 'loading' | 'error'} */
        this.state = 'ready';
        /** The tallest the box has been (shrink off keeps it). */
        this.tallest = 0;
        /** The last height reported, so the event fires on a change only. */
        this.lastHeight = -1;
        /** @type {import('../busy-card.js').BusyCard | null} */
        this.card = null;
        /** The frame the busy card needs around the box. @type {HTMLElement | null} */
        this.frame = null;
        this.wasReadOnly = this.area.readOnly;
        this.phoneQuery = this.view.matchMedia?.(PHONE);
        this.counter = new CounterLine(this.area, () => this.frame, new Intl.NumberFormat(resolveLocale(undefined, this.area)), this.strings);
        /** Where the last paste started, or -1. */
        this.pasteAt = -1;
        /** The width last measured, for the resize observer. */
        this.width = -1;
        /** What a page gets back from autosize(). @type {import('./constants.js').AutosizeHandle} */
        this.handle = this.makeHandle();
    }

    /** @returns {import('./constants.js').AutosizeHandle} */
    makeHandle() {
        const c = this;
        return {
            element: this.area,
            refresh() {
                c.measure();
                c.drawCounter();
            },
            setState: (next, message) => applyState(this, next, message),
            count: () => this.count(),
            get engine() {
                return c.engineInUse();
            },
        };
    }

    // --- Options, read each time. ---
    minRows() {
        return Math.max(1, this.options.rows ?? (Number(this.area.getAttribute('rows')) || AUTOSIZE_MIN_LINES));
    }

    /** The most lines, or null for no cap (a disabled or read-only box shows its whole value). */
    maxRows() {
        if (this.area.disabled || this.area.readOnly) return null;
        const raw = this.options.max ?? attr(this.area, 'data-kp-autosize-max', String(AUTOSIZE_MAX_LINES));
        if (raw === 'none') return null;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : AUTOSIZE_MAX_LINES;
    }

    shrinks() {
        return (this.options.shrink ?? attr(this.area, 'data-kp-autosize-shrink', 'on') !== 'off') !== false;
    }

    counterMode() {
        return this.options.counter ?? /** @type {'off' | 'chars' | 'lines' | 'both'} */ (attr(this.area, 'data-kp-counter', 'off'));
    }

    /** @returns {'css' | 'js'} */
    engineInUse() {
        const want = this.options.engine ?? attr(this.area, 'data-kp-autosize-engine', 'auto');
        // Shrink off needs the box to remember its tallest, which only the measure can do.
        if (want === 'js' || !this.shrinks()) return 'js';
        // `css` and `auto` both take the browser's own sizing when it has it.
        return cssAutosizeSupported() ? 'css' : 'js';
    }

    /** The cap a phone puts on the box, so the keyboard never hides Save; undefined elsewhere. */
    phoneCap() {
        if (!this.phoneQuery?.matches) return undefined;
        return Math.floor((this.view.visualViewport?.height ?? this.view.innerHeight) * PHONE_HEIGHT_SHARE);
    }

    count() {
        const value = this.area.value;
        return { chars: value.length, lines: value === '' ? 0 : value.split('\n').length };
    }

    // --- Wiring. ---
    connect() {
        const area = this.area;
        this.own(() => this.reset());
        area.classList.add('kp-autosize');
        if (!area.hasAttribute('data-kp-resize')) area.setAttribute('data-kp-resize', 'vertical');
        this.hookValueSetter();
        this.watchSize();
        restoreDraft(area);
        const form = area.form;
        if (form) {
            this.listen(form, 'submit', () => forgetDraft(area));
            this.listen(form, 'reset', () => this.onChange());
        }
        this.registerSubmitKey();
        this.listen(area, 'input', () => this.onInput());
        this.listen(area, 'paste', () => {
            this.pasteAt = area.selectionStart;
        });
        this.listen(area, 'change', () => this.onChange());
        this.measure();
        this.drawCounter();
        if (area.getAttribute('data-kp-state') === 'loading') applyState(this, 'loading');
    }

    /** A script writes `value =`: the setter is the one door. */
    hookValueSetter() {
        const area = this.area;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        if (!descriptor?.get || !descriptor.set) return;
        const { get, set } = descriptor;
        const c = this;
        Object.defineProperty(area, 'value', {
            configurable: true,
            get() {
                return get.call(this);
            },
            set(v) {
                set.call(this, v);
                c.measure();
                c.drawCounter();
            },
        });
        this.own(() => {
            delete (/** @type {any} */ (area).value);
        });
    }

    /** A change of width changes the wrapping; the viewport and a font arriving change the cap and the lines. */
    watchSize() {
        const area = this.area;
        if (typeof ResizeObserver === 'function') {
            const resizes = this.observe(
                new ResizeObserver(() => {
                    const w = Math.round(area.getBoundingClientRect().width);
                    if (w === this.width) return;
                    this.width = w;
                    this.measure();
                }),
            );
            resizes.observe(area);
        }
        const onViewport = () => this.measure();
        if (this.view.visualViewport) this.listen(this.view.visualViewport, 'resize', onViewport);
        if (this.phoneQuery) this.listen(this.phoneQuery, 'change', onViewport);
        void this.doc.fonts?.ready.then(() => this.measure());
    }

    /** Mod+Enter submits, and the `?` sheet lists it. */
    registerSubmitKey() {
        const area = this.area;
        if (attr(area, 'data-kp-submit-key', 'off') !== 'mod-enter') return;
        void import('../shortcuts.js').then(({ registerShortcuts }) => {
            if (this.destroyed) return;
            const unregister = registerShortcuts(
                area,
                [
                    {
                        keys: 'Mod Enter',
                        what: this.strings.autosizeSubmit,
                        group: this.strings.autosizeGroup,
                        when: () => this.doc.activeElement === area && !area.disabled && !area.readOnly,
                        run: () => {
                            if (area.form?.requestSubmit) area.form.requestSubmit();
                            else area.form?.submit();
                        },
                    },
                ],
                { dev: false },
            );
            this.own(() => unregister?.());
        });
    }

    /** Undo what the box got: the card, frame, counter, twin, inline sizes, class and marks. */
    reset() {
        const area = this.area;
        this.card?.remove();
        unframe(this);
        this.counter.remove();
        dropTwin(area);
        area.style.blockSize = '';
        area.style.overflowY = '';
        area.style.removeProperty('--kp-autosize-min');
        area.style.removeProperty('--kp-autosize-max');
        area.classList.remove('kp-autosize');
        area.removeAttribute('data-kp-autosize-engine-used');
        area.removeAttribute('data-kp-autosize-capped');
    }

    // --- Events. ---
    /** A person types, pastes or cuts. */
    onInput() {
        this.measure();
        this.drawCounter();
        this.keepCaretInView();
        if (this.pasteAt >= 0) {
            // A paste longer than the box: the top of what came in stays visible, because the start of a mail names the sender.
            if (this.area.hasAttribute('data-kp-autosize-capped')) {
                const lh = lineHeightOf(this.view.getComputedStyle(this.area));
                this.area.scrollTop = Math.max(0, this.area.value.slice(0, this.pasteAt).split('\n').length - 1) * lh;
            }
            this.pasteAt = -1;
        }
        keepDraft(this.area);
    }

    onChange() {
        this.measure();
        this.drawCounter();
    }

    drawCounter() {
        this.counter.draw(this.counterMode(), this.count());
    }

    keepCaretInView() {
        const area = this.area;
        if (this.doc.activeElement !== area) return;
        const box = area.getBoundingClientRect();
        const visible = this.view.visualViewport?.height ?? this.view.innerHeight;
        if (box.bottom > visible || box.top < 0) {
            // Only when the part the caret is on would be hidden: the box's end is below the fold and the caret is at the end.
            if (area.selectionStart === area.value.length) area.scrollIntoView({ block: 'nearest' });
        }
    }

    // --- Measure. ---
    /** Size the box for its text, with the engine in use, and report the height. */
    measure() {
        const area = this.area;
        if (this.state === 'loading') {
            const cs = this.view.getComputedStyle(area);
            area.style.blockSize = `${Math.ceil(this.minRows() * lineHeightOf(cs) + chromeOf(cs))}px`;
            area.style.overflowY = 'hidden';
            return;
        }
        const engine = this.engineInUse();
        area.setAttribute('data-kp-autosize-engine-used', engine);
        if (engine === 'css') this.measureCss();
        else this.measureJs();
    }

    /** The browser sizes the field; the package says the least and the most, and measures to report. */
    measureCss() {
        const area = this.area;
        const cs = this.view.getComputedStyle(area);
        const lh = lineHeightOf(cs);
        const chrome = chromeOf(cs);
        const rows = this.maxRows();
        const cap = this.phoneCap();
        area.style.blockSize = '';
        area.style.overflowY = '';
        area.style.setProperty('--kp-autosize-min', `${Math.ceil(this.minRows() * lh + chrome)}px`);
        const most = rows === null ? 'none' : `${Math.ceil(Math.min(rows * lh + chrome, cap ?? Number.POSITIVE_INFINITY))}px`;
        area.style.setProperty('--kp-autosize-max', most);
        const result = fitTextarea(area, { minRows: this.minRows(), maxRows: rows, ...(cap !== undefined ? { maxPx: cap } : {}), apply: false });
        this.report(result.height, result.lines, result.capped);
    }

    /** The package sizes the field itself, from the twin's measure. */
    measureJs() {
        const area = this.area;
        const cap = this.phoneCap();
        area.style.removeProperty('--kp-autosize-min');
        area.style.removeProperty('--kp-autosize-max');
        const result = fitTextarea(area, {
            minRows: this.minRows(),
            maxRows: this.maxRows(),
            ...(cap !== undefined ? { maxPx: cap } : {}),
            keepPx: this.shrinks() ? 0 : this.tallest,
        });
        this.tallest = Math.max(this.tallest, result.height);
        this.report(result.height, result.lines, result.capped);
    }

    /** Mark the cap, and fire the event when the height changed. @param {number} height @param {number} lines @param {boolean} capped */
    report(height, lines, capped) {
        this.area.toggleAttribute('data-kp-autosize-capped', capped);
        if (height === this.lastHeight) return;
        this.lastHeight = height;
        this.area.dispatchEvent(new CustomEvent(AUTOSIZE_EVENT, { bubbles: true, detail: { height, lines, capped } }));
    }
}
