// Skip links: jump past the navigation to the content.
import { Controller, attachOne } from '../controller.js';

/**
 * Move focus to the target of a skip link, adding `tabindex="-1"` if the
 * target cannot take focus on its own [KT6].
 *
 * JobTracker found the half a skip link needs and nothing here provided:
 * without a focusable target the browser scrolls and the next Tab goes
 * back into the menu, so the link has done nothing for the person it
 * exists for. Returns whether a target was found and focused.
 *
 * @param {string} href `#main`, or any same-page hash
 * @param {Document | Element} [root]
 * @returns {boolean}
 */
export function skipTo(href, root = document) {
    const id = href.startsWith('#') ? href.slice(1) : href;
    if (id === '') return false;
    const target = /** @type {HTMLElement | null} */ (root.querySelector(`#${CSS.escape(id)}`));
    if (target === null) return false;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
    return true;
}
/** One skip link: a click moves the focus to its target, not only the scroll position. */
class SkipLinkControl extends Controller {
    connect() {
        const link = /** @type {HTMLAnchorElement} */ (this.host);
        link.dataset.kpSkipAttached = '';
        // Registered first, so the mark goes last.
        this.own(() => delete link.dataset.kpSkipAttached);
        this.listen(link, 'click', (event) => {
            if (skipTo(link.getAttribute('href') ?? '')) event.preventDefault();
        });
    }
}

/**
 * Make every `.kp-skip-link` (or `[data-kp-skip]`) move focus, not only
 * the scroll position.
 *
 * @param {ParentNode} root
 * @returns {() => void} detach
 */
export function attachSkipLinks(root = document) {
    // A link marked attached is wired already, by this call's controller or an earlier one.
    const made = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.kp-skip-link, [data-kp-skip]')])
        .filter((link) => !('kpSkipAttached' in link.dataset))
        .map((link) => attachOne(link, SkipLinkControl));
    return () => {
        for (const control of made.splice(0)) control?.destroy();
    };
}
