// The shortcut board: the registry, the pending chord, the cap and the one key listener of a document.

import { CHORD_MS, DEFAULT_TYPING_SELECTOR, SHORTCUTS_LIVE_SHEET, SHORTCUT_EVENT, SHORTCUT_PENDING_EVENT, UNKNOWN_MS } from './constants.js';
import { available, inFieldsToo, scopeActive } from './entries.js';
import { ChordHint } from './hint.js';
import { ignoredKey, matches } from './keys.js';
import { renderSheet } from './sheet.js';

/** @typedef {import('../shortcuts.js').Entry} Entry */
/** @typedef {import('../shortcuts.js').EngineOptions} EngineOptions */
/** @typedef {{ candidates: Entry[], index: number, at: number, shown: string }} Pending */

export class ShortcutBoard {
    constructor() {
        /** @type {Required<Pick<EngineOptions, 'chordMs' | 'layoutGuard' | 'typingSelector' | 'unknownHint'>> & EngineOptions} */
        this.config = { chordMs: CHORD_MS, layoutGuard: 'warn', typingSelector: DEFAULT_TYPING_SELECTOR, unknownHint: false };
        /** @type {Set<Entry>} */
        this.entries = new Set();
        /** The next registration's rank, so keys keep the order they were registered in. */
        this.order = 0;
        /** @type {Pending | null} */
        this.pending = null;
        this.listening = false;
        this.queued = false;
        this.hint = new ChordHint(this.config);
        this.handler = (/** @type {KeyboardEvent} */ event) => this.onKey(event);
    }

    /** Change the engine's defaults for the whole page. @param {EngineOptions} next */
    configure(next) {
        Object.assign(this.config, next);
        this.hint.place();
        this.queueSheets();
    }

    /** @returns {boolean} */
    inDevelopment() {
        if (this.config.dev !== undefined) return this.config.dev;
        try {
            return /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname);
        } catch {
            return false;
        }
    }

    /** @param {string} message */
    warn(message) {
        if (this.config.onWarn) this.config.onWarn(message);
        else console.warn(`[kp-shortcuts] ${message}`);
    }

    /** @param {EventTarget | null} target */
    typing(target) {
        return target instanceof HTMLElement && (target.isContentEditable || target.matches(this.config.typingSelector));
    }

    /** The entries whose scope is on screen. */
    active() {
        return [...this.entries].filter(scopeActive);
    }

    /** The active entries whose first step this event presses. @param {KeyboardEvent} event */
    startedBy(event) {
        return this.active().filter((entry) => entry.steps[0] && matches(entry.steps[0], event));
    }

    /** The registered shortcuts, for a consumer's own listing. @returns {{ keys: string, what: string, group: string, scope: string, available: boolean }[]} */
    list() {
        return [...this.entries].map((entry) => ({
            keys: entry.shortcut.keys,
            what: entry.shortcut.what,
            group: entry.shortcut.group ?? 'Shortcuts',
            scope: typeof entry.scope === 'string' ? entry.scope : 'element',
            available: scopeActive(entry) && available(entry),
        }));
    }

    /** Tells the page whether a chord waits for its next key. */
    announcePending() {
        if (typeof document === 'undefined') return;
        const { pending } = this;
        document.dispatchEvent(
            new CustomEvent(SHORTCUT_PENDING_EVENT, { detail: { keys: pending?.shown ?? '', waiting: pending !== null, ms: pending ? this.config.chordMs : 0 } }),
        );
    }

    /**
     * Whether the engine would take this key: a chord waits for its next key, or a registered shortcut that is on screen
     * starts with it (a letter not while a person types in a field).
     * @param {KeyboardEvent} event
     * @returns {boolean}
     */
    claims(event) {
        if (!this.listening || event.isComposing) return false;
        const now = event.timeStamp || Date.now();
        if (this.pending && now - this.pending.at <= this.config.chordMs) return true;
        const hits = this.startedBy(event);
        if (hits.length === 0) return false;
        return !this.typing(event.target) || hits.every((entry) => inFieldsToo(entry, 0));
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const before = this.pending;
        this.handleKey(event);
        if (this.pending !== before) this.announcePending();
    }

    /** Drop the chord and its cap. */
    clearChord() {
        this.pending = null;
        this.hint.hide();
    }

    /** @param {KeyboardEvent} event */
    handleKey(event) {
        if (ignoredKey(event)) return;
        const now = event.timeStamp || Date.now();
        if (event.key === 'Escape' && this.pending) return this.clearChord();
        const live = this.pending && now - this.pending.at <= this.config.chordMs ? this.pending : null;
        const pool = live ? live.candidates : this.active();
        const index = live ? live.index : 0;
        // Scoped shortcuts first: a table's own key beats the page's.
        const hits = pool
            .filter((entry) => entry.steps[index] && matches(entry.steps[index], event))
            .sort((a, b) => Number(typeof a.scope === 'string') - Number(typeof b.scope === 'string') || a.order - b.order);
        const needsMod = hits.length > 0 && hits.every((e) => inFieldsToo(e, index));
        if (this.typing(event.target) && !needsMod) return this.clearChord();
        if (hits.length === 0) return live ? this.chordMissed(live, event, now) : undefined;
        const done = hits.filter((entry) => entry.steps.length === index + 1);
        const more = hits.filter((entry) => entry.steps.length > index + 1);
        if (more.length > 0 && done.length === 0) return this.waitForNext(more, index, live, event, now);
        this.clearChord();
        this.runFirst(done, event);
    }

    /** The chord's next key matched nothing: say so if asked, then let the key begin a shortcut of its own. @param {Pending} live @param {KeyboardEvent} event @param {number} now */
    chordMissed(live, event, now) {
        const typed = live.shown;
        this.pending = null;
        if (this.config.unknownHint) {
            this.hint.chord([...typed.split(' '), event.key], true);
            this.hint.arm(() => this.hint.hide(), UNKNOWN_MS);
        } else this.hint.hide();
        this.startFresh(event, now);
    }

    /** More than one step is left: show the cap and wait for the next key. @param {Entry[]} more @param {number} index @param {Pending | null} live @param {KeyboardEvent} event @param {number} now */
    waitForNext(more, index, live, event, now) {
        const pending = { candidates: more, index: index + 1, at: now, shown: [live?.shown, event.key].filter(Boolean).join(' ') };
        this.pending = pending;
        this.hint.chord(pending.shown.split(' '), false);
        this.hint.arm(() => {
            this.pending = null;
            this.hint.hide();
            this.announcePending();
        }, this.config.chordMs);
    }

    /** Run the first available shortcut of a finished chord. @param {Entry[]} done @param {KeyboardEvent} event */
    runFirst(done, event) {
        const first = done.find(available);
        if (!first) return;
        const result = first.shortcut.run(event);
        if (result !== false) event.preventDefault();
        document.dispatchEvent(new CustomEvent(SHORTCUT_EVENT, { bubbles: true, detail: { keys: first.shortcut.keys, what: first.shortcut.what } }));
    }

    /** @param {KeyboardEvent} event @param {number} now */
    startFresh(event, now) {
        this.pending = null;
        const pool = this.startedBy(event);
        if (pool.length === 0 || (this.typing(event.target) && !pool.every((entry) => inFieldsToo(entry, 0)))) return;
        const more = pool.filter((entry) => entry.steps.length > 1);
        if (more.length > 0 && pool.every((entry) => entry.steps.length > 1)) {
            this.pending = { candidates: more, index: 1, at: now, shown: event.key };
            return;
        }
        const first = pool.filter((entry) => entry.steps.length === 1).find(available);
        if (first) {
            const result = first.shortcut.run(event);
            if (result !== false) event.preventDefault();
        }
    }

    /** The key listener goes on with the first registration. */
    listen() {
        if (this.listening || typeof document === 'undefined') return;
        this.listening = true;
        document.addEventListener('keydown', this.handler);
    }

    /** ... and off with the last. */
    unlisten() {
        if (!this.listening || this.entries.size > 0) return;
        this.listening = false;
        document.removeEventListener('keydown', this.handler);
        this.clearChord();
    }

    /** Refill every live sheet once, after the current task. */
    queueSheets() {
        if (this.queued || typeof document === 'undefined') return;
        this.queued = true;
        queueMicrotask(() => {
            this.queued = false;
            for (const sheet of document.querySelectorAll(SHORTCUTS_LIVE_SHEET)) renderSheet(this, /** @type {HTMLElement} */ (sheet));
        });
    }
}
