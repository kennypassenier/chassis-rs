// Tab rows: keeping the selected tab in view and marking a row that overflows.
import { TABS_OVERFLOW } from './constants.js';

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
