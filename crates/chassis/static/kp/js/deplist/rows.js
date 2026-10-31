// The elements of the rows: a name with its mark and link, a row with its number, arrow, state and spoken form, a cycle, a group heading.

import { setIdmark } from '../idmark.js';
import { getStrings } from '../strings.js';
import { DEPLIST_GHOST_ROWS } from './values.js';
import { DeplistCore, made } from './core.js';

/** @typedef {import('./core.js').DeplistSettings} DeplistSettings */

export class DeplistRows extends DeplistCore {
    /**
     * A thing's name with its identity mark, a link when the list has a template.
     * @param {string} name
     * @param {boolean} [needed]
     */
    nameNode(name, needed = false) {
        const doc = this.doc;
        const link = this.host.getAttribute('data-kp-dep-link');
        const holder = link ? made(doc, 'a', 'kp-deplist__name') : made(doc, 'span', 'kp-deplist__name');
        if (needed) holder.classList.add('kp-deplist__name--to');
        if (holder instanceof HTMLAnchorElement && link) holder.href = link.replace('{name}', encodeURIComponent(name));
        const mark = made(doc, 'span', 'kp-idmark kp-idmark--xs');
        setIdmark(mark, name);
        holder.append(mark, made(doc, 'span', 'kp-deplist__text'));
        /** @type {HTMLElement} */ (holder.lastElementChild).textContent = name;
        return holder;
    }

    /**
     * The badge beside a needed thing: its state in words and a tone.
     * @param {import('../deplist.js').DepItem} item
     */
    stateBadge(item) {
        const s = getStrings();
        const word = item.state === 'running' ? s.deplistRunning : item.state === 'stopped' ? s.deplistStopped : s.deplistUnknown;
        const tone = item.state === 'running' ? ' kp-badge--success' : item.state === 'stopped' ? ' kp-badge--destructive' : '';
        const badge = made(this.doc, 'span', `kp-badge kp-deplist__state${tone}`);
        badge.textContent = word;
        return badge;
    }

    /**
     * One row: the number, the thing that needs, the arrow, the thing needed, its state, and the sentence a screen reader hears.
     * @param {import('../deplist.js').DepItem} item
     * @param {number | null} no
     * @param {DeplistSettings} o
     */
    rowFor(item, no, o) {
        const s = getStrings();
        const doc = this.doc;
        const li = made(doc, 'li', 'kp-deplist__row');
        if (o.numbers) {
            const n = made(doc, 'span', 'kp-deplist__no');
            n.textContent = no === null ? '' : String(no);
            li.append(n);
        }
        const arrowNode = made(doc, 'span', 'kp-deplist__arrow');
        arrowNode.setAttribute('aria-hidden', 'true');
        arrowNode.textContent = o.arrow;
        li.append(this.nameNode(item.from), arrowNode, this.nameNode(item.to, true));
        if (o.withStates) li.append(this.stateBadge(item));
        const spoken = made(doc, 'span', 'kp-sr-only');
        spoken.textContent = `, ${o.reaches ? s.deplistReaches(item.from, item.to) : s.deplistNeeds(item.from, item.to)}`;
        li.append(spoken);
        if (item.label) li.title = item.label;
        return li;
    }

    /** The placeholder rows of the loading state. */
    ghostRows() {
        for (let i = 0; i < DEPLIST_GHOST_ROWS; i++) {
            const ghost = made(this.doc, 'li', 'kp-deplist__row kp-deplist__row--ghost');
            ghost.setAttribute('aria-hidden', 'true');
            ghost.append(made(this.doc, 'span', 'kp-skeleton kp-deplist__bone'));
            this.list.append(ghost);
        }
    }

    /** One destructive row naming each thing of a cycle. @param {string[]} cycle */
    cycleRow(cycle) {
        const s = getStrings();
        const li = made(this.doc, 'li', 'kp-deplist__row kp-deplist__row--cycle');
        const alert = made(this.doc, 'span', 'kp-alert kp-alert--destructive kp-deplist__cycle');
        alert.setAttribute('role', 'alert');
        for (const [i, name] of [...cycle, cycle[0]].entries()) {
            if (i > 0) alert.append(' ', s.deplistNeedsWord, ' ');
            alert.append(this.nameNode(name));
        }
        li.append(alert);
        return li;
    }

    /** A heading row over a group of rows. @param {string} key */
    groupHeading(key) {
        const head = made(this.doc, 'li', 'kp-deplist__group');
        head.setAttribute('role', 'presentation');
        head.append(this.nameNode(key));
        return head;
    }

    /**
     * The rows in the order they stand: sorted by the grouped name when the list is grouped.
     * @param {import('../deplist.js').DepRow[]} rows
     * @param {string} group
     */
    groupedRows(rows, group) {
        if (group !== 'by-to' && group !== 'by-from') return rows;
        const keyOf = (/** @type {import('../deplist.js').DepRow} */ r) => (group === 'by-to' ? r.item.to : r.item.from);
        return [...rows].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    }
}
