// A live number that ticks to its new value [kpadopt4-data; JobTracker's
// `TickNumber` (ui/kit.jsx)].
//
// `[data-kp-count]` (js/effects/count.js) counts up once, when a number
// first arrives. A live counter changes after that: twelve open items become
// fifteen on the next poll. Mark it, and write the new number the way you
// always do; the module counts from the number shown to the new one:
//
//   <span class="kp-kpi__value" data-kp-tick>1.204</span>
//   counter.textContent = '1.210';            // or React re-renders it
//   tickTo(counter, '1.210');                 // the same, by call
//
// The written text is the oracle, as for the count-up: the module reads the
// first number out of it in the page's language (`lang`: `1.204` is a
// thousand two hundred and four in Dutch), counts in its precision, and
// ends on exactly the text that was written, never a rounded or shortened
// one. It writes into the element's own text node, so a framework that
// owns that node (React) still finds it. Down counts too.
//
// `--kp-tick` is how long it takes in ms (default 600; `0` means no
// ticking at all). A reader who asked for less motion sees the new number
// at once, and so does a jump the eye cannot follow (more than 400 steps of
// the precision is drawn as 400). While it runs the element carries
// `aria-busy="true"` and `data-kp-tick-state="running"` (`done` after), so a
// live region speaks only the number it lands on; `kp-tick` fires when it
// lands, with the value in `detail`.

import { motionAllowed } from './calm.js';

/** An element whose number ticks when its text changes. */
export const TICK = '[data-kp-tick]';
/** How long a tick takes, in ms. */
export const TICK_KNOB = '--kp-tick';
/** The default length of a tick, in ms. */
export const TICK_MS = 600;
/** Fired when a tick lands: `{ value }`. */
export const TICK_EVENT = 'kp-tick';

/**
 * @typedef {object} TickParse
 * @property {number} value
 * @property {number} decimals
 * @property {(value: number) => string} render  the text with another value in the same shape
 */

/**
 * Read the first number out of `text` in the shape `locale` writes numbers,
 * with a way to write another value back in the same shape (the same text
 * around it, grouping and decimals). Null when the text holds no number.
 * @param {string} text @param {string | undefined} locale
 * @returns {TickParse | null}
 */
export function parseTick(text, locale) {
    const match = /-?\d[\d\s.,  ']*/.exec(text);
    if (match === null) return null;
    const raw = match[0];
    const whole = raw.trimEnd();
    const before = text.slice(0, match.index);
    const after = raw.slice(whole.length) + text.slice(match.index + raw.length);
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    const group = parts.find((part) => part.type === 'group')?.value ?? '';
    const decimal = parts.find((part) => part.type === 'decimal')?.value ?? '.';
    const cut = whole.lastIndexOf(decimal);
    const decimals = cut < 0 ? 0 : whole.length - cut - 1;
    const digits = (/** @type {string} */ part) => part.replace(/[^\d-]/g, '');
    const value = Number(cut < 0 ? digits(whole) : `${digits(whole.slice(0, cut))}.${digits(whole.slice(cut + 1))}`);
    if (!Number.isFinite(value)) return null;
    const groupInText = whole.match(/\d([\s.,  '])\d{3}(?!\d)/)?.[1];
    const groupMark = groupInText !== undefined && groupInText !== decimal ? groupInText : group !== '' && whole.includes(group) ? group : '';
    return {
        value,
        decimals,
        render: (next) => {
            const [int, frac] = Math.abs(next).toFixed(decimals).split('.');
            const sign = next < 0 && Number(next.toFixed(decimals)) !== 0 ? '-' : '';
            const body = groupMark ? int.replace(/\B(?=(\d{3})+(?!\d))/g, groupMark) : int;
            return `${before}${sign}${body}${decimals ? decimal + frac : ''}${after}`;
        },
    };
}

/** @type {WeakMap<Element, { frame: number, written: string, shown: number | null, land?: () => void }>} */
const STATE = new WeakMap();

/** The text node a number lives in: the element's first text node with a digit. @param {Element} el */
function numberNode(el) {
    const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (/\d/.test(node.nodeValue ?? '')) return /** @type {Text} */ (node);
    return null;
}

/** @param {Element} el */
const localeOf = (el) => /** @type {HTMLElement | null} */ (el.closest('[lang]'))?.lang || el.ownerDocument.documentElement.lang || undefined;

/** @param {Element} el */
function reduced(el) {
    return !motionAllowed(el);
}

/**
 * Count `el` from the number it shows to the number in `text`, and end on
 * `text` exactly. Without a number in either, `text` is written at once.
 * @param {Element} el
 * @param {string} [text]  the new text; left out, the element's own text is the target (it was just written)
 * @param {{ from?: number, duration?: number }} [options]  `from` the number to start at (default the one last shown)
 */
export function tickTo(el, text, { from, duration } = {}) {
    const view = el.ownerDocument.defaultView;
    const state = STATE.get(el) ?? { frame: 0, written: '', shown: null };
    STATE.set(el, state);
    if (state.frame) view?.cancelAnimationFrame(state.frame);
    state.frame = 0;
    const node = numberNode(el);
    const target = text ?? node?.nodeValue ?? el.textContent ?? '';
    const locale = localeOf(el);
    const parsed = parseTick(target, locale);
    const start = from ?? state.shown;
    const write = (/** @type {string} */ value) => {
        state.written = value;
        const own = numberNode(el);
        if (own) own.nodeValue = value;
        else el.textContent = value;
    };
    const land = () => {
        state.frame = 0;
        state.land = undefined;
        write(target);
        state.shown = parsed?.value ?? null;
        el.removeAttribute('aria-busy');
        el.setAttribute('data-kp-tick-state', 'done');
        el.dispatchEvent(new CustomEvent(TICK_EVENT, { bubbles: true, detail: { value: parsed?.value ?? null } }));
    };
    const asked = view?.getComputedStyle(el).getPropertyValue(TICK_KNOB).trim() ?? '';
    const ms = duration ?? (asked === '' || !Number.isFinite(Number(asked)) ? TICK_MS : Number(asked));
    if (!parsed || start == null || start === parsed.value || ms <= 0 || reduced(el) || !view) {
        land();
        return;
    }
    const unit = 10 ** -parsed.decimals;
    const steps = Math.abs(parsed.value - start) / unit;
    const begin = steps > 400 ? parsed.value - Math.sign(parsed.value - start) * 400 * unit : start;
    el.setAttribute('aria-busy', 'true');
    el.setAttribute('data-kp-tick-state', 'running');
    state.land = land;
    const t0 = view.performance.now();
    const step = () => {
        const t = Math.min(1, (view.performance.now() - t0) / ms);
        if (t >= 1 || reduced(el)) {
            land();
            return;
        }
        const eased = 1 - (1 - t) ** 3;
        const value = begin + (parsed.value - begin) * eased;
        state.shown = value;
        write(parsed.render(value));
        state.frame = view.requestAnimationFrame(step);
    };
    state.frame = view.requestAnimationFrame(step);
}

/**
 * Watch every `[data-kp-tick]` under `root` (and those added later): when
 * its text is changed by anyone but this module, it ticks from the number it
 * showed to the new one.
 * @param {ParentNode} [root]
 * @returns {() => void} detach: every running tick lands on its number
 */
export function attachTicks(root = document) {
    const doc = root instanceof Document ? root : /** @type {Element} */ (root).ownerDocument;
    const View = doc.defaultView;
    const remember = (/** @type {Element} */ el) => {
        if (STATE.has(el)) return;
        const parsed = parseTick(numberNode(el)?.nodeValue ?? '', localeOf(el));
        STATE.set(el, { frame: 0, written: numberNode(el)?.nodeValue ?? '', shown: parsed?.value ?? null });
        el.setAttribute('data-kp-tick-state', 'done');
    };
    const all = () => [...(root instanceof Element && root.matches(TICK) ? [root] : []), ...root.querySelectorAll(TICK)];
    for (const el of all()) remember(el);
    if (!View?.MutationObserver) return () => {};
    const observer = new View.MutationObserver((records) => {
        /** @type {Set<Element>} */
        const touched = new Set();
        for (const record of records) {
            const target = record.target instanceof View.Element ? record.target : record.target.parentElement;
            const el = target?.closest(TICK);
            if (el && (root === doc || root.contains(el))) touched.add(el);
            for (const node of record.addedNodes) if (node instanceof View.Element) for (const one of [node, ...node.querySelectorAll(TICK)]) if (one.matches(TICK)) remember(one);
        }
        for (const el of touched) {
            const state = STATE.get(el);
            if (!state) {
                remember(el);
                continue;
            }
            const now = numberNode(el)?.nodeValue ?? el.textContent ?? '';
            if (now === state.written) continue;
            tickTo(el, now);
        }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => {
        observer.disconnect();
        for (const el of all()) {
            const state = STATE.get(el);
            if (state?.frame) View.cancelAnimationFrame(state.frame);
            state?.land?.();
        }
    };
}
