// A conversation in bubbles [kpadopt5-people; JobTracker `Correspondence.jsx`
// Bubble and its `.th` rules, the correspondence of an application dossier].
//
//   <div class="kp-thread" data-kp-thread></div>
//
//   setThread(el, {
//       messages: [
//           { key: 'm1', dir: 'in', sender: 'Acme HR', at: 1760350000000, text: 'Thanks for applying…' },
//           { key: 'm2', dir: 'out', at: 1760353600000, text: 'Happy to talk on Thursday.', attachments: [{ name: 'cv.pdf', size: 184000, href: '/cv.pdf' }] },
//           { key: 's1', dir: 'system', at: 1760360000000, text: 'Status changed to Interview' },
//       ],
//   });
//
// Messages are bubbles, `in` on the start side, `out` on the end side and
// `system` as a centred line ("Status changed to Interview"). Each bubble is an
// `article` called "From Acme HR, 13/10/2026 14:02". Times are dd/mm/yyyy HH:mm
// in Europe/Brussels (rule 52); the exact moment is in each bubble's header and
// a day divider ("Monday 13/10/2026") sits between days.
//
// Options (each a JS option of setThread() and an attribute of the root; the
// option wins):
//   order    `data-kp-thread-order`   `oldest` (default, like mail) | `newest`
//   fold     `data-kp-thread-fold`    how a long message is shown [Kenny, 2026-10-17:
//            "Alleen de nieuwste volledig, maar moet configureerbaar zijn"]:
//            `newest` (default) the newest message is shown whole, older ones show
//            their first `foldLines` lines with "Show all N lines"; `full` every
//            message whole; a number N folds every message longer than N lines;
//   foldLines `data-kp-thread-fold-lines`  lines an older message keeps (default 3)
//   group    `data-kp-thread-group`   minutes (default 5): consecutive messages of
//            one side from one sender within it share one header
//   days     `data-kp-thread-days`    day dividers, on; `off` leaves them out
//   avatar   `data-kp-thread-avatar`  `in` (default) | `both` | `none`: the sender's
//            mark (js/idmark.js) beside the bubble
//   bubble   `data-kp-thread-bubble`  how the two sides are told apart: `tinted` (default,
//            your own bubbles on a wash of the primary colour), `plain` (both sides on
//            the card plate, your side only at the end of the row, as JobTracker draws
//            it) or `filled` (your bubbles in the primary colour)
//   actions  per-message buttons `{ id, label }` (JobTracker's Rename): fires
//            `kp-thread-action` `{ key, id }`
//
// A message may carry `attachments` (tags with the name and the size in the
// locale's units), `status` `sending` (faded, "Sending…") or `failed` ("Not
// sent: why" and Retry, `kp-thread-retry` `{ key }`). Every bubble has a Copy
// text button. A thread longer than its box scrolls inside it; scrolled away
// from the newest message a "Jump to newest" button appears. Long words and
// addresses wrap anywhere.
//
// States: `loading` keeps the box and shows one waiting bubble on each side
// under the busy card (js/busy-card.js); `empty` ("No messages yet" and an Add
// button, `kp-thread-add`) and `error` (what failed and Retry,
// `kp-thread-retry` without a key) are the package's empty state filling the
// box, centred. Every word is in js/strings.js.

import { getStrings } from './strings.js';
import { agoMoment } from './freshness.js';
import { formatBytes } from './locale.js';
import { setIdmark } from './idmark.js';
import { openBusyCard } from './busy-card.js';

/** A thread the page fills with setThread(). */
export const THREAD = '[data-kp-thread]';
/** Fired on the root when Retry (a failed list, or a message that was not sent) is pressed: `{ key? }`. */
export const THREAD_RETRY_EVENT = 'kp-thread-retry';
/** Fired on the root when the Add button of an empty thread is pressed. */
export const THREAD_ADD_EVENT = 'kp-thread-add';
/** Fired on the root when a message's own action is pressed: `{ key, id }`. */
export const THREAD_ACTION_EVENT = 'kp-thread-action';
/** Fired on the root when a message is folded or shown whole: `{ key, expanded }`. */
export const THREAD_FOLD_EVENT = 'kp-thread-fold';
/** The zone every time is written in. */
export const THREAD_TIME_ZONE = 'Europe/Brussels';

/**
 * @typedef {object} ThreadAttachment
 * @property {string} name
 * @property {number} [size] bytes
 * @property {string} [href]
 * @typedef {object} ThreadMessage
 * @property {string} key
 * @property {'in' | 'out' | 'system'} dir
 * @property {number} at ms
 * @property {string} text
 * @property {string} [sender] who wrote it (the mark and the header); `out` says "You" without it
 * @property {string} [src] the sender's photo
 * @property {ThreadAttachment[]} [attachments]
 * @property {'sent' | 'sending' | 'failed'} [status]
 * @property {string} [error] why a failed message was not sent
 * @typedef {object} ThreadSpec
 * @property {ThreadMessage[]} [messages]
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]
 * @property {string} [message] the sentence of a failed thread
 * @property {boolean} [retry] false leaves Retry out of a failed thread
 * @property {string} [emptyTitle]
 * @property {string} [emptyText]
 * @property {boolean} [add] false leaves the Add button out of the empty thread
 * @property {'oldest' | 'newest'} [order]
 * @property {'newest' | 'full' | number} [fold]
 * @property {number} [foldLines]
 * @property {number} [group] minutes
 * @property {boolean} [days]
 * @property {'in' | 'both' | 'none'} [avatar]
 * @property {'tinted' | 'plain' | 'filled'} [bubble]
 * @property {{ id: string, label: string }[]} [actions]
 * @property {string} [loadingWords]
 * @property {string} [label] the thread's name for a screen reader
 */

/**
 * @typedef {object} Memory
 * @property {ThreadSpec} spec
 * @property {number} height
 * @property {import('./busy-card.js').BusyCard | null} card
 * @property {boolean} drawn
 * @property {ThreadSpec | null} pending
 * @property {boolean} wired
 * @property {Set<string>} expanded keys shown whole by the reader
 * @property {ResizeObserver | null} watcher
 * @property {number} width the width the folds were last measured at
 */

/** @type {WeakMap<HTMLElement, Memory>} */
const MEMORY = new WeakMap();

/** @param {Document} doc @param {string} className @param {string} [tag] */
const make = (doc, className, tag = 'span') => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
};

/**
 * The options as the page wrote them: the spec first, then the attribute, then the default.
 * @param {HTMLElement} el @param {ThreadSpec} spec
 */
export function threadOptions(el, spec) {
    const attr = (/** @type {string} */ name) => el.getAttribute(`data-kp-thread-${name}`);
    const order = spec.order ?? attr('order');
    const foldRaw = spec.fold ?? attr('fold');
    /** @type {'newest' | 'full' | number} */
    let fold = 'newest';
    if (foldRaw === 'full' || foldRaw === 'none') fold = 'full';
    else if (typeof foldRaw === 'number' && foldRaw > 0) fold = Math.floor(foldRaw);
    else if (typeof foldRaw === 'string' && /^\d+$/.test(foldRaw) && Number(foldRaw) > 0) fold = Number(foldRaw);
    const lines = Number(spec.foldLines ?? attr('fold-lines'));
    const group = Number(spec.group ?? attr('group'));
    const avatar = spec.avatar ?? attr('avatar');
    const bubble = spec.bubble ?? attr('bubble');
    return {
        bubble: /** @type {'tinted' | 'plain' | 'filled'} */ (bubble === 'plain' || bubble === 'filled' ? bubble : 'tinted'),
        order: /** @type {'oldest' | 'newest'} */ (order === 'newest' ? 'newest' : 'oldest'),
        fold,
        foldLines: Number.isFinite(lines) && lines > 0 ? Math.floor(lines) : 3,
        group: attr('group') === null && spec.group === undefined ? 5 : Number.isFinite(group) && group >= 0 ? group : 5,
        days: spec.days ?? attr('days') !== 'off',
        avatar: /** @type {'in' | 'both' | 'none'} */ (avatar === 'both' || avatar === 'none' ? avatar : 'in'),
    };
}

/** The Brussels calendar day of a moment, as a sortable key. @param {number} ms */
const dayKey = (ms) => agoMoment(ms, THREAD_TIME_ZONE).slice(0, 10).split('/').reverse().join('-');

/**
 * "Monday 13/10/2026".
 * @param {number} ms @param {string} locale
 */
export function dayLabel(ms, locale) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: THREAD_TIME_ZONE }).format(ms);
    return getStrings().threadDay(weekday, agoMoment(ms, THREAD_TIME_ZONE).slice(0, 10));
}

/**
 * Split messages (oldest first) into runs that share one header: the same
 * side and sender, the same day, each within `minutes` of the one before.
 * System lines stand alone.
 * @param {readonly ThreadMessage[]} messages @param {number} minutes
 * @returns {ThreadMessage[][]}
 */
export function groupMessages(messages, minutes) {
    /** @type {ThreadMessage[][]} */
    const groups = [];
    for (const message of messages) {
        const run = groups[groups.length - 1];
        const before = run?.[run.length - 1];
        const joins =
            before !== undefined &&
            message.dir !== 'system' &&
            before.dir === message.dir &&
            (before.sender ?? '') === (message.sender ?? '') &&
            dayKey(before.at) === dayKey(message.at) &&
            message.at - before.at <= minutes * 60_000 &&
            minutes > 0;
        if (joins) run.push(message);
        else groups.push([message]);
    }
    return groups;
}

/**
 * Draw (or redraw) a thread.
 * @param {HTMLElement} el the root, a `.kp-thread`
 * @param {ThreadSpec} spec
 */
export function setThread(el, spec) {
    const memory = MEMORY.get(el) ?? {
        spec,
        height: 0,
        card: null,
        drawn: false,
        pending: null,
        wired: false,
        expanded: new Set(),
        watcher: null,
        width: 0,
    };
    MEMORY.set(el, memory);
    memory.spec = spec;
    el.classList.add('kp-thread');
    el.setAttribute('data-kp-thread', el.getAttribute('data-kp-thread') ?? '');
    if (!memory.wired) {
        memory.wired = true;
        wire(el, memory);
        watchOptions(el, memory);
    }
    const state = spec.state ?? 'ready';
    if (state === 'loading') {
        memory.pending = null;
        drawLoading(el, spec, memory);
        return;
    }
    if (memory.card) {
        const card = memory.card;
        memory.card = null;
        memory.pending = spec;
        void card.close().then(() => {
            if (memory.pending !== spec) return;
            memory.pending = null;
            draw(el, memory);
        });
        return;
    }
    draw(el, memory);
}

/** The options an attribute of the root changes at runtime, with the spec key each one stands for. */
const OPTION_ATTRIBUTES = /** @type {const} */ ({
    'data-kp-thread-order': 'order',
    'data-kp-thread-fold': 'fold',
    'data-kp-thread-fold-lines': 'foldLines',
    'data-kp-thread-group': 'group',
    'data-kp-thread-days': 'days',
    'data-kp-thread-avatar': 'avatar',
    'data-kp-thread-bubble': 'bubble',
});

/**
 * Every option is switchable at runtime: change its attribute and the thread redraws. The attribute then wins over the
 * option the spec carried, so a page that set both keeps working [Kenny, 2026-10-17 22:09: "some things are options that
 * the component can give, like Long messages and Order"].
 * @param {HTMLElement} el @param {Memory} memory
 */
function watchOptions(el, memory) {
    /** @type {Record<string, string | null>} */
    const seen = {};
    for (const name of Object.keys(OPTION_ATTRIBUTES)) seen[name] = el.getAttribute(name);
    new MutationObserver((records) => {
        /** @type {Record<string, unknown>} */
        const spec = { ...memory.spec };
        let changed = false;
        for (const record of records) {
            const name = /** @type {keyof typeof OPTION_ATTRIBUTES} */ (record.attributeName);
            if (!name || !(name in OPTION_ATTRIBUTES) || el.getAttribute(name) === seen[name]) continue;
            seen[name] = el.getAttribute(name);
            delete spec[OPTION_ATTRIBUTES[name]];
            changed = true;
        }
        if (changed) setThread(el, /** @type {ThreadSpec} */ (spec));
    }).observe(el, { attributes: true, attributeFilter: Object.keys(OPTION_ATTRIBUTES) });
}

/** @param {HTMLElement} el @param {Memory} memory */
function wire(el, memory) {
    el.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('[data-kp-thread-add]')) el.dispatchEvent(new CustomEvent(THREAD_ADD_EVENT, { bubbles: true }));
        const retry = target.closest('[data-kp-thread-retry]');
        if (retry) {
            const key = retry.closest('[data-kp-message]')?.getAttribute('data-kp-message');
            el.dispatchEvent(new CustomEvent(THREAD_RETRY_EVENT, { bubbles: true, detail: key ? { key } : {} }));
        }
        const jump = target.closest('.kp-thread__jump');
        if (jump) scrollToNewest(el, memory, true);
        const item = /** @type {HTMLElement | null} */ (target.closest('[data-kp-message]'));
        const key = item?.getAttribute('data-kp-message');
        if (!item || !key) return;
        const fold = target.closest('.kp-thread__fold');
        if (fold) {
            const open = !memory.expanded.has(key);
            if (open) memory.expanded.add(key);
            else memory.expanded.delete(key);
            applyFold(item, memory, key);
            el.dispatchEvent(new CustomEvent(THREAD_FOLD_EVENT, { bubbles: true, detail: { key, expanded: open } }));
        }
        const copy = /** @type {HTMLElement | null} */ (target.closest('.kp-thread__copy'));
        if (copy) void copyText(copy, memory.spec.messages?.find((m) => m.key === key)?.text ?? '');
        const act = target.closest('[data-kp-thread-act]');
        if (act)
            el.dispatchEvent(new CustomEvent(THREAD_ACTION_EVENT, { bubbles: true, detail: { key, id: act.getAttribute('data-kp-thread-act') } }));
    });
}

/** Copy the text; the button says so for a moment and keeps its width. @param {HTMLElement} button @param {string} text */
async function copyText(button, text) {
    const strings = getStrings();
    try {
        await button.ownerDocument.defaultView?.navigator.clipboard.writeText(text);
    } catch {
        // No clipboard (insecure page, refused): the button says nothing was copied.
        button.textContent = strings.threadCopyFailed;
        return;
    }
    const before = button.getAttribute('data-kp-label') ?? button.textContent ?? '';
    button.setAttribute('data-kp-label', before);
    button.style.minInlineSize = `${button.offsetWidth}px`;
    button.textContent = strings.copied;
    button.setAttribute('data-kp-copied', '');
    button.ownerDocument.defaultView?.setTimeout(() => {
        button.textContent = before;
        button.removeAttribute('data-kp-copied');
        button.style.minInlineSize = '';
    }, 1500);
}

/** Whether the scroll box is at the newest end. @param {HTMLElement} box @param {'oldest' | 'newest'} order */
const atNewest = (box, order) => (order === 'newest' ? box.scrollTop <= 24 : box.scrollHeight - box.clientHeight - box.scrollTop <= 24);

/** @param {HTMLElement} el @param {Memory} memory @param {boolean} smooth */
function scrollToNewest(el, memory, smooth) {
    const box = /** @type {HTMLElement | null} */ (el.querySelector('.kp-thread__scroll'));
    if (!box) return;
    const order = threadOptions(el, memory.spec).order;
    const reduced = el.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
    box.scrollTo({ top: order === 'newest' ? 0 : box.scrollHeight, behavior: smooth && !reduced ? 'smooth' : 'auto' });
}

/** @param {HTMLElement} el @param {Memory} memory @param {ThreadSpec} spec */
function drawLoading(el, spec, memory) {
    const doc = el.ownerDocument;
    el.setAttribute('aria-busy', 'true');
    el.setAttribute('data-kp-state', 'loading');
    const scroll = make(doc, 'kp-thread__scroll', 'div');
    scroll.setAttribute('aria-hidden', 'true');
    const list = make(doc, 'kp-thread__list', 'ol');
    for (const dir of /** @type {const} */ (['in', 'out'])) {
        const item = make(doc, 'kp-thread__item kp-thread__item--wait', 'li');
        item.setAttribute('data-kp-dir', dir);
        const bubble = make(doc, 'kp-thread__bubble', 'div');
        for (const width of dir === 'in' ? ['100%', '92%', '58%'] : ['100%', '64%']) {
            const line = make(doc, 'kp-thread__wait-line kp-skeleton kp-skeleton--block');
            line.style.inlineSize = width;
            bubble.append(line);
        }
        if (dir === 'in') item.append(make(doc, 'kp-idmark kp-idmark--sm kp-idmark--round kp-skeleton kp-skeleton--block'));
        item.append(bubble);
        list.append(item);
    }
    scroll.append(list);
    const keep = memory.card?.layer;
    for (const child of [...el.childNodes]) if (child !== keep) child.remove();
    el.prepend(scroll);
    if (memory.height > 0) scroll.style.minBlockSize = `${memory.height}px`;
    if (memory.card) {
        memory.card.place();
        return;
    }
    memory.card = openBusyCard(el, {
        words: spec.loadingWords ?? getStrings().threadLoading,
        area: () => [scroll],
        className: 'kp-thread__busy',
        arrive: memory.drawn,
    });
    memory.drawn = true;
}

/** @param {HTMLElement} el @param {Memory} memory */
function draw(el, memory) {
    const doc = el.ownerDocument;
    const strings = getStrings();
    const spec = memory.spec;
    const state = spec.state ?? 'ready';
    const messages = spec.messages ?? [];
    el.removeAttribute('aria-busy');
    memory.drawn = true;
    const refocus = el.querySelector(':scope > .kp-thread__note')?.contains(doc.activeElement) ?? false;

    if (state === 'error' || state === 'empty' || messages.length === 0) {
        const failed = state === 'error';
        el.setAttribute('data-kp-state', failed ? 'error' : 'empty');
        const was = el.querySelector(':scope > :is(.kp-thread__scroll, .kp-thread__note)')?.getBoundingClientRect().height ?? 0;
        memory.height = Math.max(was, memory.height);
        const note = make(doc, 'kp-empty kp-thread__note', 'div');
        if (memory.height > 0) note.style.minBlockSize = `${memory.height}px`;
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
        memory.watcher?.disconnect();
        el.replaceChildren(note);
        if (refocus) {
            el.tabIndex = -1;
            el.focus({ preventScroll: true });
        }
        return;
    }

    el.setAttribute('data-kp-state', 'ready');
    const options = threadOptions(el, spec);
    // The look is the root's, so the CSS keys off one place.
    if (spec.bubble && el.getAttribute('data-kp-thread-bubble') !== spec.bubble) el.setAttribute('data-kp-thread-bubble', spec.bubble);
    const locale = /** @type {HTMLElement | null} */ (el.closest('[lang]'))?.lang || 'en-GB';
    const oldBox = /** @type {HTMLElement | null} */ (el.querySelector('.kp-thread__scroll'));
    const stick = !oldBox || atNewest(oldBox, options.order);
    const keptTop = oldBox?.scrollTop ?? 0;
    const sorted = [...messages].sort((a, b) => a.at - b.at);
    const newestKey = [...sorted].reverse().find((m) => m.dir !== 'system')?.key;
    const groups = groupMessages(sorted, options.group);
    if (options.order === 'newest') groups.reverse();

    const scroll = make(doc, 'kp-thread__scroll', 'div');
    scroll.setAttribute('tabindex', '0');
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', spec.label ?? el.getAttribute('aria-label') ?? strings.threadLabel);
    const list = make(doc, 'kp-thread__list', 'ol');
    let previousDay = '';
    for (const group of groups) {
        const members = options.order === 'newest' ? [...group].reverse() : group;
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
        members.forEach((message, index) => {
            list.append(messageItem(doc, message, { options, first: index === 0, newestKey, memory, locale, spec }));
        });
    }
    scroll.append(list);
    const jump = make(doc, 'kp-button kp-button--sm kp-thread__jump', 'button');
    jump.setAttribute('type', 'button');
    jump.hidden = true;
    jump.textContent = strings.threadJump;
    el.replaceChildren(scroll, jump);

    scroll.addEventListener('scroll', () => {
        jump.hidden = atNewest(scroll, options.order);
    });
    if (stick) scrollToNewest(el, memory, false);
    else scroll.scrollTop = keptTop;
    jump.hidden = atNewest(scroll, options.order);
    fitFolds(el, memory);
    // Wrapping changes with the width: the lines a message has, and so its fold, are measured again.
    memory.watcher?.disconnect();
    const View = doc.defaultView;
    if (View?.ResizeObserver) {
        memory.width = Math.round(el.clientWidth);
        memory.watcher = new View.ResizeObserver(() => {
            const width = Math.round(el.clientWidth);
            if (width === memory.width) return;
            memory.width = width;
            fitFolds(el, memory);
        });
        memory.watcher.observe(el);
    }
    memory.height = Math.max(memory.height, el.getBoundingClientRect().height);
    if (stick) {
        scrollToNewest(el, memory, false);
        jump.hidden = atNewest(scroll, options.order);
    }
}

/**
 * @param {Document} doc @param {ThreadMessage} message
 * @param {{ options: ReturnType<typeof threadOptions>, first: boolean, newestKey: string | undefined, memory: Memory, locale: string, spec: ThreadSpec }} context
 */
function messageItem(doc, message, { options, first, newestKey, memory, locale, spec }) {
    const strings = getStrings();
    const item = make(doc, 'kp-thread__item', 'li');
    item.setAttribute('data-kp-message', message.key);
    item.setAttribute('data-kp-dir', message.dir);
    const moment = agoMoment(message.at, THREAD_TIME_ZONE);

    if (message.dir === 'system') {
        const line = make(doc, 'kp-thread__system', 'p');
        line.append(doc.createTextNode(message.text));
        const time = make(doc, 'kp-thread__time', 'time');
        time.setAttribute('datetime', new Date(message.at).toISOString());
        time.title = moment;
        time.textContent = moment.slice(11);
        line.append(time);
        item.append(line);
        return item;
    }

    item.setAttribute('data-kp-first', String(first));
    const sender = message.sender ?? (message.dir === 'out' ? strings.threadYou : '');
    const showsAvatar = options.avatar === 'both' || (options.avatar === 'in' && message.dir === 'in');
    if (showsAvatar) {
        const slot = make(doc, 'kp-thread__avatar');
        if (first && sender) {
            const mark = make(doc, 'kp-idmark kp-idmark--sm kp-idmark--round');
            mark.setAttribute('data-kp-idmark', sender);
            if (message.src) mark.setAttribute('data-kp-idmark-src', message.src);
            mark.setAttribute('aria-hidden', 'true');
            setIdmark(mark, sender);
            slot.append(mark);
        }
        item.append(slot);
    }

    const bubble = make(doc, 'kp-thread__bubble', 'article');
    bubble.setAttribute('aria-label', strings.threadBubbleLabel(sender || strings.threadUnknownSender, moment));
    if (message.status && message.status !== 'sent') bubble.setAttribute('data-kp-status', message.status);
    if (message.status === 'sending') bubble.setAttribute('aria-busy', 'true');

    if (first) {
        const head = make(doc, 'kp-thread__head', 'header');
        const who = make(doc, 'kp-thread__sender');
        who.textContent = sender;
        const time = make(doc, 'kp-thread__time', 'time');
        time.setAttribute('datetime', new Date(message.at).toISOString());
        time.title = moment;
        time.textContent = moment.slice(11);
        head.append(who, time);
        bubble.append(head);
    }

    const textId = `kp-thread-text-${message.key}`;
    const body = make(doc, 'kp-thread__text', 'div');
    body.id = textId;
    body.textContent = message.text;
    const foldMode = options.fold;
    const limit = foldMode === 'newest' ? (message.key === newestKey ? 0 : options.foldLines) : foldMode === 'full' ? 0 : foldMode;
    if (limit > 0) {
        body.setAttribute('data-kp-fold-lines', String(limit));
        body.style.setProperty('--kp-thread-fold-lines', String(limit));
        body.setAttribute('data-kp-fold', memory.expanded.has(message.key) ? 'open' : 'folded');
    }
    bubble.append(body);
    if (limit > 0) {
        const fold = make(doc, 'kp-button kp-button--sm kp-button--ghost kp-thread__fold', 'button');
        fold.setAttribute('type', 'button');
        fold.setAttribute('aria-controls', textId);
        fold.hidden = true;
        bubble.append(fold);
    }

    if (message.attachments?.length) {
        const tags = make(doc, 'kp-tag-list kp-thread__attachments', 'ul');
        tags.setAttribute('aria-label', strings.threadAttachments(message.attachments.length));
        for (const file of message.attachments) {
            const tag = make(doc, 'kp-tag kp-thread__attachment', 'li');
            const size = file.size == null ? '' : ` (${formatBytes(file.size, locale)})`;
            if (file.href) {
                const link = make(doc, 'kp-thread__file', 'a');
                link.setAttribute('href', file.href);
                link.textContent = `${file.name}${size}`;
                tag.append(link);
            } else {
                const name = make(doc, 'kp-thread__file');
                name.textContent = `${file.name}${size}`;
                tag.append(name);
            }
            tags.append(tag);
        }
        bubble.append(tags);
    }

    const foot = make(doc, 'kp-thread__foot', 'footer');
    if (message.status === 'sending') {
        const status = make(doc, 'kp-thread__status');
        status.setAttribute('role', 'status');
        status.append(make(doc, 'kp-spinner'), doc.createTextNode(strings.threadSending));
        foot.append(status);
    } else if (message.status === 'failed') {
        const status = make(doc, 'kp-thread__status kp-thread__status--failed');
        status.setAttribute('role', 'alert');
        status.textContent = strings.threadNotSent(message.error ?? strings.threadNotSentFallback);
        const retry = make(doc, 'kp-button kp-button--sm kp-thread__retry', 'button');
        retry.setAttribute('type', 'button');
        retry.setAttribute('data-kp-thread-retry', '');
        retry.textContent = strings.threadRetry;
        foot.append(status, retry);
    }
    const tools = make(doc, 'kp-thread__tools');
    const copy = make(doc, 'kp-button kp-button--sm kp-button--ghost kp-thread__copy', 'button');
    copy.setAttribute('type', 'button');
    copy.setAttribute('aria-label', strings.threadCopyOf(sender || strings.threadUnknownSender));
    copy.textContent = strings.threadCopy;
    tools.append(copy);
    for (const action of spec.actions ?? []) {
        const button = make(doc, 'kp-button kp-button--sm kp-button--ghost kp-thread__action', 'button');
        button.setAttribute('type', 'button');
        button.setAttribute('data-kp-thread-act', action.id);
        button.textContent = action.label;
        tools.append(button);
    }
    foot.append(tools);
    bubble.append(foot);
    item.append(bubble);
    return item;
}

/**
 * Measure every foldable body and show or hide its Show all button: a message
 * with no more lines than its limit is shown whole, with no button.
 * @param {HTMLElement} el @param {Memory} memory
 */
function fitFolds(el, memory) {
    for (const item of /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('[data-kp-message]'))) {
        const key = item.getAttribute('data-kp-message');
        if (key && item.querySelector('.kp-thread__text[data-kp-fold-lines]')) applyFold(item, memory, key);
    }
}

/** @param {HTMLElement} item @param {Memory} memory @param {string} key */
function applyFold(item, memory, key) {
    const strings = getStrings();
    const body = /** @type {HTMLElement | null} */ (item.querySelector('.kp-thread__text[data-kp-fold-lines]'));
    const button = /** @type {HTMLElement | null} */ (item.querySelector('.kp-thread__fold'));
    if (!body || !button) return;
    const limit = Number(body.getAttribute('data-kp-fold-lines'));
    const open = memory.expanded.has(key);
    // Measure whole: the clamp is lifted for the reading.
    const before = body.getAttribute('data-kp-fold');
    body.setAttribute('data-kp-fold', 'open');
    const style = body.ownerDocument.defaultView?.getComputedStyle(body);
    const lineHeight = parseFloat(style?.lineHeight ?? '') || (parseFloat(style?.fontSize ?? '') || 16) * 1.5;
    const lines = Math.max(1, Math.round(body.scrollHeight / lineHeight));
    body.setAttribute('data-kp-fold', before ?? 'folded');
    if (lines <= limit) {
        body.removeAttribute('data-kp-fold');
        button.hidden = true;
        return;
    }
    body.setAttribute('data-kp-fold', open ? 'open' : 'folded');
    button.hidden = false;
    button.textContent = open ? strings.threadShowLess : strings.threadShowAll(lines);
    button.setAttribute('aria-expanded', String(open));
}

/**
 * Fill every `[data-kp-thread]` under `root` that carries its spec as JSON in
 * the attribute (a page that draws with setThread() needs nothing).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachThreads(root = document) {
    for (const el of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(THREAD))) {
        const json = el.getAttribute('data-kp-thread') ?? '';
        if (json.trim().startsWith('{') && !MEMORY.has(el)) {
            try {
                setThread(el, JSON.parse(json));
            } catch (error) {
                console.error(error);
            }
        }
    }
    return () => {};
}
