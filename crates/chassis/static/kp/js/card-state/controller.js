// The controller of one card: it syncs the card, follows `data-kp-state` and turns a press on Try again into `kp-card-retry`.

import { Controller } from '../controller.js';
import { CARD_RETRY_EVENT } from './values.js';
import { syncOf } from './sync.js';

/** Follows one card in four data states. */
export class CardStateController extends Controller {
    connect() {
        const sync = syncOf(this.host);
        sync.sync();
        // The busy card of a loading card is taken out on detach.
        this.own(() => sync.dropBusy());
        this.listen(this.host, 'click', (event) => this.onPress(event));
        if (typeof MutationObserver === 'undefined') return;
        this.observe(new MutationObserver(() => this.onState())).observe(this.host, { attributes: true, attributeFilter: ['data-kp-state'] });
    }

    /** A framework wrote `data-kp-state`: sync, unless the card is in that state already. */
    onState() {
        const sync = syncOf(this.host);
        if (sync.state !== this.host.getAttribute('data-kp-state')) sync.sync({ announce: true });
    }

    /** A press on Try again of this card, not of a card inside it. @param {Event} event */
    onPress(event) {
        const card = this.host;
        const button = event.target instanceof Element ? event.target.closest('[data-kp-card-retry]') : null;
        if (!button || !card.contains(button) || button.closest('.kp-card') !== card) return;
        card.dispatchEvent(new CustomEvent(CARD_RETRY_EVENT, { bubbles: true, detail: { card } }));
    }
}
