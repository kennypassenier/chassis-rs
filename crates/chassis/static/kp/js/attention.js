// The attention band, kept worst first [scope-143].
//
// `.kp-attention` holds one `.kp-attention__item` per problem, each with the
// action that fixes it, and takes no room at all when it holds none (the
// stylesheet does that). The items are ranked by `data-kp-severity`
// (critical, warning, info); this module keeps that order in the DOM itself,
// so a screen reader meets the problems in the order the eye does, and a
// problem added later lands in its place rather than at the bottom. Nothing
// runs on import; attachAttention(root) returns a detach.
//
// A live page builds its band after the boot and refreshes it on every poll
// (the homelab dashboard, port spec item F). attachAttention() therefore also
// picks up bands added later and lets go of bands that leave, and
// setAttention(band, items) updates a band by each item's key: an unchanged
// item stays the same element, so an alert is announced once rather than on
// every poll, and a focused fix button keeps its focus.

import { leave } from './motion.js';
import { getStrings } from './strings.js';

/** The band, and the severities it orders by, worst first. */
export const ATTENTION = '.kp-attention';
export const SEVERITIES = /** @type {const} */ (['critical', 'warning', 'info']);

/** The alert flavour each severity wears. */
const FLAVOUR = { critical: 'destructive', warning: 'warning', info: 'info' };
/** The glyph in each severity's round icon; not words, so not in the dictionary. */
const GLYPH = { critical: '!', warning: '!', info: 'i' };

/** @param {Element} el */
const rank = (el) => {
    const at = SEVERITIES.indexOf(/** @type {any} */ (el.getAttribute('data-kp-severity')));
    return at < 0 ? SEVERITIES.length : at;
};

/**
 * Put a band's items in severity order in the DOM (a stable sort: two
 * problems of one severity keep the order the page gave them).
 * @param {Element} band
 */
export function sortAttention(band) {
    const items = /** @type {HTMLElement[]} */ ([...band.children]).filter((el) => el.classList.contains('kp-attention__item'));
    const sorted = [...items].sort((a, b) => rank(a) - rank(b));
    if (sorted.every((el, at) => el === items[at])) return;
    for (const el of sorted) band.append(el);
}

/**
 * One problem on the band.
 * @typedef {object} AttentionItem
 * @property {string} key its stable id (`data-kp-key`): the same key is the same element on every refresh
 * @property {'critical' | 'warning' | 'info'} severity
 * @property {string} title the problem, in one line
 * @property {string} [text] one sentence more
 * @property {Node | null} [action] the fix (a button or a link). Left out, a kept item keeps the action it has; `null` removes it. A new node equal in markup to the one shown (`isEqualNode`) keeps the one shown, so its focus and listeners survive a refresh.
 * @property {string} [srSeverity] the word a screen reader hears before the title, in place of the dictionary's
 */

/**
 * The severity word a screen reader hears first.
 * @param {AttentionItem} item
 */
const severityWord = (item) => {
    if (item.srSeverity !== undefined) return item.srSeverity;
    const s = getStrings();
    return item.severity === 'critical' ? s.attentionCritical : item.severity === 'warning' ? s.attentionWarning : s.attentionInfo;
};

/**
 * Write `item` into `el`, touching only what changed.
 * @param {HTMLElement} el @param {AttentionItem} item
 */
function paintItem(el, item) {
    const doc = el.ownerDocument;
    const severity = SEVERITIES.includes(item.severity) ? item.severity : 'info';
    if (el.getAttribute('data-kp-severity') !== severity) el.setAttribute('data-kp-severity', severity);
    for (const flavour of Object.values(FLAVOUR)) el.classList.toggle(`kp-alert--${flavour}`, flavour === FLAVOUR[severity]);
    // Only a critical problem interrupts; the rest wait their turn.
    const role = severity === 'critical' ? 'alert' : 'status';
    if (el.getAttribute('role') !== role) el.setAttribute('role', role);
    let icon = el.querySelector(':scope > .kp-attention__icon');
    if (!icon) {
        icon = doc.createElement('span');
        icon.className = 'kp-attention__icon';
        icon.setAttribute('aria-hidden', 'true');
        el.prepend(icon);
    }
    if (icon.textContent !== GLYPH[severity]) icon.textContent = GLYPH[severity];
    let words = el.querySelector(':scope > .kp-attention__text');
    if (!words) {
        words = doc.createElement('div');
        words.className = 'kp-attention__text';
        icon.after(words);
    }
    let title = words.querySelector(':scope > strong');
    if (!title) {
        title = doc.createElement('strong');
        words.prepend(title);
    }
    let sr = title.querySelector(':scope > .kp-sr-only');
    if (!sr) {
        sr = doc.createElement('span');
        sr.className = 'kp-sr-only';
        title.prepend(sr);
    }
    const prefix = `${severityWord(item)}: `;
    if (sr.textContent !== prefix) sr.textContent = prefix;
    // The title's own words are the text after the prefix: replaced only
    // when they changed, so an unchanged title is the same text node.
    const titleText = [...title.childNodes].filter((n) => n !== sr);
    if (titleText.map((n) => n.textContent).join('') !== item.title) {
        for (const n of titleText) n.remove();
        title.append(item.title);
    }
    let line = words.querySelector(':scope > span');
    if (item.text) {
        if (!line) {
            line = doc.createElement('span');
            words.append(line);
        }
        if (line.textContent !== item.text) line.textContent = item.text;
    } else line?.remove();
    let actions = el.querySelector(':scope > .kp-attention__actions');
    if (item.action === undefined) return;
    if (item.action === null) {
        actions?.remove();
        return;
    }
    if (!actions) {
        actions = doc.createElement('div');
        actions.className = 'kp-attention__actions';
        el.append(actions);
    }
    const shown = actions.childNodes.length === 1 ? actions.firstChild : null;
    if (shown === item.action || (shown && shown.isEqualNode(item.action))) return;
    actions.replaceChildren(item.action);
}

/**
 * Set a band's problems, by key [port spec F]. An item whose key is on the
 * band already stays the same element and only what changed in it is
 * rewritten (an alert is not inserted again, so it is not announced again,
 * and focus on its fix stays); a new key makes a new item (`role="alert"`
 * for a critical one, `role="status"` otherwise); a key no longer given
 * leaves the theme's way (`leave()` from js/motion.js, at once under
 * reduced motion). The band ends worst first, in the given order within a
 * severity, and only items out of place are moved.
 *
 * @param {Element} band a `.kp-attention`
 * @param {AttentionItem[]} items
 */
export function setAttention(band, items) {
    const doc = band.ownerDocument;
    /** @type {Map<string, HTMLElement>} */
    const shown = new Map();
    for (const el of /** @type {HTMLElement[]} */ ([...band.children])) {
        if (!el.classList.contains('kp-attention__item') || el.hasAttribute('data-kp-leaving')) continue;
        const key = el.getAttribute('data-kp-key');
        if (key !== null && !shown.has(key)) shown.set(key, el);
    }
    /** @type {HTMLElement[]} */
    const wanted = [];
    const seen = new Set();
    for (const item of items) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        let el = shown.get(item.key);
        if (!el) {
            el = doc.createElement('div');
            el.className = 'kp-alert kp-attention__item';
            el.setAttribute('data-kp-key', item.key);
        }
        paintItem(el, item);
        wanted.push(el);
    }
    // An item told to leave is marked `data-kp-leaving` only a microtask
    // later (leave() batches); until then it is skipped by hand, or the
    // items under it read as out of place and were moved, which took the
    // focus off a fix button in them.
    /** @type {Set<Element>} */
    const going = new Set();
    for (const [key, el] of shown)
        if (!seen.has(key)) {
            going.add(el);
            void leave(el);
        }
    // Worst first, stable within a severity, then moved only where out of place.
    const order = wanted.map((el, at) => ({ el, at })).sort((a, b) => rank(a.el) - rank(b.el) || a.at - b.at);
    /** @type {HTMLElement | null} */
    let before = null;
    for (const { el } of order) {
        /** @type {Element | null} */
        let prev = el.isConnected && el.parentElement === band ? el.previousElementSibling : null;
        while (prev && (!prev.classList.contains('kp-attention__item') || prev.hasAttribute('data-kp-leaving') || going.has(prev)))
            prev = prev.previousElementSibling;
        const inPlace = el.parentElement === band && prev === before;
        if (!inPlace) {
            if (before) before.after(el);
            else {
                const first = [...band.children].find((c) => c.classList.contains('kp-attention__item'));
                if (first && first !== el) first.before(el);
                else if (!first) band.append(el);
            }
        }
        before = el;
    }
}

/**
 * Keep every attention band under `root` worst first, now and whenever an
 * item arrives or changes severity. A band added under `root` later is
 * sorted as it arrives and watched from then on; a band that leaves the
 * page is let go (its watcher disconnected). The band hides itself in CSS
 * when it holds nothing.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachAttention(root = document) {
    const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
    const view = doc.defaultView;
    /** @param {ParentNode} scope */
    const bandsIn = (scope) => [...(scope instanceof Element && scope.matches(ATTENTION) ? [scope] : []), ...scope.querySelectorAll(ATTENTION)];
    if (!view) {
        for (const band of bandsIn(root)) sortAttention(band);
        return () => {};
    }
    const options = { childList: true, subtree: true, attributes: true, attributeFilter: ['data-kp-severity'] };
    /** @type {Map<Element, MutationObserver>} */
    const watchers = new Map();
    /** @param {Element} band */
    const watch = (band) => {
        if (watchers.has(band)) return;
        sortAttention(band);
        const watcher = new view.MutationObserver(() => {
            watcher.disconnect();
            sortAttention(band);
            watcher.observe(band, options);
        });
        watcher.observe(band, options);
        watchers.set(band, watcher);
    };
    for (const band of bandsIn(root)) watch(band);
    // Bands that arrive later, and bands that leave. A removal is checked a
    // microtask later, so a band moved within the page keeps its watcher.
    const later = new view.MutationObserver((records) => {
        let removed = false;
        for (const record of records) {
            for (const node of record.addedNodes) if (node instanceof view.Element) for (const band of bandsIn(node)) watch(band);
            if (record.removedNodes.length) removed = true;
        }
        if (removed)
            queueMicrotask(() => {
                for (const [band, watcher] of watchers)
                    if (!band.isConnected) {
                        watcher.disconnect();
                        watchers.delete(band);
                    }
            });
    });
    later.observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), { childList: true, subtree: true });
    return () => {
        later.disconnect();
        for (const watcher of watchers.values()) watcher.disconnect();
        watchers.clear();
    };
}
