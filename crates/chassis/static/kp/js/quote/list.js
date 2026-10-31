// A list of quote cards: the first few shown and a button for the rest ("Show all 7", the exact number).

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { LIST_MAX_CAP, QUOTE_LIST_MAX } from './constants.js';
import { make } from './dom.js';

/** The controller of one `[data-kp-quote-list]`. */
export class QuoteListController extends Controller {
    /**
     * @param {HTMLElement} host the list
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        this.more = make('button', 'kp-button kp-quote-list__more');
        this.more.type = 'button';
        /** Whether the whole list is open. */
        this.open = false;
    }

    connect() {
        const list = this.host;
        list.dataset.kpQuoteListAttached = '';
        this.own(() => {
            this.more.remove();
            delete list.dataset.kpQuoteListAttached;
        });
        list.append(this.more);
        if (!list.hasAttribute('aria-label') && !list.hasAttribute('aria-labelledby')) list.setAttribute('aria-label', getStrings().quoteListName);
        list.setAttribute('role', 'group');
        this.listen(list, 'click', (event) => {
            if (event.target !== this.more) return;
            this.open = !this.open;
            this.sync();
        });
        this.observe(new MutationObserver(() => this.sync())).observe(list, { childList: true, attributes: true, attributeFilter: ['data-kp-quote-max'] });
        this.sync();
    }

    /** The cards that count: those not marked gone. */
    items() {
        return [...this.host.querySelectorAll(':scope > .kp-quote, :scope > li')].filter((node) => !(node instanceof HTMLElement && node.dataset.kpQuoteGone !== undefined));
    }

    /** Hide the cards beyond the maximum (unless open), show the rest, and write the button. */
    sync() {
        const list = this.host;
        const s = getStrings();
        const max = Math.min(LIST_MAX_CAP, Math.max(1, Number(list.getAttribute('data-kp-quote-max')) || QUOTE_LIST_MAX));
        const all = this.items().filter((node) => !(node instanceof HTMLElement && node.hidden && node.dataset.kpQuoteListHidden === undefined));
        all.forEach((node, i) => {
            if (!(node instanceof HTMLElement)) return;
            const beyond = i >= max && !this.open;
            if (beyond) {
                node.hidden = true;
                node.dataset.kpQuoteListHidden = '';
            } else if (node.dataset.kpQuoteListHidden !== undefined) {
                node.hidden = false;
                delete node.dataset.kpQuoteListHidden;
            }
        });
        const total = all.length;
        this.more.hidden = total <= max;
        this.more.textContent = this.open ? s.quoteShowFewer : s.quoteShowAllN(total);
        this.more.setAttribute('aria-expanded', String(this.open));
    }
}
