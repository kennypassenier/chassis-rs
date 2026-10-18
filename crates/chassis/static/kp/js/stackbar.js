// The share bar: one bar split into the parts of a whole [kpadopt4-data; the
// admin dashboard's `hk-stack-bar` on the Host page, "what fills the root
// volume"].
//
//   <figure class="kp-stackbar" data-kp-stackbar></figure>
//
//   setStackbar(el, {
//       title: 'Root volume',
//       total: 120,
//       format: (gb) => `${gb} GB`,
//       parts: [{ key: 'images', label: 'Docker images', value: 41 }, { key: 'logs', label: '/var/log', value: 6.5 }],
//       marks: [{ at: 0.8, label: '80 % warning level' }],
//   });
//
// The parts are drawn in the theme's chart colours in the order given (the
// sixth on takes the palette again, hatched), the rest of `total` is the
// track, labelled "Free" in the legend; every part's exact value stands in
// the legend, and in the hover card with its share. Parts smaller than
// `other` (a share, default 0) are merged into one "Other" part. When the parts
// add up to more than `total`, the bar is their sum, a ▸ stands at its end
// and the free row says "Over by …".
//
// Keyboard: the parts are one tab stop; the arrow keys, Home and End move
// between them, and each part's hover card opens on focus. Pointing at a
// part or its legend row lights both. A press on either fires
// `kp-stackbar-pick` `{ key, part }` on the root (the page may filter).
//
// States: `state: 'loading'` (the bar shows the meter's own loading picture,
// js/kpi.js setMeter, the one every theme draws for a bar that waits: formal
// rules a navy line along it [G10]; the legend keeps its rows as the theme's
// waiting lines, `aria-busy`), `'empty'` (nothing read yet) and `'error'` (a
// sentence; `message` replaces the default, with a normal-size Retry that
// fires `kp-stackbar-retry`, `retry: false` leaves it out). Empty and error
// are one calm note over the bar's and the legend's whole footprint (the
// empty state's frame and each theme's empty-state title, the sentence and
// Retry side by side so the note fits the small footprint), the height they had, the words and
// the button centred in it (Kenny, 2026-10-16: failed, empty and loading fill
// the component's full normal size); a bar without a legend keeps its track
// and says it in its accessible name and hover card. Nothing under it moves.
// A share bar is one figure, as a meter is, not a data area: its own bar
// waits, not the busy card.

import { getStrings } from './strings.js';
import { attachHoverCards } from './hovercard.js';
import { setMeter } from './kpi.js';

/** A share bar the page fills with setStackbar(). */
export const STACKBAR = '[data-kp-stackbar]';
/** Fired on the root when a part or its legend row is pressed: `{ key, part }`. */
export const STACKBAR_PICK_EVENT = 'kp-stackbar-pick';
/** Fired on the root when the Retry of a failed share bar is pressed. */
export const STACKBAR_RETRY_EVENT = 'kp-stackbar-retry';

/**
 * @typedef {object} StackbarPart
 * @property {string} [key]    stable id (default the label)
 * @property {string} label
 * @property {number} value    in the unit of `total`
 * @property {string} [tip]    the hover card's text, in place of label, value and share
 * @property {'warning' | 'destructive'} [tone]  a part that needs attention takes the status colour
 */

/**
 * @typedef {object} StackbarSpec
 * @property {StackbarPart[]} [parts]
 * @property {number} [total]       the whole; without it, the sum of the parts
 * @property {string} [title]       a line over the bar
 * @property {string} [summary]     the words at the head's end (default: the sum of the format over the whole)
 * @property {(value: number) => string} [format]  how a value reads (default: the number in the page's language)
 * @property {string} [restLabel]   the free row's label (default the dictionary's `stackbarRest`)
 * @property {number} [other]       parts under this share are merged into "Other" (default 0, none)
 * @property {{ at: number, label?: string }[]} [marks]  ticks across the bar at a share of the whole
 * @property {boolean} [legend]     default true
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]
 * @property {string} [message]     the sentence of an empty or failed bar
 * @property {boolean} [retry]      false leaves Retry out of a failed bar (a read the page cannot repeat)
 * @property {string} [label]       the bar's accessible name (default: every part in order)
 */

/** @type {WeakMap<HTMLElement, { parts: number, wired: boolean, height: number }>} */
const MEMORY = new WeakMap();

/** @param {Document} doc @param {string} className @param {string} [tag] */
const make = (doc, className, tag = 'span') => {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
};

/** @param {HTMLElement} el */
const langOf = (el) => /** @type {HTMLElement | null} */ (el.closest('[lang]'))?.lang || undefined;

/** A share as words: one decimal under ten per cent, whole above. @param {number} share @param {string | undefined} lang */
export function shareText(share, lang) {
    const pct = share * 100;
    return new Intl.NumberFormat(lang, { maximumFractionDigits: pct > 0 && pct < 10 ? 1 : 0 }).format(pct) + ' %';
}

/**
 * The arithmetic of a share bar, with no DOM: the parts as drawn (merged
 * into Other where asked), each with its share of the bar, the free rest,
 * and whether the parts run past the whole.
 * @param {StackbarPart[]} parts @param {number | undefined} total @param {number} [other]
 */
export function stackbarParts(parts, total, other = 0) {
    const clean = parts.filter((part) => Number.isFinite(part.value) && part.value > 0);
    const sum = clean.reduce((acc, part) => acc + part.value, 0);
    const whole = Number.isFinite(total) && /** @type {number} */ (total) > 0 ? /** @type {number} */ (total) : sum;
    /** @type {(StackbarPart & { key: string, merged?: number })[]} */
    const kept = [];
    let otherValue = 0;
    let merged = 0;
    for (const part of clean) {
        if (whole > 0 && part.value / whole < other) {
            otherValue += part.value;
            merged += 1;
        } else kept.push({ ...part, key: part.key ?? part.label });
    }
    if (merged > 0) kept.push({ key: '\u0000other', label: getStrings().stackbarOther, value: otherValue, merged });
    const scale = Math.max(whole, sum);
    return {
        parts: kept.map((part) => ({ ...part, share: whole > 0 ? part.value / whole : 0, width: scale > 0 ? part.value / scale : 0 })),
        whole,
        sum,
        rest: Math.max(0, whole - sum),
        over: sum > whole ? sum - whole : 0,
    };
}

/**
 * Draw (or redraw) a share bar. Calling it again with new numbers keeps the
 * focus on the part it was on, by key.
 * @param {HTMLElement} el the root, a `.kp-stackbar`
 * @param {StackbarSpec} spec
 */
export function setStackbar(el, spec) {
    const doc = el.ownerDocument;
    const strings = getStrings();
    const lang = langOf(el);
    const state = spec.state ?? 'ready';
    const memory = MEMORY.get(el) ?? { parts: 2, wired: false, height: 0 };
    MEMORY.set(el, memory);
    const format = spec.format ?? ((/** @type {number} */ value) => new Intl.NumberFormat(lang).format(value));
    const focusedKey = /** @type {HTMLElement | null} */ (el.querySelector('.kp-stackbar__seg:focus'))?.dataset.kpStackbarKey;

    el.classList.add('kp-stackbar');
    el.setAttribute('data-kp-stackbar', '');
    el.setAttribute('data-kp-state', state);
    if (state === 'loading') el.setAttribute('aria-busy', 'true');
    else el.removeAttribute('aria-busy');

    const nodes = [];
    const calc = stackbarParts(spec.parts ?? [], spec.total, spec.other ?? 0);
    if (spec.title !== undefined) {
        const head = make(doc, 'kp-stackbar__head', 'div');
        const title = make(doc, 'kp-stackbar__title');
        title.textContent = spec.title;
        head.append(title);
        const summaryText = spec.summary ?? (state === 'ready' && calc.whole > 0 ? `${format(calc.sum)} / ${format(calc.whole)}` : '');
        const summary = make(doc, 'kp-stackbar__total');
        summary.textContent = summaryText;
        head.append(summary);
        nodes.push(head);
    }

    const bar = make(doc, 'kp-stackbar__bar', 'div');
    const legendWanted = spec.legend !== false;
    const noted = (state === 'empty' || state === 'error' || (state === 'ready' && calc.parts.length === 0)) && legendWanted;
    if (!noted) nodes.push(bar);
    // The footprint of the bar and its legend, kept by an empty or failed note.
    const body = [...el.querySelectorAll(':scope > :is(.kp-stackbar__bar, .kp-stackbar__legend, .kp-stackbar__note)')].map((n) =>
        n.getBoundingClientRect(),
    );
    if (body.length) memory.height = Math.max(...body.map((r) => r.bottom)) - Math.min(...body.map((r) => r.top));
    let refocus = false;

    if (state === 'loading') {
        // The meter's own loading picture, at the bar's size: the theme's way a bar waits.
        const wait = make(doc, 'kp-meter kp-stackbar__wait');
        setMeter(wait, { loading: true });
        wait.removeAttribute('role');
        wait.removeAttribute('aria-valuetext');
        wait.setAttribute('aria-hidden', 'true');
        bar.append(wait);
        bar.setAttribute('role', 'img');
        bar.setAttribute('aria-label', strings.stackbarLoading);
        if (legendWanted) {
            const legend = make(doc, 'kp-stackbar__legend', 'ul');
            legend.setAttribute('aria-hidden', 'true');
            for (let i = 0; i < memory.parts; i += 1) {
                const item = make(doc, 'kp-stackbar__item', 'li');
                const swatch = make(doc, 'kp-stackbar__swatch');
                swatch.style.setProperty('--kp-stackbar-colour', 'var(--muted)');
                const line = make(doc, 'kp-stackbar__wait-line');
                line.append(make(doc, 'kp-skeleton'));
                item.append(swatch, line);
                legend.append(item);
            }
            nodes.push(legend);
        }
    } else if (state === 'empty' || state === 'error' || calc.parts.length === 0) {
        const failed = state === 'error';
        const words = spec.message ?? (failed ? strings.stackbarError : strings.stackbarEmpty);
        if (!noted) {
            // No legend, no room for words: the track stays and says it.
            bar.setAttribute('role', 'img');
            bar.setAttribute('aria-label', words);
            bar.setAttribute('data-kp-hovercard', words);
            bar.setAttribute('tabindex', '0');
        } else {
            refocus = el.querySelector(':scope > .kp-stackbar__note')?.contains(doc.activeElement) ?? false;
            const note = make(doc, 'kp-stackbar__note', 'div');
            if (memory.height > 0) note.style.minBlockSize = `${memory.height}px`;
            note.setAttribute('role', failed ? 'alert' : 'status');
            const said = make(doc, 'kp-empty__title kp-stackbar__note-title', 'p');
            said.textContent = words;
            note.append(said);
            if (failed && spec.retry !== false) {
                const retry = make(doc, 'kp-button kp-stackbar__retry', 'button');
                retry.setAttribute('type', 'button');
                retry.setAttribute('data-kp-stackbar-retry', '');
                retry.textContent = strings.stackbarRetry;
                note.append(retry);
            }
            nodes.push(note);
        }
    } else {
        memory.parts = Math.max(2, calc.parts.length + (calc.rest > 0 || calc.over > 0 ? 1 : 0));
        bar.setAttribute('role', 'group');
        /** @type {string[]} */
        const spoken = [];
        const legend = legendWanted ? make(doc, 'kp-stackbar__legend', 'ul') : null;
        calc.parts.forEach((part, i) => {
            const colour = part.tone ? `var(--${part.tone})` : `var(--chart-${(i % 5) + 1})`;
            const words = part.tip ?? strings.stackbarPart(part.label, format(part.value), shareText(part.share, lang));
            spoken.push(strings.stackbarPart(part.label, format(part.value), shareText(part.share, lang)));
            const seg = make(doc, 'kp-stackbar__seg');
            seg.dataset.kpStackbarKey = part.key;
            seg.setAttribute('role', 'img');
            seg.setAttribute('aria-label', words);
            seg.setAttribute('data-kp-hovercard', words);
            seg.setAttribute('tabindex', '-1');
            seg.style.setProperty('--kp-share', String(part.width));
            seg.style.setProperty('--kp-stackbar-colour', colour);
            if (i >= 5) seg.setAttribute('data-kp-stackbar-hatch', '');
            bar.append(seg);
            if (legend) {
                const item = make(doc, 'kp-stackbar__item', 'li');
                item.dataset.kpStackbarKey = part.key;
                const swatch = make(doc, 'kp-stackbar__swatch');
                swatch.setAttribute('aria-hidden', 'true');
                swatch.style.setProperty('--kp-stackbar-colour', colour);
                if (i >= 5) swatch.setAttribute('data-kp-stackbar-hatch', '');
                const label = make(doc, 'kp-stackbar__label');
                label.textContent = part.label;
                label.title = part.label;
                const value = make(doc, 'kp-stackbar__value');
                value.textContent = format(part.value);
                item.append(swatch, label, value);
                legend.append(item);
            }
        });
        if (calc.rest > 0 || calc.over > 0) {
            const restWords = calc.over > 0 ? strings.stackbarOver(format(calc.over)) : `${spec.restLabel ?? strings.stackbarRest}`;
            spoken.push(calc.over > 0 ? restWords : `${restWords}: ${format(calc.rest)}`);
            if (legend) {
                const item = make(doc, 'kp-stackbar__item', 'li');
                item.setAttribute('data-kp-stackbar-rest', '');
                if (calc.over > 0) item.setAttribute('data-kp-stackbar-over', '');
                const swatch = make(doc, 'kp-stackbar__swatch');
                swatch.setAttribute('aria-hidden', 'true');
                const label = make(doc, 'kp-stackbar__label');
                label.textContent = calc.over > 0 ? restWords : (spec.restLabel ?? strings.stackbarRest);
                const value = make(doc, 'kp-stackbar__value');
                value.textContent = calc.over > 0 ? format(calc.sum) : format(calc.rest);
                item.append(swatch, label, value);
                legend.append(item);
            }
        }
        bar.toggleAttribute('data-kp-over', calc.over > 0);
        bar.toggleAttribute('data-kp-stackbar-full', calc.rest === 0);
        bar.setAttribute(
            'aria-label',
            spec.label ?? (spec.title ? `${spec.title}. ${strings.stackbarLabel(spoken)}` : strings.stackbarLabel(spoken)),
        );
        for (const mark of spec.marks ?? []) {
            const tick = make(doc, 'kp-stackbar__mark');
            tick.setAttribute('aria-hidden', 'true');
            tick.style.setProperty('--kp-at', String(calc.sum > calc.whole && calc.sum > 0 ? (mark.at * calc.whole) / calc.sum : mark.at));
            if (mark.label) tick.title = mark.label;
            bar.append(tick);
        }
        const segs = /** @type {HTMLElement[]} */ ([...bar.querySelectorAll('.kp-stackbar__seg')]);
        const stop = segs.find((seg) => seg.dataset.kpStackbarKey === focusedKey) ?? segs[0];
        stop?.setAttribute('tabindex', '0');
        if (legend) nodes.push(legend);
    }

    el.replaceChildren(...nodes);
    if (refocus) {
        el.tabIndex = -1;
        el.focus({ preventScroll: true });
    }
    if (focusedKey) /** @type {HTMLElement | null} */ (el.querySelector(`.kp-stackbar__seg[tabindex="0"]`))?.focus();
    if (state !== 'loading') attachHoverCards(doc);
    if (!memory.wired) {
        memory.wired = true;
        wire(el);
    }
}

/** The listeners of one root, set once: they read the parts as they stand. @param {HTMLElement} el */
function wire(el) {
    /** @param {EventTarget | null} target */
    const keyOf = (target) =>
        target instanceof Element ? /** @type {HTMLElement | null} */ (target.closest('[data-kp-stackbar-key]'))?.dataset.kpStackbarKey : undefined;
    /** @param {string | undefined} key */
    const light = (key) => {
        for (const node of el.querySelectorAll('[data-kp-stackbar-lit]')) node.removeAttribute('data-kp-stackbar-lit');
        if (key === undefined) return;
        for (const node of el.querySelectorAll('[data-kp-stackbar-key]'))
            if (/** @type {HTMLElement} */ (node).dataset.kpStackbarKey === key) node.setAttribute('data-kp-stackbar-lit', '');
    };
    el.addEventListener('pointerover', (event) => light(keyOf(event.target)));
    el.addEventListener('pointerleave', () =>
        light(/** @type {HTMLElement | null} */ (el.querySelector('.kp-stackbar__seg:focus'))?.dataset.kpStackbarKey),
    );
    el.addEventListener('focusin', (event) => light(keyOf(event.target)));
    el.addEventListener('focusout', () => light(undefined));
    el.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('[data-kp-stackbar-retry]')) {
            el.dispatchEvent(new CustomEvent(STACKBAR_RETRY_EVENT, { bubbles: true }));
            return;
        }
        const key = keyOf(event.target);
        if (key === undefined) return;
        el.dispatchEvent(new CustomEvent(STACKBAR_PICK_EVENT, { bubbles: true, detail: { key, part: event.target } }));
    });
    el.addEventListener('keydown', (event) => {
        const seg = event.target instanceof HTMLElement && event.target.matches('.kp-stackbar__seg') ? event.target : null;
        if (!seg) return;
        const segs = /** @type {HTMLElement[]} */ ([...el.querySelectorAll('.kp-stackbar__seg')]);
        const at = segs.indexOf(seg);
        const rtl = getComputedStyle(seg).direction === 'rtl';
        /** @type {Record<string, number>} */
        const moves = { ArrowRight: rtl ? -1 : 1, ArrowDown: 1, ArrowLeft: rtl ? 1 : -1, ArrowUp: -1 };
        let next = -1;
        if (event.key in moves) next = Math.min(segs.length - 1, Math.max(0, at + moves[event.key]));
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = segs.length - 1;
        else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            seg.click();
            return;
        }
        if (next < 0) return;
        event.preventDefault();
        for (const one of segs) one.setAttribute('tabindex', '-1');
        segs[next].setAttribute('tabindex', '0');
        segs[next].focus();
    });
}

/**
 * Fill every `[data-kp-stackbar]` under `root` that carries its spec as JSON
 * in `data-kp-stackbar` (a page that draws with setStackbar() needs nothing).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachStackbars(root = document) {
    for (const el of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(STACKBAR))) {
        const json = el.getAttribute('data-kp-stackbar') ?? '';
        if (json.trim().startsWith('{') && !MEMORY.has(el)) {
            try {
                setStackbar(el, JSON.parse(json));
            } catch (error) {
                console.error(error);
            }
        }
    }
    return () => {};
}
