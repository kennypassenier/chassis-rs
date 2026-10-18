// A quantity with minus and plus [kpadopt4; the AuDHD recipe app's servings and shopping amounts].
//
// A number between a minus and a plus button, with its unit after it: "2
// portions" becoming "6 portions", "500 g" on a shopping list. The number is
// also a field to type in.
//
//   <div class="kp-quantity" data-kp-quantity data-kp-quantity-min="1" data-kp-quantity-max="12"
//        data-kp-quantity-unit="portions" data-kp-quantity-unit-one="portion" data-kp-quantity-label="Portions">
//       <input class="kp-quantity__input" value="2" />
//   </div>
//
// The module writes what the markup leaves out: the two buttons
// (`.kp-button.kp-quantity__step`, `data-kp-quantity-by="-1|1"`), the unit
// (`.kp-quantity__unit`) and the field box around the number and the unit
// (`.kp-quantity__field`). A page may write them itself.
//
// Attributes on the root:
//   data-kp-quantity-min / -max   the bounds (none: open)
//   data-kp-quantity-step         the step a press moves by (1); its decimals are the number's decimals
//   data-kp-quantity-unit         the unit after the number; -unit-one is its singular, used for exactly 1
//   data-kp-quantity-label        what the number is, for the buttons' and the field's names ("Portions")
//   data-kp-quantity-locale       the language of the decimal mark (else the nearest `lang`)
//   data-kp-quantity-disabled     the whole control, unreachable
//
// What it does:
//   - The field is a spin button (`role="spinbutton"`, `aria-valuenow`,
//     `aria-valuetext` "6 portions"): ArrowUp and ArrowDown step, PageUp and
//     PageDown step ten times, Home and End go to the bounds.
//   - Typing is read in the page's language, with a comma or a point as the
//     decimal mark; the value is taken on Enter or when the field is left,
//     kept inside the bounds and on a step. A text that is not a number is
//     marked invalid while it stands and put back when the field is left.
//   - A button held down repeats, slowly first and then faster; a press at a
//     bound does nothing and the button says so (`aria-disabled`, dimmed),
//     but it keeps the focus, so a keyboard is never thrown out.
//   - The field is as wide as the widest value it can hold, and the unit as
//     wide as its longest form, so nothing moves while the number changes.
//
// Events (bubbling, on the root):
//   kp-quantity-change   { value, previous, source: 'button' | 'key' | 'typed' }
//
// Every word it adds is in js/strings.js. Nothing runs on import.

import { getStrings } from './strings.js';
import { resolveLocale } from './locale.js';

/** The controls this module looks after. */
export const QUANTITY = '[data-kp-quantity]';

/** Fired on the root when a person changed the value: `{ value, previous, source }`. */
export const QUANTITY_EVENT = 'kp-quantity-change';

/** The first repeat of a held button, then the pace it settles to [ms]. */
export const HOLD_DELAY = 450;
export const HOLD_SLOW = 160;
export const HOLD_FAST = 70;

/** @typedef {{ min: number, max: number, step: number, decimals: number, locale: string }} QuantityRules */

/** Roots already wired, so a second attach (a page's own and js/auto.js) adds nothing. @type {WeakSet<Element>} */
const WIRED = new WeakSet();

/** @param {Element} root @param {string} name @param {number} fallback */
const numberAt = (root, name, fallback) => {
    const raw = root.getAttribute(name);
    const value = raw === null || raw.trim() === '' ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
};

/**
 * The decimals of a step: 0.5 has one, 50 has none.
 * @param {number} step
 */
export function decimalsOf(step) {
    const text = String(step);
    const at = text.indexOf('.');
    return at < 0 ? 0 : text.length - at - 1;
}

/** @param {Element} root @returns {QuantityRules} */
function rulesOf(root) {
    const step = Math.abs(numberAt(root, 'data-kp-quantity-step', 1)) || 1;
    return {
        min: numberAt(root, 'data-kp-quantity-min', -Infinity),
        max: numberAt(root, 'data-kp-quantity-max', Infinity),
        step,
        decimals: decimalsOf(step),
        locale: resolveLocale(root.getAttribute('data-kp-quantity-locale') ?? undefined, root),
    };
}

/**
 * The value written in the page's language: no grouping, the step's decimals.
 * @param {number} value @param {QuantityRules} rules
 */
export function formatQuantity(value, rules) {
    return new Intl.NumberFormat(rules.locale, {
        useGrouping: false,
        minimumFractionDigits: 0,
        maximumFractionDigits: rules.decimals,
    }).format(value);
}

/**
 * Read a typed number: a comma or a point is the decimal mark; with both, the
 * last one is, and the other groups thousands. Spaces are ignored. NaN when it
 * is not a number.
 * @param {string} text
 * @returns {number}
 */
export function parseQuantity(text) {
    let t = text
        .replace(/[\s  ]/g, '')
        .replace(/^\+/, '')
        .replace(/^−/, '-');
    if (t === '') return NaN;
    const comma = t.lastIndexOf(',');
    const point = t.lastIndexOf('.');
    if (comma >= 0 && point >= 0) {
        const mark = comma > point ? ',' : '.';
        const group = mark === ',' ? '.' : ',';
        t = t.split(group).join('').replace(mark, '.');
    } else if (comma >= 0) {
        t = t.replace(',', '.');
    }
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
    return Number(t);
}

/**
 * Keep a value inside the bounds and on a step (counted from the minimum when
 * there is one, else from 0), rounded to the step's decimals.
 * @param {number} value @param {QuantityRules} rules
 */
export function settleQuantity(value, rules) {
    const base = Number.isFinite(rules.min) ? rules.min : 0;
    const steps = Math.round((value - base) / rules.step);
    let settled = base + steps * rules.step;
    settled = Math.min(rules.max, Math.max(rules.min, settled));
    const factor = 10 ** rules.decimals;
    return Math.round(settled * factor) / factor;
}

/** @param {Element} root */
const inputOf = (root) => /** @type {HTMLInputElement | null} */ (root.querySelector('.kp-quantity__input'));

/** @param {Element} root */
const isDisabled = (root) => root.hasAttribute('data-kp-quantity-disabled') || (inputOf(root)?.disabled ?? false);

/** The value a root stands at, as a number (its last accepted value). @param {Element} root */
export function getQuantity(root) {
    const kept = root.getAttribute('data-kp-quantity-value');
    if (kept !== null && kept !== '') return Number(kept);
    const input = inputOf(root);
    const read = input ? parseQuantity(input.value) : NaN;
    const rules = rulesOf(root);
    return settleQuantity(Number.isFinite(read) ? read : Number.isFinite(rules.min) ? rules.min : 0, rules);
}

/**
 * The unit for a value: the singular for exactly 1 when there is one.
 * @param {Element} root @param {number} value
 */
const unitFor = (root, value) => {
    const one = root.getAttribute('data-kp-quantity-unit-one');
    return value === 1 && one ? one : (root.getAttribute('data-kp-quantity-unit') ?? '');
};

/**
 * Make the parts the markup left out, and give them their names. Safe to run
 * again.
 * @param {HTMLElement} root
 */
function build(root) {
    const strings = getStrings();
    const label = root.getAttribute('data-kp-quantity-label') ?? '';
    let input = inputOf(root);
    if (!input) {
        input = document.createElement('input');
        input.className = 'kp-quantity__input';
        root.append(input);
    }
    let field = /** @type {HTMLElement | null} */ (root.querySelector('.kp-quantity__field'));
    if (!field) {
        field = document.createElement('span');
        field.className = 'kp-quantity__field';
        input.before(field);
        field.append(input);
    }
    let unit = /** @type {HTMLElement | null} */ (root.querySelector('.kp-quantity__unit'));
    const unitWord = root.getAttribute('data-kp-quantity-unit');
    if (!unit && unitWord) {
        unit = document.createElement('span');
        unit.className = 'kp-quantity__unit';
        unit.setAttribute('aria-hidden', 'true');
        field.append(unit);
    }
    if (unit) {
        const one = root.getAttribute('data-kp-quantity-unit-one');
        unit.setAttribute('data-kp-words', [unitWord ?? '', one ?? ''].filter(Boolean).join('\n'));
    }
    /** @param {-1 | 1} by */
    const button = (by) => {
        let b = /** @type {HTMLButtonElement | null} */ (root.querySelector(`.kp-quantity__step[data-kp-quantity-by="${by}"]`));
        if (!b) {
            b = document.createElement('button');
            b.type = 'button';
            b.className = 'kp-button kp-quantity__step';
            b.setAttribute('data-kp-quantity-by', String(by));
            const glyph = document.createElement('span');
            glyph.className = 'kp-quantity__glyph';
            glyph.setAttribute('aria-hidden', 'true');
            b.append(glyph);
            if (by < 0) field?.before(b);
            else field?.after(b);
        }
        b.setAttribute('aria-label', by < 0 ? strings.quantityLess(label) : strings.quantityMore(label));
        return b;
    };
    button(-1);
    button(1);
    input.setAttribute('role', 'spinbutton');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('inputmode', rulesOf(root).decimals > 0 || rulesOf(root).min < 0 ? 'decimal' : 'numeric');
    if (label && !input.hasAttribute('aria-label') && !input.hasAttribute('aria-labelledby') && !input.labels?.length) {
        input.setAttribute('aria-label', label);
    }
    if (root.getAttribute('role') === null) root.setAttribute('role', 'group');
    if (label && !root.hasAttribute('aria-label') && !root.hasAttribute('aria-labelledby')) root.setAttribute('aria-label', label);
    return input;
}

/**
 * Write a value everywhere it shows: the field, the unit, the spin button's
 * numbers and words, the buttons at a bound, the field's width.
 * @param {HTMLElement} root @param {number} value
 */
function paint(root, value) {
    const rules = rulesOf(root);
    const input = build(root);
    const text = formatQuantity(value, rules);
    if (document.activeElement !== input || input.value !== text) input.value = text;
    root.setAttribute('data-kp-quantity-value', String(value));
    input.removeAttribute('aria-invalid');
    if (Number.isFinite(rules.min)) input.setAttribute('aria-valuemin', String(rules.min));
    else input.removeAttribute('aria-valuemin');
    if (Number.isFinite(rules.max)) input.setAttribute('aria-valuemax', String(rules.max));
    else input.removeAttribute('aria-valuemax');
    input.setAttribute('aria-valuenow', String(value));
    const unit = unitFor(root, value);
    input.setAttribute('aria-valuetext', unit ? getStrings().quantityValue(text, unit) : text);
    const shown = root.querySelector('.kp-quantity__unit');
    if (shown) shown.textContent = unit;
    // As wide as the widest value it can hold, so nothing moves as it changes.
    const widest = Math.max(
        ...[rules.min, rules.max, value].filter(Number.isFinite).map((v) => formatQuantity(v, rules).length),
        rules.decimals > 0 ? rules.decimals + 2 : 1,
    );
    root.style.setProperty('--kp-quantity-chars', String(widest));
    const disabled = isDisabled(root);
    input.disabled = disabled;
    for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (root.querySelectorAll('.kp-quantity__step'))) {
        const by = Number(b.getAttribute('data-kp-quantity-by'));
        const atBound = by < 0 ? value <= rules.min : value >= rules.max;
        b.disabled = disabled;
        if (atBound && !disabled) b.setAttribute('aria-disabled', 'true');
        else b.removeAttribute('aria-disabled');
    }
}

/**
 * Change the value as a person did, and fire the event when it moved.
 * @param {HTMLElement} root @param {number} wanted @param {'button' | 'key' | 'typed'} source
 * @returns {boolean} whether it moved
 */
function change(root, wanted, source) {
    if (isDisabled(root)) return false;
    const rules = rulesOf(root);
    const previous = getQuantity(root);
    const value = settleQuantity(wanted, rules);
    paint(root, value);
    if (value === previous) return false;
    root.dispatchEvent(new CustomEvent(QUANTITY_EVENT, { bubbles: true, detail: { value, previous, source } }));
    return true;
}

/**
 * Set the value without firing the event (a page that moves it because
 * something else moved), kept inside the bounds and on a step.
 * @param {Element} root @param {number} value
 */
export function setQuantity(root, value) {
    if (!(root instanceof HTMLElement)) return;
    paint(root, settleQuantity(value, rulesOf(root)));
}

/**
 * Wire every quantity under `root`: its parts, its buttons (a held button
 * repeats), its keys and its typing.
 * @param {ParentNode} [scope]
 * @returns {() => void} detach
 */
export function attachQuantities(scope = document) {
    const roots = /** @type {HTMLElement[]} */ ([
        ...(scope instanceof HTMLElement && scope.matches(QUANTITY) ? [scope] : []),
        ...scope.querySelectorAll(QUANTITY),
    ]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const root of roots) {
        if (WIRED.has(root)) continue;
        WIRED.add(root);
        paint(root, getQuantity(root));
        /** @type {ReturnType<typeof setTimeout> | null} */
        let timer = null;
        /** The button a pointer pressed (it stepped on the way down), until its click. @type {HTMLElement | null} */
        let pressed = null;
        const stop = () => {
            if (timer !== null) clearTimeout(timer);
            timer = null;
        };
        /** @param {HTMLElement} b */
        const stepOnce = (b) => {
            if (b.getAttribute('aria-disabled') === 'true') return false;
            const by = Number(b.getAttribute('data-kp-quantity-by')) || 0;
            return change(root, getQuantity(root) + by * rulesOf(root).step, 'button');
        };
        /** @param {PointerEvent} event */
        const down = (event) => {
            const b = event.target instanceof Element ? /** @type {HTMLElement | null} */ (event.target.closest('.kp-quantity__step')) : null;
            if (!b || !root.contains(b) || event.button !== 0 || isDisabled(root)) return;
            pressed = b;
            stepOnce(b);
            let repeats = 0;
            const again = () => {
                repeats += 1;
                if (!stepOnce(b)) return stop();
                timer = setTimeout(again, repeats > 6 ? HOLD_FAST : HOLD_SLOW);
            };
            stop();
            timer = setTimeout(again, HOLD_DELAY);
        };
        /** @param {MouseEvent} event */
        const click = (event) => {
            const b = event.target instanceof Element ? /** @type {HTMLElement | null} */ (event.target.closest('.kp-quantity__step')) : null;
            if (!b || !root.contains(b)) return;
            // A pointer press already stepped on its way down; a key's click (no pointer, `detail` 0) steps here.
            if (event.detail > 0 && pressed === b) {
                pressed = null;
                return;
            }
            pressed = null;
            stepOnce(b);
        };
        const up = () => stop();
        /** @param {KeyboardEvent} event */
        const key = (event) => {
            const input = inputOf(root);
            if (event.target !== input || event.altKey || event.ctrlKey || event.metaKey) return;
            const rules = rulesOf(root);
            const now = getQuantity(root);
            /** @type {number | null} */
            let to = null;
            if (event.key === 'ArrowUp') to = now + rules.step;
            else if (event.key === 'ArrowDown') to = now - rules.step;
            else if (event.key === 'PageUp') to = now + rules.step * 10;
            else if (event.key === 'PageDown') to = now - rules.step * 10;
            else if (event.key === 'Home' && Number.isFinite(rules.min)) to = rules.min;
            else if (event.key === 'End' && Number.isFinite(rules.max)) to = rules.max;
            else if (event.key === 'Enter') {
                commit();
                return;
            } else if (event.key === 'Escape') {
                paint(root, now);
                return;
            }
            if (to === null) return;
            event.preventDefault();
            change(root, to, 'key');
        };
        const typing = () => {
            const input = inputOf(root);
            if (!input) return;
            const read = parseQuantity(input.value);
            if (input.value.trim() === '' || !Number.isFinite(read)) input.setAttribute('aria-invalid', 'true');
            else input.removeAttribute('aria-invalid');
        };
        const commit = () => {
            const input = inputOf(root);
            if (!input) return;
            const read = parseQuantity(input.value);
            if (!Number.isFinite(read)) paint(root, getQuantity(root));
            else change(root, read, 'typed');
        };
        root.addEventListener('pointerdown', down);
        root.addEventListener('click', click);
        root.addEventListener('keydown', key);
        root.addEventListener('input', typing);
        root.addEventListener('focusout', commit);
        for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) root.addEventListener(type, up, true);
        undo.push(() => {
            stop();
            WIRED.delete(root);
            root.removeEventListener('pointerdown', down);
            root.removeEventListener('click', click);
            root.removeEventListener('keydown', key);
            root.removeEventListener('input', typing);
            root.removeEventListener('focusout', commit);
            for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) root.removeEventListener(type, up, true);
        });
    }
    return () => undo.forEach((u) => u());
}
