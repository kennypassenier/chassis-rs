// The watch on a root: Escape in a search, the search key, and the presses on an active row's tags and Clear all.

import { Controller } from '../controller.js';
import { toolbarSearch } from './active.js';
import { ACTIVE, CLEAR, REMOVE, TOOLBAR, TOOLBAR_CLEAR_EVENT, TOOLBAR_REMOVE_EVENT } from './values.js';

/** Events handled once even when two attached roots both see them. @type {WeakSet<Event>} */
const HANDLED = new WeakSet();

/** @param {Event} event */
const toolbarOf = (event) => (event.target instanceof Element ? event.target.closest(TOOLBAR) : null);

/** One attach call on a root (a document, a shadow root or an element), which is the controller's host, built directly. */
export class ToolbarWatch extends Controller {
    /** @param {ParentNode} scope */
    constructor(scope) {
        super(/** @type {HTMLElement} */ (/** @type {unknown} */ (scope)));
        this.scope = scope;
    }

    connect() {
        for (const toolbar of this.scope.querySelectorAll(`${TOOLBAR} ${ACTIVE}`)) {
            if (toolbar instanceof HTMLElement && toolbar.querySelector('.kp-tag') === null) toolbar.hidden = true;
        }
        this.listen(this.host, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(this.host, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(document, 'keydown', (event) => this.onHotkey(/** @type {KeyboardEvent} */ (event)));
    }

    /** Escape in the search clears it, and fires `input` so the page filters. @param {KeyboardEvent} event */
    onKey(event) {
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
    }

    /** A press on a tag's cross or on Clear all becomes the toolbar's event. @param {MouseEvent} event */
    onClick(event) {
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
            this.keepFocus(toolbar, remove, at);
        } else {
            toolbar.dispatchEvent(new CustomEvent(TOOLBAR_CLEAR_EVENT, { bubbles: true, detail: {} }));
            toolbarSearch(toolbar)?.focus();
        }
    }

    /**
     * The tag that was pressed is gone once the page has redrawn: the focus
     * goes to the tag that took its place, else the last one, else the search.
     * @param {Element} toolbar @param {HTMLElement} pressed @param {number} at
     */
    keepFocus(toolbar, pressed, at) {
        if (pressed.isConnected && toolbar.contains(document.activeElement) && document.activeElement !== document.body) return;
        const left = [...toolbar.querySelectorAll(REMOVE)];
        const next = /** @type {HTMLElement | undefined} */ (left[Math.min(at, left.length - 1)]);
        (next ?? toolbarSearch(toolbar))?.focus();
    }

    /** The search key focuses the first visible toolbar's search, from anywhere that is not a field. @param {KeyboardEvent} event */
    onHotkey(event) {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        const target = event.target;
        if (
            target instanceof HTMLElement &&
            (target.isContentEditable || target.matches('input, textarea, select, [role="textbox"], [role="combobox"]'))
        )
            return;
        for (const toolbar of this.scope.querySelectorAll(TOOLBAR)) {
            if (toolbar.getAttribute('data-kp-toolbar-key') !== event.key) continue;
            const input = toolbarSearch(toolbar);
            // The first toolbar on the page that can be seen takes the key.
            if (!input || !(toolbar instanceof HTMLElement) || toolbar.getClientRects().length === 0) continue;
            event.preventDefault();
            input.focus();
            input.select();
            return;
        }
    }
}

/**
 * Wire every toolbar under `root` (the body of attachToolbars()).
 * @param {ParentNode} root
 * @returns {() => void} detach
 */
export function watchToolbars(root) {
    const watch = new ToolbarWatch(root);
    try {
        watch.connect();
    } catch (error) {
        watch.destroy();
        throw error;
    }
    return () => watch.destroy();
}
