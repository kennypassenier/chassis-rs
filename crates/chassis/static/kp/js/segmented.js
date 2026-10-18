// The segmented control and the filter chips [kpadopt-controls].
//
// One component, two looks: `.kp-segmented` is a track with a plate under the
// chosen segment, `.kp-segmented--chips` is the same buttons as separate
// pills. Both are a group of buttons that choose among values:
//
//   <div class="kp-segmented" data-kp-segmented="single" role="radiogroup" aria-label="Show">
//       <button type="button" class="kp-segmented__item" data-value="changed" role="radio" aria-checked="true">
//           <span class="kp-segmented__label">Changed</span><span class="kp-segmented__count">12</span>
//       </button>
//       <button type="button" class="kp-segmented__item" data-value="all" role="radio" aria-checked="false">
//           <span class="kp-segmented__label">All</span><span class="kp-segmented__count">48</span>
//       </button>
//   </div>
//
// `data-kp-segmented="single"` (the default) is one value on, as a radio
// group: arrows move the focus and choose, Home and End jump, one tab stop.
// `data-kp-segmented="multi"` is the plain-click toggle group: each press
// turns one value on or off with `aria-pressed`, several may be on, and none
// on means everything is shown. An item marked `data-kp-segmented-all` is the
// "All" item: pressed while nothing else is on, and pressing it turns the rest
// off. Turning every other value on is the same as none, so a multi group
// goes back to All (`data-kp-segmented-collapse="false"` keeps them on).
//
// Both modes use a roving tabindex: one tab stop in, arrows within. In multi
// the arrows only move the focus; Space and Enter turn the value.
//
// The markup above is what a page may write itself, with the roles and states
// in place so it is right before any script runs; whatever it leaves out the
// module fills in. In the single look the plate under the chosen segment
// glides to the next one: the module measures the segment and writes
// `--kp-seg-x` and `--kp-seg-w` on the group, and the theme decides how it
// moves (its own --fx-duration and --fx-ease).
//
// `data-kp-segmented="tri"` [kpadopt4] is the three-way filter: each chip
// stands for something that must be in, must not be in, or does not matter
// ("with chicken, without mushrooms"). A press turns it on (✓, the chip
// filled), a second press leaves it out (✕, the theme's destructive edge, the
// label struck through), a third lets it go; Delete or Backspace lets the
// focused chip go at once. The state is `data-kp-segmented-tri="include|exclude"` on the
// item (absent: either way), a mark that is always there and always the same
// size, so nothing moves, and a word a screen reader hears after the chip's
// name ("Chicken, required"); a status region says what a press changed. An
// item marked `data-kp-segmented-all` is Clear all here, dimmed while nothing
// is chosen. `data-kp-segmented-summary` on the group keeps one line after it:
// how to use it while nothing is chosen, what is chosen once something is.
// Use it with the chip look (`kp-segmented--chips`). A group whose three states
// mean something else than required / left out / either way names its own
// words, `data-kp-segmented-words='{"include":"had it","exclude":"not today",
// "any":"not answered"}'`: what a screen reader hears after a chip and what a
// press announces (the usual picker's Not today, js/usual-picker.js).
//
// Events (bubbling, on the group):
//   kp-segmented-change   { value: string | null, values: string[], item }
//                         `values` are the values on (empty = All); `value`
//                         is the one just pressed. A three-way group adds
//                         `include`, `exclude` (values) and `state`, the
//                         pressed chip's new state.
//
// States: `disabled` on an item, `aria-disabled="true"` on the group,
// `aria-busy="true"` on the group (the counts show a placeholder while their
// numbers load, so nothing moves when they arrive).
//
// Nothing runs on import; attachSegmented(root) returns a detach.

import { getStrings } from './strings.js';

/** A segmented control or a chip group. */
export const SEGMENTED = '[data-kp-segmented]';

/** Fired on the group when the choice changes by a person; `{ value, values, item }`. */
export const SEGMENTED_EVENT = 'kp-segmented-change';

/** One button of a group. */
export const SEGMENTED_ITEM = '.kp-segmented__item';

/** Set on the group while the plate under the chosen segment is placed. */
export const THUMB_ATTRIBUTE = 'data-kp-segmented-thumb';

/** Set one frame after the plate was first placed, so only later moves glide. */
export const GLIDE_ATTRIBUTE = 'data-kp-segmented-glide';

/** A three-way chip's state: `include` or `exclude`; absent is either way [kpadopt4]. */
export const TRI_ATTRIBUTE = 'data-kp-segmented-tri';

/** The order a press walks a three-way chip through. */
export const TRI_STATES = /** @type {const} */ (['any', 'include', 'exclude']);

/** Set while the segments are wider than the group, which then scrolls. */
export const OVERFLOW_ATTRIBUTE = 'data-kp-segmented-overflow';

/**
 * @typedef {object} SegmentedItem
 * @property {string} value
 * @property {string} label
 * @property {number | null} [count]  Shown beside the label; null or absent shows none.
 * @property {string} [hint]  The item's `title`.
 * @property {boolean} [disabled]
 * @property {boolean} [all]  This is the "All" item (Clear all in a three-way group).
 * @property {'any' | 'include' | 'exclude'} [state]  A three-way chip's state; a chip still there keeps its own when absent.
 */

/**
 * @typedef {object} TriValues
 * @property {string[]} include  the values that must be in
 * @property {string[]} exclude  the values that must not be in
 */

/** @type {WeakSet<Element>} */
const ENHANCED = new WeakSet();
/** The item the roving tab stop sits on, per group. @type {WeakMap<Element, Element>} */
const STOP = new WeakMap();
/** Set on a scrolling track to name the sides that have more segments out of sight: `start`, `end`, or both. */
export const MORE_ATTRIBUTE = 'data-kp-segmented-more';

/** Observers, per group, so a detach can let go. @type {WeakMap<Element, ResizeObserver>} */
const WATCH = new WeakMap();
/** The scroll listener of a scrolling track, per group, so a detach can let go. @type {WeakMap<Element, () => void>} */
const REACH = new WeakMap();
/** Events already handled, for a group under two attached roots. @type {WeakSet<Event>} */
const HANDLED = new WeakSet();

/** @param {Element} group */
const isMulti = (group) => group.getAttribute('data-kp-segmented') === 'multi';

/** @param {Element} group */
const isTri = (group) => group.getAttribute('data-kp-segmented') === 'tri';

/** @param {Element} item @returns {'any' | 'include' | 'exclude'} */
const triOf = (item) => {
    const state = item.getAttribute(TRI_ATTRIBUTE);
    return state === 'include' || state === 'exclude' ? state : 'any';
};

/** @param {Element} group @returns {HTMLElement[]} */
export function itemsOf(group) {
    return /** @type {HTMLElement[]} */ ([...group.querySelectorAll(`:scope > ${SEGMENTED_ITEM}`)]);
}

/** @param {Element} item */
const isAll = (item) => item.hasAttribute('data-kp-segmented-all');

/** @param {Element} item */
export function valueOf(item) {
    const own = item.getAttribute('data-value');
    if (own !== null) return own;
    return (item.querySelector('.kp-segmented__label') ?? item).textContent?.trim() ?? '';
}

/** @param {Element} group @param {Element} item */
const isOn = (group, item) =>
    isTri(group) ? triOf(item) === 'include' : item.getAttribute(isMulti(group) ? 'aria-pressed' : 'aria-checked') === 'true';

/** @param {Element} group */
const groupDisabled = (group) => group.getAttribute('aria-disabled') === 'true';

/** @param {HTMLElement} item */
const itemDisabled = (item) => item.hasAttribute('disabled') || item.getAttribute('aria-disabled') === 'true';

/**
 * The values that are on. Single: the chosen one (empty when none is chosen).
 * Multi: every value on except the "All" item; empty means All.
 * @param {Element} group
 * @returns {string[]}
 */
export function getSegmentedValues(group) {
    return itemsOf(group)
        .filter((item) => isOn(group, item) && !((isMulti(group) || isTri(group)) && isAll(item)))
        .map(valueOf);
}

/**
 * Write the state of every item from a list of values, then the roving tab
 * stop, then the plate. Does not fire the event.
 * @param {Element} group
 * @param {readonly string[]} values
 */
function paint(group, values) {
    if (isTri(group)) {
        // A list of values is the ones that must be in; what is left out stays left out.
        const include = new Set(values);
        for (const item of itemsOf(group)) {
            if (isAll(item)) continue;
            const was = triOf(item);
            writeTri(item, include.has(valueOf(item)) ? 'include' : was === 'exclude' ? 'exclude' : 'any');
        }
        paintTri(group);
        return;
    }
    const multi = isMulti(group);
    const items = itemsOf(group);
    const others = items.filter((item) => !isAll(item));
    let on = new Set(values);
    if (multi) {
        // Every value on is the same as none: back to All.
        if (group.getAttribute('data-kp-segmented-collapse') !== 'false' && others.length > 0 && others.every((item) => on.has(valueOf(item)))) {
            on = new Set();
        }
    } else if (on.size > 1) {
        on = new Set([[...on][0]]);
    }
    for (const item of items) {
        const pressed = multi && isAll(item) ? on.size === 0 : on.has(valueOf(item));
        item.setAttribute(multi ? 'aria-pressed' : 'aria-checked', String(pressed));
    }
    roving(group);
    layout(group);
}

/** One tab stop: the item last focused, else the first one on, else the first. @param {Element} group */
function roving(group) {
    const items = itemsOf(group);
    const enabled = items.filter((item) => !itemDisabled(item));
    const kept = STOP.get(group);
    const stop =
        (kept && enabled.includes(/** @type {HTMLElement} */ (kept)) ? kept : undefined) ??
        enabled.find((item) => isOn(group, item) && !(isMulti(group) && isAll(item) && enabled.length > 1)) ??
        enabled.find((item) => isOn(group, item)) ??
        enabled[0];
    for (const item of items) item.tabIndex = item === stop ? 0 : -1;
    if (stop) STOP.set(group, stop);
}

/**
 * The words of a three-way group's states: its own `data-kp-segmented-words`, else the dictionary's.
 * @param {Element} item
 * @returns {Record<'any' | 'include' | 'exclude', string>}
 */
function triWords(item) {
    const strings = getStrings();
    const words = { any: strings.triAny, include: strings.triInclude, exclude: strings.triExclude };
    const raw = item.parentElement?.closest(SEGMENTED)?.getAttribute('data-kp-segmented-words');
    if (!raw) return words;
    try {
        const own = JSON.parse(raw);
        for (const state of TRI_STATES) if (typeof own?.[state] === 'string') words[state] = own[state];
    } catch {
        // Words that do not read as JSON leave the dictionary's.
    }
    return words;
}

/**
 * Write one three-way chip's state: the attribute, the word a screen reader
 * hears after its name, and the mark (drawn by the stylesheet from the
 * attribute). The parts are made when the markup left them out.
 * @param {HTMLElement} item
 * @param {'any' | 'include' | 'exclude'} state
 */
function writeTri(item, state) {
    if (state === 'any') item.removeAttribute(TRI_ATTRIBUTE);
    else item.setAttribute(TRI_ATTRIBUTE, state);
    let mark = item.querySelector(':scope > .kp-segmented__mark');
    if (!mark) {
        mark = document.createElement('span');
        mark.className = 'kp-segmented__mark';
        mark.setAttribute('aria-hidden', 'true');
        item.prepend(mark);
    }
    let word = item.querySelector(':scope > .kp-segmented__state');
    if (!word) {
        word = document.createElement('span');
        word.className = 'kp-sr-only kp-segmented__state';
        item.append(word);
    }
    word.textContent = `, ${triWords(item)[state]}`;
}

/**
 * The three-way group's Clear all (dimmed while nothing is chosen), its
 * summary line and its roving tab stop.
 * @param {Element} group
 */
function paintTri(group) {
    const { include, exclude } = getSegmentedTri(group);
    const chosen = include.length + exclude.length > 0;
    for (const item of itemsOf(group)) {
        if (!isAll(item)) continue;
        item.setAttribute('aria-disabled', String(!chosen));
    }
    summaryOf(group, chosen);
    roving(group);
}

/**
 * The line after a three-way group that asks for one (`data-kp-segmented-summary`):
 * how it works while nothing is chosen, what is chosen once something is. Its
 * value, when it has one, replaces the hint. One line; the whole sentence is
 * its title when it is cut.
 * @param {Element} group @param {boolean} chosen
 */
function summaryOf(group, chosen) {
    if (!group.hasAttribute('data-kp-segmented-summary')) return;
    const next = group.nextElementSibling;
    /** @type {HTMLElement} */
    let line;
    if (next instanceof HTMLElement && next.classList.contains('kp-segmented__summary')) line = next;
    else {
        line = document.createElement('p');
        line.className = 'kp-segmented__summary';
        group.after(line);
    }
    const names = (/** @type {'include' | 'exclude'} */ state) =>
        itemsOf(group)
            .filter((item) => !isAll(item) && triOf(item) === state)
            .map((item) => (item.querySelector('.kp-segmented__label') ?? item).textContent?.trim() ?? '');
    const text = chosen
        ? getStrings().triSummary(names('include'), names('exclude'))
        : group.getAttribute('data-kp-segmented-summary') || getStrings().triHint;
    line.textContent = text;
    line.title = text;
    line.toggleAttribute('data-kp-chosen', chosen);
}

/**
 * Say something through a three-way group's status region (made on first
 * need, after the group and its summary line).
 * @param {Element} group @param {string} message
 */
function sayTri(group, message) {
    let region = group.parentElement?.querySelector(`:scope > .kp-segmented__live[data-for="${CSS.escape(group.id || '')}"]`) ?? null;
    if (!region) {
        if (!group.id) group.id = `kp-segmented-${Math.random().toString(36).slice(2, 9)}`;
        region = document.createElement('span');
        region.className = 'kp-sr-only kp-segmented__live';
        region.setAttribute('role', 'status');
        region.setAttribute('data-for', group.id);
        const summary = group.nextElementSibling?.classList.contains('kp-segmented__summary') ? group.nextElementSibling : group;
        summary.after(region);
    }
    const target = region;
    // Cleared first so the same sentence twice in a row is still heard.
    target.textContent = '';
    setTimeout(() => (target.textContent = message), 60);
}

/**
 * The values that must be in and the values that must not be in, in the
 * order of the chips (a three-way group) [kpadopt4].
 * @param {Element} group
 * @returns {TriValues}
 */
export function getSegmentedTri(group) {
    /** @type {TriValues} */
    const out = { include: [], exclude: [] };
    for (const item of itemsOf(group)) {
        if (isAll(item)) continue;
        const state = triOf(item);
        if (state !== 'any') out[state].push(valueOf(item));
    }
    return out;
}

/**
 * Set a three-way group's chips without firing the event; a value in
 * neither list is let go.
 * @param {Element} group
 * @param {{ include?: Iterable<string>, exclude?: Iterable<string> }} values
 */
export function setSegmentedTri(group, { include = [], exclude = [] }) {
    enhance(group);
    const inc = new Set(include);
    const exc = new Set(exclude);
    for (const item of itemsOf(group)) {
        if (isAll(item)) continue;
        const value = valueOf(item);
        writeTri(item, inc.has(value) ? 'include' : exc.has(value) ? 'exclude' : 'any');
    }
    paintTri(group);
}

/**
 * Note which sides of a scrolling track have more segments out of sight, so the
 * stylesheet fades only those edges (a label at a side with nothing beyond it
 * stays whole).
 * @param {HTMLElement} group
 */
function reach(group) {
    const sides = [];
    if (group.hasAttribute(OVERFLOW_ATTRIBUTE)) {
        const from = Math.abs(group.scrollLeft);
        if (from > 1) sides.push('start');
        if (from + group.clientWidth < group.scrollWidth - 1) sides.push('end');
    }
    if (sides.length) group.setAttribute(MORE_ATTRIBUTE, sides.join(' '));
    else group.removeAttribute(MORE_ATTRIBUTE);
}

/**
 * Place the plate under the chosen segment (single, segmented look) and note
 * whether the segments overflow the group.
 * @param {Element} group
 */
export function layout(group) {
    if (!(group instanceof HTMLElement)) return;
    const chips = group.classList.contains('kp-segmented--chips');
    // Chips wrap (or sit in a scrolling filter row); only a track scrolls itself.
    group.toggleAttribute(OVERFLOW_ATTRIBUTE, !chips && group.scrollWidth > group.clientWidth + 1);
    reach(group);
    const chosen = isMulti(group) || chips ? undefined : itemsOf(group).find((item) => isOn(group, item));
    if (!chosen || chosen.offsetWidth === 0) {
        group.removeAttribute(THUMB_ATTRIBUTE);
        group.removeAttribute(GLIDE_ATTRIBUTE);
        return;
    }
    group.style.setProperty('--kp-seg-x', `${chosen.offsetLeft}px`);
    group.style.setProperty('--kp-seg-w', `${chosen.offsetWidth}px`);
    if (!group.hasAttribute(THUMB_ATTRIBUTE)) {
        group.setAttribute(THUMB_ATTRIBUTE, '');
        // Placed, not moved: the glide starts with the next change.
        requestAnimationFrame(() => requestAnimationFrame(() => group.hasAttribute(THUMB_ATTRIBUTE) && group.setAttribute(GLIDE_ATTRIBUTE, '')));
    }
}

/**
 * Give a group the roles and states its markup left out, and watch its size.
 * Idempotent; called by attach and, for a group added later, by its first use.
 * @param {Element} group
 */
function enhance(group) {
    const multi = isMulti(group);
    if (!ENHANCED.has(group)) {
        ENHANCED.add(group);
        if (!group.hasAttribute('role')) group.setAttribute('role', multi || isTri(group) ? 'group' : 'radiogroup');
        if (typeof ResizeObserver !== 'undefined' && group instanceof HTMLElement) {
            const observer = new ResizeObserver(() => layout(group));
            observer.observe(group);
            WATCH.set(group, observer);
        }
        if (group instanceof HTMLElement) {
            const onScroll = () => reach(group);
            group.addEventListener('scroll', onScroll, { passive: true });
            REACH.set(group, onScroll);
        }
        if (typeof document !== 'undefined' && document.fonts?.ready) document.fonts.ready.then(() => layout(group));
    }
    const observer = WATCH.get(group);
    for (const item of itemsOf(group)) {
        if (item instanceof HTMLButtonElement && !item.hasAttribute('type')) item.type = 'button';
        if (!multi && !isTri(group) && !item.hasAttribute('role')) item.setAttribute('role', 'radio');
        if (isTri(group) && !isAll(item)) writeTri(item, triOf(item));
        observer?.observe(item);
    }
    if (isTri(group)) paintTri(group);
    else paint(group, getSegmentedValues(group));
}

/**
 * Press one item: what a click or the keyboard's choice does.
 * @param {Element} group
 * @param {HTMLElement} item
 */
function choose(group, item) {
    if (groupDisabled(group) || itemDisabled(item)) return;
    if (isTri(group)) {
        if (isAll(item)) return resetSegmented(group);
        const from = triOf(item);
        turnTri(group, item, TRI_STATES[(TRI_STATES.indexOf(from) + 1) % TRI_STATES.length]);
        return;
    }
    const before = getSegmentedValues(group);
    const value = valueOf(item);
    /** @type {string[]} */
    let next;
    if (isMulti(group)) {
        if (isAll(item)) next = [];
        else next = before.includes(value) ? before.filter((v) => v !== value) : [...before, value];
    } else {
        next = [value];
    }
    paint(group, next);
    const after = getSegmentedValues(group);
    const changed = after.length !== before.length || after.some((v, at) => v !== before[at]);
    // A press on the value already chosen, or on All while nothing is on, changes nothing.
    if (!changed) return;
    group.dispatchEvent(new CustomEvent(SEGMENTED_EVENT, { bubbles: true, detail: { value, values: after, item } }));
}

/**
 * Give one three-way chip a state, say so and fire the event.
 * @param {Element} group @param {HTMLElement} item @param {'any' | 'include' | 'exclude'} state
 */
function turnTri(group, item, state) {
    if (triOf(item) === state) return;
    writeTri(item, state);
    paintTri(group);
    const strings = getStrings();
    const label = (item.querySelector('.kp-segmented__label') ?? item).textContent?.trim() ?? '';
    sayTri(group, strings.triAnnounce(label, triWords(item)[state]));
    const { include, exclude } = getSegmentedTri(group);
    group.dispatchEvent(
        new CustomEvent(SEGMENTED_EVENT, { bubbles: true, detail: { value: valueOf(item), values: include, include, exclude, state, item } }),
    );
}

/**
 * Set the values on without firing the event: for a page that moves the
 * group because something else moved (the address changed).
 * @param {Element} group
 * @param {Iterable<string>} values  Empty is All (multi) or nothing chosen (single).
 */
export function setSegmentedValues(group, values) {
    enhance(group);
    paint(group, [...values]);
}

/**
 * Turn every value off (back to All) and fire the event if anything was on.
 * @param {Element} group
 */
export function resetSegmented(group) {
    enhance(group);
    if (groupDisabled(group)) return;
    if (isTri(group)) {
        const before = getSegmentedTri(group);
        if (before.include.length + before.exclude.length === 0) return;
        setSegmentedTri(group, {});
        sayTri(group, getStrings().triCleared);
        group.dispatchEvent(
            new CustomEvent(SEGMENTED_EVENT, {
                bubbles: true,
                detail: { value: null, values: [], include: [], exclude: [], state: 'any', item: null },
            }),
        );
        return;
    }
    const before = getSegmentedValues(group);
    if (before.length === 0 && isMulti(group)) return;
    paint(group, []);
    group.dispatchEvent(new CustomEvent(SEGMENTED_EVENT, { bubbles: true, detail: { value: null, values: [], item: null } }));
}

/**
 * Write the numbers beside the values. `null` empties a count; a value not
 * named keeps its number. The count element is made when the item has none.
 * @param {Element} group
 * @param {Record<string, number | null | undefined>} counts
 */
export function setSegmentedCounts(group, counts) {
    for (const item of itemsOf(group)) {
        const value = valueOf(item);
        if (!(value in counts)) continue;
        const n = counts[value];
        let slot = item.querySelector('.kp-segmented__count');
        if (!slot) {
            slot = document.createElement('span');
            slot.className = 'kp-segmented__count';
            item.append(slot);
        }
        slot.textContent = n == null ? '' : String(n);
    }
    layout(group);
}

/**
 * Replace the items of a group (the values can change under it). The values
 * still present stay on; the focus stays on its value.
 * @param {Element} group
 * @param {readonly SegmentedItem[]} items
 */
export function setSegmentedItems(group, items) {
    enhance(group);
    const multi = isMulti(group);
    const tri = isTri(group);
    const kept = new Map(itemsOf(group).map((item) => [valueOf(item), triOf(item)]));
    const on = getSegmentedValues(group).filter((value) => items.some((item) => item.value === value));
    const active = group.ownerDocument.activeElement;
    const focused = active instanceof HTMLElement && group.contains(active) ? valueOf(active) : null;
    const made = items.map((spec) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'kp-segmented__item';
        item.dataset.value = spec.value;
        if (spec.all) item.setAttribute('data-kp-segmented-all', '');
        if (!multi && !tri) item.setAttribute('role', 'radio');
        const state = spec.state ?? kept.get(spec.value) ?? 'any';
        if (tri && !spec.all && state !== 'any') item.setAttribute(TRI_ATTRIBUTE, state);
        if (spec.hint) item.title = spec.hint;
        if (spec.disabled) item.disabled = true;
        const label = document.createElement('span');
        label.className = 'kp-segmented__label';
        label.textContent = spec.label;
        item.append(label);
        if (spec.count !== undefined) {
            const count = document.createElement('span');
            count.className = 'kp-segmented__count';
            count.textContent = spec.count == null ? '' : String(spec.count);
            item.append(count);
        }
        return item;
    });
    STOP.delete(group);
    group.replaceChildren(...made);
    enhance(group);
    if (tri) paintTri(group);
    else paint(group, on);
    if (focused !== null) made.find((item) => valueOf(item) === focused)?.focus();
}

/** @param {KeyboardEvent} event @param {Element} group */
function stepFor(event, group) {
    const rtl = getComputedStyle(group).direction === 'rtl';
    switch (event.key) {
        case 'ArrowRight':
            return rtl ? -1 : 1;
        case 'ArrowLeft':
            return rtl ? 1 : -1;
        case 'ArrowDown':
            return 1;
        case 'ArrowUp':
            return -1;
        default:
            return 0;
    }
}

/**
 * Wire every `[data-kp-segmented]` under `root`: its roles and states, its
 * roving tab stop, its clicks and its arrow keys, and the plate under the
 * chosen segment. A group rendered later is picked up on its first use, or
 * by calling this again on its subtree.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachSegmented(root = document) {
    /** @param {Event} event */
    const onClick = (event) => {
        const item = event.target instanceof Element ? event.target.closest(SEGMENTED_ITEM) : null;
        const group = item?.parentElement?.closest(SEGMENTED);
        if (!(item instanceof HTMLElement) || !group || HANDLED.has(event)) return;
        HANDLED.add(event);
        enhance(group);
        STOP.set(group, item);
        roving(group);
        choose(group, item);
    };
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        const item = event.target instanceof Element ? event.target.closest(SEGMENTED_ITEM) : null;
        const group = item?.parentElement?.closest(SEGMENTED);
        if (!(item instanceof HTMLElement) || !group || HANDLED.has(event) || event.altKey || event.ctrlKey || event.metaKey) return;
        const items = itemsOf(group).filter((one) => !itemDisabled(one));
        const at = items.indexOf(item);
        if (at < 0) return;
        let to = -1;
        if (isTri(group) && (event.key === 'Delete' || event.key === 'Backspace') && !isAll(item)) {
            HANDLED.add(event);
            event.preventDefault();
            enhance(group);
            if (!groupDisabled(group) && !itemDisabled(item)) turnTri(group, item, 'any');
            return;
        }
        if (event.key === 'Home') to = 0;
        else if (event.key === 'End') to = items.length - 1;
        else {
            const step = stepFor(event, group);
            if (step !== 0) to = (at + step + items.length) % items.length;
        }
        if (to < 0) return;
        HANDLED.add(event);
        event.preventDefault();
        enhance(group);
        const next = items[to];
        STOP.set(group, next);
        roving(group);
        next.focus();
        // A radio group chooses as the focus moves; a toggle group only moves.
        if (!isMulti(group) && !isTri(group)) choose(group, next);
    };
    /** @param {FocusEvent} event */
    const onFocus = (event) => {
        const item = event.target instanceof Element ? event.target.closest(SEGMENTED_ITEM) : null;
        const group = item?.parentElement?.closest(SEGMENTED);
        if (!item || !group) return;
        STOP.set(group, item);
        roving(group);
        if (group instanceof HTMLElement && group.hasAttribute(OVERFLOW_ATTRIBUTE)) item.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    };
    /** Every group this attach has enhanced, for the detach. @type {Set<Element>} */
    const groups = new Set(root.querySelectorAll(SEGMENTED));
    if (root instanceof Element && root.matches(SEGMENTED)) groups.add(root);
    for (const group of groups) enhance(group);
    // A group that arrives later (rendered by the page, or a copy of one) is
    // wired when it arrives, so its first paint already has the plate in place.
    const arrivals =
        typeof MutationObserver === 'undefined'
            ? null
            : new MutationObserver((records) => {
                  for (const record of records) {
                      for (const node of record.addedNodes) {
                          if (!(node instanceof Element)) continue;
                          const found = node.matches(SEGMENTED) ? [node] : [];
                          for (const group of [...found, ...node.querySelectorAll(SEGMENTED)]) {
                              groups.add(group);
                              enhance(group);
                          }
                      }
                  }
              });
    arrivals?.observe(root, { childList: true, subtree: true });
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', /** @type {EventListener} */ (onKey));
    root.addEventListener('focusin', /** @type {EventListener} */ (onFocus));
    return () => {
        arrivals?.disconnect();
        root.removeEventListener('click', onClick);
        root.removeEventListener('keydown', /** @type {EventListener} */ (onKey));
        root.removeEventListener('focusin', /** @type {EventListener} */ (onFocus));
        for (const group of groups) {
            WATCH.get(group)?.disconnect();
            WATCH.delete(group);
            const onScroll = REACH.get(group);
            if (onScroll) group.removeEventListener('scroll', onScroll);
            REACH.delete(group);
            ENHANCED.delete(group);
        }
    };
}
