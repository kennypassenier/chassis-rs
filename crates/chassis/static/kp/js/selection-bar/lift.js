// The room a floating selection bar takes at the window's foot, published for the toasts: `.kp-toasts` rises above the bar
// while it shows a selection, as it already rises above a tab bar [habits-1101].

import { SELECTION_LIFT_PROPERTY } from './model.js';

/** @typedef {import('./controller.js').SelectionBar} SelectionBar */

/**
 * Publish `--kp-selection-lift` on the root: the distance from the window's foot to the top of the bar's panel while a
 * floating-bottom bar shows a selection or a running action, and 0px otherwise. Follows the panel's size and the window's.
 * @param {SelectionBar} bar
 */
export function publishLift(bar) {
    const { host, doc } = bar;
    const view = doc.defaultView;
    const panel = host.querySelector(':scope > .kp-selection__panel');
    if (!view || !panel || host.getAttribute('data-kp-placement') !== 'floating-bottom') return;
    const root = doc.documentElement;
    const publish = () => {
        const shown = host.getAttribute('data-kp-selection-state') !== 'empty';
        const lift = shown ? Math.max(0, view.innerHeight - panel.getBoundingClientRect().top) : 0;
        root.style.setProperty(SELECTION_LIFT_PROPERTY, `${Math.round(lift)}px`);
    };
    if (typeof ResizeObserver !== 'undefined') bar.observe(new ResizeObserver(publish)).observe(panel);
    bar.observe(new view.MutationObserver(publish)).observe(host, { attributes: true, attributeFilter: ['data-kp-selection-state'] });
    bar.listen(view, 'resize', publish);
    bar.own(() => root.style.removeProperty(SELECTION_LIFT_PROPERTY));
    publish();
}
