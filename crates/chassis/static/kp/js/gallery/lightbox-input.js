// How a person moves the lightbox: the controls that fade, the swipe on a phone, and the address that carries the open picture.

import { motionAllowed } from '../calm.js';
import { GALLERY_CHROME_MS, SWIPE, SWIPE_CLOSE_FACTOR } from './constants.js';

/** @typedef {import('./lightbox.js').Lightbox} Lightbox */

/** The controls fade after a few seconds without movement; they come back on movement or focus; never when calm. @param {Lightbox} lb */
export function installChrome(lb) {
    const { viewer, chromeMode, el } = lb;
    const showChrome = () => {
        viewer.dialog.removeAttribute('data-kp-chrome-idle');
        window.clearTimeout(lb.chromeTimer);
        if (chromeMode === 'fade' && motionAllowed(el)) {
            lb.chromeTimer = window.setTimeout(() => {
                if (!viewer.dialog.matches(':focus-within') || !viewer.dialog.querySelector(':focus-visible'))
                    viewer.dialog.setAttribute('data-kp-chrome-idle', '');
            }, GALLERY_CHROME_MS);
        }
    };
    for (const type of ['pointermove', 'pointerdown', 'keydown', 'focusin']) lb.listen(viewer.dialog, type, showChrome);
    lb.own(() => window.clearTimeout(lb.chromeTimer));
    showChrome();
}

/** A swipe on a phone: sideways steps, down closes. Where it started sits on the lightbox (`lb.swipe`). @param {Lightbox} lb */
export function installSwipe(lb) {
    const { picture, swipe } = lb;
    picture.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return;
        swipe.on = true;
        swipe.x = event.clientX;
        swipe.y = event.clientY;
    });
    picture.addEventListener('pointerup', (event) => onSwipeEnd(lb, event));
    picture.addEventListener('pointercancel', () => {
        swipe.on = false;
    });
}

/** The finger lifted: a sideways swipe steps, a downward one closes. @param {Lightbox} lb @param {PointerEvent} event */
function onSwipeEnd(lb, event) {
    const { swipe, figure } = lb;
    if (!swipe.on) return;
    swipe.on = false;
    if (figure.getAttribute('data-kp-zoom') === 'full') return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) lb.go(dx < 0 ? 1 : -1);
    else if (dy > SWIPE * SWIPE_CLOSE_FACTOR && Math.abs(dy) > Math.abs(dx)) lb.viewer.close();
}

/** The address carries the open picture; the back button closes the lightbox first. @param {Lightbox} lb @param {string} id */
export function installHash(lb, id) {
    if (!lb.hashOn) return;
    const { view } = lb;
    try {
        view.history.pushState({ kpGallery: id }, '', lb.hashOf(id));
        lb.pushed = true;
        lb.listen(view, 'popstate', () => {
            lb.closedByHistory = true;
            lb.viewer.close();
        });
    } catch {
        lb.pushed = false;
    }
}
