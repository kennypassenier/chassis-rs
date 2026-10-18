// Link anchors on headings and rows [kpadopt6-media; kyu's dead-letter list: one failed message must be pointed at in a chat].
//
// A small `#` beside a heading or a row. A press copies a link to exactly that place and says "Copied" on the mark itself; opening
// such a link scrolls to the place and marks it for two seconds so the eye finds it. Kenny, 2026-10-17: the `#` shows when the
// pointer is over the heading or row or the keyboard is on it, and always on a phone.
//
//   <main data-kp-anchors="headings">…<h2>Dead letters</h2>…</main>
//   <table data-kp-anchors="rows"><tr data-kp-anchor="dead-4f2a">…</tr></table>
//
// Options (markup on the container, each with a default [KT6]; the same names are the options of `attachAnchors(root, options)`):
//   data-kp-anchors          headings | rows | both | off                                  off (opt-in per page)
//   data-kp-anchor           on one element: its id, or empty to make one                 none
//   id source                data-kp-anchor, else the element's own id, else a slug of its text; an id the page has is never overwritten
//   data-kp-anchor-levels    which headings, "2,3"                                         2,3
//   data-kp-anchor-show      hover | always | touch                                        hover on a pointer, always on touch, always on keyboard focus
//   data-kp-anchor-position  after | before                                               after for headings, before (the first cell) for rows
//   data-kp-anchor-copy      url | hash: the full address, or only "#id"                   url
//   data-kp-anchor-target    highlight | none: mark the place a link lands on             highlight
//   data-kp-anchor-offset    a CSS length a sticky bar covers                              --kp-header-height, else 0
//   data-kp-anchor-open      on | off: open a folded group first (`details`), and ask the page to reveal a row on another page  on
//   data-kp-flash-ms         how long "Copied" stays                                       1500
//
// A hash that arrives before its row is drawn is kept for 10 s and resolved when the row renders. A hash with no place to land says
// so in a notice ("That item is no longer here") with a button that clears the hash. A press also writes the address bar
// (`history.replaceState`), and Shift with the press copies a Markdown link. With the shortcut engine, `y` then `l` on a focused row
// copies its link. Fires `kp-anchor-copy` `{ id, url, text, markdown }`, `kp-anchor-reveal` (cancelable) `{ id, target }` and
// `kp-anchor-missing` `{ id }`. Nothing runs on import.

import { getStrings } from './strings.js';
import { motionAllowed } from './calm.js';

/** Per container: take the marks off and draw them again. @type {WeakMap<Element, () => void>} */
const REBUILD = new WeakMap();

/**
 * Draw a container's marks again, after an option changed (the position of the mark, the levels).
 * @param {Element} box
 */
export function refreshAnchors(box) {
    REBUILD.get(box)?.();
}

/** A container whose headings or rows get anchors. */
export const ANCHORS = '[data-kp-anchors]';
/** One element that says its own id. */
export const ANCHOR = '[data-kp-anchor]';
/** Fired on the mark when a link was copied: `{ id, url, text, markdown, ok }`. */
export const ANCHOR_COPY_EVENT = 'kp-anchor-copy';
/** Fired (cancelable) on the container before a link lands in a place that may be folded or on another page: `{ id, target }`. */
export const ANCHOR_REVEAL_EVENT = 'kp-anchor-reveal';
/** Fired on the container when a hash has no place to land: `{ id }`. */
export const ANCHOR_MISSING_EVENT = 'kp-anchor-missing';
/** How long a place a link landed on stays marked, in ms. */
export const ANCHOR_HIT_MS = 2000;
/** How long a hash that has no row yet is waited for, in ms. */
export const ANCHOR_WAIT_MS = 10000;
/** How long "Copied" stays on the mark, in ms. */
export const ANCHOR_COPIED_MS = 1500;

/**
 * A slug of some text: lower case, accents folded, anything else a dash. Pure.
 * @param {string} text
 */
export function anchorSlug(text) {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * An id that no element of the document has yet: the slug, then `-2`, `-3`. Pure over the document.
 * @param {Document} doc @param {string} slug @param {string} [fallback]
 */
export function uniqueAnchorId(doc, slug, fallback = 'section') {
    const base = slug || fallback;
    let id = base;
    let n = 2;
    while (doc.getElementById(id)) id = `${base}-${n++}`;
    return id;
}

/**
 * @typedef {object} AnchorOptions
 * @property {'headings' | 'rows' | 'both' | 'off'} [anchors]
 * @property {number[]} [levels]
 * @property {'hover' | 'always' | 'touch'} [show]
 * @property {'url' | 'hash'} [copy]
 * @property {'highlight' | 'none'} [target]
 * @property {boolean} [open]
 * @property {number} [copiedMs]
 */

/** @param {Element} el @param {string} name @param {string} fallback */
const attr = (el, name, fallback) => el.getAttribute(name) ?? fallback;

/** Rows that carry a key the page already writes. */
const KEYED_ROWS = 'tr[data-kp-row-key], [role="row"][data-kp-row-key], li[data-kp-row-key]';

/** The words of an element without the marks this module added. @param {Element} el */
function plainText(el) {
    const copy = /** @type {Element} */ (el.cloneNode(true));
    for (const mark of copy.querySelectorAll('.kp-anchor')) mark.remove();
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** What the row or heading is called, for the mark's name. @param {HTMLElement} el */
function nameOf(el) {
    const own = el.getAttribute('data-kp-anchor-label');
    if (own) return own;
    if (/^h[1-6]$/i.test(el.tagName)) return plainText(el);
    const cell = el.querySelector('th, td, [role="cell"], [role="gridcell"], .kp-action-list__title') ?? el;
    return plainText(cell) || el.id;
}

/** Copy text, with the old way when the clipboard is not offered. @param {Document} doc @param {string} text */
async function copyText(doc, text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const area = doc.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;inset-block-start:0;inset-inline-start:-9999px;opacity:0';
        doc.body.append(area);
        area.select();
        let ok = false;
        try {
            ok = doc.execCommand('copy');
        } catch {
            ok = false;
        }
        area.remove();
        return ok;
    }
}

/**
 * Wire every container under `root`.
 * @param {ParentNode} [root]
 * @param {AnchorOptions} [options] overrides the markup
 * @returns {() => void} detach
 */
export function attachAnchors(root = document, options = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const found = /** @type {HTMLElement[]} */ ([...(root instanceof HTMLElement && root.matches(ANCHORS) ? [root] : []), ...root.querySelectorAll(ANCHORS)]);
    for (const box of found) {
        if (box.dataset.kpAnchorsAttached !== undefined) continue;
        const mode = options.anchors ?? attr(box, 'data-kp-anchors', 'off');
        if (mode === 'off') continue;
        box.dataset.kpAnchorsAttached = '';
        const doc = box.ownerDocument;
        const view = /** @type {Window} */ (doc.defaultView);
        const strings = getStrings();
        const levels = () => (options.levels ?? attr(box, 'data-kp-anchor-levels', '2,3').split(',').map(Number)).filter((n) => n >= 1 && n <= 6);
        const showMode = () => options.show ?? attr(box, 'data-kp-anchor-show', 'hover');
        const copyMode = () => options.copy ?? attr(box, 'data-kp-anchor-copy', 'url');
        const highlights = () => (options.target ?? attr(box, 'data-kp-anchor-target', 'highlight')) !== 'none';
        const opensFirst = () => (options.open ?? attr(box, 'data-kp-anchor-open', 'on') !== 'off') !== false;
        const copiedMs = () => Number(attr(box, 'data-kp-flash-ms', '')) || options.copiedMs || ANCHOR_COPIED_MS;

        box.classList.add('kp-anchors');
        box.setAttribute('data-kp-anchor-show', showMode());
        const offset = box.getAttribute('data-kp-anchor-offset');
        if (offset) box.style.setProperty('--kp-anchor-offset', offset);

        // One status region for the whole container: the copy is said politely.
        const live = doc.createElement('span');
        live.className = 'kp-sr-only kp-anchors__live';
        live.setAttribute('role', 'status');
        box.append(live);
        const say = (/** @type {string} */ text) => {
            live.textContent = '';
            view.setTimeout(() => {
                live.textContent = text;
            }, 30);
        };

        /** @type {Map<HTMLElement, HTMLButtonElement>} */
        const marks = new Map();
        /** @type {number[]} */
        const timers = [];

        /** The id of a heading or a row: its own word, else its id, else a slug of its text. @param {HTMLElement} el */
        const idFor = (el) => {
            const said = el.getAttribute('data-kp-anchor');
            if (said) return said;
            if (el.id) return el.id;
            const base = /^h[1-6]$/i.test(el.tagName) ? anchorSlug(nameOf(el)) : el.getAttribute('data-kp-row-key') ? `row-${anchorSlug(el.getAttribute('data-kp-row-key') ?? '')}` : '';
            return uniqueAnchorId(doc, base, /^h[1-6]$/i.test(el.tagName) ? 'section' : 'row');
        };

        /** Whether this row is real: a skeleton row has no anchor. @param {HTMLElement} el */
        const isReal = (el) => !el.matches('.kp-skeleton, [aria-busy="true"], [data-kp-state="loading"]') && el.querySelector(':scope > .kp-skeleton') === null;

        /** @param {HTMLElement} el @param {'heading' | 'row'} kind */
        const mark = (el, kind) => {
            if (marks.has(el) || !isReal(el)) return;
            const id = idFor(el);
            if (!el.id) el.id = id;
            el.setAttribute('data-kp-anchored', kind);
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'kp-anchor';
            button.setAttribute('data-kp-anchor-mark', '');
            button.setAttribute('aria-label', strings.anchorCopyLink(nameOf(el)));
            // The faces carry their words as an attribute the stylesheet prints: the mark has no text of its own, so a table's
            // sort, a search and a copy of the cell never pick up "#Copied".
            const hash = doc.createElement('span');
            hash.className = 'kp-anchor__hash';
            hash.setAttribute('aria-hidden', 'true');
            hash.setAttribute('data-kp-text', '#');
            const done = doc.createElement('span');
            done.className = 'kp-anchor__done';
            done.setAttribute('aria-hidden', 'true');
            // A row's mark stands in a narrow first column: it shows a tick, and the words are said politely.
            done.setAttribute('data-kp-text', kind === 'row' ? '✓' : strings.anchorCopied);
            button.append(hash, done);
            const before = (el.getAttribute('data-kp-anchor-position') ?? box.getAttribute('data-kp-anchor-position') ?? (kind === 'row' ? 'before' : 'after')) === 'before';
            if (kind === 'row') {
                const cell = el.matches('tr, [role="row"]') ? (el.querySelector('th, td, [role="cell"], [role="gridcell"], [role="rowheader"]') ?? el) : el;
                if (before) cell.prepend(button);
                else cell.append(button);
            } else if (before) el.prepend(button);
            else el.append(button);
            marks.set(el, button);
        };

        const scan = () => {
            const want = options.anchors ?? attr(box, 'data-kp-anchors', 'off');
            if (want === 'headings' || want === 'both') {
                const wanted = levels().map((n) => `h${n}`).join(',');
                if (wanted) for (const h of box.querySelectorAll(wanted)) if (h instanceof HTMLElement && !h.closest('[data-kp-anchors="off"]')) mark(h, 'heading');
            }
            // A row that says its own id is anchored in every mode that has rows; a keyed row only when rows are asked for.
            if (want === 'rows' || want === 'both') {
                for (const row of box.querySelectorAll(`[data-kp-anchor], ${KEYED_ROWS}`)) if (row instanceof HTMLElement && !/^h[1-6]$/i.test(row.tagName)) mark(row, 'row');
            }
            for (const lone of box.querySelectorAll('[data-kp-anchor]')) {
                if (lone instanceof HTMLElement && /^h[1-6]$/i.test(lone.tagName)) mark(lone, 'heading');
            }
            // Marks of rows that left.
            for (const [el, button] of marks) {
                if (!el.isConnected || !box.contains(el)) {
                    button.remove();
                    marks.delete(el);
                }
            }
        };

        // Landing on a link.
        /** @type {HTMLElement | null} */
        let notice = null;
        let waitTimer = 0;
        /** @type {HTMLElement | null} */
        let lit = null;
        let litTimer = 0;

        const clearNotice = () => {
            notice?.remove();
            notice = null;
        };

        /** @param {HTMLElement} target */
        const reveal = (target) => {
            if (!opensFirst()) return;
            for (let p = target.parentElement; p && p !== doc.body; p = p.parentElement) {
                if (p instanceof HTMLDetailsElement && !p.open) p.open = true;
            }
        };

        /** @param {string} id @returns {boolean} whether there was a place to land */
        const land = (id) => {
            const target = id ? doc.getElementById(id) : null;
            if (!target || !box.contains(target)) return false;
            clearNotice();
            window.clearTimeout(waitTimer);
            const go = box.dispatchEvent(new CustomEvent(ANCHOR_REVEAL_EVENT, { bubbles: true, cancelable: true, detail: { id, target } }));
            if (go) reveal(target);
            target.scrollIntoView({ block: 'start', behavior: motionAllowed(box) ? 'smooth' : 'auto' });
            if (highlights()) {
                if (lit && lit !== target) lit.removeAttribute('data-kp-anchor-hit');
                lit = target;
                target.setAttribute('data-kp-anchor-hit', '');
                window.clearTimeout(litTimer);
                litTimer = window.setTimeout(() => {
                    target.removeAttribute('data-kp-anchor-hit');
                    if (lit === target) lit = null;
                }, ANCHOR_HIT_MS);
            }
            return true;
        };

        const showMissing = (/** @type {string} */ id) => {
            clearNotice();
            notice = doc.createElement('div');
            notice.className = 'kp-alert kp-alert--info kp-anchors__notice';
            notice.setAttribute('role', 'status');
            const text = doc.createElement('span');
            text.className = 'kp-alert__body kp-anchors__notice-text';
            text.textContent = strings.anchorMissing;
            const reset = doc.createElement('button');
            reset.type = 'button';
            reset.className = 'kp-button kp-button--sm kp-anchors__notice-action';
            reset.textContent = strings.anchorShowAll;
            reset.addEventListener('click', () => {
                try {
                    view.history.replaceState(null, '', `${view.location.pathname}${view.location.search}`);
                } catch {
                    // A sandboxed frame may refuse; the notice still goes.
                }
                clearNotice();
                box.dispatchEvent(new CustomEvent('kp-anchor-reset', { bubbles: true, detail: { id } }));
            });
            notice.append(text, reset);
            box.prepend(notice);
            box.dispatchEvent(new CustomEvent(ANCHOR_MISSING_EVENT, { bubbles: true, detail: { id } }));
        };

        const idOfHash = () => {
            try {
                return decodeURIComponent(view.location.hash.slice(1));
            } catch {
                return view.location.hash.slice(1);
            }
        };

        const arrive = () => {
            const id = idOfHash();
            window.clearTimeout(waitTimer);
            if (!id) return;
            const startedAt = Date.now();
            const tick = () => {
                const there = doc.getElementById(id);
                if (there && box.contains(there)) {
                    land(id);
                    return;
                }
                // The place belongs to another part of the page: not this container's to answer for.
                if (there) return;
                if (Date.now() - startedAt >= ANCHOR_WAIT_MS) {
                    // One notice for the page: the first container says it.
                    if (doc.querySelector(ANCHORS) === box) showMissing(id);
                    return;
                }
                waitTimer = window.setTimeout(tick, 250);
            };
            tick();
        };

        // A press copies.
        /** @param {Event} event */
        const onClick = async (event) => {
            const button = event.target instanceof Element ? /** @type {HTMLButtonElement | null} */ (event.target.closest('[data-kp-anchor-mark]')) : null;
            if (!button || !box.contains(button)) return;
            const el = [...marks].find(([, b]) => b === button)?.[0];
            if (!el) return;
            const markdownWanted = event instanceof MouseEvent && event.shiftKey;
            await copyLink(el, button, markdownWanted);
        };

        /** @param {HTMLElement} el @param {HTMLButtonElement} button @param {boolean} [markdownWanted] */
        const copyLink = async (el, button, markdownWanted = false) => {
            const id = el.id;
            const hash = `#${encodeURIComponent(id)}`;
            const url = copyMode() === 'hash' ? hash : `${view.location.origin}${view.location.pathname}${view.location.search}${hash}`;
            const markdown = `[${nameOf(el)}](${url})`;
            const text = markdownWanted ? markdown : url;
            try {
                view.history.replaceState(null, '', hash);
            } catch {
                // Not every frame may write its address.
            }
            const ok = await copyText(doc, text);
            button.setAttribute('data-kp-anchor-state', ok ? 'copied' : 'failed');
            const done = button.querySelector('.kp-anchor__done');
            const kind = el.getAttribute('data-kp-anchored');
            if (done) done.setAttribute('data-kp-text', ok ? (kind === 'row' ? '✓' : strings.anchorCopied) : kind === 'row' ? '!' : strings.anchorFailed);
            say(ok ? strings.anchorCopiedAnnounce(nameOf(el)) : strings.anchorFailedAnnounce);
            button.dispatchEvent(new CustomEvent(ANCHOR_COPY_EVENT, { bubbles: true, detail: { id, url, text, markdown, ok } }));
            const timer = view.setTimeout(() => {
                button.removeAttribute('data-kp-anchor-state');
            }, copiedMs());
            timers.push(timer);
        };

        box.addEventListener('click', onClick);
        view.addEventListener('hashchange', arrive);

        // The page's rows come and go: a datatable draws them again on a sort.
        let scheduled = false;
        const observer = new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            queueMicrotask(() => {
                scheduled = false;
                scan();
            });
        });
        observer.observe(box, { childList: true, subtree: true });

        // y then l on a focused row copies its link; listed in the ? sheet.
        /** @type {(() => void) | null} */
        let unregister = null;
        void import('./shortcuts.js').then(({ registerShortcuts }) => {
            if (!box.isConnected && !doc.contains(box)) return;
            unregister = registerShortcuts(
                box,
                [
                    {
                        keys: 'y l',
                        what: strings.anchorKeyCopy,
                        group: strings.anchorKeyGroup,
                        when: () => focusedRow() !== null,
                        run: () => {
                            const el = focusedRow();
                            const button = el ? marks.get(el) : undefined;
                            if (el && button) void copyLink(el, button);
                        },
                    },
                ],
                { dev: false },
            );
        });
        const focusedRow = () => {
            const active = doc.activeElement;
            if (!(active instanceof Element) || !box.contains(active)) return null;
            for (const el of marks.keys()) if (el.contains(active) && el.getAttribute('data-kp-anchored') === 'row') return el;
            return null;
        };

        REBUILD.set(box, () => {
            for (const [el, button] of marks) {
                button.remove();
                el.removeAttribute('data-kp-anchored');
            }
            marks.clear();
            scan();
        });
        scan();
        // The hash the page opened with.
        if (view.location.hash) view.setTimeout(arrive, 0);

        cleanups.push(() => {
            box.removeEventListener('click', onClick);
            view.removeEventListener('hashchange', arrive);
            observer.disconnect();
            REBUILD.delete(box);
            unregister?.();
            for (const t of timers) view.clearTimeout(t);
            window.clearTimeout(waitTimer);
            window.clearTimeout(litTimer);
            for (const [el, button] of marks) {
                button.remove();
                el.removeAttribute('data-kp-anchored');
            }
            marks.clear();
            clearNotice();
            live.remove();
            lit?.removeAttribute('data-kp-anchor-hit');
            box.classList.remove('kp-anchors');
            box.removeAttribute('data-kp-anchor-show');
            delete box.dataset.kpAnchorsAttached;
        });
    }
    return () => {
        for (const clean of cleanups) clean();
    };
}
