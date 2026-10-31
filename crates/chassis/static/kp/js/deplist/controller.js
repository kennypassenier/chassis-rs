// One dependency list: wired once, redrawn from its rows, its state and its attributes, with the fold, the copy button and the states.

import { openBusyCard } from '../busy-card.js';
import { runFlashButton } from '../flash.js';
import { statePlate } from '../state-plate.js';
import { getStrings } from '../strings.js';
import { DEPLIST_OBSERVED, DEPLIST_RETRY_EVENT } from './values.js';
import { depText, orderDependencies } from './order.js';
import { made } from './core.js';
import { DeplistRows } from './rows.js';

/** @typedef {import('./core.js').DeplistSettings} DeplistSettings */

export class DependencyList extends DeplistRows {
    connect() {
        const { host, heading, body, list, foot } = this;
        host.classList.add('kp-deplist');
        host.setAttribute('role', 'group');
        this.own(() => host.classList.remove('kp-deplist'));
        heading.setAttribute('aria-live', 'polite');
        list.setAttribute('role', 'list');
        body.append(list);
        host.replaceChildren(heading, body, foot);
        this.own(() => host.replaceChildren());
        this.own(() => this.busy?.remove());
        this.observe(new MutationObserver(() => this.draw())).observe(host, { attributes: true, attributeFilter: DEPLIST_OBSERVED });
        this.draw();
    }

    /** The heading is the exact count, whatever is folded. @param {number} total */
    writeHeading(total) {
        const s = getStrings();
        const template = this.host.getAttribute('data-kp-dep-heading');
        const counting = this.state === 'ready' || this.state === 'empty';
        this.heading.textContent = counting ? (template ? template.replace('{n}', String(total)) : s.deplistCount(total)) : s.deplistReading;
    }

    /** Clear what the last draw left and set what every state shares. @param {DeplistSettings} o */
    resetList(o) {
        const { host, body, list, foot } = this;
        list.replaceChildren();
        list.removeAttribute('aria-busy');
        this.clearStandIns();
        list.hidden = false;
        if (list.parentElement !== body) body.append(list);
        list.dataset.kpCols = o.numbers ? 'numbered' : 'plain';
        host.style.setProperty('--kp-deplist-arrow', `'${o.arrow.replace(/'/g, '')}'`);
        foot.replaceChildren();
        host.setAttribute('data-kp-state', this.state);
        body.style.removeProperty('min-block-size');
        host.style.setProperty('--kp-deplist-min-rows', String(this.minRows()));
    }

    /** Redraw the list from its rows, its state and its attributes. */
    draw() {
        const o = this.settings();
        const shown = this.items.filter((i) => o.self || i.from !== i.to);
        const { rows, cycles } = orderDependencies(shown, { numbers: o.numbers });
        this.drawn = rows;
        const total = rows.length + cycles.length;
        this.writeHeading(total);
        this.resetList(o);
        if (this.drawState(total)) return;
        for (const cycle of cycles) this.list.append(this.cycleRow(cycle));
        const rowEls = this.drawRows(rows, o);
        if (rowEls.length > o.collapse) this.foot.append(this.moreButton(rowEls.length));
        if (this.host.hasAttribute('data-kp-dep-copy')) this.foot.append(this.copyButton(rows));
    }

    /**
     * Loading, failed and empty stand in for the rows.
     * @param {number} total
     * @returns {boolean} whether a state was drawn, so there are no rows to draw
     */
    drawState(total) {
        const s = getStrings();
        const { host, body, list, doc } = this;
        if (this.state === 'loading') {
            list.setAttribute('aria-busy', 'true');
            this.ghostRows();
            this.setBusy(openBusyCard(body, { words: s.deplistLoading, area: () => [body], className: 'kp-deplist__busy', arrive: true }));
            return true;
        }
        /** @type {HTMLElement} */
        let plate;
        if (this.state === 'error') {
            plate = statePlate(doc, {
                kind: 'error',
                title: s.deplistFailed,
                text: this.stateMessage || s.deplistFailedText,
                actionLabel: s.deplistRetry,
                onAction: () => host.dispatchEvent(new CustomEvent(DEPLIST_RETRY_EVENT, { bubbles: true })),
            });
        } else if (total === 0 || this.state === 'empty') {
            plate = statePlate(doc, { kind: 'empty', title: host.getAttribute('data-kp-dep-empty') ?? s.deplistEmpty });
        } else {
            return false;
        }
        this.setPlate(plate);
        body.prepend(plate);
        list.hidden = true;
        return true;
    }

    /**
     * The rows, grouped when asked, folded past the limit with an exact "Show all 23".
     * @param {import('../deplist.js').DepRow[]} rows
     * @param {DeplistSettings} o
     * @returns {HTMLElement[]} the row elements, hidden ones included
     */
    drawRows(rows, o) {
        /** @type {string | null} */
        let current = null;
        /** @type {HTMLElement[]} */
        const rowEls = [];
        for (const row of this.groupedRows(rows, o.group)) {
            const key = o.group === 'by-to' ? row.item.to : row.item.from;
            if (o.group !== 'none' && key !== current) {
                current = key;
                this.list.append(this.groupHeading(key));
            }
            const li = this.rowFor(row.item, row.number, o);
            rowEls.push(li);
            this.list.append(li);
        }
        const folded = rowEls.length > o.collapse && !this.expanded;
        rowEls.forEach((li, i) => (li.hidden = folded && i >= o.collapse));
        return rowEls;
    }

    /** The "Show all 23" / "Show fewer" button. @param {number} count the rows there are */
    moreButton(count) {
        const s = getStrings();
        const folded = !this.expanded;
        const more = /** @type {HTMLButtonElement} */ (made(this.doc, 'button', 'kp-button kp-button--ghost kp-deplist__more'));
        more.type = 'button';
        more.setAttribute('aria-expanded', String(!folded));
        more.textContent = folded ? s.deplistMore(count) : s.deplistFewer;
        more.addEventListener('click', () => {
            this.toggleExpanded();
            this.draw();
            /** @type {HTMLElement | null} */ (this.host.querySelector('.kp-deplist__more'))?.focus();
        });
        return more;
    }

    /** The button that copies the rows as text. @param {import('../deplist.js').DepRow[]} rows */
    copyButton(rows) {
        const s = getStrings();
        const copy = /** @type {HTMLButtonElement} */ (made(this.doc, 'button', 'kp-button kp-button--ghost kp-deplist__copy'));
        copy.type = 'button';
        copy.textContent = s.deplistCopy;
        copy.setAttribute('data-kp-flash-words', s.deplistCopied);
        copy.addEventListener('click', () => {
            void runFlashButton(copy, async () => {
                await navigator.clipboard.writeText(depText(rows.map((r) => r.item)));
                return s.deplistCopied;
            });
        });
        return copy;
    }
}
