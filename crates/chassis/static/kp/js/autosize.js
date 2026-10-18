// A text box that grows with its text [kpadopt6-media; JobTracker's correspondence box, kyu's publish payload].
//
// Not a new component: an opt-in attribute on the existing multiline field (`.kp-field__input--multiline`), so a pasted mail is
// seen whole and the Save button still stays within reach (Kenny, 2026-10-17: "20 regels, daarna scrollen in het vak").
//
//   <textarea class="kp-field__input kp-field__input--multiline" data-kp-autosize rows="3"></textarea>
//
// The grow logic that lived privately in js/json-field.js is here once (`fitTextarea`), and the JSON box calls it.
//
// Options (markup, each with a default [KT6]; the same names are the options of `attachAutosize(root, options)`):
//   data-kp-autosize           present: on; "off": off                                    off (existing fields never change)
//   rows (native)              the least height in lines                                  3
//   data-kp-autosize-max       the most lines, or `none`                                  20 (then the box scrolls inside)
//   data-kp-autosize-engine    css | js | auto: `auto` takes CSS `field-sizing: content` when the browser has it  auto
//   data-kp-autosize-shrink    on | off: deleting text gives the height back              on
//   data-kp-resize             none | vertical: the drag handle                           vertical (a size dragged by hand holds until the next input)
//   data-kp-counter            off | chars | lines | both                                 off
//   maxlength (native)         with a counter: "1 204 of 4 000", warning tone from 90 %
//   data-kp-submit-key         mod-enter: Ctrl or ⌘ with Enter submits the form (listed in the ? sheet)   off
//   data-kp-remember           a name: an unsent draft is kept on this device, cleared when the form is sent
//
// A phone (under 40em) caps the box at 60 % of the visible height as well, so the keyboard never hides the Save button. A
// disabled or read-only box grows to show its whole value. Measured on input, paste, cut, a programmatic `value =`, a change
// of width (wrapping), a font arriving and the visible viewport changing; the height is never animated (an animated height is
// a layout shift). Loading (`setAutosizeState(el, 'loading')`) lays the theme's busy card over the box at its least height;
// failed (`setAutosizeState(el, 'error', 'sentence')`) keeps the text and the height and writes the sentence in the field's
// error line. Fires `kp-autosize-resize` on the box: `{ height, lines, capped }`. Nothing runs on import.

import { getStrings } from './strings.js';
import { resolveLocale } from './locale.js';
import { openBusyCard } from './busy-card.js';

/** A box that grows. */
export const AUTOSIZE = 'textarea[data-kp-autosize]';
/** Fired on the box when its height changed: `{ height, lines, capped }`. */
export const AUTOSIZE_EVENT = 'kp-autosize-resize';
/** The most lines a box grows to unless it says otherwise. */
export const AUTOSIZE_MAX_LINES = 20;
/** The least lines. */
export const AUTOSIZE_MIN_LINES = 3;
/** The states a box can be in. */
export const AUTOSIZE_STATES = /** @type {const} */ (['ready', 'loading', 'error']);

/** Under this width a phone's keyboard takes half the screen: the cap follows the visible height. */
const PHONE = '(max-width: 40em)';

/** @param {string} value @param {number} fallback */
const px = (value, fallback = 0) => {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
};

/**
 * The line height in px of a box: its computed value, else 1.2 times its font size (`normal`). Pure over a computed style.
 * @param {CSSStyleDeclaration} cs
 */
export function lineHeightOf(cs) {
    const n = Number.parseFloat(cs.lineHeight);
    return Number.isFinite(n) ? n : px(cs.fontSize, 16) * 1.2;
}

/** The padding and border, top and bottom, in px. @param {CSSStyleDeclaration} cs */
function chromeOf(cs) {
    return px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
}

/** Properties that decide how text wraps; copied to the measuring twin. */
const WRAP_PROPS = [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'fontVariant',
    'fontStretch',
    'letterSpacing',
    'wordSpacing',
    'textTransform',
    'textIndent',
    'lineHeight',
    'tabSize',
    'whiteSpace',
    'wordBreak',
    'overflowWrap',
    'hyphens',
    'boxSizing',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'borderTopStyle',
    'borderRightStyle',
    'borderBottomStyle',
    'borderLeftStyle',
];

/** @type {WeakMap<HTMLTextAreaElement, HTMLTextAreaElement>} */
const TWINS = new WeakMap();

/**
 * A hidden twin of the box, outside the flow, that holds the same text at the same width: measuring it changes nothing on
 * the page (collapsing the real box to measure it would move the scroll position under the reader's hand).
 * @param {HTMLTextAreaElement} area
 */
function twinOf(area) {
    let twin = TWINS.get(area);
    if (!twin || !twin.isConnected) {
        twin = area.ownerDocument.createElement('textarea');
        twin.setAttribute('aria-hidden', 'true');
        twin.setAttribute('tabindex', '-1');
        twin.readOnly = true;
        twin.rows = 1;
        twin.style.cssText =
            'position:absolute;visibility:hidden;pointer-events:none;inset-block-start:0;inset-inline-start:-9999px;block-size:0;min-block-size:0;max-block-size:none;overflow:hidden;resize:none;margin:0;';
        area.ownerDocument.body.append(twin);
        TWINS.set(area, twin);
    }
    return twin;
}

/**
 * @typedef {object} FitOptions
 * @property {number} [minRows] the least lines (default 3)
 * @property {number | null} [maxRows] the most lines; null: no cap (default 20)
 * @property {number} [maxPx] a second cap in px (a phone's visible height)
 * @property {number} [keepPx] never shorter than this (shrink off: the tallest the box has been)
 * @property {boolean} [apply] write the height (default true)
 */

/**
 * The height a box needs for its text, between the least and the most lines. Measured on a twin, so it is exact and the page
 * does not move.
 *
 * @param {HTMLTextAreaElement} area
 * @param {FitOptions} [options]
 * @returns {{ height: number, scrolls: boolean, capped: boolean, lines: number, lineHeight: number }}
 */
export function fitTextarea(area, { minRows = AUTOSIZE_MIN_LINES, maxRows = AUTOSIZE_MAX_LINES, maxPx, keepPx = 0, apply = true } = {}) {
    const view = area.ownerDocument.defaultView;
    const cs = /** @type {Window} */ (view).getComputedStyle(area);
    const lh = lineHeightOf(cs);
    const chrome = chromeOf(cs);
    const twin = twinOf(area);
    const ts = twin.style;
    for (const name of WRAP_PROPS) /** @type {any} */ (ts)[name] = /** @type {any} */ (cs)[name];
    ts.inlineSize = `${area.getBoundingClientRect().width}px`;
    twin.value = area.value === '' ? ' ' : area.value;
    const border = px(cs.borderTopWidth) + px(cs.borderBottomWidth);
    const content = twin.scrollHeight + border;
    const least = Math.max(1, minRows) * lh + chrome;
    let most = maxRows === null ? Number.POSITIVE_INFINITY : Math.max(maxRows, minRows) * lh + chrome;
    if (maxPx !== undefined) most = Math.max(least, Math.min(most, maxPx));
    const wanted = Math.max(least, keepPx, content);
    const height = Math.ceil(Math.min(most, wanted));
    const scrolls = content > height + 1;
    if (apply) {
        area.style.blockSize = `${height}px`;
        area.style.overflowY = scrolls ? 'auto' : 'hidden';
    }
    return { height, scrolls, capped: wanted > most, lines: Math.max(1, Math.round((twin.scrollHeight - (chrome - border)) / lh)), lineHeight: lh };
}

/** Take a box's measuring twin away. @param {HTMLTextAreaElement} area */
function dropTwin(area) {
    TWINS.get(area)?.remove();
    TWINS.delete(area);
}

/**
 * @typedef {object} AutosizeOptions
 * @property {number} [rows] the least lines
 * @property {number | 'none'} [max] the most lines
 * @property {'css' | 'js' | 'auto'} [engine]
 * @property {boolean} [shrink]
 * @property {'off' | 'chars' | 'lines' | 'both'} [counter]
 */

/**
 * @typedef {object} AutosizeHandle
 * @property {HTMLTextAreaElement} element
 * @property {() => void} refresh measure again (after a value written by a script that bypassed the setter)
 * @property {(state: 'ready' | 'loading' | 'error', message?: string) => void} setState
 * @property {() => { chars: number, lines: number }} count
 * @property {'css' | 'js'} engine the engine in use
 */

/** @type {WeakMap<Element, AutosizeHandle>} */
const HANDLES = new WeakMap();

/** The handle of an attached box. @param {Element} element */
export function autosize(element) {
    return HANDLES.get(element) ?? null;
}

/**
 * Measure a box again.
 * @param {Element} element
 */
export function refreshAutosize(element) {
    HANDLES.get(element)?.refresh();
}

/**
 * Put a box in a state: `loading` lays the busy card over it, `error` writes the sentence in its error line.
 * @param {Element} element @param {'ready' | 'loading' | 'error'} state @param {string} [message]
 */
export function setAutosizeState(element, state, message) {
    HANDLES.get(element)?.setState(state, message);
}

/** Whether this browser sizes a field to its content itself. */
export function cssAutosizeSupported() {
    return typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');
}

let seq = 0;

/** @param {Element} el @param {string} name @param {string} fallback */
const attr = (el, name, fallback) => el.getAttribute(name) ?? fallback;

/**
 * Wire every growing box under `root`.
 * @param {ParentNode} [root]
 * @param {AutosizeOptions} [options] overrides the markup
 * @returns {() => void} detach
 */
export function attachAutosize(root = document, options = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const found = /** @type {HTMLTextAreaElement[]} */ ([
        ...(root instanceof HTMLTextAreaElement && root.matches(AUTOSIZE) ? [root] : []),
        ...root.querySelectorAll(AUTOSIZE),
    ]);
    for (const area of found) {
        if (HANDLES.has(area) || area.getAttribute('data-kp-autosize') === 'off') continue;
        const doc = area.ownerDocument;
        const view = /** @type {Window} */ (doc.defaultView);
        const strings = getStrings();
        const locale = resolveLocale(undefined, area);
        const number = new Intl.NumberFormat(locale);

        const minRows = () => Math.max(1, options.rows ?? (Number(area.getAttribute('rows')) || AUTOSIZE_MIN_LINES));
        const maxRows = () => {
            if (area.disabled || area.readOnly) return null;
            const raw = options.max ?? attr(area, 'data-kp-autosize-max', String(AUTOSIZE_MAX_LINES));
            if (raw === 'none') return null;
            const n = Number(raw);
            return Number.isFinite(n) && n > 0 ? n : AUTOSIZE_MAX_LINES;
        };
        const shrinks = () => (options.shrink ?? attr(area, 'data-kp-autosize-shrink', 'on') !== 'off') !== false;
        const counterMode = () => options.counter ?? /** @type {'off' | 'chars' | 'lines' | 'both'} */ (attr(area, 'data-kp-counter', 'off'));
        const wantedEngine = () => options.engine ?? attr(area, 'data-kp-autosize-engine', 'auto');
        const engineInUse = () => {
            const want = wantedEngine();
            // Shrink off needs the box to remember its tallest, which only the measure can do.
            if (want === 'js' || !shrinks()) return 'js';
            if (want === 'css') return cssAutosizeSupported() ? 'css' : 'js';
            return cssAutosizeSupported() ? 'css' : 'js';
        };

        let state = 'ready';
        let tallest = 0;
        let lastHeight = -1;
        /** @type {import('./busy-card.js').BusyCard | null} */
        let card = null;
        /** @type {HTMLElement | null} */
        let frame = null;
        let wasReadOnly = area.readOnly;
        const phoneQuery = view.matchMedia?.(PHONE);

        area.classList.add('kp-autosize');
        if (!area.hasAttribute('data-kp-resize')) area.setAttribute('data-kp-resize', 'vertical');

        const phoneCap = () => (phoneQuery?.matches ? Math.floor((view.visualViewport?.height ?? view.innerHeight) * 0.6) : undefined);

        const measure = () => {
            if (state === 'loading') {
                const cs = view.getComputedStyle(area);
                area.style.blockSize = `${Math.ceil(minRows() * lineHeightOf(cs) + chromeOf(cs))}px`;
                area.style.overflowY = 'hidden';
                return;
            }
            const engine = engineInUse();
            area.setAttribute('data-kp-autosize-engine-used', engine);
            const cs = view.getComputedStyle(area);
            const lh = lineHeightOf(cs);
            const chrome = chromeOf(cs);
            const rows = maxRows();
            const cap = phoneCap();
            if (engine === 'css') {
                // The browser sizes the field; the package says the least and the most, and measures to report.
                area.style.blockSize = '';
                area.style.overflowY = '';
                area.style.setProperty('--kp-autosize-min', `${Math.ceil(minRows() * lh + chrome)}px`);
                const most = rows === null ? 'none' : `${Math.ceil(Math.min(rows * lh + chrome, cap ?? Number.POSITIVE_INFINITY))}px`;
                area.style.setProperty('--kp-autosize-max', most);
                const result = fitTextarea(area, { minRows: minRows(), maxRows: rows, ...(cap !== undefined ? { maxPx: cap } : {}), apply: false });
                report(result.height, result.lines, result.capped);
                return;
            }
            area.style.removeProperty('--kp-autosize-min');
            area.style.removeProperty('--kp-autosize-max');
            const result = fitTextarea(area, {
                minRows: minRows(),
                maxRows: rows,
                ...(cap !== undefined ? { maxPx: cap } : {}),
                keepPx: shrinks() ? 0 : tallest,
            });
            tallest = Math.max(tallest, result.height);
            report(result.height, result.lines, result.capped);
        };

        /** @param {number} height @param {number} lines @param {boolean} capped */
        const report = (height, lines, capped) => {
            area.toggleAttribute('data-kp-autosize-capped', capped);
            if (height === lastHeight) return;
            lastHeight = height;
            area.dispatchEvent(new CustomEvent(AUTOSIZE_EVENT, { bubbles: true, detail: { height, lines, capped } }));
        };

        const keepCaretInView = () => {
            if (doc.activeElement !== area) return;
            const box = area.getBoundingClientRect();
            const visible = view.visualViewport?.height ?? view.innerHeight;
            if (box.bottom > visible || box.top < 0) {
                // Only when the part the caret is on would be hidden: the box's end is below the fold and the caret is at the end.
                if (area.selectionStart === area.value.length) area.scrollIntoView({ block: 'nearest' });
            }
        };

        // The counter.
        /** @type {HTMLElement | null} */
        let counter = null;
        /** @type {HTMLElement | null} */
        let live = null;
        let announced = 0;
        const drawCounter = () => {
            const mode = counterMode();
            if (mode === 'off') {
                counter?.remove();
                live?.remove();
                counter = null;
                live = null;
                return;
            }
            if (!counter) {
                counter = doc.createElement('p');
                counter.className = 'kp-autosize__counter';
                (frame ?? area).after(counter);
            }
            const { chars, lines } = count();
            const max = area.maxLength > 0 ? area.maxLength : 0;
            let text;
            if (max > 0 && mode !== 'lines') text = strings.autosizeOf(number.format(chars), number.format(max));
            else if (mode === 'lines') text = strings.autosizeLines(lines, number.format(lines));
            else if (mode === 'both') text = strings.autosizeBoth(chars, number.format(chars), lines, number.format(lines));
            else text = strings.autosizeChars(chars, number.format(chars));
            if (counter.textContent !== text) counter.textContent = text;
            const share = max > 0 ? chars / max : 0;
            if (max > 0 && share >= 0.9) counter.setAttribute('data-kp-tone', 'warning');
            else counter.removeAttribute('data-kp-tone');
            // Announced politely at 90 % and 100 % only, not on every key.
            if (max > 0) {
                const level = share >= 1 ? 2 : share >= 0.9 ? 1 : 0;
                if (level !== announced) {
                    announced = level;
                    if (level > 0) {
                        if (!live) {
                            live = doc.createElement('span');
                            live.className = 'kp-sr-only';
                            live.setAttribute('role', 'status');
                            counter.after(live);
                        }
                        live.textContent = level === 2 ? strings.autosizeFull(number.format(max)) : strings.autosizeNear(number.format(chars), number.format(max));
                    } else if (live) live.textContent = '';
                }
            }
        };

        const count = () => {
            const value = area.value;
            return { chars: value.length, lines: value === '' ? 0 : value.split('\n').length };
        };

        // A person types, pastes or cuts.
        let pasteAt = -1;
        const onInput = () => {
            measure();
            drawCounter();
            keepCaretInView();
            if (pasteAt >= 0) {
                // A paste longer than the box: the top of what came in stays visible, because the start of a mail names the sender.
                if (area.hasAttribute('data-kp-autosize-capped')) {
                    const lh = lineHeightOf(view.getComputedStyle(area));
                    area.scrollTop = Math.max(0, area.value.slice(0, pasteAt).split('\n').length - 1) * lh;
                }
                pasteAt = -1;
            }
            remember();
        };
        const onPaste = () => {
            pasteAt = area.selectionStart;
        };
        const onChange = () => {
            measure();
            drawCounter();
        };

        // A script writes `value =`: the setter is the one door.
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        if (descriptor?.get && descriptor.set) {
            const { get, set } = descriptor;
            Object.defineProperty(area, 'value', {
                configurable: true,
                get() {
                    return get.call(this);
                },
                set(v) {
                    set.call(this, v);
                    measure();
                    drawCounter();
                },
            });
            cleanups.push(() => {
                delete (/** @type {any} */ (area).value);
            });
        }

        // A change of width changes the wrapping; a box that is not on screen yet is measured when it arrives.
        let width = -1;
        const resizes = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
            const w = Math.round(area.getBoundingClientRect().width);
            if (w === width) return;
            width = w;
            measure();
        }) : null;
        resizes?.observe(area);
        const onViewport = () => measure();
        view.visualViewport?.addEventListener('resize', onViewport);
        phoneQuery?.addEventListener('change', onViewport);
        void doc.fonts?.ready.then(() => measure());

        // A draft kept on this device until the form is sent.
        const draftKey = () => {
            const name = area.getAttribute('data-kp-remember');
            return name ? `kp-remember:autosize:${name}:draft` : null;
        };
        function remember() {
            const key = draftKey();
            if (!key) return;
            try {
                if (area.value === '') localStorage.removeItem(key);
                else localStorage.setItem(key, area.value);
            } catch {
                // Storage refused: the draft lasts as long as the page.
            }
        }
        const key = draftKey();
        if (key && area.value === '') {
            try {
                const draft = localStorage.getItem(key);
                if (draft) area.value = draft;
            } catch {
                // No storage.
            }
        }
        const form = area.form;
        const onSubmit = () => {
            const k = draftKey();
            if (!k) return;
            try {
                localStorage.removeItem(k);
            } catch {
                // No storage.
            }
        };
        form?.addEventListener('submit', onSubmit);
        form?.addEventListener('reset', onChange);

        // Mod+Enter submits, and the `?` sheet lists it.
        /** @type {(() => void) | null} */
        let unregister = null;
        if (attr(area, 'data-kp-submit-key', 'off') === 'mod-enter') {
            void import('./shortcuts.js').then(({ registerShortcuts }) => {
                if (!HANDLES.has(area)) return;
                unregister = registerShortcuts(
                    area,
                    [
                        {
                            keys: 'Mod Enter',
                            what: strings.autosizeSubmit,
                            group: strings.autosizeGroup,
                            when: () => doc.activeElement === area && !area.disabled && !area.readOnly,
                            run: () => {
                                if (area.form?.requestSubmit) area.form.requestSubmit();
                                else area.form?.submit();
                            },
                        },
                    ],
                    { dev: false },
                );
            });
        }

        /** Make the frame that a busy card needs, around the box. */
        const framed = () => {
            if (frame) return frame;
            frame = doc.createElement('div');
            frame.className = 'kp-autosize__frame';
            area.before(frame);
            frame.append(area);
            return frame;
        };
        const unframe = () => {
            if (!frame) return;
            frame.replaceWith(area);
            frame = null;
        };

        /** @type {AutosizeHandle['setState']} */
        const setState = (next, message) => {
            if (next === state && next !== 'error') return;
            const field = area.closest('.kp-field');
            const holder = () => {
                let h = /** @type {HTMLElement | null} */ (field?.querySelector('[data-kp-field-error]') ?? null);
                if (!h) {
                    h = doc.createElement('p');
                    h.className = 'kp-field__error';
                    h.setAttribute('data-kp-field-error', '');
                    h.id = `kp-autosize-${++seq}-error`;
                    (counter ?? frame ?? area).after(h);
                }
                return h;
            };
            if (state === 'loading' && next !== 'loading') {
                area.readOnly = wasReadOnly;
                area.removeAttribute('aria-busy');
                const closing = card;
                card = null;
                void closing?.close().then(() => {
                    if (state !== 'loading') unframe();
                });
            }
            if (next === 'loading') {
                wasReadOnly = area.readOnly;
                area.readOnly = true;
                area.setAttribute('aria-busy', 'true');
                card ??= openBusyCard(framed(), { words: strings.autosizeLoading, area: () => [area], className: 'kp-autosize__busy' });
            }
            if (next === 'error') {
                const h = holder();
                h.textContent = message ?? strings.autosizeFailed;
                h.hidden = false;
                area.setAttribute('aria-invalid', 'true');
                area.setAttribute('aria-describedby', [...new Set([...(area.getAttribute('aria-describedby') ?? '').split(/\s+/), h.id].filter(Boolean))].join(' '));
                field?.classList.add('kp-field--invalid');
            } else {
                const h = /** @type {HTMLElement | null} */ (field?.querySelector('[data-kp-field-error]') ?? null);
                if (h && state === 'error') {
                    h.hidden = true;
                    h.textContent = '';
                    area.removeAttribute('aria-invalid');
                    field?.classList.remove('kp-field--invalid');
                }
            }
            state = next;
            area.setAttribute('data-kp-state', next);
            measure();
        };

        const handle = {
            element: area,
            refresh() {
                measure();
                drawCounter();
            },
            setState,
            count,
            get engine() {
                return /** @type {'css' | 'js'} */ (engineInUse());
            },
        };
        HANDLES.set(area, handle);
        area.addEventListener('input', onInput);
        area.addEventListener('paste', onPaste);
        area.addEventListener('change', onChange);
        measure();
        drawCounter();
        if (area.getAttribute('data-kp-state') === 'loading') setState('loading');

        cleanups.push(() => {
            area.removeEventListener('input', onInput);
            area.removeEventListener('paste', onPaste);
            area.removeEventListener('change', onChange);
            form?.removeEventListener('submit', onSubmit);
            form?.removeEventListener('reset', onChange);
            resizes?.disconnect();
            view.visualViewport?.removeEventListener('resize', onViewport);
            phoneQuery?.removeEventListener('change', onViewport);
            unregister?.();
            card?.remove();
            unframe();
            counter?.remove();
            live?.remove();
            dropTwin(area);
            area.style.blockSize = '';
            area.style.overflowY = '';
            area.style.removeProperty('--kp-autosize-min');
            area.style.removeProperty('--kp-autosize-max');
            area.classList.remove('kp-autosize');
            area.removeAttribute('data-kp-autosize-engine-used');
            area.removeAttribute('data-kp-autosize-capped');
            HANDLES.delete(area);
        });
    }
    return () => {
        for (const clean of cleanups) clean();
    };
}
