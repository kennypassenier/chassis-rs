// A list and its detail side by side, folding to one pane on a phone [kpadopt5-ops; spec item 7].
//
// homelab's Secrets page has three panes (stacks, items, detail), JobTracker's
// dossiers two. Both are `kp-split` with fixed columns and a narrow behaviour,
// so this extends the split instead of adding a second layout:
//
//   <div class="kp-split kp-split--panes" data-kp-master-detail data-kp-pane-widths="17rem 1fr 24rem">
//       <section class="kp-split__pane" data-kp-pane="list" aria-label="Secrets">
//           <ul class="kp-pane__list" role="listbox" aria-label="Secrets">
//               <li role="option" data-kp-pane-key="db">Database</li>
//           </ul>
//       </section>
//       <section class="kp-split__pane" data-kp-pane="detail" aria-label="Secret">
//           <h2 data-kp-pane-heading tabindex="-1">Database</h2>
//           <div class="kp-pane__body">…</div>
//       </section>
//       <aside class="kp-split__pane" data-kp-pane="aside" aria-label="History">…</aside>
//   </div>
//
// Panes: `list` and `detail` are required; `aside` is optional. Options, each
// an attribute and a JS option of attachMasterDetails(root, options):
//
//   data-kp-pane-widths      "17rem 1fr" (+ " 24rem" with an aside): the columns
//   data-kp-fold-at          "48rem": the layout's width below which the panes fold
//   data-kp-aside-fold-at    "90rem": below it the aside moves under the other panes
//   data-kp-narrow           one-pane (default) | stack | sheet: what a phone shows
//   data-kp-resizable        present: write a `kp-split__separator` between the list and the detail and `data-kp-split`
//                            on the root, and the divider drags like kp-split's (add `data-kp-remember` to keep the width)
//   data-kp-pane-history     "off" leaves the browser's history alone (default: on)
//
// One pane, narrow: the list; choosing an item opens the detail with a Back
// button at the top of the pane. Back (the button, the browser's Back, Esc in
// the detail) returns; the list keeps its scroll and its selection. The detail
// arrives the theme's own way (js/motion.js arriveShown), not a generic slide.
// Focus moves to the detail's heading on open and back to the row on Back.
// Arrow keys in the list change the selected item without the focus leaving the
// list, as a listbox does; Home and End jump; Enter and Space open it when the
// panes are folded. Esc in the aside closes it (`data-kp-aside-closable`).
//
// States (setPaneState): `empty` (the default while nothing is selected:
// "Pick an item on the left", centred at the heading size in the detail pane;
// with nothing in the list it covers the whole master-detail), `loading` (the theme's
// busy card over the detail pane only; the list stays usable; where the detail is a closed sheet on a phone, over the list), `error` (the
// destructive plate over the whole master-detail with Retry) and `ready`. The consumer reacts to the events and draws the detail itself.
//
// Which failed plate wins [kyugaps-1020, kyu gap 52]: the innermost component's own, for its own failure. A data component in the
// detail (a code block, a table, a chart) that already shows its failed plate (`data-kp-state="error"` or a `.kp-stateplate--error`
// inside `.kp-pane__body`, on screen) is not covered: `setPaneState(root, 'error')` then draws no plate of its own, the list stays usable, the body
// stays reachable and the component's own Retry (its own event) is the one to press. The root still reads `data-kp-state="error"` and
// also `data-kp-error-own`, so a page can tell the two apart. The master-detail's plate (and `kp-pane-retry`) is for a failure no
// component in the detail owns: the list or the detail could not be read at all.
//
// Events (bubbling, on the root):
//   kp-pane-select  { key, item }       the selection moved (arrow keys, a click)
//   kp-pane-open    { key, item }       the detail was opened: a click or Enter; the page loads it, its router writes ?item=
//   kp-pane-close   { pane, key }       the detail (narrow) or the aside went away
//   kp-pane-retry   { key }             Retry in an errored detail
//
// Nothing runs on import; attachMasterDetails(root) returns a detach.

import { scrollWithin } from './listbox.js';
import { openBusyCard } from './busy-card.js';
import { arriveShown } from './motion.js';
import { statePlate } from './state-plate.js';
import { getStrings } from './strings.js';

/** A list-and-detail layout. */
export const MASTER_DETAIL = '[data-kp-master-detail]';
/** Fired when the selection moves. */
export const PANE_SELECT_EVENT = 'kp-pane-select';
/** Fired when the detail is opened. */
export const PANE_OPEN_EVENT = 'kp-pane-open';
/** Fired when the folded detail, or the aside, is closed. */
export const PANE_CLOSE_EVENT = 'kp-pane-close';
/** Fired when Retry is pressed in an errored detail. */
export const PANE_RETRY_EVENT = 'kp-pane-retry';
/** The default widths of the list and the detail, and of the aside. */
export const PANE_WIDTHS = '17rem 1fr';
export const PANE_ASIDE_WIDTH = '24rem';
/** The layout's width the panes fold below, and the one the aside folds below. */
export const PANE_FOLD_AT = '48rem';
export const PANE_ASIDE_FOLD_AT = '90rem';

/**
 * @typedef {'empty' | 'loading' | 'error' | 'ready'} PaneState
 * @typedef {object} PaneStateOptions
 * @property {string} [title] the plate's first line
 * @property {string} [text] its sentence
 * @property {string} [words] what the busy card says (default `paneLoading`)
 * @property {string} [actionLabel] an action under an empty plate
 * @property {(event: MouseEvent) => void} [onAction]
 * @typedef {object} MasterDetailHandle
 * @property {HTMLElement} element
 * @property {() => string | null} key the selected key
 * @property {(key: string | null, how?: { focus?: boolean }) => void} select
 * @property {(key: string, how?: { focus?: boolean }) => void} open select and, folded, show the detail
 * @property {() => void} close show the list again (folded)
 * @property {() => boolean} narrow whether the panes are folded now
 * @property {(state: PaneState, options?: PaneStateOptions) => void} setState
 */

/** @type {WeakMap<Element, MasterDetailHandle>} */
const handles = new WeakMap();

/** The handle of an attached layout. @param {Element} element */
export const masterDetail = (element) => handles.get(element) ?? null;

/** @param {HTMLElement} root @param {string} pane */
const paneOf = (root, pane) => /** @type {HTMLElement | null} */ (root.querySelector(`:scope > [data-kp-pane="${pane}"]`));

/** `1fr` is `minmax(0, 1fr)` in a grid, so a long word never widens a column. @param {string} widths */
const columns = (widths) =>
    widths
        .trim()
        .split(/\s+/)
        .map((w) => (w === '1fr' ? 'minmax(0, 1fr)' : w))
        .join(' ');

/**
 * Set the detail pane's state. A page that draws with the DOM calls this; the
 * detail pane keeps its place and size in every state.
 * @param {Element} root
 * @param {PaneState} state
 * @param {PaneStateOptions} [options]
 */
export function setPaneState(root, state, options) {
    handles.get(root)?.setState(state, options);
}

/**
 * Select an item by its key (the arrow keys' move), without opening the detail.
 * @param {Element} root @param {string | null} key
 */
export function selectPane(root, key) {
    handles.get(root)?.select(key);
}

/**
 * Open the detail of an item (narrow: the detail replaces the list).
 * @param {Element} root @param {string} key
 */
export function openPane(root, key) {
    handles.get(root)?.open(key);
}

/** Show the list again. @param {Element} root */
export function closePane(root) {
    handles.get(root)?.close();
}

/**
 * Wire every master-detail layout under `root`.
 * @param {ParentNode} [root]
 * @param {{ history?: boolean }} [options] `history: false` leaves the browser's history alone
 * @returns {() => void} detach
 */
export function attachMasterDetails(root = document, { history: useHistory } = {}) {
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(MASTER_DETAIL) ? [root] : []),
        ...root.querySelectorAll(MASTER_DETAIL),
    ]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const element of found) {
        if (handles.has(element)) continue;
        const stop = wire(element, useHistory);
        if (stop) undo.push(stop);
    }
    return () => undo.forEach((u) => u());
}

/**
 * @param {HTMLElement} rootEl
 * @param {boolean | undefined} historyOption
 * @returns {(() => void) | null}
 */
function wire(rootEl, historyOption) {
    const doc = rootEl.ownerDocument;
    const view = doc.defaultView;
    const list = paneOf(rootEl, 'list');
    const detail = paneOf(rootEl, 'detail');
    const aside = paneOf(rootEl, 'aside');
    if (!list || !detail || !view) return null;
    const strings = () => getStrings();
    const useHistory = historyOption ?? rootEl.getAttribute('data-kp-pane-history') !== 'off';

    // --- The columns. ---
    const widths = rootEl.getAttribute('data-kp-pane-widths') ?? (aside ? `${PANE_WIDTHS} ${PANE_ASIDE_WIDTH}` : PANE_WIDTHS);
    rootEl.style.setProperty('--kp-pane-columns', columns(widths));
    const [listWidth = '17rem'] = widths.trim().split(/\s+/);
    rootEl.style.setProperty('--kp-pane-list', listWidth);

    // --- The list as a listbox. ---
    const listbox = /** @type {HTMLElement} */ (list.querySelector('[role="listbox"]') ?? list);
    if (!listbox.hasAttribute('role')) listbox.setAttribute('role', 'listbox');
    const items = () => /** @type {HTMLElement[]} */ ([...list.querySelectorAll('[data-kp-pane-key]')]);
    /** @type {string | null} */
    let selected = null;
    for (const item of items()) {
        if (!item.hasAttribute('role')) item.setAttribute('role', 'option');
        if (item.getAttribute('aria-selected') === 'true' || item.hasAttribute('data-kp-selected')) selected = item.getAttribute('data-kp-pane-key');
    }
    /** @param {string | null} key */
    const itemOf = (key) => items().find((i) => i.getAttribute('data-kp-pane-key') === key) ?? null;
    const paint = () => {
        const all = items();
        const current = itemOf(selected) ?? all[0] ?? null;
        for (const item of all) {
            const on = item.getAttribute('data-kp-pane-key') === selected;
            item.setAttribute('aria-selected', on ? 'true' : 'false');
            item.toggleAttribute('data-kp-selected', on);
            item.tabIndex = item === current ? 0 : -1;
        }
    };

    // --- Narrow. ---
    const mode = () => rootEl.getAttribute('data-kp-narrow') ?? 'one-pane';
    const foldAt = rootEl.getAttribute('data-kp-fold-at') ?? PANE_FOLD_AT;
    const asideFoldAt = rootEl.getAttribute('data-kp-aside-fold-at') ?? PANE_ASIDE_FOLD_AT;
    // The panes fold by the layout's own width, not the window's: a master-detail in a drawer, or a phone-width frame on a wide
    // page, folds when it is that narrow. The lengths are read as the page's rem.
    const probe = doc.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;block-size:0;overflow:hidden';
    /** @param {string} length */
    const px = (length) => {
        probe.style.inlineSize = length;
        rootEl.append(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return width;
    };
    const widthNow = () => rootEl.getBoundingClientRect().width;
    let narrow = widthNow() > 0 && widthNow() < px(foldAt);
    let asideNarrow = widthNow() > 0 && widthNow() < px(asideFoldAt);
    let shown = 'list';
    /** @type {HTMLElement | null} */
    let opener = null;
    let listScroll = 0;
    let pushed = false;
    /** The loading look follows the pane that is on screen when the layout folds or the sheet opens or closes [kyugaps-1019]. */
    let reseatBusy = () => {};
    const sync = () => {
        rootEl.toggleAttribute('data-kp-narrow-on', narrow);
        rootEl.toggleAttribute('data-kp-aside-folded', Boolean(aside) && asideNarrow && !narrow);
        if (narrow && mode() !== 'stack') rootEl.setAttribute('data-kp-pane-shown', shown);
        else rootEl.removeAttribute('data-kp-pane-shown');
        reseatBusy();
    };

    // --- The detail's parts. ---
    let head = /** @type {HTMLElement | null} */ (detail.querySelector(':scope > .kp-pane__head'));
    if (!head) {
        head = doc.createElement('div');
        head.className = 'kp-pane__head';
        const heading = detail.querySelector('[data-kp-pane-heading]');
        detail.prepend(head);
        if (heading) head.append(heading);
    }
    let back = /** @type {HTMLButtonElement | null} */ (head.querySelector('.kp-pane__back'));
    if (!back) {
        back = doc.createElement('button');
        back.type = 'button';
        back.className = 'kp-button kp-pane__back';
        back.textContent = strings().paneBack;
        head.prepend(back);
    }
    let body = /** @type {HTMLElement | null} */ (detail.querySelector(':scope > .kp-pane__body'));
    if (!body) {
        body = doc.createElement('div');
        body.className = 'kp-pane__body';
        for (const child of [...detail.childNodes]) if (child !== head) body.append(child);
        detail.append(body);
    }
    let stateBox = /** @type {HTMLElement | null} */ (detail.querySelector(':scope > .kp-pane__state'));
    if (!stateBox) {
        stateBox = doc.createElement('div');
        stateBox.className = 'kp-pane__state';
        detail.append(stateBox);
    }
    detail.classList.add('kp-pane__detail');
    const bodyEl = body;
    const stateEl = stateBox;
    /** @type {import('./busy-card.js').BusyCard | null} */
    let busy = null;
    /** @type {PaneState} */
    let state = 'ready';
    let drawn = false;

    // The loading look covers the data area that is on screen: the detail pane, and, where the detail is a closed sheet on a phone
    // (`display: none`, a card of 0 x 0 in it), the list, laid on the master-detail itself; the sheet opening moves it back
    // [kyugaps-1019, gap kyu 48].
    /** @type {HTMLElement | null} */
    let busyAt = null;
    let busyWords = '';
    const detailShown = () => detail.getBoundingClientRect().width > 0 && getComputedStyle(detail).display !== 'none';
    /** Stops the list's size being watched for the card laid on it. @type {() => void} */
    let unwatchList = () => {};
    /** @param {boolean} arrive */
    const layBusy = (arrive) => {
        unwatchList();
        const onDetail = detailShown();
        busyAt = onDetail ? detail : rootEl;
        const lists = () => [...rootEl.querySelectorAll(':scope > [data-kp-pane="list"]')].filter((pane) => pane.getBoundingClientRect().width > 0);
        const card = openBusyCard(busyAt, {
            words: busyWords,
            area: () => (onDetail ? [bodyEl.hidden ? detail : stateEl.hidden ? bodyEl : stateEl] : lists()),
            className: 'kp-pane__busy',
            arrive,
        });
        // The list grows and shrinks as the panes fold (its arrival is animated): the card follows it.
        if (!onDetail && typeof ResizeObserver === 'function') {
            const watcher = new ResizeObserver(() => card.place());
            for (const pane of rootEl.querySelectorAll(':scope > [data-kp-pane="list"]')) watcher.observe(pane);
            unwatchList = () => watcher.disconnect();
        }
        return card;
    };
    reseatBusy = () => {
        if (!busy || busyAt === (detailShown() ? detail : rootEl)) return;
        busy.remove();
        busy = layBusy(false);
    };

    /**
     * A failure asked for before the detail's own component drew its plate (js/code.js draws it after its busy card has closed) is
     * covered by the master-detail's plate at first. While the state reads `error` and no own plate stands, the body is watched:
     * when a component's own failed plate appears, the state is applied again and the master-detail's plate gives way [KYU 54].
     */
    let stopOwnWatch = () => {};
    /** @param {PaneStateOptions} options */
    const watchOwn = (options) => {
        stopOwnWatch();
        if (typeof MutationObserver !== 'function') return;
        const seen = new MutationObserver(() => {
            if (state === 'error' && !rootEl.hasAttribute('data-kp-error-own') && ownFailure()) setState('error', options);
        });
        seen.observe(bodyEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-kp-state', 'class', 'hidden'] });
        stopOwnWatch = () => {
            seen.disconnect();
            stopOwnWatch = () => {};
        };
    };
    const ownFailure = () =>
        [...bodyEl.querySelectorAll(":is([data-kp-state='error'], .kp-stateplate--error)")].some((el) => el.getBoundingClientRect().width > 0);

    /** @param {PaneState} next @param {PaneStateOptions} [options] */
    const setState = (next, options = {}) => {
        state = next;
        rootEl.setAttribute('data-kp-state', next);
        // A failure, and an empty master-detail with nothing in its list, cover the whole master-detail, list included
        // [states-two-1019]; an empty detail beside a list with items ("Pick an item on the left") stays in the detail pane, beside the
        // list it points at.
        // A component of the detail that shows its own failure keeps its plate: the master-detail draws none over it.
        // (on screen: where the detail is a closed sheet on a phone its plate is 0 x 0, and the master-detail's plate is the one to read).
        const own = next === 'error' && ownFailure();
        if (next === 'error' && !own) watchOwn(options);
        else stopOwnWatch();
        rootEl.toggleAttribute('data-kp-error-own', own);
        const wide = (next === 'error' && !own) || (next === 'empty' && !rootEl.querySelector('[data-kp-pane="list"] [data-kp-pane-key]'));
        rootEl.toggleAttribute('data-kp-state-wide', wide);
        for (const pane of rootEl.querySelectorAll(':scope > [data-kp-pane="list"], :scope > [data-kp-pane="aside"]')) pane.toggleAttribute('inert', wide);
        const loading = next === 'loading';
        bodyEl.toggleAttribute('inert', loading || next === 'empty' || (next === 'error' && !own));
        if (loading) bodyEl.setAttribute('aria-busy', 'true');
        else bodyEl.removeAttribute('aria-busy');
        if (next === 'empty' || (next === 'error' && !own)) {
            const s = strings();
            const plate =
                next === 'empty'
                    ? statePlate(doc, {
                          kind: 'empty',
                          title: options.title ?? s.paneEmpty,
                          ...(options.text ? { text: options.text } : {}),
                          ...(options.actionLabel ? { actionLabel: options.actionLabel } : {}),
                          ...(options.onAction ? { onAction: options.onAction } : {}),
                      })
                    : statePlate(doc, {
                          kind: 'error',
                          title: options.title ?? s.paneErrorTitle,
                          text: options.text ?? s.paneErrorText,
                          actionLabel: s.paneRetry,
                          actionAttribute: 'data-kp-pane-retry',
                      });
            stateEl.replaceChildren(plate);
            stateEl.hidden = false;
            if (drawn) arriveShown(plate);
        } else {
            stateEl.hidden = true;
            stateEl.replaceChildren();
        }
        if (loading) busyWords = options.words ?? strings().paneLoading;
        if (loading && !busy) {
            busy = layBusy(drawn);
        } else if (!loading && busy) {
            const card = busy;
            busy = null;
            busyAt = null;
            unwatchList();
            void card.close();
        }
        drawn = true;
        // Nothing selected and nothing loading: the empty plate says what to do.
    };

    // --- Moving about. ---
    /** @param {string | null} key @param {{ focus?: boolean }} [how] */
    const select = (key, how = {}) => {
        const item = itemOf(key);
        selected = item ? key : null;
        paint();
        if (item && how.focus) item.focus({ preventScroll: false });
        if (item) scrollWithin(item); // the pane's own scroller only, never the window
        rootEl.dispatchEvent(new CustomEvent(PANE_SELECT_EVENT, { bubbles: true, detail: { key: selected, item } }));
    };
    const heading = () => /** @type {HTMLElement | null} */ (detail.querySelector('[data-kp-pane-heading], h1, h2, h3, h4'));
    /** @param {string} key @param {{ focus?: boolean }} [how] */
    const open = (key, how = {}) => {
        const item = itemOf(key);
        if (!item) return;
        const wasSelected = selected === key;
        if (!wasSelected) select(key);
        if (narrow && mode() !== 'stack' && shown !== 'detail') {
            opener = item;
            listScroll = list.scrollTop;
            shown = 'detail';
            sync();
            arriveShown(detail);
            if (useHistory && !pushed) {
                try {
                    view.history.pushState({ kpPane: key }, '');
                    pushed = true;
                } catch {
                    // A document without history (a sandboxed frame): the Back button still works.
                }
            }
            const target = heading();
            if (target) {
                target.tabIndex = -1;
                target.focus({ preventScroll: true });
            }
        } else if (how.focus) heading()?.focus({ preventScroll: true });
        rootEl.dispatchEvent(new CustomEvent(PANE_OPEN_EVENT, { bubbles: true, detail: { key, item } }));
    };
    /** @param {{ fromHistory?: boolean }} [how] */
    const close = ({ fromHistory = false } = {}) => {
        if (!(narrow && mode() !== 'stack' && shown === 'detail')) return;
        shown = 'list';
        sync();
        arriveShown(list);
        list.scrollTop = listScroll;
        if (pushed && !fromHistory) {
            pushed = false;
            try {
                view.history.back();
            } catch {
                // nothing to go back to
            }
        }
        pushed = false;
        const key = selected;
        (opener ?? itemOf(key))?.focus({ preventScroll: true });
        rootEl.dispatchEvent(new CustomEvent(PANE_CLOSE_EVENT, { bubbles: true, detail: { pane: 'detail', key } }));
    };

    /** @param {MouseEvent} event */
    const onClick = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('[data-kp-pane-retry]') && detail.contains(target)) {
            rootEl.dispatchEvent(new CustomEvent(PANE_RETRY_EVENT, { bubbles: true, detail: { key: selected } }));
            return;
        }
        if (target.closest('.kp-pane__back') === back) {
            close();
            return;
        }
        const item = target.closest('[data-kp-pane-key]');
        if (item instanceof HTMLElement && list.contains(item)) open(item.getAttribute('data-kp-pane-key') ?? '');
    };
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const item = target.closest('[data-kp-pane-key]');
        if (item instanceof HTMLElement && list.contains(item)) {
            const all = items();
            const at = all.indexOf(item);
            let to = -1;
            if (event.key === 'ArrowDown') to = Math.min(all.length - 1, at + 1);
            else if (event.key === 'ArrowUp') to = Math.max(0, at - 1);
            else if (event.key === 'Home') to = 0;
            else if (event.key === 'End') to = all.length - 1;
            if (to >= 0) {
                event.preventDefault();
                const next = all[to];
                if (next) select(next.getAttribute('data-kp-pane-key'), { focus: true });
                return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open(item.getAttribute('data-kp-pane-key') ?? '', { focus: true });
            }
            return;
        }
        if (event.key === 'Escape') {
            if (aside && aside.contains(target) && rootEl.hasAttribute('data-kp-aside-closable')) {
                event.preventDefault();
                aside.hidden = true;
                rootEl.dispatchEvent(new CustomEvent(PANE_CLOSE_EVENT, { bubbles: true, detail: { pane: 'aside', key: selected } }));
            } else if (detail.contains(target) && narrow && shown === 'detail') {
                event.preventDefault();
                close();
            }
        }
    };
    const onPop = () => {
        if (pushed || shown === 'detail') close({ fromHistory: true });
    };
    const onSize = () => {
        const width = widthNow();
        if (width <= 0) return;
        const was = narrow;
        narrow = width < px(foldAt);
        asideNarrow = width < px(asideFoldAt);
        if (was && !narrow) shown = 'list';
        sync();
    };

    rootEl.addEventListener('click', onClick);
    rootEl.addEventListener('keydown', onKey);
    view.addEventListener('popstate', onPop);
    const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(onSize) : null;
    watcher?.observe(rootEl);
    const attributes = new MutationObserver(sync);
    attributes.observe(rootEl, { attributes: true, attributeFilter: ['data-kp-narrow'] });

    /** @type {MasterDetailHandle} */
    const handle = {
        element: rootEl,
        key: () => selected,
        select,
        open,
        close: () => close(),
        narrow: () => narrow,
        setState,
    };
    handles.set(rootEl, handle);
    paint();
    sync();
    // Nothing selected: the detail says what to do rather than stand blank.
    if (!selected && !rootEl.hasAttribute('data-kp-state')) setState('empty');
    else if (rootEl.hasAttribute('data-kp-state')) setState(/** @type {PaneState} */ (rootEl.getAttribute('data-kp-state')));
    return () => {
        rootEl.removeEventListener('click', onClick);
        rootEl.removeEventListener('keydown', onKey);
        view.removeEventListener('popstate', onPop);
        watcher?.disconnect();
        attributes.disconnect();
        busy?.remove();
        unwatchList();
        stopOwnWatch();
        handles.delete(rootEl);
        rootEl.removeAttribute('data-kp-pane-shown');
        rootEl.removeAttribute('data-kp-narrow-on');
        rootEl.removeAttribute('data-kp-aside-folded');
        rootEl.style.removeProperty('--kp-pane-columns');
        rootEl.style.removeProperty('--kp-pane-list');
    };
}
