// The divider for the rows that came while the tab was away: "New since 14:32", put before the first of them.

import { NewPillDraw } from './draw.js';
import { sinceLeftOf } from './options.js';
import { DIVIDER_COLSPAN } from './values.js';

export class NewPillAway extends NewPillDraw {
    /**
     * @param {HTMLElement} host the scroller
     * @param {import('../newpill.js').NewPillOptions} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        /** When the tab was hidden, and the first row that came after. @type {number} */
        this.hiddenAt = 0;
        /** @type {Element | null} */
        this.firstAway = null;
    }

    /** A row came in: the first one that came while the tab was away is where the divider goes. @param {Element} node */
    noteRow(node) {
        if (this.hiddenAt && !this.firstAway) this.firstAway = node;
    }

    onVisibility() {
        if (!sinceLeftOf(this.host, this.pillOptions)) return;
        if (this.doc.visibilityState === 'hidden') {
            this.noteAway();
            return;
        }
        if (!this.hiddenAt) return;
        const row = this.firstAway;
        const left = new Date(this.hiddenAt);
        this.hiddenAt = 0;
        this.firstAway = null;
        const selector = this.read.inTbody ? '.kp-newpill__since' : ':scope > .kp-newpill__since';
        for (const old of this.host.querySelectorAll(selector)) old.remove();
        if (!row || !row.isConnected) return;
        row.before(this.divider(row, left));
    }

    /** The tab went away: remember when, and wait for the first row that comes. */
    noteAway() {
        this.hiddenAt = Date.now();
        this.firstAway = null;
    }

    /** @param {Element} row @param {Date} left */
    divider(row, left) {
        const el = this.host;
        const tag = row.tagName === 'TR' ? 'tr' : el.tagName === 'UL' || el.tagName === 'OL' ? 'li' : el.tagName === 'TBODY' ? 'tr' : 'div';
        const line = this.doc.createElement(tag);
        line.className = 'kp-newpill__since';
        line.setAttribute('role', 'separator');
        const time = `${String(left.getHours()).padStart(2, '0')}:${String(left.getMinutes()).padStart(2, '0')}`;
        if (tag === 'tr') {
            const cell = this.doc.createElement('td');
            cell.colSpan = DIVIDER_COLSPAN;
            cell.textContent = this.strings.newpillSince(time);
            line.append(cell);
        } else line.textContent = this.strings.newpillSince(time);
        return line;
    }
}
