// Tabs: selecting from outside and the attach; TabsControl wires one tab list.
import { attachOne } from '../controller.js';
import { TabsControl, handles } from './tab-list.js';

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
    // A list marked attached is wired already; one without tabs has nothing to wire.
    const made = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('[role="tablist"]')])
        .filter((list) => !('kpTabsAttached' in list.dataset) && list.querySelector('[role="tab"]') !== null)
        .map((list) => attachOne(list, TabsControl, { activation, loop }));
    return () => {
        for (const control of made.splice(0)) control?.destroy();
    };
}
