// Draws one card from its data, fits its flags and actions and redraws it when they change.
import { ENTITY_GRID } from './constants.js';
import { drawTile } from './tile.js';
import { RowsDrawing } from './rows.js';
import { DRAWN, slotOf } from './helpers.js';
/** @typedef {import('./types.js').EntityData} EntityData */

/**
 * Take a flag out of the row (into the "+N") while the row is wider than the card, one at a time, as soon as the card is laid out.
 * @param {HTMLElement} card
 * @param {number} shown how many flags are drawn now
 */
function fitFlags(card, shown) {
    const view = card.ownerDocument.defaultView;
    view?.requestAnimationFrame(() => {
        const row = slotOf(card, 'flags');
        if (!row || !card.isConnected || shown <= 0) return;
        if (row.scrollWidth > row.clientWidth + 1) {
            card.dataset.kpFlagsFit = String(shown - 1);
            const was = DRAWN.get(card);
            if (was) {
                delete was.drawn.flags;
                setEntity(card, was.data);
            }
        }
    });
}

/** Grids (or lone cards) with a fit check already waiting for the next frame. @type {WeakSet<HTMLElement>} */
const ACTIONS_QUEUED = new WeakSet();

/**
 * Move actions into "More" while a button of the grid does not fit its card, one button at a time, as soon as the cards are
 * laid out: the columns are equal (`minmax(0, 1fr)`), so a button whose longest word is wider than its column spills it past its own
 * box, which is what is measured here (and a row that runs past the card's edge). The count is the grid's, so the same action stands in the same column on every card.
 * @param {HTMLElement} host the grid, or the card when it stands alone
 * @param {number} inline how many actions stand as buttons now
 */
function fitActions(host, inline) {
    if (inline <= 0 || ACTIONS_QUEUED.has(host)) return;
    ACTIONS_QUEUED.add(host);
    host.ownerDocument.defaultView?.requestAnimationFrame(() => {
        ACTIONS_QUEUED.delete(host);
        // Another pass has already taken a button out since this one was asked for.
        if (!host.isConnected || Number(host.dataset.kpEntityFit ?? inline) < inline) return;
        const cards = /** @type {HTMLElement[]} */ (host.matches(ENTITY_GRID) ? [...host.querySelectorAll(':scope > .kp-card--entity')] : [host]);
        const tooWide = cards.some((card) => {
            const row = slotOf(card, 'actions');
            if (!row || row.hidden || row.clientWidth === 0 || card.dataset.kpState === 'error') return false;
            const edge = row.getBoundingClientRect().right + 0.5;
            // The columns are equal, so a button too wide for its column spills its longest word past its own box
            // (or past the row's edge, for the last one).
            return [...row.children].some((child) => {
                const button = child.matches('button') ? child : child.querySelector('button');
                return child.getBoundingClientRect().right > edge || (button !== null && button.scrollWidth > button.clientWidth);
            });
        });
        if (!tooWide) return;
        host.dataset.kpEntityFit = String(inline - 1);
        redraw(cards);
    });
}

/**
 * Draw the given cards again from their last data, slot by slot as the signatures say.
 * @param {readonly HTMLElement[]} cards
 * @param {string[]} [slots] slots to draw anew whatever the signature says
 */
export function redraw(cards, slots = ['actions']) {
    for (const card of cards) {
        const was = DRAWN.get(card);
        if (!was) continue;
        for (const name of slots) delete was.drawn[name];
        setEntity(card, was.data);
    }
}

/** One draw of one card: the preamble, then the slots of its kind in order, then the fit checks of the next frame. */
class CardDrawing extends RowsDrawing {
    draw() {
        this.begin();
        this.trend(redraw);
        if (this.status === 'loading') {
            this.drawLoading();
            return;
        }
        this.card.removeAttribute('aria-busy');
        this.readOptions();
        if (this.kind === 'tile') {
            const { card, data, doc, s, status, key, link, selectable, markKind, starOn, starKey, star } = this;
            drawTile({ card, data, doc, s, slot: (name, signature, build) => this.slot(name, signature, build), status, key, link, selectable, markKind, starOn, starKey, star });
            return;
        }
        this.identity();
        this.figures();
        this.flags();
        fitFlags(this.card, this.flagsMax);
        this.meters();
        this.actions();
        fitActions(this.fitHost, this.inline);
    }
}

/**
 * Draw one card from its data. Only what differs from the last draw is touched.
 * @param {HTMLElement} card
 * @param {EntityData} data
 */
export function setEntity(card, data) {
    new CardDrawing(card, data).draw();
}
