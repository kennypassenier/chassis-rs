// The list toolbar [kpadopt-controls]: the bar above a list, a log, a board or
// a chart that is not (or not only) a data table.
//
//   <div class="kp-toolbar" data-kp-toolbar data-kp-toolbar-key="/" role="group" aria-label="Containers">
//       <div class="kp-toolbar__search">
//           <input type="search" class="kp-field__input kp-toolbar__input" placeholder="Search containers"
//                  aria-label="Search containers" aria-keyshortcuts="/" />
//           <kbd class="kp-kbd kp-toolbar__key" aria-hidden="true">/</kbd>
//       </div>
//       <div class="kp-toolbar__filters">
//           <div class="kp-toolbar__group" role="group" aria-labelledby="tb-status">
//               <b class="kp-toolbar__label" id="tb-status">Status</b>
//               <div class="kp-segmented kp-segmented--chips" data-kp-segmented="multi" aria-label="Status"> … </div>
//           </div>
//       </div>
//       <div class="kp-toolbar__state">12 of 48 · <button class="kp-button kp-button--ghost kp-button--sm">Follow</button></div>
//       <div class="kp-toolbar__active" hidden></div>
//   </div>
//
// Its three zones sit on one grid row, so the search box keeps its width
// whatever the filter groups hold. The filter groups are `.kp-segmented`
// (chips or segments, js/segmented.js); the state zone is a slot for a count,
// a follow switch, a table/cards choice. The active row under them lists the
// filters that are on as the data table's own removable tags, and is absent
// when none is on.
//
// What this module does:
//   - Escape in the search clears it (and fires `input`, so the page filters).
//   - `data-kp-toolbar-key="/"` focuses the search on that key from anywhere
//     on the page that is not a field. The hint cap in the markup says so.
//   - the active row: `setToolbarActive(toolbar, filters)` draws it; a press
//     on a tag's cross fires `kp-toolbar-remove`, a press on Clear all fires
//     `kp-toolbar-clear`. The page turns the filter off and calls
//     setToolbarActive again; the focus goes to the next tag.
//
// Events (bubbling, on the toolbar):
//   kp-toolbar-remove   { id: string, label: string }
//   kp-toolbar-clear    {}
//
// The input is a `.kp-field__input`, so each theme's field look is already on
// it. Nothing runs on import; attachToolbars(root) returns a detach.

import { getStrings } from './strings.js';

/** A list toolbar. */
export const TOOLBAR = '[data-kp-toolbar]';

/** Fired on the toolbar when a tag's cross is pressed; `{ id, label }`. */
export const TOOLBAR_REMOVE_EVENT = 'kp-toolbar-remove';

/** Fired on the toolbar when Clear all is pressed. */
export const TOOLBAR_CLEAR_EVENT = 'kp-toolbar-clear';

/** The tag a filter that is on is drawn as: `id` names it to the page (the label when absent). @typedef {{ id?: string, label: string }} ToolbarFilter */

const SEARCH = '.kp-toolbar__input';
const ACTIVE = '.kp-toolbar__active';
const LIST = '.kp-toolbar__active-list';
const CLEAR = '[data-kp-toolbar-clear]';
const REMOVE = '.kp-toolbar__active .kp-tag__remove';

/** Events handled once even when two attached roots both see them. @type {WeakSet<Event>} */
const HANDLED = new WeakSet();

/** @param {Element} toolbar @returns {HTMLInputElement | null} */
export function toolbarSearch(toolbar) {
    const input = toolbar.querySelector(SEARCH);
    return input instanceof HTMLInputElement ? input : null;
}

/**
 * What `decorate` is told about the control it is handed: `kind` is `tag-remove` (a tag's cross; `value` is the filter's id) or
 * `clear-all`; `host` is the toolbar and `key` its `data-kp-key`.
 * @typedef {{ kind: 'tag-remove' | 'clear-all', host: HTMLElement, key?: string, value?: string, label?: string }} ToolbarDecorateInfo
 */

/**
 * Draw the filters that are on under the toolbar: one removable tag each and
 * Clear all, or nothing (the row is hidden) when there are none. The Clear all
 * button and the word before the tags are made once and kept, so a press that
 * is still in flight never meets a button replaced under it.
 * @param {Element} toolbar
 * @param {readonly ToolbarFilter[]} filters
 * @param {{ clearAll?: boolean, removeGlyph?: string, decorate?: (part: HTMLElement, info: ToolbarDecorateInfo) => void }} [options]
 *   clearAll: show Clear all (default true); decorate: called with every tag's cross (`tag-remove`) and with Clear all (`clear-all`),
 *   each time they are built, the same shape every kp module's `decorate` takes [wish-1120, homelab 66, 114]
 */
export function setToolbarActive(toolbar, filters, { clearAll = true, removeGlyph = '×', decorate } = {}) {
    /** @param {HTMLElement} part @param {Omit<ToolbarDecorateInfo, 'host' | 'key'>} info */
    const mark = (part, info) => {
        if (!decorate) return;
        const key = toolbar.getAttribute('data-kp-key');
        decorate(part, { ...info, host: /** @type {HTMLElement} */ (toolbar), ...(key === null ? {} : { key }) });
    };
    const strings = getStrings();
    let row = /** @type {HTMLElement | null} */ (toolbar.querySelector(ACTIVE));
    if (!row) {
        row = document.createElement('div');
        row.className = 'kp-toolbar__active';
        toolbar.append(row);
    }
    let list = row.querySelector(LIST);
    let button = /** @type {HTMLElement | null} */ (row.querySelector(CLEAR));
    if (!list || !button) {
        const word = document.createElement('span');
        word.className = 'kp-toolbar__active-label';
        list = document.createElement('ul');
        list.className = 'kp-tag-list kp-toolbar__active-list';
        button = document.createElement('button');
        button.setAttribute('type', 'button');
        button.className = 'kp-button kp-button--ghost kp-button--sm';
        button.setAttribute('data-kp-toolbar-clear', '');
        row.replaceChildren(word, list, button);
    }
    const word = row.querySelector('.kp-toolbar__active-label');
    if (word) word.textContent = strings.toolbarShowingOnly;
    list.setAttribute('aria-label', strings.tableActiveFilters);
    list.replaceChildren(
        ...filters.map((filter) => {
            const item = document.createElement('li');
            item.className = 'kp-tag';
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'kp-tag__remove';
            remove.dataset.id = filter.id ?? filter.label;
            remove.dataset.label = filter.label;
            remove.setAttribute('aria-label', strings.tableRemoveFilter(filter.label));
            remove.textContent = removeGlyph;
            item.append(filter.label, remove);
            mark(remove, { kind: 'tag-remove', value: filter.id ?? filter.label, label: filter.label });
            return item;
        }),
    );
    button.textContent = strings.toolbarClearAll;
    mark(button, { kind: 'clear-all', label: strings.toolbarClearAll });
    button.hidden = !clearAll;
    row.hidden = filters.length === 0;
}

/**
 * Wire every `[data-kp-toolbar]` under `root`: Escape in the search, the
 * search key, and the active row's two buttons. The active row is hidden when
 * it holds no tag.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachToolbars(root = document) {
    /** @param {Event} event */
    const toolbarOf = (event) => (event.target instanceof Element ? event.target.closest(TOOLBAR) : null);

    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        const toolbar = toolbarOf(event);
        if (!toolbar || HANDLED.has(event) || event.key !== 'Escape') return;
        const input = toolbarSearch(toolbar);
        if (!input || event.target !== input || input.value === '') return;
        HANDLED.add(event);
        // The Escape was for the search: nothing above it (a drawer, a dialog) closes.
        event.stopPropagation();
        event.preventDefault();
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    /** @param {MouseEvent} event */
    const onClick = (event) => {
        const toolbar = toolbarOf(event);
        if (!toolbar || HANDLED.has(event) || !(event.target instanceof Element)) return;
        const remove = event.target.closest(REMOVE);
        const clear = event.target.closest(CLEAR);
        if (!(remove instanceof HTMLElement) && !clear) return;
        HANDLED.add(event);
        const crosses = [...toolbar.querySelectorAll(REMOVE)];
        if (remove instanceof HTMLElement) {
            const at = crosses.indexOf(remove);
            toolbar.dispatchEvent(
                new CustomEvent(TOOLBAR_REMOVE_EVENT, { bubbles: true, detail: { id: remove.dataset.id ?? '', label: remove.dataset.label ?? '' } }),
            );
            keepFocus(toolbar, remove, at);
        } else {
            toolbar.dispatchEvent(new CustomEvent(TOOLBAR_CLEAR_EVENT, { bubbles: true, detail: {} }));
            toolbarSearch(toolbar)?.focus();
        }
    };

    /**
     * The tag that was pressed is gone once the page has redrawn: the focus
     * goes to the tag that took its place, else the last one, else the search.
     * @param {Element} toolbar @param {HTMLElement} pressed @param {number} at
     */
    const keepFocus = (toolbar, pressed, at) => {
        if (pressed.isConnected && toolbar.contains(document.activeElement) && document.activeElement !== document.body) return;
        const left = [...toolbar.querySelectorAll(REMOVE)];
        const next = /** @type {HTMLElement | undefined} */ (left[Math.min(at, left.length - 1)]);
        (next ?? toolbarSearch(toolbar))?.focus();
    };

    /** @param {KeyboardEvent} event */
    const onHotkey = (event) => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        const target = event.target;
        if (
            target instanceof HTMLElement &&
            (target.isContentEditable || target.matches('input, textarea, select, [role="textbox"], [role="combobox"]'))
        )
            return;
        for (const toolbar of root.querySelectorAll(TOOLBAR)) {
            if (toolbar.getAttribute('data-kp-toolbar-key') !== event.key) continue;
            const input = toolbarSearch(toolbar);
            // The first toolbar on the page that can be seen takes the key.
            if (!input || !(toolbar instanceof HTMLElement) || toolbar.getClientRects().length === 0) continue;
            event.preventDefault();
            input.focus();
            input.select();
            return;
        }
    };

    for (const toolbar of root.querySelectorAll(`${TOOLBAR} ${ACTIVE}`)) {
        if (toolbar instanceof HTMLElement && toolbar.querySelector('.kp-tag') === null) toolbar.hidden = true;
    }
    root.addEventListener('keydown', /** @type {EventListener} */ (onKey));
    root.addEventListener('click', /** @type {EventListener} */ (onClick));
    document.addEventListener('keydown', onHotkey);
    return () => {
        root.removeEventListener('keydown', /** @type {EventListener} */ (onKey));
        root.removeEventListener('click', /** @type {EventListener} */ (onClick));
        document.removeEventListener('keydown', onHotkey);
    };
}
