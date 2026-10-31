// One wired wheel: its parts laid and drawn, its Spin button (or, as a kiosk, the whole stage and Enter or Space), and a
// redraw when the kiosk attribute changes or the fonts arrive.

import { Controller } from '../controller.js';
import { build, drawDisc, paint } from './draw.js';
import { spinWheel } from './spin.js';
import { part, stateOf } from './state.js';

export class WheelControl extends Controller {
    connect() {
        const root = this.host;
        build(root);
        drawDisc(root, true);
        paint(root);
        this.listen(root, 'click', (event) => this.onClick(event));
        this.listen(root, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        // The kiosk attribute is live.
        this.observe(new MutationObserver(() => paint(root))).observe(root, { attributes: true, attributeFilter: ['data-kp-wheel-kiosk'] });
        // Labels are cut to their room in the theme's face: again once the fonts are in.
        void document.fonts?.ready.then(() => root.isConnected && !stateOf(root).spinning && drawDisc(root, true));
    }

    get kiosk() {
        return this.host.hasAttribute('data-kp-wheel-kiosk');
    }

    /** Spin on the Spin button, or anywhere on the stage or the answer as a kiosk. @param {Event} event */
    onClick(event) {
        const root = this.host;
        const target = event.target instanceof Element ? event.target : null;
        const spin = target?.closest(this.kiosk ? '.kp-wheel__stage, .kp-wheel__result' : '.kp-wheel__spin');
        if (!spin || !root.contains(spin) || root.hasAttribute('aria-busy')) return;
        if (!this.kiosk && spin.getAttribute('aria-disabled') === 'true') return;
        void spinWheel(root);
    }

    /** Kiosk: Enter or Space on the focused wheel spins it. @param {KeyboardEvent} event */
    onKey(event) {
        if (!this.kiosk || event.target !== part(this.host, 'stage')) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        void spinWheel(this.host);
    }
}
