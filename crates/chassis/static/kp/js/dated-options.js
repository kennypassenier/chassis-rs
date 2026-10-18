// A choice where every option has a date and an age [kpadopt5-time; homelab's snapshot picker, JobTracker's version pickers].
//
// Choosing a snapshot, a backup or a version means choosing a moment: each option is two lines, a name (or its date) and
// how long ago it is, with a size or a kind in a column at the end, the newest first and labelled "Latest":
//
//   <div class="kp-dated" data-kp-dated aria-label="Snapshot to restore"></div>
//   setDatedOptions(el, [{ value: 'a1', when: '2026-10-15T04:00:00+02:00', meta: '4.1 GB' }, …]);
//
// An option is `{ value, label?, when?, meta?, disabled? }`: `label` is its name (the date, in rule 52, stands in when it
// has none), `when` the moment it was made (ISO, ms or Date: the component writes "3 days ago" and the date), `meta` a
// short text the page has formatted (a size from `formatBytes`, a count of files), `disabled` the sentence that says why
// it cannot be chosen now. Up to `data-kp-picker-inline-max` options (7) the options are radio rows, one group, the
// meta values in one column so they line up from row to row; with more, a searchable combobox whose list shows the same
// two lines, because a list longer than a screen is better searched. `data-kp-picker="radio"` or `"combobox"` forces one.
//
// Options (markup, then the option of attachDatedOptions()), each with a default [KT6]:
//   data-kp-picker            radio | combobox | auto                       auto
//   data-kp-picker-inline-max the longest list drawn as radio rows          7
//   data-kp-latest            first | none: the badge on the newest         first
//   data-kp-order             newest | oldest | given                       newest
//   data-kp-meta-column       "false" writes the meta under the name        a column
//   data-kp-preselect         "false" leaves the newest unchosen            the newest is chosen
//   data-kp-rows              the rows a state keeps the height of          4 (2 for a combobox)
//   data-kp-name              the radios' name, for a form                  the element's id
//   data-kp-value             the value to choose when the options arrive   the newest
//   data-kp-time-zone         an IANA zone                                  Europe/Brussels
//   data-kp-now               an ISO moment: a fixed clock for a demo or a test   the real clock
//
// Type a few letters on the radio rows and the first option whose name starts with them is chosen. A choice fires
// `kp-dated-change` with `{ value, option }`. States, in the height of the rows: loading is the busy card over
// placeholder rows, empty is the page's reason (and its action) centred at heading size in the package's empty plate,
// error is the alert with a Try again that fires `kp-dated-retry`. Nothing runs on import; attachDatedOptions(root)
// returns a detach.

import { getStrings } from './strings.js';
import { openBusyCard } from './busy-card.js';
import { attachComboboxes, combobox, CHANGE_EVENT as COMBOBOX_EVENT } from './combobox.js';
import { rangeMoment } from './range.js';
import { CHART_TIME_ZONE } from './chart.js';
import { humanDuration } from './freshness.js';

/** A dated option picker. */
export const DATED = '[data-kp-dated]';
/** Fired on the picker when an option is chosen by a person: `{ value, option }`. */
export const DATED_EVENT = 'kp-dated-change';
/** Fired on the picker, bubbling, when Try again is pressed: `{ element }`. */
export const DATED_RETRY_EVENT = 'kp-dated-retry';
/** The states a picker can be in. */
export const DATED_STATES = /** @type {const} */ (['ready', 'empty', 'loading', 'error']);

/**
 * @typedef {object} DatedOption
 * @property {string} value what the page gets back
 * @property {string} [label] the option's name; the date when absent
 * @property {number | string | Date} [when] the moment it was made
 * @property {string} [meta] a short text, a size or a kind, in the column at the end
 * @property {string} [disabled] why it cannot be chosen now; the option stays and says so
 * @typedef {'ready' | 'empty' | 'loading' | 'error'} DatedState
 * @typedef {object} DatedStateOptions
 * @property {string} [reason] an empty picker's sentence ("No snapshots yet")
 * @property {Node | null} [action] a button under an empty picker's sentence ("Take a snapshot")
 * @property {string} [title] an error's first line
 * @property {string} [text] an error's sentence
 */

/**
 * How long ago a moment was, in words: "just now", "35 min ago", "3 h ago", "3 days ago". Pure.
 * @param {number} ms @param {number} now @param {import('./strings.js').Strings} [strings]
 */
export function datedAge(ms, now, strings = getStrings()) {
    const seconds = Math.floor((now - ms) / 1000);
    if (seconds < 60) return strings.datedJustNow;
    if (seconds >= 86400) return strings.datedAgo(strings.agoDays(Math.floor(seconds / 86400)));
    return strings.datedAgo(humanDuration(seconds, strings));
}

/**
 * The options in the order a picker shows them. Options without a moment keep their place after those with one. Pure.
 * @param {readonly DatedOption[]} options @param {'newest' | 'oldest' | 'given'} order
 * @returns {DatedOption[]}
 */
export function orderDated(options, order = 'newest') {
    const list = options.slice();
    if (order === 'given') return list;
    const at = (/** @type {DatedOption} */ o) => (o.when === undefined ? NaN : new Date(o.when).getTime());
    return list
        .map((o, i) => ({ o, i, t: at(o) }))
        .sort((a, b) => {
            const an = Number.isNaN(a.t);
            const bn = Number.isNaN(b.t);
            if (an || bn) return an === bn ? a.i - b.i : an ? 1 : -1;
            return order === 'oldest' ? a.t - b.t : b.t - a.t;
        })
        .map((x) => x.o);
}

/**
 * @typedef {object} DatedHandle
 * @property {HTMLElement} element
 * @property {(options: readonly DatedOption[], value?: string | null) => void} set the options; none is the empty state
 * @property {(state: DatedState, options?: DatedStateOptions) => void} setState
 * @property {() => string | null} value the chosen value
 * @property {(value: string | null) => void} select choose a value from a script (no event)
 * @property {() => DatedOption[]} options the options, in the order shown
 * @property {() => DatedState} state
 */

/** @type {WeakMap<Element, DatedHandle>} */
const HANDLES = new WeakMap();

/** The handle of an attached picker. @param {Element} element */
export function datedOptions(element) {
    return HANDLES.get(element) ?? null;
}

/**
 * Give a picker its options (none: the empty state), and optionally the value to choose (the newest by default).
 * @param {Element} element @param {readonly DatedOption[]} options @param {string | null} [value]
 */
export function setDatedOptions(element, options, value) {
    HANDLES.get(element)?.set(options, value);
}

/**
 * Put a picker in a state: ready, empty, loading or error.
 * @param {Element} element @param {DatedState} state @param {DatedStateOptions} [options]
 */
export function setDatedState(element, state, options) {
    HANDLES.get(element)?.setState(state, options);
}

/**
 * The value a picker holds.
 * @param {Element} element
 */
export function datedValue(element) {
    return HANDLES.get(element)?.value() ?? null;
}

let seq = 0;

/**
 * Wire every dated option picker under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number }} [options]
 * @returns {() => void} detach
 */
export function attachDatedOptions(root = document, { now: nowOption } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const found = /** @type {HTMLElement[]} */ ([...(root instanceof Element && root.matches(DATED) ? [root] : []), ...root.querySelectorAll(DATED)]);
    for (const el of found) {
        if (HANDLES.has(el)) continue;
        const s = getStrings();
        const doc = el.ownerDocument;
        const id = el.id || `kp-dated-${++seq}`;
        const name = el.dataset.kpName ?? id;
        const mode = el.dataset.kpPicker === 'radio' || el.dataset.kpPicker === 'combobox' ? el.dataset.kpPicker : 'auto';
        const inlineMax = Math.max(1, Number(el.dataset.kpPickerInlineMax) || 7);
        const latestOn = el.dataset.kpLatest !== 'none';
        const order = el.dataset.kpOrder === 'oldest' || el.dataset.kpOrder === 'given' ? el.dataset.kpOrder : 'newest';
        const column = el.dataset.kpMetaColumn !== 'false';
        const preselect = el.dataset.kpPreselect !== 'false';
        const zone = el.dataset.kpTimeZone || CHART_TIME_ZONE;
        const fixed = Date.parse(el.dataset.kpNow ?? '');
        const now = nowOption ?? (Number.isFinite(fixed) ? () => fixed : () => Date.now());
        const label = el.getAttribute('aria-label') ?? el.dataset.kpLegend ?? s.datedGroup;
        el.classList.add('kp-dated');
        el.dataset.kpDatedAttached = '';
        if (!column) el.dataset.kpMetaColumnOff = '';
        const rowsWanted = Math.max(0, Number(el.dataset.kpRows) || 0);

        const stage = doc.createElement('div');
        stage.className = 'kp-dated__stage';
        const body = doc.createElement('div');
        body.className = 'kp-dated__body';
        const note = doc.createElement('div');
        note.className = 'kp-dated__state';
        note.hidden = true;
        stage.append(body, note);
        const live = doc.createElement('p');
        live.className = 'kp-sr-only';
        live.setAttribute('role', 'status');
        live.setAttribute('aria-live', 'polite');
        el.replaceChildren(stage, live);

        /** @type {DatedOption[]} */
        let shown = [];
        /** @type {string | null} */
        let chosen = null;
        /** @type {string | undefined} */
        let pendingValue;
        /** @type {DatedState} */
        let state = 'ready';
        /** @type {DatedStateOptions} */
        let given = {};
        /** @type {'radio' | 'combobox'} */
        let kind = 'radio';
        /** @type {import('./busy-card.js').BusyCard | null} */
        let busy = null;
        let drawn = false;
        /** @type {(() => void) | null} */
        let detachCombobox = null;

        const stamp = (/** @type {DatedOption} */ o) => (o.when === undefined ? NaN : new Date(o.when).getTime());
        /** The option's first line: its name, or its date. @param {DatedOption} o */
        const titleOf = (o) => o.label ?? (Number.isNaN(stamp(o)) ? o.value : rangeMoment(stamp(o), zone));
        /** The second line: how long ago, with the date when the first line is a name. @param {DatedOption} o */
        const hintOf = (o) => {
            if (o.disabled) return o.disabled;
            const t = stamp(o);
            if (Number.isNaN(t)) return '';
            const age = datedAge(t, now(), s);
            return o.label ? `${age} · ${rangeMoment(t, zone)}` : age;
        };
        const newest = () => {
            const dated = shown.filter((o) => !Number.isNaN(stamp(o)));
            return dated.length ? dated.reduce((a, b) => (stamp(b) > stamp(a) ? b : a)) : null;
        };

        /** @param {HTMLElement} parent @param {DatedOption} o */
        const nameLine = (parent, o) => {
            const text = doc.createElement('span');
            text.className = 'kp-dated__name';
            text.textContent = titleOf(o);
            parent.append(text);
            if (latestOn && newest() === o) {
                const badge = doc.createElement('span');
                badge.className = 'kp-badge kp-badge--info kp-dated__latest';
                badge.textContent = s.datedLatest;
                parent.append(badge);
            }
        };

        const drawRadios = () => {
            const group = doc.createElement('fieldset');
            group.className = 'kp-fieldset kp-dated__group';
            group.dataset.kpLayout = 'dated';
            const legend = doc.createElement('legend');
            legend.className = 'kp-sr-only';
            legend.textContent = label;
            group.append(legend);
            for (const [i, o] of shown.entries()) {
                const row = doc.createElement('label');
                row.className = 'kp-field__option kp-dated__option';
                const input = doc.createElement('input');
                input.type = 'radio';
                input.className = 'kp-field__check';
                input.name = name;
                input.value = o.value;
                input.checked = o.value === chosen;
                if (o.disabled) {
                    input.disabled = true;
                    input.setAttribute('aria-describedby', `${id}-hint-${i}`);
                }
                const title = doc.createElement('span');
                title.className = 'kp-field__option-title';
                nameLine(title, o);
                const hint = doc.createElement('span');
                hint.className = 'kp-field__option-hint kp-dated__hint';
                hint.id = `${id}-hint-${i}`;
                hint.textContent = hintOf(o);
                row.append(input, title, hint);
                if (o.meta) {
                    const meta = doc.createElement('span');
                    meta.className = 'kp-dated__meta';
                    meta.textContent = o.meta;
                    row.append(meta);
                }
                group.append(row);
            }
            body.replaceChildren(group);
        };

        const drawCombobox = () => {
            const box = doc.createElement('div');
            box.className = 'kp-combobox kp-dated__combobox';
            box.dataset.kpCombobox = '';
            box.dataset.kpMatch = 'substring';
            const input = doc.createElement('input');
            input.className = 'kp-combobox__input';
            input.type = 'text';
            input.setAttribute('role', 'combobox');
            input.setAttribute('aria-expanded', 'false');
            input.setAttribute('aria-controls', `${id}-list`);
            input.setAttribute('aria-label', label);
            input.setAttribute('autocomplete', 'off');
            input.placeholder = s.datedSearch;
            const list = doc.createElement('ul');
            list.className = 'kp-combobox__list kp-dated__list';
            list.id = `${id}-list`;
            list.setAttribute('role', 'listbox');
            list.hidden = true;
            for (const [i, o] of shown.entries()) {
                const li = doc.createElement('li');
                li.className = 'kp-combobox__option kp-dated__item';
                li.id = `${id}-option-${i}`;
                li.setAttribute('role', 'option');
                li.setAttribute('aria-selected', 'false');
                li.dataset.kpOption = '';
                li.dataset.value = o.value;
                li.dataset.kpLabel = titleOf(o);
                if (o.disabled) li.setAttribute('aria-disabled', 'true');
                const first = doc.createElement('span');
                first.className = 'kp-dated__item-name';
                nameLine(first, o);
                const sub = doc.createElement('span');
                sub.className = 'kp-dated__item-hint';
                sub.textContent = hintOf(o);
                li.append(first, sub);
                if (o.meta) {
                    const meta = doc.createElement('span');
                    meta.className = 'kp-dated__meta';
                    meta.textContent = o.meta;
                    li.append(meta);
                }
                list.append(li);
            }
            const status = doc.createElement('p');
            status.className = 'kp-combobox__status';
            status.dataset.kpComboboxStatus = '';
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            const hidden = doc.createElement('input');
            hidden.type = 'hidden';
            hidden.name = name;
            hidden.className = 'kp-dated__value';
            box.append(input, list, status, hidden);
            body.replaceChildren(box);
            detachCombobox = attachComboboxes(body);
            const handle = combobox(box);
            if (chosen !== null) handle?.set([chosen]);
            hidden.value = chosen ?? '';
        };

        const paintNote = () => {
            note.replaceChildren();
            note.hidden = state !== 'empty' && state !== 'error';
            note.removeAttribute('role');
            if (state === 'empty') {
                const plate = doc.createElement('div');
                plate.className = 'kp-empty kp-dated__empty';
                const t = doc.createElement('p');
                t.className = 'kp-empty__title kp-dated__empty-title';
                t.textContent = given.reason ?? s.datedEmpty;
                plate.append(t);
                if (given.action) {
                    const actions = doc.createElement('div');
                    actions.className = 'kp-dated__actions';
                    actions.append(given.action);
                    plate.append(actions);
                }
                note.append(plate);
                note.setAttribute('role', 'status');
            } else if (state === 'error') {
                const alert = doc.createElement('div');
                alert.className = 'kp-alert kp-alert--destructive kp-dated__failure';
                const text = doc.createElement('div');
                text.className = 'kp-alert__body';
                const t = doc.createElement('strong');
                t.className = 'kp-dated__failure-title';
                t.textContent = given.title ?? s.datedFailed;
                text.append(t);
                if (given.text) {
                    const p = doc.createElement('span');
                    p.className = 'kp-dated__failure-text';
                    p.textContent = given.text;
                    text.append(p);
                }
                const retry = doc.createElement('button');
                retry.type = 'button';
                retry.className = 'kp-button kp-dated__retry';
                retry.dataset.kpDatedRetry = '';
                retry.textContent = s.datedRetry;
                alert.append(text, retry);
                note.append(alert);
                note.setAttribute('role', 'alert');
            }
        };

        const draw = () => {
            detachCombobox?.();
            detachCombobox = null;
            const placeholders = state === 'loading' && shown.length === 0;
            kind = mode === 'auto' ? (shown.length > inlineMax ? 'combobox' : 'radio') : mode;
            el.dataset.kpPickerKind = kind;
            el.style.setProperty('--kp-dated-rows', String(rowsWanted || (kind === 'combobox' ? 2 : 4)));
            if (placeholders) {
                const wait = doc.createElement('div');
                wait.className = 'kp-dated__wait';
                wait.setAttribute('aria-hidden', 'true');
                for (let i = 0; i < (rowsWanted || 4); i++) {
                    const bar = doc.createElement('span');
                    bar.className = 'kp-skeleton kp-dated__bar';
                    wait.append(bar);
                }
                body.replaceChildren(wait);
            } else if (kind === 'radio') drawRadios();
            else drawCombobox();
            body.toggleAttribute('inert', state !== 'ready');
            if (state === 'loading') body.setAttribute('aria-busy', 'true');
            else body.removeAttribute('aria-busy');
        };

        /** The height the picker had with its options, kept while a state stands in for them. */
        let kept = 0;
        const sync = () => {
            if (state === 'ready') {
                kept = 0;
                el.style.removeProperty('--kp-dated-keep');
            } else if (stage.dataset.kpWas === 'ready') {
                kept = stage.offsetHeight;
                el.style.setProperty('--kp-dated-keep', `${kept}px`);
            }
            stage.dataset.kpWas = state;
            draw();
            paintNote();
            el.dataset.kpState = state;
            if (state === 'loading' && !busy)
                busy = openBusyCard(stage, { words: s.datedLoading, area: () => [stage], className: 'kp-dated__busy', arrive: drawn });
            else if (state !== 'loading' && busy) {
                const b = busy;
                busy = null;
                void b.close();
            }
            drawn = true;
        };

        /** @param {string | null} value @param {boolean} fire */
        const choose = (value, fire) => {
            const option = shown.find((o) => o.value === value) ?? null;
            if (option?.disabled) return;
            chosen = option ? option.value : null;
            if (kind === 'radio') {
                for (const input of body.querySelectorAll('input[type="radio"]'))
                    /** @type {HTMLInputElement} */ (input).checked = /** @type {HTMLInputElement} */ (input).value === chosen;
            } else {
                const hidden = body.querySelector('.kp-dated__value');
                if (hidden instanceof HTMLInputElement) hidden.value = chosen ?? '';
                const box = body.querySelector('.kp-combobox');
                if (box && fire === false) {
                    // The combobox writes its own field; a script's choice goes through its handle without our listener acting twice.
                    suppress = true;
                    combobox(box)?.set(chosen === null ? [] : [chosen]);
                    suppress = false;
                }
            }
            if (fire && option) {
                live.textContent = s.datedChosen(titleOf(option));
                el.dispatchEvent(new CustomEvent(DATED_EVENT, { bubbles: true, detail: { value: option.value, option } }));
            }
        };
        let suppress = false;

        /** @type {DatedHandle} */
        const handle = {
            element: el,
            set(options, value) {
                shown = orderDated(options, order);
                const wanted = value === undefined ? (chosen ?? pendingValue ?? null) : value;
                const keep = wanted !== null && shown.some((o) => o.value === wanted && !o.disabled) ? wanted : null;
                const first = preselect ? (newest() ?? shown.find((o) => !o.disabled) ?? null) : null;
                chosen = keep ?? (value === null ? null : (first?.value ?? null));
                state = shown.length === 0 ? 'empty' : 'ready';
                sync();
            },
            setState(next, options = {}) {
                given = { ...given, ...options };
                state = next === 'ready' && shown.length === 0 ? 'empty' : next;
                sync();
            },
            value: () => chosen,
            select: (value) => choose(value, false),
            options: () => shown.slice(),
            state: () => state,
        };
        HANDLES.set(el, handle);

        /** @param {Event} event */
        const onChange = (event) => {
            const target = event.target;
            if (target instanceof HTMLInputElement && target.type === 'radio' && body.contains(target)) choose(target.value, true);
        };
        /** @param {Event} event */
        const onCombobox = (event) => {
            if (suppress || event.target === el) return;
            const detail = /** @type {CustomEvent} */ (event).detail;
            if (detail?.action === 'add' || detail?.action === 'set') choose(String(detail.value), detail.action === 'add');
        };
        /** @param {MouseEvent} event */
        const onClick = (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest('[data-kp-dated-retry]'))
                el.dispatchEvent(new CustomEvent(DATED_RETRY_EVENT, { bubbles: true, detail: { element: el } }));
        };
        // Type a few letters on the radio rows: the first option whose name starts with them is chosen.
        let typed = '';
        let typedAt = 0;
        /** @param {KeyboardEvent} event */
        const onType = (event) => {
            if (
                kind !== 'radio' ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey ||
                event.key.length !== 1 ||
                !(event.target instanceof HTMLInputElement)
            )
                return;
            const t = Date.now();
            typed = t - typedAt > 700 ? event.key.toLowerCase() : typed + event.key.toLowerCase();
            typedAt = t;
            const hit = shown.find((o) => !o.disabled && titleOf(o).toLowerCase().startsWith(typed));
            if (!hit) return;
            const input = [...body.querySelectorAll('input[type="radio"]')].find((i) => /** @type {HTMLInputElement} */ (i).value === hit.value);
            if (input instanceof HTMLInputElement) {
                input.focus();
                input.checked = true;
                choose(hit.value, true);
            }
        };
        el.addEventListener('change', onChange);
        el.addEventListener(COMBOBOX_EVENT, onCombobox);
        el.addEventListener('click', onClick);
        el.addEventListener('keydown', onType);

        // A data area shows its loading state from the first frame; the page hands over the options after.
        pendingValue = el.dataset.kpValue;
        handle.setState('loading');

        cleanups.push(() => {
            el.removeEventListener('change', onChange);
            el.removeEventListener(COMBOBOX_EVENT, onCombobox);
            el.removeEventListener('click', onClick);
            el.removeEventListener('keydown', onType);
            detachCombobox?.();
            busy?.remove();
            HANDLES.delete(el);
            el.replaceChildren();
            el.style.removeProperty('--kp-dated-rows');
            delete el.dataset.kpDatedAttached;
            delete el.dataset.kpPickerKind;
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}
