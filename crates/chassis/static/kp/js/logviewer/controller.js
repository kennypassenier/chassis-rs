// One log viewer: its parts, its search field, its option controls, its tools, its follow state and its search key.
import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { FOLLOW_EVENT, attachNewPills, newPill } from '../newpill.js';
import { attachSegmented } from '../segmented.js';
import { attachDisabledReasons } from '../reason.js';
import { registerShortcuts } from '../shortcuts.js';
import { runFlashButton } from '../flash.js';
import { logViewerText, stepLogMatch, syncOptions } from './api.js';
import { LOGVIEWER_RETRY_EVENT } from './constants.js';
import { attr, stateOf } from './model.js';
import { ensureParts } from './parts.js';
import { logOf, queryOf, say } from './reads.js';
import { matchWords } from './rows.js';

/** How long (ms) a download's object URL lives after its click. */
const DOWNLOAD_URL_MS = 1000;
/** The viewer attributes that redraw it when they change: every option is live. */
const LIVE = ['data-kp-state', 'data-kp-log-hint', ...['max', 'wrap', 'time', 'level', 'search', 'search-only', 'tools'].map((n) => `data-kp-log-${n}`)];

/** One viewer: its state is the registry entry every part reads; its parts are found once ensureParts() built them. */
export class LogViewerControl extends Controller {
    connect() {
        const viewer = this.host;
        ensureParts(viewer);
        const log = logOf(viewer);
        const stage = /** @type {HTMLElement} */ (viewer.querySelector('.kp-logviewer__stage'));
        const bar = /** @type {HTMLElement} */ (viewer.querySelector('.kp-logviewer__bar'));
        const find = /** @type {HTMLInputElement} */ (bar.querySelector('.kp-logviewer__find'));
        this.own(attachDisabledReasons(bar));
        this.own(attachSegmented(viewer));
        this.own(attachNewPills(stage));
        if (attr(viewer, 'follow', 'live') === 'paused') newPill(log)?.pause();
        stateOf(viewer).sig = '';
        syncOptions(viewer);
        this.own(this.searchKey(find, bar));
        this.listen(find, 'input', () => this.onInput(find));
        this.listen(find, 'keydown', (event) => this.onFindKey(/** @type {KeyboardEvent} */ (event), find));
        this.listen(viewer, 'change', (event) => this.onChange(event));
        this.listen(viewer, 'kp-segmented-change', (event) => this.onSegment(event));
        this.listen(viewer, 'click', (event) => this.onClick(event, find));
        this.observe(new MutationObserver(() => syncOptions(viewer))).observe(viewer, { attributes: true, attributeFilter: LIVE });
        this.follow(log);
    }

    /** The key that jumps to the search field from anywhere, through the engine; none when `data-kp-log-focus-key` is off. @param {HTMLInputElement} find @param {HTMLElement} bar */
    searchKey(find, bar) {
        const s = getStrings();
        const focusKey = attr(this.host, 'focus-key', '/');
        if (focusKey === 'false' || focusKey === '') return () => undefined;
        const key = { keys: focusKey, what: s.logviewerKeySearch, group: s.logviewerKeyGroup, when: () => !find.disabled && !find.hidden && !bar.hidden, reason: s.logviewerNothing, run: () => find.focus() };
        return registerShortcuts(this.host, [key], { layoutGuard: 'off' });
    }

    /**
     * The follow state on the root, for the page and for the stylesheet. Rows change height after they are drawn (a font that
     * arrives late, the width of the window): a reader at the newest line stays at it.
     * @param {HTMLElement} log
     */
    follow(log) {
        const viewer = this.host;
        const stick = () => {
            if (newPill(log)?.following()) log.scrollTop = log.scrollHeight;
        };
        if (typeof ResizeObserver === 'function') this.observe(new ResizeObserver(stick)).observe(log);
        void document.fonts?.ready.then(() => !this.destroyed && stick());
        const onFollow = () => viewer.setAttribute('data-kp-log-following', String(newPill(log)?.following() ?? true));
        this.listen(log, FOLLOW_EVENT, onFollow);
        onFollow();
    }

    /** @param {HTMLInputElement} find */
    onInput(find) {
        const viewer = this.host;
        if (find.value.trim() === '') viewer.removeAttribute('data-kp-log-search');
        else viewer.setAttribute('data-kp-log-search', find.value);
        syncOptions(viewer);
        if (stateOf(viewer).matches.length > 0) say(viewer, matchWords(viewer));
        else if (queryOf(viewer) !== '') say(viewer, getStrings().logviewerSearchNone);
    }

    /** Enter steps to the next match (Shift: the one before); Esc empties the field. @param {KeyboardEvent} event @param {HTMLInputElement} find */
    onFindKey(event, find) {
        if (event.key === 'Enter') {
            event.preventDefault();
            stepLogMatch(this.host, event.shiftKey ? -1 : 1);
        } else if (event.key === 'Escape' && find.value !== '') {
            event.preventDefault();
            find.value = '';
            this.onInput(find);
        }
    }

    /** @param {Event} event */
    onChange(event) {
        const target = /** @type {Element} */ (event.target);
        if (!target.closest('.kp-logviewer__level')) return;
        const value = /** @type {HTMLSelectElement} */ (target).value;
        if (value === 'debug') this.host.removeAttribute('data-kp-log-level');
        else this.host.setAttribute('data-kp-log-level', value);
        syncOptions(this.host);
    }

    /** @param {Event} event */
    onSegment(event) {
        const detail = /** @type {CustomEvent} */ (event).detail;
        const group = /** @type {Element} */ (event.target).closest('[data-kp-logviewer-time]');
        const value = detail?.value ?? detail?.item?.getAttribute('data-value');
        if (!group || !value) return;
        this.host.setAttribute('data-kp-log-time', value);
        syncOptions(this.host);
    }

    /** The bar's tools: step, only matches, wrap, clear, retry, copy and download. @param {Event} event @param {HTMLInputElement} find */
    onClick(event, find) {
        const viewer = this.host;
        const t = event.target instanceof Element ? event.target : null;
        if (!t) return;
        const step = t.closest('[data-kp-logviewer-step]');
        const copy = /** @type {HTMLButtonElement | null} */ (t.closest('[data-kp-logviewer-copy]'));
        if (step) stepLogMatch(viewer, Number(step.getAttribute('data-kp-logviewer-step')) < 0 ? -1 : 1);
        else if (t.closest('[data-kp-logviewer-only]')) {
            viewer.setAttribute('data-kp-log-search-only', attr(viewer, 'search-only', 'off') === 'on' ? 'off' : 'on');
            syncOptions(viewer);
        } else if (t.closest('[data-kp-logviewer-wrap]')) {
            viewer.setAttribute('data-kp-log-wrap', attr(viewer, 'wrap', 'on') === 'off' ? 'on' : 'off');
            syncOptions(viewer);
        } else if (t.closest('[data-kp-logviewer-clear]')) {
            viewer.removeAttribute('data-kp-log-search');
            viewer.removeAttribute('data-kp-log-level');
            find.value = '';
            syncOptions(viewer);
        } else if (t.closest('[data-kp-logviewer-retry]')) viewer.dispatchEvent(new CustomEvent(LOGVIEWER_RETRY_EVENT, { bubbles: true }));
        else if (copy) this.copy(copy);
        else if (t.closest('[data-kp-logviewer-download]')) this.download();
    }

    /** Copy the shown lines; the button flashes what happened. @param {HTMLButtonElement} copy */
    copy(copy) {
        const s = getStrings();
        void runFlashButton(copy, async () => {
            try {
                await navigator.clipboard.writeText(logViewerText(this.host));
                return s.logviewerCopied;
            } catch {
                // The refusal is said on the button itself.
                return { error: s.logviewerNotCopied, word: s.logviewerNotCopied };
            }
        });
    }

    /** Save the shown lines as `<data-kp-log-filename>.txt`. */
    download() {
        const blob = new Blob([`${logViewerText(this.host)}\n`], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${attr(this.host, 'filename', 'log')}.txt`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_MS);
    }
}
