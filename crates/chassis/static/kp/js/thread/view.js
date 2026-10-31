// A thread as drawn: its state on the instance, the loading skeleton under the busy card, the empty or failed note, the
// messages in their days, scrolling to the newest, and the folds measured against the width.

import { openBusyCard } from '../busy-card.js';
import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { messageItem } from './message.js';
import { atNewest, dayKey, dayLabel, groupMessages, make, threadOptions } from './options.js';

/** @typedef {import('../thread.js').ThreadSpec} ThreadSpec */
/** @typedef {ReturnType<typeof getStrings>} Strings */

/** The skeleton's lines while loading: an incoming bubble's and an outgoing one's widths. */
const WAIT_LINES = { in: ['100%', '92%', '58%'], out: ['100%', '64%'] };
/** The language a thread speaks in when the page names none. */
const LOCALE = 'en-GB';
/** The line height when the body's style gives none, as a share of its font size [em]; and that font size [px]. */
const LINE_EM = 1.5;
const FONT_PX = 16;

export class ThreadView extends Controller {
    /** @param {HTMLElement} el */
    constructor(el) {
        super(el);
        /** @type {ThreadSpec} */
        this.spec = {};
        /** The tallest the thread has been, so a state in its place keeps its room [px]. */
        this.height = 0;
        /** @type {import('../busy-card.js').BusyCard | null} */
        this.card = null;
        /** Whether anything was drawn yet: the first busy card arrives without its entrance. */
        this.drawn = false;
        /** A spec that waits for the busy card to close. @type {ThreadSpec | null} */
        this.pending = null;
        /** The keys the reader opened whole. @type {Set<string>} */
        this.expanded = new Set();
        /** @type {ResizeObserver | null} */
        this.watcher = null;
        /** The width the folds were last measured at [px]. */
        this.width = 0;
    }

    scrollToNewest(smooth = false) {
        const box = /** @type {HTMLElement | null} */ (this.host.querySelector('.kp-thread__scroll'));
        if (!box) return;
        const order = threadOptions(this.host, this.spec).order;
        const reduced = this.host.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
        box.scrollTo({ top: order === 'newest' ? 0 : box.scrollHeight, behavior: smooth && !reduced ? 'smooth' : 'auto' });
    }

    /** Draw now, or, while the busy card is up, once it has closed (a later spec wins). @param {ThreadSpec} spec */
    drawAfterCard(spec) {
        if (!this.card) return this.draw();
        const card = this.card;
        this.card = null;
        this.pending = spec;
        void card.close().then(() => {
            if (this.pending !== spec) return;
            this.pending = null;
            this.draw();
        });
    }

    /** Two skeleton bubbles under the theme's busy card, at the height the thread had. @param {ThreadSpec} spec */
    drawLoading(spec) {
        const el = this.host;
        const doc = el.ownerDocument;
        el.setAttribute('aria-busy', 'true');
        el.setAttribute('data-kp-state', 'loading');
        const scroll = make(doc, 'kp-thread__scroll', 'div');
        scroll.setAttribute('aria-hidden', 'true');
        const list = make(doc, 'kp-thread__list', 'ol');
        for (const dir of /** @type {const} */ (['in', 'out'])) list.append(this.waitItem(dir));
        scroll.append(list);
        const keep = this.card?.layer;
        for (const child of [...el.childNodes]) if (child !== keep) child.remove();
        el.prepend(scroll);
        if (this.height > 0) scroll.style.minBlockSize = `${this.height}px`;
        if (this.card) return this.card.place();
        this.card = openBusyCard(el, { words: spec.loadingWords ?? getStrings().threadLoading, area: () => [scroll], className: 'kp-thread__busy', arrive: this.drawn });
        this.drawn = true;
    }

    /** @param {'in' | 'out'} dir */
    waitItem(dir) {
        const doc = this.host.ownerDocument;
        const item = make(doc, 'kp-thread__item kp-thread__item--wait', 'li');
        item.setAttribute('data-kp-dir', dir);
        const bubble = make(doc, 'kp-thread__bubble', 'div');
        for (const width of WAIT_LINES[dir]) {
            const line = make(doc, 'kp-thread__wait-line kp-skeleton kp-skeleton--block');
            line.style.inlineSize = width;
            bubble.append(line);
        }
        if (dir === 'in') item.append(make(doc, 'kp-idmark kp-idmark--sm kp-idmark--round kp-skeleton kp-skeleton--block'));
        item.append(bubble);
        return item;
    }

    draw() {
        const el = this.host;
        const state = this.spec.state ?? 'ready';
        el.removeAttribute('aria-busy');
        this.drawn = true;
        const refocus = el.querySelector(':scope > .kp-thread__note')?.contains(el.ownerDocument.activeElement) ?? false;
        if (state === 'error' || state === 'empty' || (this.spec.messages ?? []).length === 0) return this.drawNote(state === 'error', refocus);
        this.drawMessages();
    }

    /** The empty or failed note, at the height the thread had. @param {boolean} failed @param {boolean} refocus */
    drawNote(failed, refocus) {
        const el = this.host;
        const doc = el.ownerDocument;
        const strings = getStrings();
        const spec = this.spec;
        el.setAttribute('data-kp-state', failed ? 'error' : 'empty');
        const was = el.querySelector(':scope > :is(.kp-thread__scroll, .kp-thread__note)')?.getBoundingClientRect().height ?? 0;
        this.height = Math.max(was, this.height);
        const note = make(doc, 'kp-empty kp-thread__note', 'div');
        if (this.height > 0) note.style.minBlockSize = `${this.height}px`;
        if (failed) note.setAttribute('data-kp-tone', 'error');
        note.setAttribute('role', failed ? 'alert' : 'status');
        const title = make(doc, 'kp-empty__title kp-thread__note-title', 'p');
        title.textContent = failed ? (spec.message ?? strings.threadError) : (spec.emptyTitle ?? strings.threadEmptyTitle);
        note.append(title);
        if (!failed && (spec.emptyText ?? strings.threadEmptyText)) {
            const text = make(doc, 'kp-empty__body kp-thread__note-text', 'p');
            text.textContent = spec.emptyText ?? strings.threadEmptyText;
            note.append(text);
        }
        if (failed && spec.retry !== false) {
            const retry = make(doc, 'kp-button kp-thread__note-button', 'button');
            retry.setAttribute('type', 'button');
            retry.setAttribute('data-kp-thread-retry', '');
            retry.textContent = strings.threadRetry;
            note.append(retry);
        } else if (!failed && spec.add !== false) {
            const add = make(doc, 'kp-button kp-button--primary kp-thread__note-button', 'button');
            add.setAttribute('type', 'button');
            add.setAttribute('data-kp-thread-add', '');
            add.textContent = strings.threadAdd;
            note.append(add);
        }
        this.watcher?.disconnect();
        el.replaceChildren(note);
        if (refocus) {
            el.tabIndex = -1;
            el.focus({ preventScroll: true });
        }
    }

    /** The messages in their days, the scroll kept where the reader left it unless they were at the newest. */
    drawMessages() {
        const el = this.host;
        const doc = el.ownerDocument;
        const strings = getStrings();
        const spec = this.spec;
        el.setAttribute('data-kp-state', 'ready');
        const options = threadOptions(el, spec);
        // The look is the root's, so the CSS keys off one place.
        if (spec.bubble && el.getAttribute('data-kp-thread-bubble') !== spec.bubble) el.setAttribute('data-kp-thread-bubble', spec.bubble);
        const locale = /** @type {HTMLElement | null} */ (el.closest('[lang]'))?.lang || LOCALE;
        const oldBox = /** @type {HTMLElement | null} */ (el.querySelector('.kp-thread__scroll'));
        const stick = !oldBox || atNewest(oldBox, options.order);
        const keptTop = oldBox?.scrollTop ?? 0;
        const scroll = make(doc, 'kp-thread__scroll', 'div');
        scroll.setAttribute('tabindex', '0');
        scroll.setAttribute('role', 'region');
        scroll.setAttribute('aria-label', spec.label ?? el.getAttribute('aria-label') ?? strings.threadLabel);
        scroll.append(this.listOf(options, locale));
        const jump = make(doc, 'kp-button kp-button--sm kp-thread__jump', 'button');
        jump.setAttribute('type', 'button');
        jump.hidden = true;
        jump.textContent = strings.threadJump;
        el.replaceChildren(scroll, jump);
        scroll.addEventListener('scroll', () => {
            jump.hidden = atNewest(scroll, options.order);
        });
        if (stick) this.scrollToNewest(false);
        else scroll.scrollTop = keptTop;
        jump.hidden = atNewest(scroll, options.order);
        this.fitFolds();
        this.watchWidth();
        this.height = Math.max(this.height, el.getBoundingClientRect().height);
        if (stick) {
            this.scrollToNewest(false);
            jump.hidden = atNewest(scroll, options.order);
        }
    }

    /** The list: a divider per day (when asked), then each run of messages. @param {ReturnType<typeof threadOptions>} options @param {string} locale */
    listOf(options, locale) {
        const doc = this.host.ownerDocument;
        const sorted = [...(this.spec.messages ?? [])].sort((a, b) => a.at - b.at);
        const newestKey = [...sorted].reverse().find((m) => m.dir !== 'system')?.key;
        const groups = groupMessages(sorted, options.group);
        if (options.order === 'newest') groups.reverse();
        const list = make(doc, 'kp-thread__list', 'ol');
        let previousDay = '';
        for (const group of groups) {
            const day = dayKey(group[0].at);
            if (options.days && day !== previousDay) {
                const divider = make(doc, 'kp-thread__day', 'li');
                divider.setAttribute('role', 'separator');
                const text = make(doc, 'kp-thread__day-text', 'time');
                text.setAttribute('datetime', new Date(group[0].at).toISOString());
                text.textContent = dayLabel(group[0].at, locale);
                divider.append(text);
                list.append(divider);
            }
            previousDay = day;
            const members = options.order === 'newest' ? [...group].reverse() : group;
            members.forEach((message, index) => list.append(messageItem(doc, message, { options, first: index === 0, newestKey, expanded: this.expanded, locale, spec: this.spec })));
        }
        return list;
    }

    /** Wrapping changes with the width: the lines a message has, and so its fold, are measured again. */
    watchWidth() {
        const el = this.host;
        this.watcher?.disconnect();
        const View = el.ownerDocument.defaultView;
        if (!View?.ResizeObserver) return;
        this.width = Math.round(el.clientWidth);
        this.watcher = new View.ResizeObserver(() => {
            const width = Math.round(el.clientWidth);
            if (width === this.width) return;
            this.width = width;
            this.fitFolds();
        });
        this.watcher.observe(el);
    }

    /** Measure every foldable body and show or hide its Show all: a message with no more lines than its limit is shown whole. */
    fitFolds() {
        for (const item of /** @type {NodeListOf<HTMLElement>} */ (this.host.querySelectorAll('[data-kp-message]'))) {
            const key = item.getAttribute('data-kp-message');
            if (key && item.querySelector('.kp-thread__text[data-kp-fold-lines]')) this.applyFold(item, key);
        }
    }

    /** @param {HTMLElement} item @param {string} key */
    applyFold(item, key) {
        const body = /** @type {HTMLElement | null} */ (item.querySelector('.kp-thread__text[data-kp-fold-lines]'));
        const button = /** @type {HTMLElement | null} */ (item.querySelector('.kp-thread__fold'));
        if (!body || !button) return;
        const limit = Number(body.getAttribute('data-kp-fold-lines'));
        const open = this.expanded.has(key);
        // Measure whole: the clamp is lifted for the reading.
        const before = body.getAttribute('data-kp-fold');
        body.setAttribute('data-kp-fold', 'open');
        const style = body.ownerDocument.defaultView?.getComputedStyle(body);
        const lineHeight = parseFloat(style?.lineHeight ?? '') || (parseFloat(style?.fontSize ?? '') || FONT_PX) * LINE_EM;
        const lines = Math.max(1, Math.round(body.scrollHeight / lineHeight));
        body.setAttribute('data-kp-fold', before ?? 'folded');
        if (lines <= limit) {
            body.removeAttribute('data-kp-fold');
            button.hidden = true;
            return;
        }
        body.setAttribute('data-kp-fold', open ? 'open' : 'folded');
        button.hidden = false;
        button.textContent = open ? getStrings().threadShowLess : getStrings().threadShowAll(lines);
        button.setAttribute('aria-expanded', String(open));
    }
}
