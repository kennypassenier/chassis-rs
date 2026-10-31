// The `list` and `fold` layouts: one alert holding every problem as a list, the tone of the worst, with "Show the other N" when it folds.

import { getStrings } from '../strings.js';
import { ProblemsEach } from './each.js';
import { paintAction, paintParts } from './parts.js';
import { DEFAULT_OPEN_ROWS, FLAVOUR, alertBody, alertIcon, setText, severityOf } from './values.js';

/** @typedef {import('../problems.js').Problem} Problem */

export class ProblemsSummary extends ProblemsEach {
    /** The one alert, made when missing or kept; its tone is the worst problem's. @param {Problem[]} list @returns {{ summary: HTMLElement, fresh: boolean }} */
    summaryShell(list) {
        const doc = this.host.ownerDocument;
        let summary = /** @type {HTMLElement | null} */ (this.host.querySelector(':scope > .kp-problem--list'));
        const fresh = !summary;
        if (!summary) {
            summary = doc.createElement('div');
            summary.setAttribute('role', 'alert');
            summary.setAttribute('data-kp-key', '*');
        } else if (summary.getAttribute('role') !== 'status') summary.setAttribute('role', 'status');
        const worst = severityOf(/** @type {Problem} */ (list[0]));
        summary.className = `kp-alert kp-alert--${FLAVOUR[worst]} kp-problem kp-problem--list`;
        summary.setAttribute('data-kp-severity', worst);
        return { summary, fresh };
    }

    /** The heading and the list inside the body. @param {HTMLElement} body @param {number} count @returns {HTMLElement} the list */
    summaryList(body, count) {
        const doc = this.host.ownerDocument;
        let heading = body.querySelector(':scope > .kp-alert__summary');
        if (!heading) {
            heading = doc.createElement('p');
            heading.className = 'kp-alert__summary';
            body.prepend(heading);
        }
        setText(heading, getStrings().problemListLabel(count));
        let ul = /** @type {HTMLElement | null} */ (body.querySelector(':scope > .kp-alert__list'));
        if (!ul) {
            ul = doc.createElement('ul');
            ul.className = 'kp-alert__list';
            heading.after(ul);
        }
        return ul;
    }

    /** The rows by key; the rows beyond `open` are hidden unless the alert is expanded. @param {HTMLElement} ul @param {Problem[]} list @param {number} open @param {boolean} expanded @param {string} remedyLabel */
    summaryRows(ul, list, open, expanded, remedyLabel) {
        const doc = this.host.ownerDocument;
        /** @type {Map<string, HTMLElement>} */
        const rows = new Map();
        for (const li of /** @type {HTMLElement[]} */ ([...ul.children])) rows.set(li.getAttribute('data-kp-key') ?? '', li);
        const lis = list.map((p, at) => {
            let li = rows.get(p.key);
            if (!li) {
                li = doc.createElement('li');
                li.className = 'kp-alert__item';
                li.setAttribute('data-kp-key', p.key);
            }
            li.setAttribute('data-kp-severity', severityOf(p));
            paintParts(li, p, remedyLabel);
            paintAction(li, p);
            li.hidden = at >= open && !expanded;
            return li;
        });
        for (const [key, li] of rows) if (!list.some((p) => p.key === key)) li.remove();
        lis.forEach((li, at) => {
            if (ul.children[at] !== li) ul.insertBefore(li, ul.children[at] ?? null);
        });
    }

    /** The "Show the other N" button of a folded alert, made when it is needed and taken away when it is not. @param {HTMLElement} summary @param {HTMLElement} body @param {Problem[]} list @param {string} mode @param {number} open @param {boolean} expanded */
    summaryMore(summary, body, list, mode, open, expanded) {
        const s = getStrings();
        let more = /** @type {HTMLButtonElement | null} */ (body.querySelector(':scope > .kp-problems__more'));
        if (mode !== 'fold' || list.length <= open) {
            more?.remove();
            return;
        }
        if (!more) {
            more = summary.ownerDocument.createElement('button');
            more.type = 'button';
            more.className = 'kp-button kp-button--secondary kp-button--sm kp-problems__more';
            more.addEventListener('click', () => this.toggleExpanded(summary));
            body.append(more);
        }
        more.setAttribute('aria-expanded', String(expanded));
        setText(more, expanded ? s.problemShowFewer : s.problemShowOthers(list.length - open));
    }

    /** Show the rest of a folded alert, or fold it again. @param {HTMLElement} target the one alert */
    toggleExpanded(target) {
        const next = target.getAttribute('data-kp-expanded') !== 'true';
        target.setAttribute('data-kp-expanded', String(next));
        const keep = Number.parseInt(target.getAttribute('data-kp-open') ?? String(DEFAULT_OPEN_ROWS), 10);
        const rowsNow = /** @type {HTMLElement[]} */ ([...target.querySelectorAll('.kp-alert__list > li')]);
        rowsNow.forEach((li, at) => {
            li.hidden = at >= keep && !next;
        });
        const moreNow = /** @type {HTMLButtonElement} */ (target.querySelector('.kp-problems__more'));
        moreNow.setAttribute('aria-expanded', String(next));
        moreNow.textContent = next ? getStrings().problemShowFewer : getStrings().problemShowOthers(rowsNow.length - keep);
    }

    /** One alert holding the problems as a list. @param {Problem[]} list @param {'list' | 'fold'} mode @param {number} foldFrom @param {string} remedyLabel */
    paintSummary(list, mode, foldFrom, remedyLabel) {
        const host = this.host;
        for (const el of /** @type {HTMLElement[]} */ ([...host.children]))
            if (el.classList.contains('kp-problem') && !el.classList.contains('kp-problem--list')) el.remove();
        if (list.length === 0) {
            host.querySelector(':scope > .kp-problem--list')?.remove();
            return;
        }
        const { summary, fresh } = this.summaryShell(list);
        const body = alertBody(summary, alertIcon(summary, severityOf(/** @type {Problem} */ (list[0]))));
        const ul = this.summaryList(body, list.length);
        const open = mode === 'fold' ? foldFrom - 1 : list.length;
        summary.setAttribute('data-kp-open', String(open));
        const expanded = summary.getAttribute('data-kp-expanded') === 'true';
        this.summaryRows(ul, list, open, expanded, remedyLabel);
        this.summaryMore(summary, body, list, mode, open, expanded);
        if (fresh) host.prepend(summary);
    }
}
