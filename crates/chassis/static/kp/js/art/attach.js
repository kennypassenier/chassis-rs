// Gives every element with a kind its drawing and follows a change of the kind: one ArtControl per element.
import { Controller, attachAll } from '../controller.js';
import { ART } from './constants.js';
import { drawArt, isKind } from './draw.js';

/** One element with a kind: the drawing this controller put in it. */
class ArtControl extends Controller {
    /** @param {HTMLElement} host */
    constructor(host) {
        super(host);
        /** The drawing in the element now, when this controller drew it. @type {SVGSVGElement | null} */
        this.svg = null;
    }

    connect() {
        // Registered first, so it runs last: the drawing goes after the watch.
        this.own(() => this.svg?.remove());
        this.place();
        if (typeof MutationObserver === 'undefined') return;
        this.observe(new MutationObserver(() => this.place())).observe(this.host, { attributes: true, attributeFilter: ['data-kp-art'] });
    }

    /** Draw the element's kind in place of the drawing it has; an unknown kind leaves it without one. */
    place() {
        const host = this.host;
        host.querySelector(':scope > .kp-art')?.remove();
        this.svg = null;
        const kind = host.dataset.kpArt ?? '';
        if (!isKind(kind)) return;
        this.svg = drawArt(host.ownerDocument, kind);
        host.prepend(this.svg);
    }
}

/**
 * Give every element with `data-kp-art` under `root` its drawing, and follow a change of the kind.
 * @param {ParentNode} [root]
 * @returns {() => void} detach: the drawings go
 */
export function attachArt(root = document) {
    return attachAll(root, ART, ArtControl);
}
