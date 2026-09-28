// Combobox and tag input, framework-free [TH39, TH41].
//
// The two share almost everything: a text input, a filtered list, virtual
// focus from js/listbox.js. They differ in what a choice does — a
// combobox replaces the value, a tag input appends one and clears the
// field — so they are one module with one flag rather than two files that
// drift.
//
// What the markup looks like:
//
//   <div class="kp-combobox" data-kp-combobox>
//     <input class="kp-combobox__input" type="text" role="combobox"
//            aria-expanded="false" aria-controls="fruit-list" />
//     <ul class="kp-combobox__list" id="fruit-list" role="listbox" hidden>
//       <li class="kp-combobox__option" role="option" data-kp-option
//           data-value="apple">Apple</li>
//     </ul>
//     <p class="kp-combobox__status" data-kp-combobox-status
//        role="status" aria-live="polite"></p>
//   </div>
//
// Add `data-kp-tags` to the wrapper and it becomes a tag input. Tags the
// server already rendered into `[data-kp-tag-list]` are read at attach.
//
// The status line is not decoration. A sighted user sees the list shrink
// as they type; without an announcement, nobody else knows anything
// happened. It is the single most-skipped part of every combobox.
//
// Since 3.0.0 [KT6]: the values are readable and settable through the
// handle; the matcher is a choice (substring, prefix, or the palette's
// subsequence) or the consumer's own function; every behaviour — open on
// focus, close on blur, Backspace removes, stay open after a tag, the
// cap, duplicates — is a flag with a default; the tag markup can be the
// consumer's; and detach restores what attach changed.

import { createListbox, OPTION_SELECTOR, subsequence } from './listbox.js';
import { getStrings } from './strings.js';
import { placeBlockSide, raiseInPlace, raiseOverlay, raised } from './top-layer.js';

const COMBOBOX = '[data-kp-combobox]';
const INPUT = 'input[role="combobox"]';
const LIST = '[role="listbox"]';
const STATUS = '[data-kp-combobox-status]';
const TAGS = '[data-kp-tag-list]';
const EMPTY = '[data-kp-combobox-empty]';

/** Announced when the list changes; the words come from the dictionary [KT5]. */
const RESULTS_TEXT = /** @param {number} n */ (n) => {
    const s = getStrings();
    return n === 0 ? s.noResults : n === 1 ? s.oneResult : s.manyResults(n);
};

/**
 * The event a consumer listens for. A contract value [TH26]: the detail
 * carries `{ value, label, values, action }` — the value just chosen or
 * removed, its label, every value held (one for a combobox, the whole
 * set for a tag input), and which of 'add' | 'remove' | 'set' it was.
 */
export const CHANGE_EVENT = 'kp-combobox-change';
/** Fired when the list opens or closes: `{ open }`. */
export const OPEN_EVENT = 'kp-combobox-open';

/** @typedef {(optionText: string, query: string) => boolean} Matcher */
/** @type {Record<string, Matcher>} */
export const MATCHERS = {
    substring: (text, query) => text.includes(query),
    prefix: (text, query) => text.startsWith(query),
    subsequence: (text, query) => subsequence(text, query),
};

/**
 * @typedef {object} ComboboxHandle
 * @property {HTMLElement} element
 * @property {() => string[]} values
 * @property {(values: readonly string[]) => void} set replace the held values (a combobox takes the first)
 * @property {() => void} open
 * @property {() => void} close
 * @property {(text: string) => void} query type on the consumer's behalf
 * @property {() => void} refresh re-read the options after the consumer changed them
 */

/** @type {WeakMap<Element, ComboboxHandle>} */
const handles = new WeakMap();

/** The handle for an attached combobox. @param {Element} element */
export function combobox(element) {
    return handles.get(element) ?? null;
}

/**
 * Attach every combobox and tag input under `root`.
 *
 * @param {ParentNode} root
 * @param {{ match?: keyof typeof MATCHERS | Matcher, loop?: boolean, openOnFocus?: boolean, closeOnBlur?: boolean, backspaceRemoves?: boolean, stayOpen?: boolean, maxTags?: number, allowDuplicates?: boolean, debounceMs?: number, emptyRow?: boolean, creatable?: boolean, renderTag?: (value: string, label: string) => HTMLElement, removeGlyph?: string }} [options]
 *   Defaults; per box as data-attributes: `data-kp-match`, `data-kp-loop`, `data-kp-open-on-focus`, `data-kp-close-on-blur`, `data-kp-backspace-removes`, `data-kp-stay-open`, `data-kp-max-tags`, `data-kp-duplicates`, `data-kp-debounce`, `data-kp-empty-row`, `data-kp-creatable`.
 *   A tag input adds from typed text with Enter or a comma [scope-60]: text that names an option (its label, any case) takes that option; other text becomes a tag of its own only with `creatable` (default false, as the React channel's prop).
 *   `backspaceRemoves` (default false since Kenny's second nostromo pass, 2026-09-13): Backspace in an empty field removes the last tag; `data-kp-backspace-removes` opts one box in.
 *   `emptyRow` (default true): a query that matches nothing keeps the list open with a "no results" row — the server's own `[data-kp-combobox-empty]` element inside the list if it wrote one, else one built from the dictionary; `false` closes the list instead, as before 6.1 [gap-11].
 * @returns {(() => void) & { handles: ComboboxHandle[] }} detach
 */
export function attachComboboxes(
    root = document,
    {
        match = 'substring',
        loop = false,
        openOnFocus = true,
        closeOnBlur = true,
        backspaceRemoves = false,
        stayOpen = true,
        maxTags = Infinity,
        allowDuplicates = false,
        debounceMs = 0,
        emptyRow = true,
        creatable = false,
        renderTag,
        removeGlyph = '×',
    } = {},
) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {ComboboxHandle[]} */
    const created = [];

    for (const element of root.querySelectorAll(COMBOBOX)) {
        const box = /** @type {HTMLElement} */ (element);
        if (box.dataset.kpComboboxAttached !== undefined) continue;
        const input = /** @type {HTMLInputElement | null} */ (box.querySelector(INPUT));
        const list = /** @type {HTMLElement | null} */ (box.querySelector(LIST));
        if (input === null || list === null) continue;
        box.dataset.kpComboboxAttached = '';

        const status = /** @type {HTMLElement | null} */ (box.querySelector(STATUS));
        const tagList = /** @type {HTMLElement | null} */ (box.querySelector(TAGS));
        const isTags = box.dataset.kpTags !== undefined;
        /** @param {string} name @param {boolean} fallback */
        const flag = (name, fallback) => (box.dataset[name] === undefined ? fallback : box.dataset[name] !== 'false');
        const opens = flag('kpOpenOnFocus', openOnFocus);
        const closes = flag('kpCloseOnBlur', closeOnBlur);
        const backspaces = flag('kpBackspaceRemoves', backspaceRemoves);
        const stays = flag('kpStayOpen', stayOpen);
        const duplicates = flag('kpDuplicates', allowDuplicates);
        const cap = Number.parseInt(box.dataset.kpMaxTags ?? '', 10) || maxTags;
        const debounce = Number.parseInt(box.dataset.kpDebounce ?? '', 10) || debounceMs;
        const matcher = typeof match === 'function' ? match : (MATCHERS[box.dataset.kpMatch ?? match] ?? MATCHERS.substring);
        const showsEmpty = flag('kpEmptyRow', emptyRow);
        const creates = flag('kpCreatable', creatable);
        // The row that says nothing matched, inside the list and directly under
        // the input [gap-11]. Filtering to nothing used to close the list, and
        // the only answer left was the status line. The server's own row is
        // used when it wrote one (it may offer "add this"); otherwise one is
        // built, and taken away again at detach.
        const serverEmpty = /** @type {HTMLElement | null} */ (list.querySelector(EMPTY));
        /** @type {HTMLElement | null} */
        let empty = serverEmpty;
        if (showsEmpty && empty === null) {
            empty = document.createElement('li');
            empty.className = 'kp-combobox__empty';
            empty.setAttribute('role', 'presentation');
            empty.dataset.kpComboboxEmpty = '';
            list.append(empty);
        }
        const emptyWasHidden = serverEmpty?.hidden ?? true;

        /** Tags the server rendered are the starting set, not invisible. */
        /** @type {string[]} */
        const chosen = tagList
            ? [...tagList.querySelectorAll('.kp-tag')].map((t) => /** @type {HTMLElement} */ (t).dataset.value ?? (t.textContent ?? '').trim())
            : [];
        const before = {
            expanded: input.getAttribute('aria-expanded'),
            listHidden: list.hidden,
            hidden: [...list.querySelectorAll(OPTION_SELECTOR)].map((o) => /** @type {HTMLElement} */ (o).hidden),
            tags: tagList ? [...tagList.children] : [],
            status: status?.textContent ?? '',
        };

        /** Takes the open list out of the top layer again (js/top-layer.js). */
        let lower = () => {};
        /** @param {boolean} next */
        const setOpen = (next) => {
            const was = list.hidden === false;
            list.hidden = !next;
            // Above a container that clips — a card's cut corners hid every option in four themes — where it was drawn.
            if (next && !was) lower = raiseInPlace(list, box, input);
            if (!next && was) {
                lower();
                lower = () => {};
            }
            input.setAttribute('aria-expanded', String(next));
            if (!next) listbox.clear();
            if (was !== next) box.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: next } }));
        };
        const open = () => setOpen(true);
        const close = () => setOpen(false);

        /** Show only the options whose text matches, and say how many are left. */
        const filter = () => {
            const query = input.value.trim().toLowerCase();
            let visible = 0;
            for (const element of list.querySelectorAll(OPTION_SELECTOR)) {
                const option = /** @type {HTMLElement} */ (element);
                const text = (option.textContent ?? '').toLowerCase();
                const taken = isTags && !duplicates && chosen.includes(option.dataset.value ?? text);
                const shown = !taken && (query === '' || matcher(text, query));
                option.hidden = !shown;
                if (shown) visible += 1;
            }
            listbox.refresh();
            if (status !== null) status.textContent = RESULTS_TEXT(visible);
            if (empty !== null) {
                empty.hidden = !showsEmpty || visible > 0;
                if (empty !== serverEmpty) empty.textContent = getStrings().noResults;
            }
            return visible;
        };

        /** The option whose value (or text) is `value`. @param {string} value @returns {HTMLElement | null} */
        const optionFor = (value) => {
            for (const element of list.querySelectorAll(OPTION_SELECTOR)) {
                const option = /** @type {HTMLElement} */ (element);
                if ((option.dataset.value ?? (option.textContent ?? '').trim()) === value) return option;
            }
            return null;
        };

        /** @param {string} value @param {string} label @param {'add' | 'remove' | 'set'} action */
        const announce = (value, label, action) =>
            box.dispatchEvent(
                new CustomEvent(CHANGE_EVENT, { bubbles: true, detail: { value, label, values: isTags ? [...chosen] : [value], action } }),
            );

        /** @param {string} value @param {string} label */
        const tagElement = (value, label) => {
            if (renderTag !== undefined) {
                const custom = renderTag(value, label);
                custom.dataset.value = value;
                custom.classList.add('kp-tag');
                return custom;
            }
            const tag = document.createElement('span');
            tag.className = 'kp-tag';
            tag.dataset.value = value;
            const text = document.createElement('span');
            text.textContent = label;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'kp-tag__remove';
            // A bare glyph is "times" to a screen reader; the name says
            // what it removes, because a row of ten identical buttons is
            // useless without it.
            remove.setAttribute('aria-label', getStrings().removeNamed(label));
            remove.textContent = box.dataset.kpRemoveGlyph ?? removeGlyph;
            tag.append(text, remove);
            return tag;
        };

        /** @param {string} value @param {string} label */
        const addTag = (value, label) => {
            if (chosen.length >= cap) return;
            if (duplicates || !chosen.includes(value)) {
                chosen.push(value);
                if (tagList !== null) tagList.append(tagElement(value, label));
            }
            input.value = '';
            filter();
            // Kept open: adding one tag almost always means adding
            // another, and reopening the list by hand is friction the
            // keyboard user pays and the mouse user does not.
            if (stays) open();
            else close();
            announce(value, label, 'add');
        };

        /** @param {HTMLElement} option */
        const take = (option) => {
            // Two different things, and conflating them is a real bug the
            // contract suite caught between the channels: the LABEL is
            // what a person reads in the field, the VALUE is what the
            // consumer gets in the event. `data-value` is optional, so an
            // option without one uses its own text for both.
            const label = (option.textContent ?? '').trim();
            const value = option.dataset.value ?? label;
            if (isTags) {
                addTag(value, label);
                return;
            }
            input.value = label;
            close();
            announce(value, label, 'add');
        };

        /**
         * Typed text ends a tag [scope-60]. Before this, Enter with nothing
         * highlighted had nothing to take, so a tag input filtered and removed
         * but never added from the keyboard. Text naming an option takes it;
         * other text becomes its own tag where the box allows new values.
         *
         * @returns {boolean} whether a tag was added
         */
        const addTyped = () => {
            const typed = input.value.trim();
            if (typed === '') return false;
            const named = [...list.querySelectorAll(OPTION_SELECTOR)].find(
                (element) =>
                    !element.matches('[aria-disabled="true"], [data-kp-disabled]') &&
                    (element.textContent ?? '').trim().toLowerCase() === typed.toLowerCase(),
            );
            if (named instanceof HTMLElement) {
                take(named);
                return true;
            }
            if (!creates) return false;
            addTag(typed, typed);
            return true;
        };

        /** @param {string} value */
        const removeValue = (value) => {
            const at = chosen.indexOf(value);
            if (at === -1) return;
            chosen.splice(at, 1);
            const tag = /** @type {HTMLElement | null} */ (tagList?.querySelector(`.kp-tag[data-value="${CSS.escape(value)}"]`) ?? null);
            const label = tag?.querySelector('span')?.textContent ?? value;
            tag?.remove();
            filter();
            announce(value, label, 'remove');
        };

        const listbox = createListbox({
            input,
            list,
            loop: flag('kpLoop', loop),
            onChoose: (_, option) => take(option),
            onDismiss: close,
        });

        let pending = 0;
        const onInput = () => {
            clearTimeout(pending);
            const run = () => {
                const visible = filter();
                if (visible > 0 || (showsEmpty && input.value.trim() !== '')) open();
                else close();
            };
            if (debounce > 0) pending = window.setTimeout(run, debounce);
            else run();
        };

        /** @param {KeyboardEvent} event */
        const onKeyDown = (event) => {
            if (!isTags) return;
            // The listbox runs first: an Enter that took a highlighted option
            // is already spent, and the field is empty by now.
            if ((event.key === 'Enter' || event.key === ',') && !event.defaultPrevented && !event.isComposing) {
                if (event.key === 'Enter' && listbox.index !== -1) return;
                if (addTyped()) event.preventDefault();
                return;
            }
            // Backspace in an empty field removes the last tag only where the
            // box opts in. It was the default until Kenny's second nostromo
            // pass (2026-09-13): one Backspace too many while correcting a
            // typo took away a tag already chosen. Each tag's own remove
            // button is the way out, and it is in the tab order.
            if (!backspaces) return;
            if (event.key === 'Backspace' && input.value === '' && chosen.length > 0) removeValue(chosen[chosen.length - 1] ?? '');
        };

        /** @param {MouseEvent} event */
        const onTagClick = (event) => {
            const target = /** @type {HTMLElement} */ (event.target);
            const remove = target.closest('.kp-tag__remove, [data-kp-tag-remove]');
            if (remove === null) return;
            const tag = /** @type {HTMLElement | null} */ (remove.closest('.kp-tag'));
            removeValue(tag?.dataset.value ?? '');
            input.focus();
        };

        const onFocus = () => {
            if (opens && filter() > 0) open();
        };
        const onFocusOut = () => {
            if (!closes) return;
            // A tick, because focus moving from the input to an option is
            // a focusout followed immediately by a focusin, and closing
            // on the first would make every mouse choice miss.
            setTimeout(() => {
                if (!box.contains(document.activeElement)) close();
            }, 0);
        };

        /**
         * A press in the list keeps DOM focus in the input. Without this the
         * press moved focus to the page, the focusout above closed the list
         * a tick later, and the click that followed the release landed on a
         * hidden list: choosing an option with the mouse did nothing [note 2
         * of Kenny's second nostromo pass, 2026-09-13]. The React channel
         * always did this on its options.
         *
         * @param {MouseEvent} event
         */
        const onListMouseDown = (event) => event.preventDefault();

        input.addEventListener('input', onInput);
        input.addEventListener('keydown', onKeyDown);
        input.addEventListener('focus', onFocus);
        box.addEventListener('focusout', onFocusOut);
        list.addEventListener('mousedown', onListMouseDown);
        tagList?.addEventListener('click', onTagClick);
        filter();
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');

        /** @type {ComboboxHandle} */
        const handle = {
            element: box,
            values: () => (isTags ? [...chosen] : [input.value]),
            set: (values) => {
                if (isTags) {
                    chosen.splice(0, chosen.length);
                    if (tagList) tagList.replaceChildren();
                    for (const value of values.slice(0, cap)) {
                        if (!duplicates && chosen.includes(value)) continue;
                        chosen.push(value);
                        const option = optionFor(value);
                        tagList?.append(tagElement(value, (option?.textContent ?? value).trim()));
                    }
                    filter();
                    announce(values[values.length - 1] ?? '', '', 'set');
                } else {
                    const value = values[0] ?? '';
                    const option = optionFor(value);
                    input.value = (option?.textContent ?? value).trim();
                    announce(value, input.value, 'set');
                }
            },
            open,
            close,
            query: (text) => {
                input.value = text;
                onInput();
            },
            refresh: () => void filter(),
        };
        handles.set(box, handle);
        created.push(handle);

        cleanups.push(() => {
            clearTimeout(pending);
            lower();
            listbox.destroy();
            input.removeEventListener('input', onInput);
            input.removeEventListener('keydown', onKeyDown);
            input.removeEventListener('focus', onFocus);
            box.removeEventListener('focusout', onFocusOut);
            list.removeEventListener('mousedown', onListMouseDown);
            tagList?.removeEventListener('click', onTagClick);
            if (before.expanded === null) input.removeAttribute('aria-expanded');
            else input.setAttribute('aria-expanded', before.expanded);
            list.hidden = before.listHidden;
            [...list.querySelectorAll(OPTION_SELECTOR)].forEach((o, i) => {
                /** @type {HTMLElement} */ (o).hidden = before.hidden[i] ?? false;
            });
            if (tagList) tagList.replaceChildren(...before.tags);
            if (status) status.textContent = before.status;
            if (empty !== null && empty !== serverEmpty) empty.remove();
            if (serverEmpty !== null) serverEmpty.hidden = emptyWasHidden;
            handles.delete(box);
            delete box.dataset.kpComboboxAttached;
        });
    }

    const detach = () => {
        for (const c of cleanups) c();
    };
    return Object.assign(detach, { handles: created });
}

// ── The drawn select [scope-54, Kenny's form of 2026-09-13] ──────────────
//
// Firefox cannot style a native select's open list, so the one list in a
// form that did not wear the theme was the select's. A listbox in the
// combobox's look is laid over every single select the package styles —
// `select.kp-field__input` — without asking. It was an opt-in under scope-54;
// Kenny's form of 2026-09-13 made it the default, because a form whose one
// unthemed list is the select's is the fault the opt-in left in place:
//
//   <select class="kp-field__input">…</select>                        drawn
//   <select class="kp-field__input" data-kp-select="native">…</select> the browser's
//   <select multiple>…</select>                                        always the browser's
//
// A bare `data-kp-select` still asks for the drawn list on a select without
// the class, as it did in 6.1.
//
// The native select stays exactly where it was and stays the control: it
// keeps DOM focus, holds the value, submits with the form, fires `change`,
// and is what a screen reader reads (a single select is already a
// combobox to assistive technology, so `aria-expanded`, `aria-controls`
// and `aria-activedescendant` on it mean what they mean on the combobox's
// input). What is drawn is only the open list, a sibling directly after
// the select, rebuilt from the select's own options every time it opens —
// so a value or an option the page changed behind its back is what shows.

/**
 * Whether a select gets the drawn list: a single select that is the
 * package's field (`.kp-field__input`) or asks for it (`data-kp-select`),
 * unless it opts out with `data-kp-select="native"`.
 *
 * @param {Element} element
 * @returns {element is HTMLSelectElement}
 */
export function drawsSelect(element) {
    if (!(element instanceof HTMLSelectElement) || element.multiple) return false;
    const asked = element.getAttribute('data-kp-select');
    if (asked === 'native') return false;
    return asked !== null || element.classList.contains('kp-field__input');
}

/**
 * @typedef {object} SelectHandle
 * @property {HTMLSelectElement} element
 * @property {HTMLElement} list the drawn listbox
 * @property {() => void} open
 * @property {() => void} close
 * @property {() => void} refresh re-read the options and the value
 */

/** @type {WeakMap<Element, SelectHandle>} */
const selectHandles = new WeakMap();

/** The handle for an attached drawn select. @param {Element} element */
export function drawnSelect(element) {
    return selectHandles.get(element) ?? null;
}

let selectCount = 0;

/**
 * Lay a drawn list over one select. Returns its detach.
 *
 * @param {HTMLSelectElement} select
 * @param {{ loop?: boolean, typeaheadMs?: number }} [options]
 * @returns {(() => void) & { handle: SelectHandle }}
 */
export function attachSelect(select, { loop = false, typeaheadMs = 500 } = {}) {
    const before = {
        expanded: select.getAttribute('aria-expanded'),
        controls: select.getAttribute('aria-controls'),
    };
    selectCount += 1;
    const list = document.createElement('ul');
    list.className = 'kp-combobox__list';
    list.id = `${select.id || 'kp-select'}-drawn-${selectCount}`;
    list.setAttribute('role', 'listbox');
    list.dataset.kpSelectList = '';
    list.hidden = true;
    const labelled = select.labels?.[0];
    if (labelled) {
        if (!labelled.id) labelled.id = `${list.id}-label`;
        list.setAttribute('aria-labelledby', labelled.id);
    }
    select.after(list);
    select.setAttribute('aria-controls', list.id);
    select.setAttribute('aria-expanded', 'false');

    /** Rebuild the options from the select's own, and mark the chosen one. */
    const build = () => {
        list.replaceChildren(
            ...[...select.options].map((native, i) => {
                const option = document.createElement('li');
                option.className = 'kp-combobox__option';
                option.id = `${list.id}-option-${i}`;
                option.setAttribute('role', 'option');
                option.setAttribute('aria-selected', 'false');
                option.dataset.kpOption = '';
                option.dataset.value = native.value;
                option.textContent = native.label || native.text;
                if (native.disabled) option.setAttribute('aria-disabled', 'true');
                if (native.selected) option.dataset.kpChosen = '';
                return option;
            }),
        );
        listbox.refresh();
    };

    /**
     * Put the open list under the select and as wide as it. A first guess from
     * the offsets both siblings share, then one correction measured against
     * the paint, because a register may give the list a margin or the page a
     * containing block the offsets do not see. The gap under the select is
     * the list's own top margin, held to at most 0.5rem.
     */
    const place = () => {
        list.style.left = `${select.offsetLeft}px`;
        list.style.top = `${select.offsetTop + select.offsetHeight}px`;
        list.style.width = `${select.offsetWidth}px`;
        const box = select.getBoundingClientRect();
        const drawn = list.getBoundingClientRect();
        const margin = Math.min(Math.max(Number.parseFloat(getComputedStyle(list).marginTop) || 0, 0), 8);
        list.style.left = `${select.offsetLeft + (box.left - drawn.left)}px`;
        list.style.top = `${select.offsetTop + select.offsetHeight + (box.bottom + margin - drawn.top)}px`;
        list.style.width = `${box.width}px`;
        // Above the select when the window has no room under it [fix-30].
        if (raised(list)) placeBlockSide(list, box);
    };

    const isOpen = () => list.hidden === false;

    /** Takes the open list out of the top layer again (js/top-layer.js). */
    let lower = () => {};
    const open = () => {
        if (select.disabled) return;
        build();
        list.hidden = false;
        // Above a container that clips, placed by the same measurement as before; it follows the select while open.
        lower();
        lower = raiseOverlay(list, place);
        select.setAttribute('aria-expanded', 'true');
        const chosen = listbox.options.findIndex((option) => option.dataset.kpChosen !== undefined);
        listbox.highlight(Math.max(chosen, 0));
        select.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: true } }));
    };

    const close = () => {
        if (!isOpen()) return;
        lower();
        lower = () => {};
        list.hidden = true;
        select.setAttribute('aria-expanded', 'false');
        listbox.clear();
        select.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: false } }));
    };

    /** @param {HTMLElement} option */
    const take = (option) => {
        const value = option.dataset.value ?? '';
        const changed = select.value !== value;
        select.value = value;
        close();
        select.focus();
        // The events a person choosing in the native list would have caused,
        // so a form library, React's onChange and forms.js all hear it.
        if (changed) {
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    const listbox = createListbox({
        input: select,
        list,
        loop,
        typeahead: true,
        typeaheadMs,
        onChoose: (_, option) => take(option),
        onDismiss: close,
    });

    /**
     * What the listbox does not do: open from a closed box, and keep the
     * browser's own select behaviour — its popup, its arrow keys and letters
     * changing the value directly — out of the way.
     *
     * @param {KeyboardEvent} event
     */
    const onKeyDownCapture = (event) => {
        if (event.ctrlKey || event.metaKey) return;
        const printable = event.key.length === 1 && !event.altKey;
        if (!isOpen()) {
            if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'F4'].includes(event.key) || printable) {
                event.preventDefault();
                open();
                // Arrows and Enter only open; the listbox must not also move.
                if (!printable) event.stopImmediatePropagation();
                else if (event.key === ' ') event.stopImmediatePropagation();
            }
            return;
        }
        if (event.key === 'Tab') {
            close();
            return;
        }
        if (event.key === ' ' && listbox.index !== -1) {
            event.preventDefault();
            event.stopImmediatePropagation();
            listbox.choose();
            return;
        }
        if (event.key === 'Escape') event.preventDefault();
        if (printable || event.key === 'Enter') event.preventDefault();
    };

    /** A press on the box opens the drawn list instead of the browser's. @param {MouseEvent} event */
    const onMouseDown = (event) => {
        if (event.button !== 0 || select.disabled) return;
        event.preventDefault();
        select.focus();
        if (isOpen()) close();
        else open();
    };

    /** A press in the list must not take focus from the select. @param {MouseEvent} event */
    const onListMouseDown = (event) => event.preventDefault();

    const onFocusOut = () => {
        setTimeout(() => {
            if (document.activeElement !== select) close();
        }, 0);
    };

    /** The page changed the value: the mark follows at once if the list is open. */
    const onChange = () => {
        if (isOpen()) build();
    };

    // Capture on the select itself runs before the listbox's bubble-phase
    // listener, which is what lets a closed box open without the listbox
    // also moving the highlight.
    select.addEventListener('keydown', onKeyDownCapture, { capture: true });
    select.addEventListener('mousedown', onMouseDown);
    select.addEventListener('focusout', onFocusOut);
    select.addEventListener('change', onChange);
    list.addEventListener('mousedown', onListMouseDown);
    build();

    /** @type {SelectHandle} */
    const handle = { element: select, list, open, close, refresh: build };
    selectHandles.set(select, handle);
    select.dataset.kpSelectAttached = '';

    const detach = () => {
        lower();
        listbox.destroy();
        select.removeEventListener('keydown', onKeyDownCapture, { capture: true });
        select.removeEventListener('mousedown', onMouseDown);
        select.removeEventListener('focusout', onFocusOut);
        select.removeEventListener('change', onChange);
        list.remove();
        if (labelled && labelled.id === `${list.id}-label`) labelled.removeAttribute('id');
        for (const [name, value] of /** @type {const} */ ([
            ['aria-expanded', before.expanded],
            ['aria-controls', before.controls],
        ])) {
            if (value === null) select.removeAttribute(name);
            else select.setAttribute(name, value);
        }
        select.removeAttribute('aria-activedescendant');
        selectHandles.delete(select);
        delete select.dataset.kpSelectAttached;
    };
    return Object.assign(detach, { handle });
}

/**
 * Lay a drawn list over every select under `root` that `drawsSelect` accepts:
 * each single `select.kp-field__input` and each `select[data-kp-select]`, but
 * never one marked `data-kp-select="native"` and never a multiple select
 * [scope-54; the default since Kenny's form of 2026-09-13].
 *
 * @param {ParentNode} [root]
 * @param {{ loop?: boolean, typeaheadMs?: number }} [options] Defaults; per select `data-kp-loop`.
 * @returns {(() => void) & { handles: SelectHandle[] }} detach
 */
export function attachSelects(root = document, options = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {SelectHandle[]} */
    const created = [];
    const found = root instanceof Element && root.matches('select') ? [root] : [...root.querySelectorAll('select')];
    for (const element of found) {
        if (!drawsSelect(element)) continue;
        const select = element;
        if (select.dataset.kpSelectAttached !== undefined) continue;
        const loopFlag = select.dataset.kpLoop;
        const detach = attachSelect(select, { ...options, ...(loopFlag === undefined ? {} : { loop: loopFlag !== 'false' }) });
        cleanups.push(detach);
        created.push(detach.handle);
    }
    const detach = () => {
        for (const c of cleanups) c();
    };
    return Object.assign(detach, { handles: created });
}
