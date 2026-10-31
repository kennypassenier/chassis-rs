// One status list: its rows synced, its voice and today order, the presses (Retry, Resume, Pause), the rows' later
// `data-state` changes, and for a calm list its keys and its options read live.

import { Controller } from '../controller.js';
import { registerShortcuts } from '../shortcuts.js';
import { getStrings } from '../strings.js';
import { settleToday, turn } from './list.js';
import { STATUS_ID_ATTRIBUTE, STATUS_RETRY_EVENT, isCalm } from './state.js';
import { syncItem } from './sync.js';
import { regionOf } from './voice.js';

/** A calm list's options; a change is drawn at once: the since words, Resume, Pause, the order and the fold. */
const CALM_OPTIONS = ['data-kp-today-since', 'data-kp-today-resume', 'data-kp-today-pause', 'data-kp-today-order', 'data-kp-today-paused', 'data-kp-today-fold-after', 'data-kp-today-mark'];
/** The rows the keys walk: every row but the fold. */
const ROWS = ':scope > .kp-statusrow:not(.kp-statusrow--fold)';

export class StatusList extends Controller {
    connect() {
        const list = this.host;
        for (const item of list.querySelectorAll(':scope > .kp-statusrow')) syncItem(item);
        regionOf(list);
        settleToday(list);
        this.listen(list, 'click', (event) => this.press(event));
        if (isCalm(list)) {
            this.wireCalmKeys();
            this.observe(
                new MutationObserver(() => {
                    for (const item of list.querySelectorAll(ROWS)) syncItem(item);
                    settleToday(list);
                }),
            ).observe(list, { attributes: true, attributeFilter: CALM_OPTIONS });
        }
        // A row's later `data-state` change is synced and said.
        if (typeof MutationObserver !== 'undefined')
            this.observe(
                new MutationObserver((records) => {
                    for (const record of records) {
                        const target = /** @type {Element} */ (record.target);
                        if (target.classList.contains('kp-statusrow')) syncItem(target, { announce: true });
                    }
                }),
            ).observe(list, { attributes: true, attributeFilter: ['data-state'], subtree: true });
    }

    /** Resume or Pause on a calm row; Retry on a failed one. @param {Event} event */
    press(event) {
        const list = this.host;
        const target = event.target instanceof Element ? event.target : null;
        const resume = target?.closest('[data-kp-status-resume-button]');
        const pause = target?.closest('[data-kp-status-pause-button]');
        const calmItem = (resume ?? pause)?.closest('.kp-statusrow');
        if (calmItem && list.contains(calmItem)) return turn(list, calmItem, resume ? 'resume' : 'pause');
        const button = target?.closest('[data-kp-status-retry-button]');
        const item = button?.closest('.kp-statusrow');
        if (!button || !item || !list.contains(item)) return;
        list.dispatchEvent(new CustomEvent(STATUS_RETRY_EVENT, { bubbles: true, detail: { item, id: item.getAttribute(STATUS_ID_ATTRIBUTE) } }));
    }

    rows() {
        return /** @type {HTMLElement[]} */ ([...this.host.querySelectorAll(ROWS)]).filter((row) => !row.hidden);
    }

    /** @param {HTMLElement | undefined} stop */
    rove(stop) {
        for (const row of this.rows()) row.tabIndex = row === stop ? 0 : -1;
    }

    focusedRow() {
        return this.rows().find((r) => r.contains(document.activeElement));
    }

    /**
     * The keys of a calm list: one tab stop on the rows, ArrowUp and ArrowDown between them, `r` resumes the focused paused row
     * (on the `?` sheet; no digit keys, which need Shift on AZERTY).
     */
    wireCalmKeys() {
        const list = this.host;
        this.rove(this.rows()[0]);
        this.listen(list, 'focusin', (event) => {
            const row = event.target instanceof Element ? event.target.closest('.kp-statusrow') : null;
            if (row instanceof HTMLElement && this.rows().includes(row)) this.rove(row);
        });
        this.listen(list, 'keydown', (event) => this.walk(/** @type {KeyboardEvent} */ (event)));
        const focusedPaused = () => {
            const row = this.focusedRow();
            return row !== undefined && row.getAttribute('data-state') === 'paused' && list.getAttribute('data-kp-today-resume') !== 'off';
        };
        const resume = () => {
            const row = this.focusedRow();
            const button = row?.querySelector('[data-kp-status-resume-button]');
            if (row && button instanceof HTMLButtonElement && !button.disabled) turn(list, row, 'resume');
        };
        this.own(registerShortcuts(list, [{ keys: 'r', what: getStrings().statusResume, group: 'Today', when: focusedPaused, run: resume }]));
    }

    /** @param {KeyboardEvent} event */
    walk(event) {
        if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || event.altKey || event.ctrlKey || event.metaKey) return;
        const all = this.rows();
        const at = all.findIndex((row) => row.contains(document.activeElement));
        if (at < 0) return;
        event.preventDefault();
        all[Math.max(0, Math.min(all.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    }
}
