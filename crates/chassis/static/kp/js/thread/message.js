// One message of a thread as a list item: a system line, or a bubble with its avatar, its head (sender and time), its text
// (folded to a few lines when the options say), its attachments, and its foot (sending, not sent with Retry, Copy, actions).

import { agoMoment } from '../freshness.js';
import { setIdmark } from '../idmark.js';
import { formatBytes } from '../locale.js';
import { getStrings } from '../strings.js';
import { THREAD_TIME_ZONE, make } from './options.js';

/** @typedef {import('../thread.js').ThreadMessage} ThreadMessage */
/** @typedef {import('../thread.js').ThreadSpec} ThreadSpec */
/** @typedef {ReturnType<typeof import('./options.js').threadOptions>} ThreadOptions */
/** @typedef {{ options: ThreadOptions, first: boolean, newestKey: string | undefined, expanded: Set<string>, locale: string, spec: ThreadSpec }} MessageContext */

/** Where `agoMoment` writes the time of day ("HH:MM" after "DD/MM/YYYY "). */
const TIME_START = 11;

/** A `<time>` with the moment's time of day, the whole moment as its title. @param {Document} doc @param {number} at @param {string} moment */
function timeOf(doc, at, moment) {
    const time = make(doc, 'kp-thread__time', 'time');
    time.setAttribute('datetime', new Date(at).toISOString());
    time.title = moment;
    time.textContent = moment.slice(TIME_START);
    return time;
}

/** @param {Document} doc @param {string} className @param {string} text */
function button(doc, className, text) {
    const b = make(doc, className, 'button');
    b.setAttribute('type', 'button');
    b.textContent = text;
    return b;
}

/** @param {Document} doc @param {ThreadMessage} message @param {MessageContext} context */
export function messageItem(doc, message, context) {
    const strings = getStrings();
    const item = make(doc, 'kp-thread__item', 'li');
    item.setAttribute('data-kp-message', message.key);
    item.setAttribute('data-kp-dir', message.dir);
    const moment = agoMoment(message.at, THREAD_TIME_ZONE);
    if (message.dir === 'system') {
        const line = make(doc, 'kp-thread__system', 'p');
        line.append(doc.createTextNode(message.text), timeOf(doc, message.at, moment));
        item.append(line);
        return item;
    }
    item.setAttribute('data-kp-first', String(context.first));
    const sender = message.sender ?? (message.dir === 'out' ? strings.threadYou : '');
    const avatar = context.options.avatar;
    if (avatar === 'both' || (avatar === 'in' && message.dir === 'in')) item.append(avatarOf(doc, message, sender, context.first));
    const bubble = make(doc, 'kp-thread__bubble', 'article');
    bubble.setAttribute('aria-label', strings.threadBubbleLabel(sender || strings.threadUnknownSender, moment));
    if (message.status && message.status !== 'sent') bubble.setAttribute('data-kp-status', message.status);
    if (message.status === 'sending') bubble.setAttribute('aria-busy', 'true');
    if (context.first) {
        const head = make(doc, 'kp-thread__head', 'header');
        const who = make(doc, 'kp-thread__sender');
        who.textContent = sender;
        head.append(who, timeOf(doc, message.at, moment));
        bubble.append(head);
    }
    appendText(doc, bubble, message, context);
    if (message.attachments?.length) bubble.append(attachmentsOf(doc, message.attachments, context.locale));
    bubble.append(footOf(doc, message, sender, context.spec));
    item.append(bubble);
    return item;
}

/** The avatar's slot; the first of a run holds the sender's mark. @param {Document} doc @param {ThreadMessage} message @param {string} sender @param {boolean} first */
function avatarOf(doc, message, sender, first) {
    const slot = make(doc, 'kp-thread__avatar');
    if (first && sender) {
        const mark = make(doc, 'kp-idmark kp-idmark--sm kp-idmark--round');
        mark.setAttribute('data-kp-idmark', sender);
        if (message.src) mark.setAttribute('data-kp-idmark-src', message.src);
        mark.setAttribute('aria-hidden', 'true');
        setIdmark(mark, sender);
        slot.append(mark);
    }
    return slot;
}

/**
 * The text, folded to its limit when the options say: the newest message is whole under `newest`, every message under
 * `full`, and none past the given count otherwise. The fold's button is shown by applyFold once the lines are measured.
 * @param {Document} doc @param {HTMLElement} bubble @param {ThreadMessage} message @param {MessageContext} context
 */
function appendText(doc, bubble, message, context) {
    const { options, newestKey, expanded } = context;
    const textId = `kp-thread-text-${message.key}`;
    const body = make(doc, 'kp-thread__text', 'div');
    body.id = textId;
    body.textContent = message.text;
    const mode = options.fold;
    const limit = mode === 'newest' ? (message.key === newestKey ? 0 : options.foldLines) : mode === 'full' ? 0 : mode;
    if (limit > 0) {
        body.setAttribute('data-kp-fold-lines', String(limit));
        body.style.setProperty('--kp-thread-fold-lines', String(limit));
        body.setAttribute('data-kp-fold', expanded.has(message.key) ? 'open' : 'folded');
    }
    bubble.append(body);
    if (limit > 0) {
        const fold = make(doc, 'kp-button kp-button--sm kp-button--ghost kp-thread__fold', 'button');
        fold.setAttribute('type', 'button');
        fold.setAttribute('aria-controls', textId);
        fold.hidden = true;
        bubble.append(fold);
    }
}

/** The attachments as tags, linked when they have an address. @param {Document} doc @param {NonNullable<ThreadMessage['attachments']>} files @param {string} locale */
function attachmentsOf(doc, files, locale) {
    const tags = make(doc, 'kp-tag-list kp-thread__attachments', 'ul');
    tags.setAttribute('aria-label', getStrings().threadAttachments(files.length));
    for (const file of files) {
        const tag = make(doc, 'kp-tag kp-thread__attachment', 'li');
        const size = file.size == null ? '' : ` (${formatBytes(file.size, locale)})`;
        const name = make(doc, 'kp-thread__file', file.href ? 'a' : 'span');
        if (file.href) name.setAttribute('href', file.href);
        name.textContent = `${file.name}${size}`;
        tag.append(name);
        tags.append(tag);
    }
    return tags;
}

/** The foot: sending, or not sent with Retry; then Copy and the page's actions. @param {Document} doc @param {ThreadMessage} message @param {string} sender @param {ThreadSpec} spec */
function footOf(doc, message, sender, spec) {
    const strings = getStrings();
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
        const retry = button(doc, 'kp-button kp-button--sm kp-thread__retry', strings.threadRetry);
        retry.setAttribute('data-kp-thread-retry', '');
        foot.append(status, retry);
    }
    const tools = make(doc, 'kp-thread__tools');
    const copy = button(doc, 'kp-button kp-button--sm kp-button--ghost kp-thread__copy', strings.threadCopy);
    copy.setAttribute('aria-label', strings.threadCopyOf(sender || strings.threadUnknownSender));
    tools.append(copy);
    for (const action of spec.actions ?? []) {
        const act = button(doc, 'kp-button kp-button--sm kp-button--ghost kp-thread__action', action.label);
        act.setAttribute('data-kp-thread-act', action.id);
        tools.append(act);
    }
    foot.append(tools);
    return foot;
}
