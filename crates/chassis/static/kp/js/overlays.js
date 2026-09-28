// The overlays' behaviour, framework-free [L8, TH35].
//
// Most of what is hard here, the browser now does. AR15's baseline is
// modern Chrome and Firefox only, which is what makes that affordable:
//
//   <dialog>          traps focus, closes on Escape, and returns focus to
//                     whatever opened it — all three, for free
//   popover="auto"    light-dismisses, closes on Escape, and restores
//                     focus to the invoker
//   <details>         is a keyboard-operable disclosure
//
// So this file is small on purpose. What it adds is the wiring the
// platform leaves to the author — opening a dialog from a button, roving
// tabindex on a tab list, and a toast region that announces itself — and
// nothing it adds re-implements something the browser already does
// correctly, because a hand-written focus trap is how focus traps break.
//
// Since 3.0.0 [KT6]: every attach is idempotent (the first version of
// this file double-bound on a second call, alone among the modules),
// every state change dispatches an event with a detail, every behaviour
// a consumer might not want is an option or a data-attribute, the tab
// selection is readable and settable from outside, and detach puts back
// what attach changed.

import { getStrings } from './strings.js';

/** How long a toast stays before it removes itself. An operational knob; per toast as `ms`. */
export const TOAST_MS = 5000;

/** Dispatched on the dialog, bubbling, when a wired trigger opened it: `{ trigger, modal }`. */
export const DIALOG_OPEN_EVENT = 'kp-dialog-open';
/** Dispatched on a tab list, bubbling, when the selected tab changed: `{ index, tab, panel, previous }`. */
export const TAB_CHANGE_EVENT = 'kp-tab-change';
/** Dispatched on the toast region when a toast was shown / removed: `{ toast, text }`. */
export const TOAST_SHOW_EVENT = 'kp-toast-show';
export const TOAST_HIDE_EVENT = 'kp-toast-hide';

/**
 * Put a dialog that has just opened, and its `.kp-dialog__body`, back at
 * the top [scope-96]. A closed dialog keeps its scroll position, so a
 * long dialog scrolled and closed reopened where it was left (Kenny,
 * 2026-09-15: "Bovenaan openen"). Called after showModal()/show(), because
 * a closed dialog has no box to scroll. The one exception is focus: when
 * the element the dialog focused on opening lies below the fold, it is
 * scrolled back into view, as far as needed and no further, so focus is
 * never hidden.
 *
 * @param {HTMLDialogElement} dialog
 */
export function openAtTop(dialog) {
    const body = dialog.querySelector(':scope > .kp-dialog__body');
    for (const box of [dialog, body]) if (box) box.scrollTop = 0;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== dialog && dialog.contains(focused))
        focused.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/**
 * Wire `[data-kp-dialog="<id>"]` buttons to the dialog with that id.
 *
 * showModal() by default: the modal form is the one that traps focus and
 * makes the rest of the page inert. `data-kp-dialog-mode="non-modal"` on
 * the trigger opens with show() instead, for a palette-like panel that
 * must not inert the page.
 *
 * @param {ParentNode} root
 * @param {{ modal?: boolean }} [options] the default mode when a trigger says nothing
 * @returns {() => void} detach
 */
export function attachDialogs(root = document, { modal = true } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    for (const el of root.querySelectorAll('[data-kp-dialog]')) {
        const trigger = /** @type {HTMLElement} */ (el);
        if (trigger.dataset.kpDialogAttached !== undefined) continue;
        const dialog = document.getElementById(trigger.dataset.kpDialog ?? '');
        if (!(dialog instanceof HTMLDialogElement)) continue;
        trigger.dataset.kpDialogAttached = '';
        const open = () => {
            const asModal = trigger.dataset.kpDialogMode === undefined ? modal : trigger.dataset.kpDialogMode !== 'non-modal';
            if (dialog.open) return;
            if (asModal) dialog.showModal();
            else dialog.show();
            openAtTop(dialog);
            dialog.dispatchEvent(new CustomEvent(DIALOG_OPEN_EVENT, { bubbles: true, detail: { trigger, modal: asModal } }));
        };
        trigger.addEventListener('click', open);
        cleanups.push(() => {
            trigger.removeEventListener('click', open);
            delete trigger.dataset.kpDialogAttached;
        });
    }
    for (const el of root.querySelectorAll('[data-kp-dialog-close]')) {
        const button = /** @type {HTMLElement} */ (el);
        if (button.dataset.kpDialogCloseAttached !== undefined) continue;
        button.dataset.kpDialogCloseAttached = '';
        // The value, if any, becomes the dialog's returnValue — so a
        // consumer's `close` listener can tell "save" from "cancel".
        const close = () => button.closest('dialog')?.close(button.dataset.kpDialogClose || undefined);
        button.addEventListener('click', close);
        cleanups.push(() => {
            button.removeEventListener('click', close);
            delete button.dataset.kpDialogCloseAttached;
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}

/**
 * Select a tab in an attached tab list from outside — for a "next" button,
 * a URL hash, or a restored view.
 *
 * @param {Element} list the `[role="tablist"]`
 * @param {number | string} which an index, or a tab's id
 */
export function selectTab(list, which) {
    const handle = handles.get(list);
    if (handle === undefined) return;
    const tabs = handle.tabs();
    const index = typeof which === 'number' ? which : tabs.findIndex((t) => t.id === which);
    if (index >= 0 && index < tabs.length) handle.select(index, { focus: false });
}

/** @type {WeakMap<Element, { tabs: () => HTMLElement[], select: (index: number, options?: { focus?: boolean }) => void }>} */
const handles = new WeakMap();

/**
 * Scroll a tab row, and only the row, until `tab` is inside it [gap-12].
 *
 * A row longer than its box scrolls (css/components.css), and a selected
 * tab scrolled out of sight is a selection nobody can see. Not
 * `scrollIntoView`: that scrolls every ancestor too, and a tab changed from
 * a "next" button would pull the whole page to the row.
 *
 * @param {Element} list the `[role="tablist"]`
 * @param {Element | undefined} tab
 */
export function revealTab(list, tab) {
    if (tab === undefined || list.scrollWidth <= list.clientWidth) return;
    const row = list.getBoundingClientRect();
    const box = tab.getBoundingClientRect();
    if (box.left < row.left) list.scrollLeft -= row.left - box.left;
    else if (box.right > row.right) list.scrollLeft += box.right - row.right;
}

/** Written on a tab row while its tabs do not fit, which is what makes it scroll [gap-12]. */
export const TABS_OVERFLOW = 'data-kp-tabs-overflow';

/**
 * Keep `data-kp-tabs-overflow` on a tab row exactly while its tabs are
 * wider than the row [gap-12]. The stylesheet scrolls only such a row, so a
 * row that fits keeps every pixel a register draws past its edge.
 *
 * @param {HTMLElement} list the `[role="tablist"]`
 * @param {() => Element | undefined} selected the tab to keep in view when the row starts to scroll
 * @returns {() => void} stop, which also takes the attribute away
 */
export function watchTabOverflow(list, selected) {
    const measure = () => {
        const over = list.scrollWidth > list.clientWidth + 1;
        if (over === list.hasAttribute(TABS_OVERFLOW)) return;
        list.toggleAttribute(TABS_OVERFLOW, over);
        if (over) revealTab(list, selected());
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return () => list.removeAttribute(TABS_OVERFLOW);
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const tab of list.children) observer.observe(tab);
    return () => {
        observer.disconnect();
        list.removeAttribute(TABS_OVERFLOW);
    };
}

/**
 * Tabs: one stop in the tab order, arrows to move between them.
 *
 * This is the ARIA authoring practice, and it is genuinely not free: a
 * tab list where every tab is a tab stop makes a keyboard user press Tab
 * seven times to leave a row of tabs.
 *
 * Options, each also readable from the list's own attributes so a
 * server-written page needs no JavaScript to set them:
 *   - `aria-orientation="vertical"` → Up/Down move instead of Left/Right
 *   - `data-kp-activation="manual"` → arrows move focus only; Enter or
 *     Space selects. The other half of the ARIA practice, for a panel
 *     that is expensive to show.
 *   - `data-kp-loop="false"` → no wrap-around at the ends
 *
 * @param {ParentNode} root
 * @param {{ activation?: 'automatic' | 'manual', loop?: boolean }} [options] defaults for lists that say nothing
 * @returns {() => void} detach
 */
export function attachTabs(root = document, { activation = 'automatic', loop = true } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];

    for (const el of root.querySelectorAll('[role="tablist"]')) {
        const list = /** @type {HTMLElement} */ (el);
        if (list.dataset.kpTabsAttached !== undefined) continue;
        const tabs = () => [.../** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll('[role="tab"]'))];
        if (tabs().length === 0) continue;
        list.dataset.kpTabsAttached = '';

        const manual = (list.dataset.kpActivation ?? activation) === 'manual';
        const wraps = list.dataset.kpLoop === undefined ? loop : list.dataset.kpLoop !== 'false';
        const vertical = list.getAttribute('aria-orientation') === 'vertical';

        /** What attach changed, so detach can put it back. */
        const before = tabs().map((tab) => ({
            tab,
            tabIndex: tab.getAttribute('tabindex'),
            selected: tab.getAttribute('aria-selected'),
            panel: document.getElementById(tab.getAttribute('aria-controls') ?? ''),
            hidden: document.getElementById(tab.getAttribute('aria-controls') ?? '')?.hidden ?? false,
        }));

        /** @param {number} index @param {{ focus?: boolean }} [options] */
        const select = (index, { focus = true } = {}) => {
            const all = tabs();
            const previous = all.findIndex((t) => t.getAttribute('aria-selected') === 'true');
            all.forEach((tab, i) => {
                const selected = i === index;
                tab.setAttribute('aria-selected', String(selected));
                tab.tabIndex = selected ? 0 : -1;
                const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '');
                if (panel) panel.hidden = !selected;
            });
            // Guarded because a caller computes this index. Found by
            // JobTracker's stricter typecheck (KT4): with
            // noUncheckedIndexedAccess an out-of-range index is a type
            // error here, and in a browser it is a thrown TypeError that
            // stops the key handler.
            if (focus) all[index]?.focus();
            revealTab(list, all[index]);
            if (previous !== index) {
                const tab = all[index];
                list.dispatchEvent(
                    new CustomEvent(TAB_CHANGE_EVENT, {
                        bubbles: true,
                        detail: { index, tab, panel: document.getElementById(tab?.getAttribute('aria-controls') ?? ''), previous },
                    }),
                );
            }
        };

        /** Manual activation moves focus without selecting. @param {number} index */
        const roam = (index) => {
            const all = tabs();
            all.forEach((tab, i) => {
                tab.tabIndex = i === index ? 0 : -1;
            });
            all[index]?.focus();
        };

        /** @param {KeyboardEvent} e */
        const onKey = (e) => {
            const all = tabs();
            const current = all.indexOf(/** @type {HTMLElement} */ (document.activeElement));
            if (current === -1) return;
            const next = vertical ? 'ArrowDown' : 'ArrowRight';
            const prev = vertical ? 'ArrowUp' : 'ArrowLeft';
            if (manual && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                select(current);
                return;
            }
            const move = { [next]: 1, [prev]: -1, Home: -current, End: all.length - 1 - current }[e.key];
            if (move === undefined) return;
            e.preventDefault();
            let target = current + move;
            if (wraps) target = (target + all.length) % all.length;
            else target = Math.max(0, Math.min(all.length - 1, target));
            if (manual) roam(target);
            else select(target);
        };

        /** @param {Event} e */
        const onClick = (e) => {
            const tab = /** @type {HTMLElement} */ (e.target).closest('[role="tab"]');
            if (tab) select(tabs().indexOf(/** @type {HTMLElement} */ (tab)));
        };

        // The initial state comes from the markup, so a page that renders
        // the second tab selected keeps it after this runs.
        const initial = Math.max(
            0,
            tabs().findIndex((t) => t.getAttribute('aria-selected') === 'true'),
        );
        tabs().forEach((tab, i) => {
            tab.tabIndex = i === initial ? 0 : -1;
        });
        const stopWatching = watchTabOverflow(list, () => tabs().find((t) => t.getAttribute('aria-selected') === 'true'));
        revealTab(list, tabs()[initial]);

        list.addEventListener('keydown', onKey);
        list.addEventListener('click', onClick);
        handles.set(list, { tabs, select });
        cleanups.push(() => {
            list.removeEventListener('keydown', onKey);
            list.removeEventListener('click', onClick);
            stopWatching();
            handles.delete(list);
            delete list.dataset.kpTabsAttached;
            for (const b of before) {
                if (b.tabIndex === null) b.tab.removeAttribute('tabindex');
                else b.tab.setAttribute('tabindex', b.tabIndex);
                if (b.selected === null) b.tab.removeAttribute('aria-selected');
                else b.tab.setAttribute('aria-selected', b.selected);
                if (b.panel) b.panel.hidden = b.hidden;
            }
        });
    }

    return () => {
        for (const c of cleanups) c();
    };
}

/**
 * The page's toast region, created on first use.
 *
 * @param {{ region?: HTMLElement | null, role?: string, live?: 'polite' | 'assertive' | 'off', className?: string }} [options]
 * @returns {HTMLElement}
 */
export function toastRegion({ region = null, role = 'status', live = 'polite', className = 'kp-toasts' } = {}) {
    if (region) return region;
    let found = /** @type {HTMLElement | null} */ (document.querySelector(`.${className.split(/\s+/)[0]}`));
    if (!found) {
        found = document.createElement('div');
        found.className = className;
        found.setAttribute('role', role);
        found.setAttribute('aria-live', live);
        document.body.append(found);
    }
    return found;
}

/**
 * Show a toast in the page's toast region, creating the region if it is
 * not there. role="status" rather than role="alert" by default: a toast
 * is an announcement, and alert interrupts whatever a screen reader was
 * saying. An error that must interrupt passes `live: 'assertive'` on its
 * own toast, which gets its own live region so the politeness is per
 * message rather than per page.
 *
 * @param {string | Node} content text, or a node the consumer built
 * @param {{ ms?: number, region?: HTMLElement | null, live?: 'polite' | 'assertive', className?: string, action?: { label: string, onClick: () => void }, max?: number }} [options]
 *   ms: 0 keeps the toast until dismissed; max: drop the oldest beyond this many
 * @returns {HTMLElement & { dismiss: () => void }} the toast, so a caller can remove it early
 */
export function toast(content, { ms = TOAST_MS, region = null, live, className = 'kp-toast', action, max } = {}) {
    const host =
        live === 'assertive'
            ? toastRegion({ role: 'alert', live: 'assertive', className: 'kp-toasts kp-toasts--assertive' })
            : toastRegion({ region });
    const el = /** @type {HTMLElement & { dismiss: () => void }} */ (/** @type {unknown} */ (document.createElement('div')));
    el.className = className;
    // The words in their own box, so the buttons sit at the toast's end
    // whatever the text's length (second nostromo pass, 2026-09-13).
    const body = document.createElement('span');
    body.className = 'kp-toast__body';
    if (typeof content === 'string') body.textContent = content;
    else body.append(content);
    el.append(body);
    if (action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'kp-button kp-button--ghost';
        button.textContent = action.label;
        button.addEventListener('click', action.onClick);
        el.append(button);
    }
    let timer = 0;
    el.dismiss = () => {
        clearTimeout(timer);
        if (!el.isConnected) return;
        el.remove();
        host.dispatchEvent(new CustomEvent(TOAST_HIDE_EVENT, { bubbles: true, detail: { toast: el } }));
    };
    host.append(el);
    if (max !== undefined)
        while (host.children.length > max) /** @type {HTMLElement & { dismiss?: () => void }} */ (host.firstElementChild)?.dismiss?.();
    host.dispatchEvent(
        new CustomEvent(TOAST_SHOW_EVENT, { bubbles: true, detail: { toast: el, text: typeof content === 'string' ? content : el.textContent } }),
    );
    if (ms > 0) timer = window.setTimeout(el.dismiss, ms);
    return el;
}

/** Dispatched on an alert, bubbling and cancelable, before its close button hides it: `{ alert, button }`. */
export const ALERT_DISMISS_EVENT = 'kp-alert-dismiss';
/** Close buttons another channel wires itself; the React Alert and Toasts mark theirs [AR29]. */
export const DISMISS_OWNED = '[data-kp-dismiss-owner]';

/** @type {WeakSet<Event>} */
const dismissHandled = new WeakSet();

/**
 * Make `.kp-alert__close` and `.kp-toast__close` close what they sit in,
 * without a framework [gap-11].
 *
 * Before this only the React components did anything with those buttons;
 * a server-rendered alert kept a close button that did nothing, which is
 * worse than no button at all. Delegated from `root`, so a toast raised
 * after attach is covered too.
 *
 * An alert is hidden (`hidden`, which the base layer holds above every
 * layout class) after ALERT_DISMISS_EVENT, which a consumer may cancel to
 * keep it or to animate it out first — setting `hidden = false` brings it
 * back. A toast leaves through its own `dismiss()` when `toast()` made it,
 * so TOAST_HIDE_EVENT fires as it does on a timeout; otherwise it is
 * removed and the same event is dispatched on its region.
 *
 * @param {ParentNode} root
 * @param {{ ownedBy?: string }} [options] `ownedBy: ''` wires even the buttons another channel marked
 * @returns {() => void} detach
 */
export function attachDismissals(root = document, { ownedBy = DISMISS_OWNED } = {}) {
    /** @param {Event} event */
    const onClick = (event) => {
        // One click, one dismissal, however many roots on the way up were attached.
        if (dismissHandled.has(event)) return;
        const target = event.target instanceof Element ? event.target : null;
        const button = target?.closest('.kp-alert__close, .kp-toast__close');
        if (!button) return;
        if (ownedBy !== '' && button.matches(ownedBy)) return;
        dismissHandled.add(event);
        const toastEl = /** @type {(HTMLElement & { dismiss?: () => void }) | null} */ (button.closest('.kp-toast'));
        if (button.classList.contains('kp-toast__close') && toastEl) {
            if (typeof toastEl.dismiss === 'function') {
                toastEl.dismiss();
                return;
            }
            const region = toastEl.parentElement;
            toastEl.remove();
            region?.dispatchEvent(new CustomEvent(TOAST_HIDE_EVENT, { bubbles: true, detail: { toast: toastEl } }));
            return;
        }
        const alert = /** @type {HTMLElement | null} */ (button.closest('.kp-alert'));
        if (!alert) return;
        const proceed = alert.dispatchEvent(new CustomEvent(ALERT_DISMISS_EVENT, { bubbles: true, cancelable: true, detail: { alert, button } }));
        if (proceed) alert.hidden = true;
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
}

/** Dispatched on a tooltip anchor, bubbling, when its tooltip opens or closes: `{ open, tooltip }`. */
export const TOOLTIP_EVENT = 'kp-tooltip';
/** Tooltip anchors another channel wires itself; the React Tooltip marks its own [AR29]. */
export const TOOLTIP_OWNED = '[data-kp-tooltip-owner]';

/**
 * Framework-free tooltips on `.kp-tooltip-anchor` [gap-11].
 *
 *   <span class="kp-tooltip-anchor">
 *     <button type="button" class="kp-button">Recalibrate</button>
 *     <span role="tooltip" class="kp-popover kp-tooltip">Takes about two minutes</span>
 *   </span>
 *
 * The same contract as the React Tooltip: hidden at rest, shown after a
 * short delay under the pointer and at once on focus, gone when the
 * pointer or focus leaves, and gone on Escape (WCAG 1.4.13). The trigger
 * is described by the tooltip — an id is given where there was none, and
 * `aria-describedby` gains it rather than losing what it held. The anchor
 * names itself for anchor positioning, as the React channel does. Detach
 * puts back the attributes, the styles and the hidden state it found.
 *
 * @param {ParentNode} root
 * @param {{ openDelayMs?: number, closeDelayMs?: number, closeOnEscape?: boolean, ownedBy?: string }} [options]
 *   Per anchor: `data-kp-open-delay`, `data-kp-close-delay`, `data-kp-close-on-escape="false"`.
 * @returns {() => void} detach
 */
export function attachTooltips(root = document, { openDelayMs = 300, closeDelayMs = 100, closeOnEscape = true, ownedBy = TOOLTIP_OWNED } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    let count = 0;
    for (const el of root.querySelectorAll('.kp-tooltip-anchor')) {
        const anchor = /** @type {HTMLElement} */ (el);
        if (ownedBy !== '' && anchor.matches(ownedBy)) continue;
        if (anchor.dataset.kpTooltipAttached !== undefined) continue;
        const tooltip = /** @type {HTMLElement | null} */ (anchor.querySelector('[role="tooltip"], .kp-tooltip'));
        const trigger = /** @type {HTMLElement | null} */ ([...anchor.children].find((child) => child !== tooltip) ?? null);
        if (tooltip === null || trigger === null) continue;
        anchor.dataset.kpTooltipAttached = '';
        count += 1;

        const before = {
            id: tooltip.getAttribute('id'),
            hidden: tooltip.hidden,
            describedby: trigger.getAttribute('aria-describedby'),
            anchorName: anchor.style.getPropertyValue('anchor-name'),
            positionAnchor: tooltip.style.getPropertyValue('position-anchor'),
        };
        if (!tooltip.id) tooltip.id = `kp-tooltip-${count}-${Math.random().toString(36).slice(2, 8)}`;
        const ids = (before.describedby ?? '').split(/\s+/).filter(Boolean);
        if (!ids.includes(tooltip.id)) trigger.setAttribute('aria-describedby', [...ids, tooltip.id].join(' '));
        if (before.anchorName === '') anchor.style.setProperty('anchor-name', `--${tooltip.id}`);
        if (before.positionAnchor === '') tooltip.style.setProperty('position-anchor', before.anchorName || `--${tooltip.id}`);

        /** @param {string | undefined} value @param {number} fallback */
        const number = (value, fallback) => (value === undefined || Number.isNaN(Number(value)) ? fallback : Number(value));
        const openDelay = number(anchor.dataset.kpOpenDelay, openDelayMs);
        const closeDelay = number(anchor.dataset.kpCloseDelay, closeDelayMs);
        const escapes = anchor.dataset.kpCloseOnEscape === undefined ? closeOnEscape : anchor.dataset.kpCloseOnEscape !== 'false';

        let timer = 0;
        /** @param {boolean} open */
        const set = (open) => {
            clearTimeout(timer);
            if (tooltip.hidden === !open) return;
            tooltip.hidden = !open;
            anchor.dispatchEvent(new CustomEvent(TOOLTIP_EVENT, { bubbles: true, detail: { open, tooltip } }));
        };
        /** @param {boolean} open @param {number} delay */
        const schedule = (open, delay) => {
            clearTimeout(timer);
            if (delay <= 0) set(open);
            else timer = window.setTimeout(() => set(open), delay);
        };
        const onEnter = () => schedule(true, openDelay);
        const onLeave = () => {
            if (!anchor.contains(document.activeElement)) schedule(false, closeDelay);
        };
        const onFocusIn = () => schedule(true, 0);
        const onFocusOut = () => schedule(false, 0);
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            if (escapes && event.key === 'Escape' && !tooltip.hidden) set(false);
        };

        tooltip.hidden = true;
        anchor.addEventListener('pointerenter', onEnter);
        anchor.addEventListener('pointerleave', onLeave);
        anchor.addEventListener('focusin', onFocusIn);
        anchor.addEventListener('focusout', onFocusOut);
        document.addEventListener('keydown', onKey);

        cleanups.push(() => {
            clearTimeout(timer);
            anchor.removeEventListener('pointerenter', onEnter);
            anchor.removeEventListener('pointerleave', onLeave);
            anchor.removeEventListener('focusin', onFocusIn);
            anchor.removeEventListener('focusout', onFocusOut);
            document.removeEventListener('keydown', onKey);
            tooltip.hidden = before.hidden;
            if (before.id === null) tooltip.removeAttribute('id');
            if (before.describedby === null) trigger.removeAttribute('aria-describedby');
            else trigger.setAttribute('aria-describedby', before.describedby);
            if (before.anchorName === '') anchor.style.removeProperty('anchor-name');
            if (before.positionAnchor === '') tooltip.style.removeProperty('position-anchor');
            delete anchor.dataset.kpTooltipAttached;
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}

/** Written on an overlay's scroll box while its content is taller than the box. */
export const SCROLL_OVERFLOW = 'data-kp-popover-overflowing';
/** The boxes `attachScrollbars` watches: the popover (a menu, a tooltip), a dialog, a dialog's body. */
export const SCROLL_BOXES = '.kp-popover, .kp-dialog, .kp-dialog__body';

/**
 * Tell a register whether an overlay's box scrolls, and where [retro notes, 2026-09-15].
 *
 * Theme-neutral data, nothing drawn: `data-kp-popover-overflowing` exactly while the
 * content is taller than the box, and three custom properties while it is —
 * `--kp-scroll-view` (the box's inner height in px), `--kp-scroll-ratio`
 * (the part of the content in view, 0–1) and `--kp-scroll-progress` (how far
 * it is scrolled, 0–1). A register that draws its own scrollbar reads them;
 * every other theme never notices them.
 *
 * Such a register also declares `--kp-scrollbar-size` (the bar's width),
 * `--kp-scrollbar-inset` (its distance from the padding box's end edge and
 * from the top and bottom) and `--kp-scrollbar-button` (an arrow button's
 * height) on the box. Only then does a press on the drawn bar do what a
 * platform scrollbar's does: an arrow scrolls a line, the track a page,
 * and the thumb is dragged. A press on a bar with nothing to scroll does
 * nothing. The bar is drawn at the inline end of a left-to-right box.
 *
 * @param {HTMLElement} box
 * @returns {() => void} stop, which also takes the attribute and the properties away
 */
export function watchScrollbar(box) {
    const PROPS = ['--kp-scroll-view', '--kp-scroll-ratio', '--kp-scroll-progress'];
    const measure = () => {
        const view = box.clientHeight;
        const size = box.scrollHeight;
        const over = view > 0 && size > view + 1;
        box.toggleAttribute(SCROLL_OVERFLOW, over);
        if (!over) {
            for (const p of PROPS) box.style.removeProperty(p);
            return;
        }
        box.style.setProperty('--kp-scroll-view', `${view}px`);
        box.style.setProperty('--kp-scroll-ratio', (view / size).toFixed(4));
        box.style.setProperty('--kp-scroll-progress', Math.min(1, Math.max(0, box.scrollTop / (size - view))).toFixed(4));
    };

    /** @param {string} name */
    const length = (name) => parseFloat(getComputedStyle(box).getPropertyValue(name));
    /** @param {PointerEvent} event */
    const onPointerDown = (event) => {
        const bar = length('--kp-scrollbar-size');
        if (event.button !== 0 || !(bar > 0)) return;
        const inset = length('--kp-scrollbar-inset') || 0;
        const rect = box.getBoundingClientRect();
        const right = rect.left + box.clientLeft + box.clientWidth - inset;
        const top = rect.top + box.clientTop + inset;
        const bottom = rect.top + box.clientTop + box.clientHeight - inset;
        if (event.clientX < right - bar || event.clientX > right || event.clientY < top || event.clientY > bottom) return;
        event.preventDefault();
        if (!box.hasAttribute(SCROLL_OVERFLOW)) return;
        const button = Math.min(length('--kp-scrollbar-button') || bar, (bottom - top) / 2);
        const line = parseFloat(getComputedStyle(box).lineHeight) || 20;
        if (event.clientY < top + button) box.scrollTop -= line;
        else if (event.clientY > bottom - button) box.scrollTop += line;
        else {
            const track = bottom - top - 2 * button;
            const thumb = Math.max(8, track * (box.clientHeight / box.scrollHeight));
            const travel = track - thumb;
            const range = box.scrollHeight - box.clientHeight;
            const start = top + button + travel * (box.scrollTop / range);
            if (event.clientY < start) box.scrollTop -= box.clientHeight;
            else if (event.clientY > start + thumb) box.scrollTop += box.clientHeight;
            else if (travel > 0) {
                const from = { y: event.clientY, scroll: box.scrollTop };
                /** @param {PointerEvent} move */
                const onMove = (move) => {
                    box.scrollTop = from.scroll + ((move.clientY - from.y) / travel) * range;
                };
                const onUp = () => {
                    box.removeEventListener('pointermove', onMove);
                    box.removeEventListener('pointerup', onUp);
                    box.removeEventListener('pointercancel', onUp);
                };
                box.setPointerCapture?.(event.pointerId);
                box.addEventListener('pointermove', onMove);
                box.addEventListener('pointerup', onUp);
                box.addEventListener('pointercancel', onUp);
            }
        }
        measure();
    };

    measure();
    box.addEventListener('scroll', measure, { passive: true });
    box.addEventListener('pointerdown', onPointerDown);
    /** @type {ResizeObserver | null} */
    let resize = null;
    /** @type {MutationObserver | null} */
    let mutation = null;
    if (typeof ResizeObserver !== 'undefined') {
        resize = new ResizeObserver(measure);
        const observe = () => {
            resize?.disconnect();
            resize?.observe(box);
            for (const child of box.children) resize?.observe(child);
        };
        observe();
        mutation = new MutationObserver(() => {
            observe();
            measure();
        });
        mutation.observe(box, { childList: true });
    }
    return () => {
        resize?.disconnect();
        mutation?.disconnect();
        box.removeEventListener('scroll', measure);
        box.removeEventListener('pointerdown', onPointerDown);
        box.removeAttribute(SCROLL_OVERFLOW);
        for (const p of PROPS) box.style.removeProperty(p);
    };
}

/** The boxes some `attachScrollbars` already watches, so a second call is a no-op. */
const scrollbarsWatched = new WeakSet();

/**
 * `watchScrollbar` on every `.kp-popover`, `.kp-dialog` and
 * `.kp-dialog__body` under `root`, including the ones added later (a theme
 * menu, a data table's column menu). Idempotent.
 *
 * @param {ParentNode} root
 * @returns {() => void} detach
 */
export function attachScrollbars(root = document) {
    /** @type {Map<HTMLElement, () => void>} */
    const watched = new Map();
    /** @param {ParentNode | Element} scope */
    const scan = (scope) => {
        const found = [...scope.querySelectorAll(SCROLL_BOXES)];
        if (scope instanceof Element && scope.matches(SCROLL_BOXES)) found.push(scope);
        for (const el of found) {
            const box = /** @type {HTMLElement} */ (el);
            if (watched.has(box) || scrollbarsWatched.has(box)) continue;
            scrollbarsWatched.add(box);
            const stop = watchScrollbar(box);
            watched.set(box, () => {
                stop();
                scrollbarsWatched.delete(box);
            });
        }
    };
    scan(root);
    const observer =
        typeof MutationObserver === 'undefined'
            ? null
            : new MutationObserver((records) => {
                  for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) scan(node);
              });
    const target = root instanceof Document ? root.documentElement : root;
    if (observer && target instanceof Node) observer.observe(target, { childList: true, subtree: true });
    return () => {
        observer?.disconnect();
        for (const stop of watched.values()) stop();
        watched.clear();
    };
}

/** The close label a consumer's markup can use: `data-kp-dialog-close` with the dictionary's word. */
export const closeLabel = () => getStrings().close;
