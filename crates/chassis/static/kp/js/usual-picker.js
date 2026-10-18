// A picker with the usual on top [kpadopt6; Life's daily check-in: symptoms, triggers, strategies, meals].
//
// It extends the combobox (js/combobox.js): the same input, listbox, matcher, status line and tag mode, with an opt-in band of
// the choices a person uses most standing first, the rest alphabetical below, and a guard against a near-duplicate when a new
// name is typed. The band is given by the application and changes slowly (a list that reorders on every use is slower and
// disliked: Sears and Shneiderman 1994, Findlater and McGrenere 2004); it is never re-sorted per tap.
//
//   <div class="kp-combobox kp-usual" data-kp-combobox data-kp-usual='["headache","fatigue"]' data-kp-add="inline">
//       <input class="kp-combobox__input" type="text" role="combobox" aria-expanded="false" aria-controls="sym-list" aria-label="Symptom" />
//       <ul class="kp-combobox__list" id="sym-list" role="listbox" hidden>
//           <li class="kp-combobox__option" role="option" data-kp-option data-value="headache">Headache</li> …
//       </ul>
//       <p class="kp-combobox__status" data-kp-combobox-status role="status" aria-live="polite"></p>
//   </div>
//
// Every option is a markup attribute and a field of the handle, and changing one at run time redraws the picker (KT6):
//   data-kp-usual              the values of the band: a comma list, a JSON array, or JSON `{ value, uses }` with the source `counts`
//   data-kp-usual-source       given | counts                           given (the app owns the weekly recompute; counts ranks by uses)
//   data-kp-usual-max          1 to 7                                   5
//   data-kp-usual-label        the band's heading                       "Usual"
//   data-kp-usual-while-typing first | hide                             first (matching usual items still lead while typing)
//   data-kp-order              alphabetical | given                     alphabetical (the full list under the band)
//   data-kp-pinned             JSON [{ value, label }]                  none ("Nothing to log", "Not sure" stand first, never usual)
//   data-kp-all                open | fold                              fold when the list has more than 12 items, else open ("Show all 38")
//   data-kp-multiple           present                                  absent (the combobox's tag mode: symptoms, meals)
//   data-kp-preselect          none | usual                             none (a stock picker never answers for a person)
//   data-kp-not-today          rows | chips | off                       absent = off; present without a value = rows (see "Not today")
//   data-kp-add                off | inline                             off
//   data-kp-usual-undo         field | toast                            field (the Undo after an add: a line under the field, or a toast)
//   data-kp-near               ask | select | off                       ask
//   data-kp-near-threshold     0.5 to 1                                 0.8
//   data-kp-near-max           1 to 5                                   3
//   data-kp-remember           a name                                   the folded or open list is remembered per picker
//   data-kp-hint               "Last time you wrote: ..."               the line the app gives, under the input once something is chosen
//   data-kp-state              loading | empty | error | ready          ready (empty when there are no items)
//   data-kp-undo-ms            the Undo window after an add             6000
//
// Typing a name identical to an existing one after case, accents and spaces are ignored selects the existing item (it cannot
// create a duplicate); its tag lights up, and a name already picked says so in the list ("Headache is already picked") and
// lights its tag instead of doing nothing. A near one ("hoofdpjn", also "Fatigu", the start of a name) puts up to `near-max`
// "Did you mean Hoofdpijn?" rows FIRST in the list, the plain row of that item folded into it, and always "Add 'hoofdpjn' as
// new" last, which always works. Enter on a near name: `ask` lights the first "Did you mean" row (a second Enter takes it),
// `select` takes the closest at once, `off` adds the name as typed. Nothing typed is ever answered by silence (Kenny,
// 2026-10-18 21:37: "Ik zie hem niet take closest pakken of vragen naar een name ... waar zou ik het moeten zien?").
//
// "Not today" [kpadopt6; redesigned after Kenny, 2026-10-18 21:37: a pill inside the tag "lijkt me niet wenselijk", and "wat
// is de bedoeling van die not today pill?"]. A usual choice is something logged nearly every day, so "it did not happen today"
// is an answer of its own, different from "not filled in yet". The tags stay one pill each (name and remove). The usual
// choices get their own check under the field, with a plain heading and one line saying what Not today means, in one of two
// looks: `rows` (default), one line per usual choice, its name and the package's segmented pair "Had it" / "Not today"
// (neither pressed: not answered); `chips`, one row of the package's three-way chips (one press had it, ✓; a second not today,
// ✕ and struck through; a third clears). "Had it" is the same as picking the item (its tag appears), "Not today" takes the
// tag away if there was one; the check and the tags are one state.
//
// Events: `kp-usual-pick` `{ value, from: 'usual' | 'all' | 'pinned' | 'typed' }`, `kp-usual-add`
// `{ label, nearTo }` (cancelable: the app keeps the vocabulary and may refuse), `kp-usual-not-today` `{ value, on }`,
// `kp-usual-retry`. Alt U jumps to the first usual choice (a bare `u` would take the first letter of a name; Alt U is on the `?`
// sheet). No digit key is bound. Nothing runs on import; attachUsualPickers(root) returns a detach.

import { attachComboboxes, combobox, CHANGE_EVENT } from './combobox.js';
import { getStrings } from './strings.js';
import { undoToast } from './undo-toast.js';
import { registerShortcuts } from './shortcuts.js';
import { memoryFor } from './remember.js';
import { statePlate } from './state-plate.js';
import { openBusyCard } from './busy-card.js';
import { OPTION_SELECTOR } from './listbox.js';
import { attachSegmented, setSegmentedTri, SEGMENTED_EVENT } from './segmented.js';

/** A picker with the usual on top. */
export const USUAL = '[data-kp-usual]';
/** Fired on the picker when something is picked: `{ value, from }`. */
export const USUAL_PICK_EVENT = 'kp-usual-pick';
/** Fired on the picker, cancelable, before a typed name is added: `{ label, nearTo }`. */
export const USUAL_ADD_EVENT = 'kp-usual-add';
/** Fired on the picker when an item's "Not today" is set or cleared: `{ value, on }`. */
export const USUAL_NOT_TODAY_EVENT = 'kp-usual-not-today';
/** Fired on the picker when Retry is pressed on the plate of a list that could not be read. */
export const USUAL_RETRY_EVENT = 'kp-usual-retry';
/** The states a picker can be in. */
export const USUAL_STATES = /** @type {const} */ (['ready', 'loading', 'empty', 'error']);
/** More items than this fold behind "Show all N" unless `data-kp-all` says otherwise. */
export const USUAL_FOLD_ABOVE = 12;

/**
 * @typedef {object} UsualItem
 * @property {string} value
 * @property {string} label
 * @property {HTMLElement} el
 */

/**
 * @typedef {object} UsualModel
 * @property {HTMLElement} box
 * @property {HTMLInputElement} input
 * @property {HTMLElement} list
 * @property {HTMLElement | null} status
 * @property {import('./combobox.js').ComboboxHandle} handle
 * @property {UsualItem[]} items
 * @property {{ value: string, uses?: number }[] | null} given the band set from a script
 * @property {boolean} expanded
 * @property {string | null} nextFrom
 * @property {Set<string>} notToday
 * @property {HTMLElement} panel
 * @property {import('./busy-card.js').BusyCard | null} busy
 * @property {HTMLElement} hintEl
 * @property {HTMLElement} noteEl the line under the field after an add, with its Undo
 * @property {HTMLElement | null} check the usual choices' own check (Not today), when the picker has one
 * @property {string} checkKey what the check was drawn for (its look and the band), so a sync redraws only on a change
 * @property {() => void} checkOff detaches the three-way chips of the check
 * @property {boolean} silent a change made by the check itself: no pick event
 */

/** @type {WeakMap<Element, UsualModel>} */
const models = new WeakMap();
let serial = 0;

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {string} [className] @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

/** A name as the guard compares it: case, accents and spacing ignored. Pure. @param {string} text */
export function normaliseName(text) {
    return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * How alike two names are, 0 to 1: one minus the edit distance over the longer length, after `normaliseName`. Pure.
 * @param {string} a @param {string} b
 */
export function similarity(a, b) {
    const x = normaliseName(a);
    const y = normaliseName(b);
    if (x === y) return 1;
    if (x === '' || y === '') return 0;
    /** @type {number[]} */
    let row = Array.from({ length: y.length + 1 }, (_, j) => j);
    for (let i = 1; i <= x.length; i += 1) {
        const next = [i];
        for (let j = 1; j <= y.length; j += 1) {
            next[j] = Math.min((row[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1, (row[j - 1] ?? 0) + (x[i - 1] === y[j - 1] ? 0 : 1));
        }
        row = next;
    }
    return 1 - (row[y.length] ?? 0) / Math.max(x.length, y.length);
}

/**
 * The names closest to what was typed, nearest first: at least `threshold` alike, at most `max`, never an identical one. Pure.
 * @template {{ label: string }} T
 * @param {string} typed @param {readonly T[]} names @param {number} [threshold] @param {number} [max]
 * @returns {T[]}
 */
export function nearNames(typed, names, threshold = 0.8, max = 3) {
    return names
        .map((name) => ({ name, score: similarity(typed, name.label) }))
        .filter(({ score }) => score >= threshold && score < 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, max)
        .map(({ name }) => name);
}

/** @param {UsualModel} m @param {string} name @param {string} [fallback] */
const attr = (m, name, fallback) => m.box.getAttribute(`data-kp-${name}`) ?? fallback;
/** @param {UsualModel} m @param {string} name */
const flag = (m, name) => m.box.hasAttribute(`data-kp-${name}`) && m.box.getAttribute(`data-kp-${name}`) !== 'off';
/** @param {number} n @param {number} lo @param {number} hi */
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** The real options of the list, not the rows this module adds. @param {HTMLElement} list */
const realOptions = (list) =>
    /** @type {HTMLElement[]} */ ([...list.querySelectorAll(OPTION_SELECTOR)]).filter(
        (o) => !o.hasAttribute('data-kp-synth') && !o.hasAttribute('data-kp-pinned'),
    );

/** @param {UsualModel} m */
function readItems(m) {
    m.items = realOptions(m.list).map((el) => ({
        el,
        value: el.dataset.value ?? (el.textContent ?? '').trim(),
        label: (el.dataset.kpLabel ?? el.firstChild?.textContent ?? el.textContent ?? '').trim(),
    }));
}

/** The pinned choices: "Nothing to log", "Not sure". @param {UsualModel} m @returns {{ value: string, label: string }[]} */
function readPinned(m) {
    try {
        const raw = JSON.parse(attr(m, 'pinned', '[]') ?? '[]');
        return Array.isArray(raw) ? raw.filter((p) => p && typeof p.value === 'string' && typeof p.label === 'string') : [];
    } catch {
        return [];
    }
}

/** The band's values, in the band's order, only those the list has. @param {UsualModel} m @returns {string[]} */
function bandValues(m) {
    /** @type {{ value: string, uses?: number }[]} */
    let entries = [];
    const raw = attr(m, 'usual', '') ?? '';
    if (m.given) entries = m.given;
    else if (raw.trim().startsWith('[')) {
        try {
            const list = JSON.parse(raw);
            if (Array.isArray(list))
                entries = list.map((e) => (typeof e === 'string' ? { value: e } : { value: String(e.value), uses: Number(e.uses) || 0 }));
        } catch {
            entries = [];
        }
    } else
        entries = raw
            .split(',')
            .map((v) => ({ value: v.trim() }))
            .filter((e) => e.value !== '');
    if (attr(m, 'usual-source') === 'counts') {
        const label = (/** @type {string} */ v) => m.items.find((i) => i.value === v)?.label ?? v;
        entries = [...entries].sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0) || label(a.value).localeCompare(label(b.value)));
    }
    const have = new Set(m.items.map((i) => i.value));
    const max = clamp(Number(attr(m, 'usual-max')) || 5, 1, 7);
    return entries
        .map((e) => e.value)
        .filter((v) => have.has(v))
        .slice(0, max);
}

/** Whether the full list is folded behind "Show all N" right now. @param {UsualModel} m */
function folded(m) {
    const mode = attr(m, 'all');
    const fold = mode === 'fold' || (mode !== 'open' && m.items.length > USUAL_FOLD_ABOVE);
    return fold && !m.expanded;
}

/** Whether the list can fold at all. @param {UsualModel} m */
function canFold(m) {
    const mode = attr(m, 'all');
    return mode === 'fold' || (mode !== 'open' && m.items.length > USUAL_FOLD_ABOVE);
}

/** @param {UsualModel} m @param {string} text */
function say(m, text) {
    if (m.status) m.status.textContent = text;
}

/** Rebuild the order of the list: pinned, the band, the rest, the rows that open the rest. @param {UsualModel} m */
function arrange(m) {
    const s = getStrings();
    for (const node of m.list.querySelectorAll('[data-kp-synth]')) node.remove();
    readItems(m);
    const query = m.input.value.trim();
    const hideBand = query !== '' && attr(m, 'usual-while-typing') === 'hide';
    const band = hideBand ? [] : bandValues(m);
    const inBand = new Set(band);
    const byValue = new Map(m.items.map((i) => [i.value, i]));
    const rest = m.items.filter((i) => !inBand.has(i.value));
    if (attr(m, 'order', 'alphabetical') !== 'given') rest.sort((a, b) => a.label.localeCompare(b.label));
    // An item that cannot be picked says why in words under its label, and a screen reader reads it as its description.
    for (const item of m.items) {
        const why = item.el.getAttribute('data-kp-reason');
        if (!why || item.el.querySelector('.kp-usual__reason')) continue;
        serial += 1;
        const reason = make('span', 'kp-usual__reason', why);
        reason.id = `kp-usual-${serial}-why`;
        item.el.setAttribute('aria-describedby', reason.id);
        item.el.setAttribute('aria-disabled', 'true');
        item.el.append(reason);
    }
    for (const item of m.items) {
        item.el.toggleAttribute('data-kp-band', inBand.has(item.value));
        item.el.toggleAttribute('data-kp-rest', !inBand.has(item.value));
    }
    /** @type {HTMLElement[]} */
    const order = [];
    const pinned = readPinned(m);
    for (const p of pinned) {
        const row = make('li', 'kp-combobox__option kp-usual__pinned', p.label);
        row.setAttribute('role', 'option');
        row.setAttribute('data-kp-option', '');
        row.setAttribute('data-kp-pinned', '');
        row.setAttribute('data-kp-synth', '');
        row.dataset.value = p.value;
        order.push(row);
    }
    /** @param {string} text @param {string} kind */
    const header = (text, kind) => {
        const h = make('li', 'kp-usual__group', text);
        h.setAttribute('role', 'presentation');
        h.setAttribute('data-kp-synth', '');
        h.setAttribute('data-kp-group', kind);
        return h;
    };
    if (band.length > 0) order.push(header(attr(m, 'usual-label') ?? s.usualLabel, 'usual'));
    for (const v of band) {
        const item = byValue.get(v);
        if (item) order.push(item.el);
    }
    if (band.length > 0 && rest.length > 0) order.push(header(s.usualAll, 'all'));
    for (const item of rest) order.push(item.el);
    const more = make('li', 'kp-combobox__option kp-usual__more');
    more.setAttribute('role', 'option');
    more.setAttribute('data-kp-option', '');
    more.setAttribute('data-kp-synth', '');
    more.setAttribute('data-kp-more', '');
    more.textContent = m.expanded ? s.usualShowFewer : s.usualShowAll(m.items.length);
    order.push(more);
    const empty = m.list.querySelector('[data-kp-combobox-empty]');
    m.list.append(...order);
    if (empty) m.list.append(empty);
}

/** @param {UsualModel} m @param {string} typed */
const exactItem = (m, typed) => m.items.find((i) => normaliseName(i.label) === normaliseName(typed));

/** The values picked now (tag mode), or the one chosen. @param {UsualModel} m */
const pickedValues = (m) => (m.box.hasAttribute('data-kp-tags') ? m.handle.values() : []);

/** The near names of what was typed, by the picker's own threshold and count. @param {UsualModel} m @param {string} typed */
const nearOf = (m, typed) =>
    attr(m, 'near', 'ask') === 'off'
        ? []
        : nearNames(typed, m.items, clamp(Number(attr(m, 'near-threshold')) || 0.8, 0.5, 1), clamp(Number(attr(m, 'near-max')) || 3, 1, 5));

/**
 * The guard's rows for what is typed. FIRST in the list: "Headache is already picked" for a name (or the near name of one)
 * already picked, then "Did you mean Fatigue?" for each near name not picked yet, whose plain row is folded into it so the
 * name stands once. Under the options: the plate over a search with nothing left, then "Add 'Fatigu' as new". Before, a
 * near name whose row was still shown (the start of a name, "Fatigu") got no question at all, and a name already picked was
 * answered with "No match" (Kenny, 2026-10-18 21:37).
 * @param {UsualModel} m @param {string} typed
 */
function paintTail(m, typed) {
    const s = getStrings();
    for (const node of m.list.querySelectorAll('.kp-usual__tail')) node.remove();
    if (typed === '') return;
    const empty = m.list.querySelector('[data-kp-combobox-empty]');
    const picked = new Set(pickedValues(m));
    // Identical after case, accents and spaces is never a new name, whatever the guard for close names is set to.
    const exact = exactItem(m, typed);
    /** @param {string} cls @param {string} text @param {boolean} option */
    const row = (cls, text, option) => {
        const li = make('li', `kp-usual__tail ${cls}`, text);
        li.setAttribute('data-kp-synth', '');
        if (option) {
            li.className = `kp-combobox__option ${li.className}`;
            li.setAttribute('role', 'option');
            li.setAttribute('data-kp-option', '');
        } else li.setAttribute('role', 'presentation');
        return li;
    };
    /** @type {HTMLElement[]} */
    const head = [];
    if (exact) {
        // Identical to a name: Enter takes it. Already picked: the list says so where the eyes are.
        if (picked.has(exact.value)) head.push(row('kp-usual__already', s.usualAlreadyPicked(exact.label), false));
        if (head.length) m.list.prepend(...head);
        return;
    }
    const near = nearOf(m, typed);
    const already = near.find((item) => picked.has(item.value));
    if (already) head.push(row('kp-usual__already', s.usualAlreadyPicked(already.label), false));
    for (const item of near.filter((one) => !picked.has(one.value) && !one.el.hasAttribute('aria-disabled'))) {
        const ask = row('kp-usual__near', s.usualDidYouMean(item.label), true);
        ask.dataset.kpNearValue = item.value;
        head.push(ask);
        // The item's own row is folded into its question: one name, once.
        item.el.hidden = true;
    }
    if (head.length) m.list.prepend(...head);
    const realVisible = realOptions(m.list).filter((o) => !o.hidden).length;
    const addOn = attr(m, 'add', 'off') === 'inline';
    /** @type {HTMLElement[]} */
    const foot = [];
    if (realVisible === 0 && head.length === 0) {
        const plate = row('kp-usual__plate', '', false);
        plate.append(
            make('strong', 'kp-usual__plate-title', s.usualNoMatchTitle),
            make('span', 'kp-usual__plate-text', addOn ? s.usualNoMatchText : s.usualNoMatchTextFixed),
        );
        foot.push(plate);
    }
    if (addOn) foot.push(row('kp-usual__add', s.usualAdd(typed), true));
    if (empty) empty.before(...foot);
    else m.list.append(...foot);
}

/** Show or hide the headers by whether any option stands under them. @param {UsualModel} m */
function paintHeaders(m) {
    const children = /** @type {HTMLElement[]} */ ([...m.list.children]);
    for (let i = 0; i < children.length; i += 1) {
        const node = children[i];
        if (!node?.classList.contains('kp-usual__group')) continue;
        let any = false;
        for (let j = i + 1; j < children.length; j += 1) {
            const next = children[j];
            if (!next || next.classList.contains('kp-usual__group')) break;
            // The guard's rows are no item of a group: "All" over nothing but "Add … as new" is a heading over nothing.
            if (next.classList.contains('kp-usual__tail')) continue;
            if (next.hasAttribute('data-kp-option') && !next.hidden && !next.hasAttribute('data-kp-more')) any = true;
        }
        node.hidden = !any;
    }
}

/** Where a value came from. @param {UsualModel} m @param {string} value @returns {'usual' | 'all' | 'pinned'} */
function originOf(m, value) {
    const row = /** @type {HTMLElement[]} */ ([...m.list.querySelectorAll(OPTION_SELECTOR)]).find((o) => o.dataset.value === value);
    if (row?.hasAttribute('data-kp-pinned')) return 'pinned';
    return row?.hasAttribute('data-kp-band') ? 'usual' : 'all';
}

/** Say something on the status line after the combobox has written its own count. @param {UsualModel} m @param {string} text */
const sayAfter = (m, text) => window.setTimeout(() => say(m, text), 0);

/**
 * Light up the tag of a value for a moment: the answer to a pick, an add or a name typed that is already picked, where the
 * eyes are (the row of tags right above the field). A ring in the theme's own focus colour, switched on and off, never eased;
 * held still under reduced motion.
 * @param {UsualModel} m @param {string} value
 */
function flashTag(m, value) {
    const tag = /** @type {HTMLElement | null} */ (m.box.querySelector(`.kp-tag[data-value="${CSS.escape(value)}"]`));
    if (!tag) return;
    tag.removeAttribute('data-kp-usual-flash');
    void tag.offsetWidth;
    tag.setAttribute('data-kp-usual-flash', '');
    window.setTimeout(() => tag.removeAttribute('data-kp-usual-flash'), 1300);
}

/** @param {UsualModel} m @param {string} value @param {'typed' | 'usual' | 'all' | 'pinned'} from */
function pick(m, value, from) {
    m.nextFrom = from;
    const tags = m.box.hasAttribute('data-kp-tags');
    // The field is emptied first: a list closing while it still held the typed name drew "… is already picked" in its
    // closing frames, about the name just picked.
    if (tags) m.input.value = '';
    if (tags) m.handle.set([...m.handle.values().filter((v) => v !== value), value]);
    else m.handle.set([value]);
    m.handle.close();
    m.input.value = tags ? '' : (m.items.find((i) => i.value === value)?.label ?? m.input.value);
    m.handle.refresh();
    flashTag(m, value);
}

/** Take a value out of the picks without a pick event (the check's "Not today", or pressing "Had it" again). @param {UsualModel} m @param {string} value */
function unpick(m, value) {
    m.silent = true;
    try {
        m.handle.set(m.handle.values().filter((v) => v !== value));
    } finally {
        m.silent = false;
    }
}

/** Hide the line under the field that offered Undo after an add. @param {UsualModel} m */
function clearNote(m) {
    m.noteEl.hidden = true;
    m.noteEl.replaceChildren();
}

/** Add a typed name to the list, pick it, and offer Undo. @param {UsualModel} m @param {string} label @param {string | null} nearTo */
function addName(m, label, nearTo) {
    const s = getStrings();
    const event = new CustomEvent(USUAL_ADD_EVENT, { bubbles: true, cancelable: true, detail: { label, nearTo } });
    if (!m.box.dispatchEvent(event)) return;
    const row = make('li', 'kp-combobox__option', label);
    row.setAttribute('role', 'option');
    row.setAttribute('data-kp-option', '');
    row.dataset.value = label;
    m.list.append(row);
    arrange(m);
    pick(m, label, 'typed');
    arrange(m);
    m.handle.refresh();
    const undo = () => {
        row.remove();
        m.handle.set(m.handle.values().filter((v) => v !== label));
        if (!m.box.hasAttribute('data-kp-tags')) m.input.value = '';
        clearNote(m);
        render(m);
        sayAfter(m, s.usualAddUndone(label));
    };
    if (attr(m, 'usual-undo', 'field') === 'toast') {
        sayAfter(m, s.usualAdded(label));
        const ms = m.box.hasAttribute('data-kp-undo-ms') ? Number(m.box.getAttribute('data-kp-undo-ms')) : 6000;
        if (ms > 0) undoToast(s.usualAddedToast(label), { mode: 'revert', ms, undo });
        return;
    }
    // Under the field, where the eyes are: the toast stood at the far corner of the window, cut off in the review dialog.
    // It stays until the next thing is typed or picked.
    const words = make('span', 'kp-usual__note-text', s.usualAddedNote(label));
    const button = make('button', 'kp-button kp-button--ghost kp-button--sm kp-usual__undo', s.usualUndo);
    button.type = 'button';
    button.setAttribute('aria-label', s.usualUndoName(label));
    button.addEventListener('click', () => {
        undo();
        m.input.focus();
    });
    m.noteEl.replaceChildren(words, button);
    m.noteEl.hidden = false;
}

/**
 * The look of the usual choices' check: `rows`, `chips`, or none (`off`, or no attribute). A bare `data-kp-not-today` is rows.
 * Only a picker that holds several values has one: "Had it" is a pick.
 * @param {UsualModel} m @returns {'rows' | 'chips' | null}
 */
function checkLook(m) {
    if (!m.box.hasAttribute('data-kp-tags') || !m.box.hasAttribute('data-kp-not-today')) return null;
    const look = m.box.getAttribute('data-kp-not-today') ?? '';
    if (look === 'off' || look === 'false') return null;
    return look === 'chips' ? 'chips' : 'rows';
}

/** Where a usual choice stands: had it (picked), not today, or not answered. @param {UsualModel} m @param {string} value */
function answerOf(m, value) {
    if (m.handle.values().includes(value)) return 'had';
    return m.notToday.has(value) ? 'not' : 'none';
}

/** Give a usual choice an answer from the check. @param {UsualModel} m @param {string} value @param {'had' | 'not' | 'none'} next */
function answer(m, value, next) {
    const was = answerOf(m, value);
    if (was === next) return;
    const s = getStrings();
    const label = m.items.find((i) => i.value === value)?.label ?? value;
    const wasNot = m.notToday.has(value);
    if (next === 'not') m.notToday.add(value);
    else m.notToday.delete(value);
    if (next === 'had') pick(m, value, 'usual');
    else if (was === 'had') unpick(m, value);
    if (wasNot !== (next === 'not'))
        m.box.dispatchEvent(new CustomEvent(USUAL_NOT_TODAY_EVENT, { bubbles: true, detail: { value, on: next === 'not' } }));
    syncCheck(m);
    syncHint(m);
    sayAfter(m, next === 'had' ? s.usualPicked(label) : next === 'not' ? s.usualNotTodayAnnounce(label) : s.usualUnanswered(label));
}

/**
 * Draw the check of the usual choices under the field, or take it away: a heading, one line saying what Not today is, and
 * the choices in the picker's look. Drawn again only when the look or the band changed; otherwise only the states move, so
 * the focus stays on the button pressed.
 * @param {UsualModel} m
 */
function syncCheck(m) {
    const look = checkLook(m);
    const band = look ? bandValues(m) : [];
    // A value picked or answered stays known; a value that left the band forgets its Not today.
    for (const v of [...m.notToday]) if (!band.includes(v)) m.notToday.delete(v);
    if (!look || band.length === 0) {
        m.checkOff();
        m.check?.remove();
        m.check = null;
        m.checkKey = '';
        return;
    }
    const s = getStrings();
    const key = `${look}|${band.join('\u0001')}`;
    if (!m.check || m.checkKey !== key) {
        m.check?.remove();
        serial += 1;
        const id = `kp-usual-${serial}-check`;
        const check = make('div', `kp-usual__check kp-usual__check--${look}`);
        check.setAttribute('role', 'group');
        check.setAttribute('aria-labelledby', `${id}-title`);
        check.setAttribute('aria-describedby', `${id}-what`);
        const title = make('p', 'kp-usual__check-title', attr(m, 'not-today-label') ?? s.usualCheckTitle);
        title.id = `${id}-title`;
        const what = make('p', 'kp-usual__check-what', look === 'rows' ? s.usualCheckWhat : s.usualCheckWhatChips);
        what.id = `${id}-what`;
        check.append(title, what);
        if (look === 'rows') {
            const grid = make('div', 'kp-usual__check-rows');
            for (const [n, value] of band.entries()) {
                const label = m.items.find((i) => i.value === value)?.label ?? value;
                const name = make('span', 'kp-usual__check-name', label);
                name.id = `${id}-${n}`;
                const pair = make('div', 'kp-segmented kp-usual__check-pair');
                pair.setAttribute('role', 'group');
                pair.setAttribute('aria-labelledby', name.id);
                pair.dataset.value = value;
                for (const [kind, words] of /** @type {const} */ ([
                    ['had', s.usualHadIt],
                    ['not', s.usualNotToday],
                ])) {
                    const button = make('button', 'kp-segmented__item', words);
                    button.type = 'button';
                    button.dataset.value = kind;
                    button.setAttribute('aria-pressed', 'false');
                    pair.append(button);
                }
                grid.append(name, pair);
            }
            check.append(grid);
        } else {
            // The package's three-way chips, with their words: had it (✓), not today (✕, struck through), not answered.
            const chips = make('div', 'kp-segmented kp-segmented--chips kp-usual__check-chips');
            chips.setAttribute('data-kp-segmented', 'tri');
            chips.setAttribute('role', 'group');
            chips.setAttribute('aria-labelledby', `${id}-title`);
            chips.setAttribute(
                'data-kp-segmented-words',
                JSON.stringify({ include: s.usualHadItWord, exclude: s.usualNotTodayMark, any: s.usualUnansweredWord }),
            );
            for (const value of band) {
                const label = m.items.find((i) => i.value === value)?.label ?? value;
                const chip = make('button', 'kp-segmented__item');
                chip.type = 'button';
                chip.dataset.value = value;
                chip.append(make('span', 'kp-segmented__label', label));
                chips.append(chip);
            }
            check.append(chips);
        }
        // After the status line, under the field: the open list lies over it while it is open, as over anything below.
        m.checkOff();
        (m.status ?? m.noteEl).after(check);
        m.check = check;
        m.checkKey = key;
        if (look === 'chips') {
            const group = /** @type {HTMLElement} */ (check.querySelector('.kp-usual__check-chips'));
            const off = attachSegmented(group);
            /** @param {Event} event */
            const onTri = (event) => {
                const { value, state } = /** @type {CustomEvent} */ (event).detail ?? {};
                if (typeof value !== 'string') return;
                answer(m, value, state === 'include' ? 'had' : state === 'exclude' ? 'not' : 'none');
            };
            group.addEventListener(SEGMENTED_EVENT, onTri);
            m.checkOff = () => {
                group.removeEventListener(SEGMENTED_EVENT, onTri);
                off();
                m.checkOff = () => {};
            };
        } else m.checkOff = () => {};
    }
    const off = m.input.disabled;
    if (look === 'rows') {
        for (const pair of m.check.querySelectorAll('.kp-usual__check-pair')) {
            const value = /** @type {HTMLElement} */ (pair).dataset.value ?? '';
            const state = answerOf(m, value);
            for (const button of pair.querySelectorAll('button')) {
                button.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (button).dataset.value === state));
                /** @type {HTMLButtonElement} */ (button).disabled = off;
            }
        }
    } else {
        const group = /** @type {HTMLElement} */ (m.check.querySelector('.kp-usual__check-chips'));
        setSegmentedTri(group, {
            include: band.filter((v) => answerOf(m, v) === 'had'),
            exclude: band.filter((v) => answerOf(m, v) === 'not'),
        });
        if (off) group.setAttribute('aria-disabled', 'true');
        else group.removeAttribute('aria-disabled');
    }
}

/** The state panel: loading, empty, or failed, in the place and size of the open list. @param {UsualModel} m */
function syncPanel(m) {
    const s = getStrings();
    const given = attr(m, 'state');
    const state = given === 'loading' || given === 'error' || given === 'empty' ? given : m.items.length === 0 ? 'empty' : 'ready';
    const was = m.panel.getAttribute('data-kp-panel');
    if (was === state) return;
    m.busy?.remove();
    m.busy = null;
    m.panel.replaceChildren();
    m.panel.setAttribute('data-kp-panel', state);
    m.panel.hidden = state === 'ready';
    // The input waits while the list is read; a page that switched it off itself keeps it off.
    if (state === 'loading') {
        if (m.input.dataset.kpWasDisabled === undefined) m.input.dataset.kpWasDisabled = String(m.input.disabled);
        m.input.disabled = true;
    } else if (m.input.dataset.kpWasDisabled !== undefined) {
        m.input.disabled = m.input.dataset.kpWasDisabled === 'true';
        delete m.input.dataset.kpWasDisabled;
    }
    m.box.toggleAttribute('aria-busy', state === 'loading');
    if (state === 'loading') {
        m.handle.close();
        m.busy = openBusyCard(m.panel, { words: s.usualLoading, area: () => [m.panel], className: 'kp-usual__busy' });
    } else if (state === 'empty') {
        const addOn = attr(m, 'add', 'off') === 'inline';
        m.panel.append(
            statePlate(document, {
                kind: 'empty',
                title: s.usualEmptyTitle,
                text: addOn ? s.usualEmptyText : s.usualEmptyTextFixed,
                ...(addOn ? { actionLabel: s.usualAddButton, actionAttribute: 'data-kp-usual-add-button' } : {}),
            }),
        );
    } else if (state === 'error') {
        m.panel.append(
            statePlate(document, {
                kind: 'error',
                title: s.usualFailedTitle,
                text: s.usualFailedText,
                actionLabel: s.usualRetry,
                actionAttribute: 'data-kp-usual-retry',
            }),
        );
    }
}

/** The line the app gives under the input once something is chosen. @param {UsualModel} m */
function syncHint(m) {
    const text = attr(m, 'hint', '') ?? '';
    const has = m.box.hasAttribute('data-kp-tags') ? m.handle.values().length > 0 : m.input.value.trim() !== '';
    m.hintEl.textContent = text;
    m.hintEl.hidden = !(text !== '' && has);
}

/** Draw the picker from its attributes: the order, the rows, the state, the hint. @param {UsualModel} m */
function render(m) {
    arrange(m);
    m.handle.refresh();
    syncPanel(m);
    syncHint(m);
    syncCheck(m);
}

/**
 * Make one picker ready for the combobox: tag mode and the empty row it needs, before the combobox attaches.
 * @param {HTMLElement} box
 */
function prepare(box) {
    if (box.hasAttribute('data-kp-multiple') && !box.hasAttribute('data-kp-tags')) {
        box.setAttribute('data-kp-tags', '');
        if (!box.querySelector('[data-kp-tag-list]')) {
            const tags = make('div', 'kp-tag-list');
            tags.setAttribute('data-kp-tag-list', '');
            box.querySelector('input')?.before(tags);
        }
    }
    const list = box.querySelector('[role="listbox"]');
    if (list && !list.querySelector('[data-kp-combobox-empty]')) {
        const empty = make('li', 'kp-combobox__empty kp-usual__empty');
        empty.setAttribute('role', 'presentation');
        empty.setAttribute('data-kp-combobox-empty', '');
        empty.hidden = true;
        list.append(empty);
    }
    box.dataset.kpUsualReady = '';
}

/** @param {HTMLElement} box @returns {(() => void) | null} */
function wire(box) {
    prepare(box);
    attachComboboxes(box.parentElement ?? document);
    const handle = combobox(box);
    const input = /** @type {HTMLInputElement | null} */ (box.querySelector('input[role="combobox"]'));
    const list = /** @type {HTMLElement | null} */ (box.querySelector('[role="listbox"]'));
    if (!handle || !input || !list) return null;
    serial += 1;
    const panel = make('div', 'kp-usual__state');
    panel.hidden = true;
    const hintEl = make('p', 'kp-usual__hint');
    hintEl.hidden = true;
    input.after(hintEl);
    const noteEl = make('p', 'kp-usual__note');
    // It says the add itself (the status line keeps its count), so a screen reader hears it once.
    noteEl.setAttribute('aria-live', 'polite');
    noteEl.hidden = true;
    hintEl.after(noteEl);
    box.append(panel);
    /** @type {UsualModel} */
    const m = {
        box,
        input,
        list,
        status: box.querySelector('[data-kp-combobox-status]'),
        handle,
        items: [],
        given: null,
        expanded: false,
        nextFrom: null,
        notToday: new Set(),
        panel,
        busy: null,
        hintEl,
        noteEl,
        check: null,
        checkKey: '',
        checkOff: () => {},
        silent: false,
    };
    models.set(box, m);
    const memory = box.hasAttribute('data-kp-remember') ? memoryFor(box, 'picker') : null;
    if (memory) m.expanded = Boolean(memory.read('expanded', false));
    box.classList.add('kp-usual');
    readItems(m);

    handle.extend({
        shown: (option, query, matched) => {
            if (option.hasAttribute('data-kp-more')) return query === '' && canFold(m);
            if (option.hasAttribute('data-kp-pinned')) return query === '' || matched;
            if (option.hasAttribute('data-kp-synth')) return true;
            if (query === '') return !(folded(m) && option.hasAttribute('data-kp-rest'));
            return matched;
        },
        after: (query, visible) => {
            void query;
            void visible;
            // The guard first (it folds a near name's own row into its question), then the headings over what is left.
            paintTail(m, m.input.value.trim());
            paintHeaders(m);
        },
        status: (query) => {
            if (query !== '') {
                // A name typed that is already picked: the status says what the list's own line says.
                const same = exactItem(m, query);
                return same && pickedValues(m).includes(same.value) ? getStrings().usualAlreadyPicked(same.label) : null;
            }
            const band = bandValues(m).length;
            return band > 0 ? getStrings().usualStatus(band, m.items.length - band) : null;
        },
        choose: (option) => {
            if (option.hasAttribute('data-kp-more')) {
                m.expanded = !m.expanded;
                memory?.write('expanded', m.expanded);
                arrange(m);
                m.handle.refresh();
                return true;
            }
            if (option.classList.contains('kp-usual__add')) {
                addName(m, m.input.value.trim(), null);
                return true;
            }
            if (option.classList.contains('kp-usual__near')) {
                const value = option.dataset.kpNearValue ?? '';
                pick(m, value, 'typed');
                sayAfter(m, getStrings().usualSelectedExisting(m.items.find((i) => i.value === value)?.label ?? value));
                return true;
            }
            if (option.hasAttribute('data-kp-pinned')) {
                m.nextFrom = 'pinned';
            }
            return false;
        },
    });
    arrange(m);
    handle.refresh();
    syncPanel(m);

    let typedAtEnter = '';
    /** @param {Event} event */
    const onChange = (event) => {
        const { value, action, label } = /** @type {CustomEvent} */ (event).detail;
        // Text that named an item already in the list selected it: the status line says so (the combobox cleared the field).
        if (action === 'add' && typedAtEnter !== '' && normaliseName(typedAtEnter) === normaliseName(String(label ?? ''))) {
            sayAfter(m, getStrings().usualSelectedExisting(String(label)));
            flashTag(m, String(value));
        }
        typedAtEnter = '';
        // Any change of the picks ends the Undo offered after an add (an add sets its own line after its pick).
        clearNote(m);
        // Picked is "had it": a usual choice picked from the list or by typing stops being "not today".
        for (const v of handle.values()) {
            if (!m.notToday.delete(v)) continue;
            box.dispatchEvent(new CustomEvent(USUAL_NOT_TODAY_EVENT, { bubbles: true, detail: { value: v, on: false } }));
        }
        if (m.silent || action === 'remove') {
            syncCheck(m);
            syncHint(m);
            return;
        }
        const from = m.nextFrom ?? originOf(m, String(value));
        m.nextFrom = null;
        box.dispatchEvent(new CustomEvent(USUAL_PICK_EVENT, { bubbles: true, detail: { value, from } }));
        syncCheck(m);
        syncHint(m);
    };
    box.addEventListener(CHANGE_EVENT, onChange);

    /** A name typed that is already picked: its tag lights up and the status line says so; the text stays, and so does the list's own line. @param {UsualItem} item */
    const already = (item) => {
        handle.open();
        flashTag(m, item.value);
        sayAfter(m, getStrings().usualAlreadyPicked(item.label));
    };

    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        if (event.key === 'Enter') typedAtEnter = input.value.trim();
        if (event.altKey && (event.code === 'KeyU' || event.key.toLowerCase() === 'u') && input.value === '') {
            event.preventDefault();
            handle.open();
            const pinned = readPinned(m).length;
            for (let i = 0; i < pinned + 1; i += 1) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
            return;
        }
        if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
        const typed = input.value.trim();
        if (typed === '') return;
        // A row lit by the arrows (or by the first Enter on a near name) is what Enter takes: the listbox chooses it.
        if (!list.hidden && input.getAttribute('aria-activedescendant')) return;
        const s = getStrings();
        const picked = new Set(pickedValues(m));
        // Identical after case, accents and spaces: never a second one, whatever the guard is set to.
        const exact = exactItem(m, typed);
        if (exact) {
            event.preventDefault();
            if (picked.has(exact.value)) return already(exact);
            pick(m, exact.value, 'typed');
            sayAfter(m, s.usualSelectedExisting(exact.label));
            return;
        }
        const near = attr(m, 'near', 'ask') ?? 'ask';
        if (near !== 'off') {
            const close = nearOf(m, typed);
            const free = close.filter((item) => !picked.has(item.value) && !item.el.hasAttribute('aria-disabled'));
            if (free[0]) {
                event.preventDefault();
                if (near === 'select') {
                    pick(m, free[0].value, 'typed');
                    sayAfter(m, s.usualTookClosest(typed, free[0].label));
                } else {
                    // Ask: the question already stands first in the list; Enter lights it, and a second Enter takes it. This
                    // Enter is spent here: the listbox, which runs after, must not take the row it has just been lit.
                    event.stopImmediatePropagation();
                    handle.open();
                    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
                    sayAfter(m, s.usualAsk(free[0].label));
                }
                return;
            }
            if (close[0]) {
                event.preventDefault();
                return already(close[0]);
            }
        }
        if (attr(m, 'add', 'off') !== 'inline') return;
        event.preventDefault();
        addName(m, typed, close0(near, typed));
    };
    /** The name a new one was close to, for the add event (null when the guard is off or nothing is close). @param {string} near @param {string} typed */
    const close0 = (near, typed) => (near === 'off' ? null : (nearOf(m, typed)[0]?.label ?? null));
    input.addEventListener('keydown', onKey, { capture: true });

    /** @param {MouseEvent} event */
    const onClick = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-kp-usual-retry]')) box.dispatchEvent(new CustomEvent(USUAL_RETRY_EVENT, { bubbles: true }));
        else if (target?.closest('[data-kp-usual-add-button]')) {
            const typed = input.value.trim();
            if (typed) addName(m, typed, null);
            else input.focus();
        } else {
            // A row of the check: "Had it" or "Not today", pressed again: not answered. (The chips are the segmented
            // module's own three-way group, which says what changed by its event.)
            const button = /** @type {HTMLButtonElement | null} */ (target?.closest('.kp-usual__check-pair button') ?? null);
            const pair = button?.closest('.kp-usual__check-pair');
            if (!button || button.disabled || !(pair instanceof HTMLElement)) return;
            const kind = button.dataset.value === 'not' ? 'not' : 'had';
            const value = pair.dataset.value ?? '';
            answer(m, value, answerOf(m, value) === kind ? 'none' : kind);
        }
    };
    box.addEventListener('click', onClick);
    // Typing re-orders for `while-typing="hide"` and shows or hides the rows of the guard.
    const onInput = () => {
        clearNote(m);
        if (attr(m, 'usual-while-typing') === 'hide') {
            arrange(m);
            handle.refresh();
        }
        syncHint(m);
    };
    input.addEventListener('input', onInput);

    const unkey = registerShortcuts(box, [
        { keys: 'Alt U', what: getStrings().usualJump, group: 'Picker', when: () => bandValues(m).length > 0, run: () => false },
    ]);
    const watch = new MutationObserver(() => render(m));
    watch.observe(box, {
        attributes: true,
        attributeFilter: [
            'data-kp-usual',
            'data-kp-usual-source',
            'data-kp-usual-max',
            'data-kp-usual-label',
            'data-kp-usual-while-typing',
            'data-kp-order',
            'data-kp-pinned',
            'data-kp-all',
            'data-kp-add',
            'data-kp-near',
            'data-kp-near-threshold',
            'data-kp-near-max',
            'data-kp-not-today',
            'data-kp-not-today-label',
            'data-kp-usual-undo',
            'data-kp-hint',
            'data-kp-state',
        ],
    });
    if (attr(m, 'preselect') === 'usual' && box.hasAttribute('data-kp-tags') && handle.values().length === 0) {
        handle.set(bandValues(m));
    }
    syncHint(m);
    syncCheck(m);
    return () => {
        watch.disconnect();
        unkey();
        box.removeEventListener(CHANGE_EVENT, onChange);
        box.removeEventListener('click', onClick);
        input.removeEventListener('keydown', onKey, { capture: true });
        input.removeEventListener('input', onInput);
        handle.extend(null);
        m.busy?.remove();
        panel.remove();
        hintEl.remove();
        noteEl.remove();
        m.checkOff();
        m.check?.remove();
        for (const node of list.querySelectorAll('[data-kp-synth], .kp-usual__tail')) node.remove();
        models.delete(box);
        delete box.dataset.kpUsualReady;
    };
}

/**
 * Wire every picker with `data-kp-usual` under `root`. The combobox it stands on is attached here (a box with the usual is
 * skipped by `attachComboboxes` until this has made it ready).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachUsualPickers(root = document) {
    /** @type {(() => void)[]} */
    const undo = [];
    const boxes = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(USUAL) ? [root] : []),
        ...root.querySelectorAll(USUAL),
    ]);
    for (const box of boxes) {
        if (models.has(box)) continue;
        const off = wire(box);
        if (off) undo.push(off);
    }
    return () => undo.splice(0).forEach((off) => off());
}

/**
 * @typedef {object} UsualHandle
 * @property {HTMLElement} element
 * @property {(values: readonly (string | { value: string, uses?: number })[]) => void} setUsual hand over the band (`{ value, uses }` with the source `counts`)
 * @property {() => string[]} usual the band as drawn
 * @property {() => string[]} notToday the values marked "Not today"
 * @property {(state: 'ready' | 'loading' | 'empty' | 'error') => void} setState
 * @property {(text: string) => void} setHint
 * @property {() => void} refresh read the options again after the page changed them
 */

/**
 * The handle of an attached picker.
 * @param {Element} element
 * @returns {UsualHandle | null}
 */
export function usualPicker(element) {
    const m = models.get(element);
    if (!m) return null;
    return {
        element: m.box,
        setUsual: (values) => setUsual(m.box, values),
        usual: () => bandValues(m),
        notToday: () => [...m.notToday],
        setState: (state) => setUsualState(m.box, state),
        setHint: (text) => (text === '' ? m.box.removeAttribute('data-kp-hint') : m.box.setAttribute('data-kp-hint', text)),
        refresh: () => render(m),
    };
}

/**
 * Hand a picker its band: values (in order), or `{ value, uses }` which `data-kp-usual-source="counts"` ranks by uses.
 * @param {Element} element
 * @param {readonly (string | { value: string, uses?: number })[]} values
 */
export function setUsual(element, values) {
    const m = models.get(element);
    if (!m) return;
    m.given = values.map((v) => (typeof v === 'string' ? { value: v } : v));
    if (!m.box.hasAttribute('data-kp-usual')) m.box.setAttribute('data-kp-usual', '');
    render(m);
}

/**
 * The state of a picker: `loading` (the busy card in the place of the list, the input waiting), `empty`, `error` (Retry fires
 * `kp-usual-retry`; the last good list stays), `ready`.
 * @param {Element} element
 * @param {'ready' | 'loading' | 'empty' | 'error'} state
 */
export function setUsualState(element, state) {
    if (state === 'ready') element.removeAttribute('data-kp-state');
    else element.setAttribute('data-kp-state', state);
}

/**
 * The values marked "Not today".
 * @param {Element} element
 * @returns {string[]}
 */
export function usualNotToday(element) {
    return [...(models.get(element)?.notToday ?? [])];
}
