// "On this page": a contents list that follows the reader [wish-1120, homelab 95; the dashboard's Settings side list].
//
// A long page is a few sections; a list of them beside it says where the reader is and takes them to another with one press. This module
// builds that list from the page's own headings, marks the one the reader is in as they scroll (scroll-spy), and keeps the list in step
// when the headings change:
//
//   <nav class="kp-contents" data-kp-contents data-kp-contents-for="#settings" data-kp-contents-headings="h2, h3"></nav>
//
// Or from items the page gives, where the sections are cards without a heading of their own or want a count beside the name:
//
//   setContents(nav, [{ id: 'wc', label: 'Working copy' }, { id: 'signin', label: 'Sign-in', count: 3 }, { id: 'sub', label: 'Keys', level: 1 }]);
//
// Options, as attributes on the `nav` (read again when they change), each with a default [KT6]:
//
//   data-kp-contents-for       a selector for where the headings are                    the nearest `main`, else the page
//   data-kp-contents-headings  a selector for the headings that count                   h2
//   data-kp-contents-offset    px from the top of the window where a section counts as reached (a sticky header's height)   80
//   data-kp-contents-min       the fewest entries that earn a list; with fewer it is hidden   2
//   data-kp-contents-title     the heading over the list ("On this page"); `none` leaves it out
//   data-kp-contents-hash      `off`: a press does not write the address's #fragment    on
//   data-kp-contents-scroller  a selector for the box that scrolls the sections, when it is not the page (a pane with its own scroll); the
//                              offset then counts from the box's top edge. Left out, the pane the first section sits in is found by itself   the page
//
// A heading without an `id` gets one from its words. A press (or Enter on the entry) scrolls to the section, in its pane when it has one and the
// page does not move (smoothly, unless the reader asked for less motion),
// writes `#id` into the address without a new history entry, and gives the section's heading the focus, so a keyboard reader arrives where
// the page did. The entry of the section the reader is in has `aria-current="location"` and `data-kp-current`; it follows the scroll, and
// at the foot of the page the last entry is the current one. Entries nest by heading level (`data-kp-level`). `kp-contents-change`
// `{ id, label, previous }` is fired on the list when the current entry changes. `data-kp-state="loading"` shows three bars in the list's
// own footprint until the page gives its items. Nothing runs on import; attachContents(root) returns a detach.

import { getStrings } from './strings.js';

/** The lists this module looks after. */
export const CONTENTS = '[data-kp-contents]';
/** Fired on the list, bubbling, when the current entry changes: `{ id, label, previous }`. */
export const CONTENTS_EVENT = 'kp-contents-change';

/**
 * @typedef {object} ContentsItem
 * @property {string} id the section's `id`
 * @property {string} label the entry's words
 * @property {number} [level] 0 (default) for a section, 1 under it, and so on
 * @property {string | number} [count] a small number or word after the label
 */

/**
 * @typedef {object} ContentsHandle
 * @property {() => string | null} current the id of the current entry
 * @property {() => void} refresh read the headings again now
 * @property {(items: readonly ContentsItem[] | null) => void} setItems entries the page gives; null goes back to the headings
 */

/** @type {WeakMap<Element, ContentsHandle>} */
const HANDLES = new WeakMap();
let serial = 0;

/** The id a heading's words make: lower case, letters and digits joined by hyphens. @param {string} text */
export function contentsSlug(text) {
    const slug = text
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'section';
}

/**
 * Which entry is current: the first section (in page order) whose top has passed the offset line and whose bottom has not; with none,
 * the last one passed; and the last entry at the foot of the page. Pure.
 * @param {readonly { top: number, bottom: number }[]} boxes the sections' boxes, in page order, relative to the window
 * @param {number} offset the line, px from the top of the window
 * @param {boolean} atEnd the page is scrolled to its foot
 * @returns {number} the index, -1 for none
 */
export function currentSection(boxes, offset, atEnd) {
    if (!boxes.length) return -1;
    if (atEnd) return boxes.length - 1;
    let found = -1;
    boxes.forEach((box, i) => {
        if (box.top <= offset + 1) found = i;
    });
    return found;
}

/** @param {Element} nav */
function attachOne(nav) {
    if (HANDLES.has(nav)) return () => undefined;
    const doc = nav.ownerDocument;
    const view = /** @type {Window & typeof globalThis} */ (doc.defaultView);
    const s = getStrings();
    const id = nav.id || (nav.id = `kp-contents-${(serial += 1)}`);
    nav.classList.add('kp-contents');
    if (!nav.hasAttribute('aria-label') && !nav.hasAttribute('aria-labelledby')) nav.setAttribute('aria-label', s.contentsLabel);
    const title = doc.createElement('p');
    title.className = 'kp-contents__title';
    title.id = `${id}-title`;
    const list = doc.createElement('ol');
    list.className = 'kp-contents__list';
    const wait = doc.createElement('div');
    wait.className = 'kp-contents__wait';
    wait.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i += 1) {
        const bone = doc.createElement('span');
        bone.className = 'kp-skeleton kp-contents__bone';
        wait.append(bone);
    }
    nav.replaceChildren(title, list, wait);

    /** @type {ContentsItem[] | null} */
    let given = null;
    /** @type {{ item: ContentsItem, target: HTMLElement, link: HTMLAnchorElement }[]} */
    let entries = [];
    /** @type {string | null} */
    let current = null;
    let raf = 0;

    /**
     * The element a selector names, looked for from the list outwards: the nearest ancestor that holds a match wins, so a page that shows
     * the same markup twice (a copy in a dialog, a preview beside the page) is read from its own copy, not from the first one in the document.
     * @param {string | null} selector
     * @returns {Element | null}
     */
    const lookup = (selector) => {
        if (!selector) return null;
        try {
            for (let up = nav.parentElement; up; up = up.parentElement) {
                const hit = up.querySelector(selector);
                if (hit) return hit;
            }
            return doc.querySelector(selector);
        } catch {
            return null;
        }
    };
    const scope = () => {
        const found = lookup(nav.getAttribute('data-kp-contents-for'));
        return found ?? nav.closest('body')?.querySelector('main') ?? doc.body;
    };
    const offset = () => {
        const n = Number(nav.getAttribute('data-kp-contents-offset'));
        return nav.hasAttribute('data-kp-contents-offset') && Number.isFinite(n) ? n : 80;
    };
    const least = () => {
        const n = Number(nav.getAttribute('data-kp-contents-min'));
        return nav.hasAttribute('data-kp-contents-min') && Number.isFinite(n) ? n : 2;
    };
    /** The nearest ancestor of `el` that scrolls vertically (below the page itself), or null. @param {Element} el @returns {HTMLElement | null} */
    const scrollParent = (el) => {
        for (let up = el.parentElement; up && up !== doc.body && up !== doc.documentElement; up = up.parentElement) {
            const overflow = view.getComputedStyle(up).overflowY;
            if ((overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') && up.scrollHeight > up.clientHeight + 1) return up;
        }
        return null;
    };
    /** The box that scrolls the sections when they live in a pane of their own: the one the page names, else the one the first section sits in. @returns {HTMLElement | null} */
    const scroller = () => {
        const found = lookup(nav.getAttribute('data-kp-contents-scroller'));
        if (found instanceof HTMLElement) return found;
        const first = entries[0]?.target;
        return first ? scrollParent(first) : null;
    };
    const motion = () => (view.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

    /** @returns {{ item: ContentsItem, target: HTMLElement }[]} */
    const read = () => {
        if (given) {
            return given.flatMap((item) => {
                const target = /** @type {HTMLElement | null} */ (lookup(`#${view.CSS.escape(item.id)}`));
                return target ? [{ item, target }] : [];
            });
        }
        const selector = nav.getAttribute('data-kp-contents-headings') || 'h2';
        /** @type {HTMLElement[]} */
        let headings;
        try {
            headings = /** @type {HTMLElement[]} */ ([...scope().querySelectorAll(selector)]);
        } catch {
            headings = [];
        }
        headings = headings.filter((h) => !nav.contains(h) && !h.hidden && (h.textContent ?? '').trim() !== '');
        const levels = headings.map((h) => (/^H[1-6]$/.test(h.tagName) ? Number(h.tagName[1]) : 2));
        const top = Math.min(...levels);
        const used = new Set([...doc.querySelectorAll('[id]')].map((e) => e.id));
        return headings.map((target, i) => {
            if (!target.id) {
                const base = contentsSlug(target.textContent ?? '');
                let candidate = base;
                for (let n = 2; used.has(candidate); n += 1) candidate = `${base}-${n}`;
                target.id = candidate;
                used.add(candidate);
            }
            return { item: { id: target.id, label: (target.textContent ?? '').trim(), level: Math.max(0, levels[i] - top) }, target };
        });
    };

    const mark = (/** @type {string | null} */ next) => {
        const previous = current;
        current = next;
        for (const { item, link } of entries) {
            const on = item.id === next;
            link.toggleAttribute('data-kp-current', on);
            if (on) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
        }
        if (previous !== next && next !== null) {
            const hit = entries.find((e) => e.item.id === next);
            nav.dispatchEvent(new CustomEvent(CONTENTS_EVENT, { bubbles: true, detail: { id: next, label: hit?.item.label ?? '', previous } }));
        }
    };

    const spy = () => {
        raf = 0;
        if (!entries.length) return;
        bindPane();
        const own = scroller();
        const root = own ?? doc.scrollingElement ?? doc.documentElement;
        const atEnd = own
            ? own.scrollTop + own.clientHeight >= own.scrollHeight - 2 && own.scrollTop > 0
            : root.scrollTop + view.innerHeight >= root.scrollHeight - 2 && root.scrollTop > 0;
        const edge = own ? own.getBoundingClientRect().top : 0;
        const at = currentSection(
            entries.map((e) => {
                const box = e.target.getBoundingClientRect();
                return { top: box.top - edge, bottom: box.bottom - edge };
            }),
            offset(),
            atEnd,
        );
        mark(at < 0 ? (entries[0]?.item.id ?? null) : entries[at].item.id);
    };
    const queueSpy = () => {
        if (!raf) raf = view.requestAnimationFrame(spy);
    };

    const draw = () => {
        const next = read();
        const state = nav.getAttribute('data-kp-state');
        title.hidden = nav.getAttribute('data-kp-contents-title') === 'none';
        title.textContent = s.contentsTitle;
        const signature = JSON.stringify(next.map((e) => [e.item.id, e.item.label, e.item.level ?? 0, e.item.count ?? '']));
        wait.hidden = state !== 'loading';
        nav.toggleAttribute('aria-busy', state === 'loading');
        /** @type {HTMLElement} */ (nav).hidden = state !== 'loading' && next.length < least();
        if (nav.getAttribute('data-kp-contents-sig') === signature) {
            bindPane();
            return queueSpy();
        }
        nav.setAttribute('data-kp-contents-sig', signature);
        entries = next.map(({ item, target }) => {
            const li = doc.createElement('li');
            li.className = 'kp-contents__item';
            li.dataset.kpLevel = String(item.level ?? 0);
            const link = doc.createElement('a');
            link.className = 'kp-contents__link';
            link.href = `#${item.id}`;
            const label = doc.createElement('span');
            label.className = 'kp-contents__label';
            label.textContent = item.label;
            link.append(label);
            if (item.count !== undefined && item.count !== '') {
                const count = doc.createElement('span');
                count.className = 'kp-contents__count';
                count.textContent = String(item.count);
                link.append(count);
            }
            li.append(link);
            return { item, target, link, li };
        });
        list.replaceChildren(.../** @type {any[]} */ (entries).map((e) => e.li));
        current = null;
        bindPane();
        queueSpy();
    };

    /** @param {Event} raw */
    const onClick = (raw) => {
        const event = /** @type {MouseEvent} */ (raw);
        const link = event.target instanceof Element ? event.target.closest('.kp-contents__link') : null;
        if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const hit = entries.find((e) => e.link === link);
        if (!hit) return;
        event.preventDefault();
        const own = scroller();
        if (own) {
            // The sections scroll in a pane: move the pane (never the page) so the section's top lands on the offset line.
            const gap = hit.target.getBoundingClientRect().top - own.getBoundingClientRect().top - Math.min(offset(), own.clientHeight / 4);
            own.scrollTo({ top: Math.max(0, own.scrollTop + gap), behavior: motion() });
        } else hit.target.scrollIntoView({ behavior: motion(), block: 'start' });
        if (!hit.target.hasAttribute('tabindex') && !hit.target.matches('a[href], button, input, select, textarea, summary')) hit.target.tabIndex = -1;
        hit.target.focus({ preventScroll: true });
        if (nav.getAttribute('data-kp-contents-hash') !== 'off') {
            try {
                view.history.replaceState(view.history.state, '', `#${hit.item.id}`);
            } catch {
                /* a sandboxed frame keeps the address as it is */
            }
        }
        mark(hit.item.id);
    };
    nav.addEventListener('click', onClick);
    view.addEventListener('scroll', queueSpy, { passive: true });
    view.addEventListener('resize', queueSpy);
    // A pane with its own scroll: its scroll does not bubble to the window, so it is listened to itself (and again when the sections move to another pane).
    /** @type {HTMLElement | null} */
    let pane = null;
    const bindPane = () => {
        const next = scroller();
        if (next === pane) return;
        pane?.removeEventListener('scroll', queueSpy);
        pane = next;
        pane?.addEventListener('scroll', queueSpy, { passive: true });
    };
    const changes = new view.MutationObserver((records) => {
        if (records.some((r) => !nav.contains(r.target))) queueMicrotask(draw);
    });
    changes.observe(scope(), { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'id'] });
    const options = new view.MutationObserver(draw);
    options.observe(nav, {
        attributes: true,
        attributeFilter: ['data-kp-contents-for', 'data-kp-contents-headings', 'data-kp-contents-min', 'data-kp-contents-title', 'data-kp-state', 'data-kp-contents-offset'],
    });

    HANDLES.set(nav, {
        current: () => current,
        refresh: draw,
        setItems(items) {
            given = items ? [...items] : null;
            draw();
        },
    });
    draw();
    return () => {
        view.cancelAnimationFrame(raf);
        nav.removeEventListener('click', onClick);
        view.removeEventListener('scroll', queueSpy);
        view.removeEventListener('resize', queueSpy);
        pane?.removeEventListener('scroll', queueSpy);
        changes.disconnect();
        options.disconnect();
        nav.replaceChildren();
        nav.removeAttribute('data-kp-contents-sig');
        HANDLES.delete(nav);
    };
}

/**
 * The handle of an attached list.
 * @param {Element} nav
 * @returns {ContentsHandle | null}
 */
export function contents(nav) {
    return HANDLES.get(nav) ?? null;
}

/**
 * Give a list its entries (the page's own sections), or `null` to go back to reading the headings.
 * @param {Element} nav an attached `[data-kp-contents]`
 * @param {readonly ContentsItem[] | null} items
 */
export function setContents(nav, items) {
    HANDLES.get(nav)?.setItems(items);
}

/**
 * Build a contents list for every `[data-kp-contents]` under `root` and follow the reader.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachContents(root = document) {
    const found = /** @type {HTMLElement[]} */ ([...(root instanceof HTMLElement && root.matches(CONTENTS) ? [root] : []), ...root.querySelectorAll(CONTENTS)]);
    const undo = found.map((nav) => attachOne(nav));
    return () => undo.forEach((u) => u());
}
