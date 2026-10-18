// The identity mark: a small chip made from a name [kpadopt4-data; JobTracker's
// `Mark` (ui/kit.jsx) and the admin dashboard's `stackMark` (ui.js)].
//
// Two apps drew the same idea twice: a company or a stack gets a little
// plate of its own, the same on every page, so the eye finds it in a list
// before it reads the name. This is that plate, made from the name alone:
//
//   <span class="kp-idmark" data-kp-idmark="Acme Logistics" aria-hidden="true"></span>
//   <span class="kp-idmark kp-idmark--pattern kp-idmark--sm" data-kp-idmark="media" aria-hidden="true"></span>
//
// From the name (FNV-1a, the same hash as the facet swatch's pattern, so a
// name has one look in both places) come:
//   - the colour: one of the theme's five chart colours (`--chart-1..5`), so
//     the mark lives in the theme's own palette; or, with
//     `data-kp-idmark-hue="free"`, the hue of the hash on the lightness and
//     chroma of `--chart-1` (the admin dashboard's one colour per stack);
//   - the letters: the initials of the first two words, else the first two
//     letters (one on the extra-small mark), upper case;
//   - the pattern (`--pattern`): a 5 by 5 grid mirrored about its middle;
//   - the corner glyph (`--glyph`): circle, square, triangle or diamond.
//
// `idmarkColours(names)` gives a list of names palette slots that do not
// collide while free slots remain, for a list read together (a legend, a
// board); `setIdmark(el, name, { slot })` takes one. The mark is decorative:
// it is hidden from a screen reader and the name always stands beside it
// (`.kp-idmark-name`). An empty name is a quiet dashed plate with a "?".
//
// Sizes `--xs` `--sm` (md is the default) `--lg` `--xl`, `--round`; a list
// marks its current one with `aria-current` or `data-kp-idmark-selected`, and a
// loading mark is `.kp-idmark.kp-skeleton`. `.kp-idmark-group` overlaps marks with
// an exact `.kp-idmark-group__more` ("+3", never "9+").
//
// The avatar [kpadopt5-people; kp-soft's shadcn avatar, JobTracker's recruiter
// photos]: the same mark with a photo on it, so a person without one looks
// exactly like today's marks.
//
//   <span class="kp-idmark kp-idmark--round" data-kp-idmark="Ada Lovelace"
//         data-kp-idmark-src="/people/ada.jpg" data-kp-idmark-status="online"></span>
//
//   data-kp-idmark-src      the photo. The plate keeps its size and its letters
//                           underneath while the photo loads; the photo fades in
//                           (`data-kp-photo` loading, loaded, failed). A photo
//                           that fails leaves the letters, with no error mark:
//                           the person is still identified. Fires
//                           `kp-idmark-photo` `{ state, src }`;
//   data-kp-idmark-loading  `lazy` (default) or `eager`, as the img's `loading`;
//   data-kp-idmark-alt      `decorative` (default: hidden from a screen reader,
//                           the name stands beside it) or `name` (the mark is an
//                           image called by the name);
//   data-kp-idmark-status   `online`, `away`, `busy` or `none` (default): a dot at
//                           the foot corner whose shape differs too (full, ring,
//                           barred), and its word joins the mark's label, so it is
//                           never colour alone. A status makes the mark an image.
//
// `setIdmarkGroup(el, people, { max })` draws a group with an exact "+N" that is
// a button: it opens the list of the names left out.

import { getStrings } from './strings.js';
import { identityCells } from './facets.js';

/** A mark the module fills from its name. */
export const IDMARK = '[data-kp-idmark]';
/** How many colours the theme's chart palette has. */
export const IDMARK_SLOTS = 5;
/** The corner glyphs, in the order the hash picks them. */
export const IDMARK_GLYPHS = Object.freeze(['circle', 'square', 'triangle', 'diamond']);

const SVG_NS = 'http://www.w3.org/2000/svg';

/** FNV-1a over a name, as js/facets.js hashes a pattern's seed. @param {string} name */
function hashOf(name) {
    let hash = 2166136261;
    for (const ch of name) hash = Math.imul(hash ^ (ch.codePointAt(0) ?? 0), 16777619);
    return hash >>> 0;
}

/**
 * The letters of a name: the initials of its first two words, or its first
 * two letters when it is one word. Letters and digits only.
 * @param {string} name @param {number} [count]
 */
export function idmarkLetters(name, count = 2) {
    const words = name
        .normalize('NFKC')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
    if (words.length === 0) return '';
    const letters = words.length > 1 ? words.slice(0, count).map((word) => [...word][0]) : [...words[0]].slice(0, count);
    return letters.join('').toLocaleUpperCase();
}

/**
 * Everything a mark is, from its name. Pure: the same name gives the same
 * mark in node and in every browser.
 * @param {string} name
 * @returns {{ name: string, empty: boolean, slot: number, hue: number, letters: string, glyph: string, cells: [number, number][] }}
 *   `slot` 1 to 5 (the chart colour), `hue` 0 to 359 (the free hue)
 */
export function idmarkFor(name) {
    const clean = (name ?? '').trim();
    if (clean === '') return { name: '', empty: true, slot: 0, hue: 0, letters: '', glyph: IDMARK_GLYPHS[0], cells: [] };
    const hash = hashOf(clean.toLocaleLowerCase());
    return {
        name: clean,
        empty: false,
        slot: (hash % IDMARK_SLOTS) + 1,
        hue: hash % 360,
        letters: idmarkLetters(clean),
        glyph: IDMARK_GLYPHS[(hash >>> 3) % IDMARK_GLYPHS.length],
        cells: identityCells(clean),
    };
}

/**
 * Palette slots for names read together: each name keeps its own slot where
 * no other name took it; a collision moves the later name to the nearest
 * slot still free, and only when all five are taken do names share.
 * The order of `names` decides who keeps a contested slot.
 * @param {readonly string[]} names
 * @returns {Map<string, number>} name to slot, 1 to 5
 */
export function idmarkColours(names) {
    /** @type {Map<string, number>} */
    const out = new Map();
    /** @type {Map<number, number>} */
    const used = new Map();
    for (const raw of names) {
        const name = (raw ?? '').trim();
        if (name === '' || out.has(name)) continue;
        const own = idmarkFor(name).slot;
        let slot = own;
        const least = Math.min(...Array.from({ length: IDMARK_SLOTS }, (_, i) => used.get(i + 1) ?? 0));
        if ((used.get(own) ?? 0) > least)
            for (let step = 1; step < IDMARK_SLOTS; step += 1) {
                const next = ((own - 1 + step) % IDMARK_SLOTS) + 1;
                if ((used.get(next) ?? 0) === least) {
                    slot = next;
                    break;
                }
            }
        used.set(slot, (used.get(slot) ?? 0) + 1);
        out.set(name, slot);
    }
    return out;
}

/** @param {Document} doc @param {[number, number][]} cells */
function patternSvg(doc, cells) {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'kp-idmark__pattern');
    svg.setAttribute('viewBox', '0 0 7 7');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('shape-rendering', 'crispEdges');
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', cells.map(([x, y]) => `M${x + 1} ${y + 1}h1v1h-1z`).join(''));
    svg.append(path);
    return svg;
}

/**
 * Fill a mark from a name: its colour, letters, pattern and glyph. Call it
 * again with a new name; an empty name gives the quiet plate.
 * @param {HTMLElement} el a `.kp-idmark`
 * @param {string} name
 * @param {{ slot?: number, hue?: 'palette' | 'free', title?: boolean }} [options]
 *   `slot` a palette slot from idmarkColours(); `hue` defaults to the element's
 *   `data-kp-idmark-hue` ('free') else 'palette'; `title` (default true) puts
 *   the name in the element's title for a pointer
 */
export function setIdmark(el, name, { slot, hue, title = true } = {}) {
    const mark = idmarkFor(name);
    const doc = el.ownerDocument;
    el.classList.add('kp-idmark');
    if (!el.hasAttribute('aria-hidden')) el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-kp-idmark', mark.name);
    el.toggleAttribute('data-kp-idmark-empty', mark.empty);
    el.setAttribute('data-kp-idmark-glyph', mark.glyph);
    const free = (hue ?? el.getAttribute('data-kp-idmark-hue')) === 'free';
    if (mark.empty) el.style.removeProperty('--kp-idmark-colour');
    else if (free) el.style.setProperty('--kp-idmark-colour', `oklch(from var(--chart-1) l c ${mark.hue})`);
    else el.style.setProperty('--kp-idmark-colour', `var(--chart-${slot ?? mark.slot})`);
    if (title && mark.name) el.title = mark.name;
    else el.removeAttribute('title');
    const xs = el.classList.contains('kp-idmark--xs');
    const letters = doc.createElement('span');
    letters.className = 'kp-idmark__letters';
    letters.textContent = mark.empty ? getStrings().idmarkUnknown : idmarkLetters(mark.name, xs ? 1 : 2);
    el.replaceChildren(letters, ...(mark.empty ? [] : [patternSvg(doc, mark.cells)]));
    decorateAvatar(el, mark.name);
    DRAWN.set(el, { base: baseKey(el), slot: slot ?? mark.slot });
}

/** What each mark was last drawn from, so a mark drawn by setIdmark() is not drawn a second time by attachIdmarks(). @type {WeakMap<Element, { base: string, slot: number }>} */
const DRAWN = new WeakMap();

/** What a mark is drawn from, apart from its palette slot. @param {Element} el */
const baseKey = (el) =>
    `${el.getAttribute('data-kp-idmark') ?? ''}|${AVATAR_ATTRIBUTES.map((attr) => el.getAttribute(attr) ?? '').join('|')}|${el.className}`;

/** The attributes of a mark that redraw it when they change. */
const AVATAR_ATTRIBUTES = ['data-kp-idmark-hue', 'data-kp-idmark-src', 'data-kp-idmark-status', 'data-kp-idmark-alt', 'data-kp-idmark-loading'];

/** The statuses a mark can show. */
export const IDMARK_STATUSES = Object.freeze(['online', 'away', 'busy']);

/** Whether this call gave `aria-hidden` to the mark itself (a mark the markup hid keeps it). @type {WeakSet<Element>} */
const OWN_LABEL = new WeakSet();
/** The photo a mark last asked for. @type {WeakMap<Element, string>} */
const ASKED = new WeakMap();

/**
 * The avatar part of a mark: its photo, its status dot and how a screen reader
 * hears it.
 * @param {HTMLElement} el @param {string} name
 */
function decorateAvatar(el, name) {
    const doc = el.ownerDocument;
    const strings = getStrings();
    const src = (el.getAttribute('data-kp-idmark-src') ?? '').trim();
    const rawStatus = el.getAttribute('data-kp-idmark-status') ?? 'none';
    const status = IDMARK_STATUSES.includes(rawStatus) ? rawStatus : 'none';
    const alt = el.getAttribute('data-kp-idmark-alt') === 'name' ? 'name' : 'decorative';

    // A status dot with its word in the label: the mark becomes an image called "Ada, online".
    el.querySelector(':scope > .kp-idmark__status')?.remove();
    if (status !== 'none') {
        const dot = doc.createElement('span');
        dot.className = 'kp-idmark__status';
        dot.setAttribute('data-kp-status', status);
        el.append(dot);
    }
    const statusWord = status === 'none' ? '' : /** @type {Record<string, string>} */ ({
        online: strings.idmarkOnline,
        away: strings.idmarkAway,
        busy: strings.idmarkBusy,
    })[status];
    const speaks = name !== '' && (alt === 'name' || status !== 'none');
    if (speaks) {
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', statusWord ? strings.idmarkLabel(name, statusWord) : name);
        if (statusWord) el.title = strings.idmarkLabel(name, statusWord);
        el.removeAttribute('aria-hidden');
        OWN_LABEL.add(el);
    } else if (OWN_LABEL.has(el)) {
        el.removeAttribute('role');
        el.removeAttribute('aria-label');
        el.setAttribute('aria-hidden', 'true');
        OWN_LABEL.delete(el);
    }

    // The photo: the letters stay underneath until it has loaded; the plate's size is fixed, so nothing shifts.
    el.querySelector(':scope > .kp-idmark__photo')?.remove();
    ASKED.set(el, src);
    if (src === '' || name === '') {
        el.removeAttribute('data-kp-photo');
        return;
    }
    const img = doc.createElement('img');
    img.className = 'kp-idmark__photo';
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.loading = el.getAttribute('data-kp-idmark-loading') === 'eager' ? 'eager' : 'lazy';
    /** @param {'loaded' | 'failed'} state */
    const settle = (state) => {
        if (ASKED.get(el) !== src) return;
        if (state === 'failed') img.remove();
        el.setAttribute('data-kp-photo', state);
        el.dispatchEvent(new CustomEvent('kp-idmark-photo', { bubbles: true, detail: { state, src } }));
    };
    img.addEventListener('load', () => settle('loaded'));
    img.addEventListener('error', () => settle('failed'));
    el.setAttribute('data-kp-photo', 'loading');
    img.src = src;
    el.prepend(img);
    if (img.complete && img.naturalWidth > 0) settle('loaded');
}

/**
 * @typedef {object} IdmarkPerson
 * @property {string} name
 * @property {string} [src] the photo
 * @property {'online' | 'away' | 'busy' | 'none'} [status]
 */

/**
 * Draw a group of marks with an exact "+N" for the people left out. The "+N" is
 * a button that opens the list of their names (`list: false` leaves it a plain
 * count). Counts are the real number, never "9+".
 * @param {HTMLElement} el the group, a `.kp-idmark-group`
 * @param {readonly IdmarkPerson[]} people
 * @param {{ max?: number, size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl', round?: boolean, list?: boolean }} [options]
 *   `max` marks shown (default 4); `size` the marks' size (default md); `round` round marks (default true)
 */
export function setIdmarkGroup(el, people, { max = 4, size = 'md', round = true, list = true } = {}) {
    const doc = el.ownerDocument;
    const strings = getStrings();
    el.classList.add('kp-idmark-group');
    el.classList.toggle('kp-idmark-group--sm', size === 'sm' || size === 'xs');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', strings.idmarkGroup(people.length));
    const shown = people.slice(0, Math.max(0, max));
    const rest = people.slice(shown.length);
    const colours = idmarkColours(people.map((person) => person.name));
    const marks = shown.map((person) => {
        const mark = doc.createElement('span');
        mark.className = ['kp-idmark', size === 'md' ? '' : `kp-idmark--${size}`, round ? 'kp-idmark--round' : ''].filter(Boolean).join(' ');
        mark.setAttribute('data-kp-idmark', person.name);
        if (person.src) mark.setAttribute('data-kp-idmark-src', person.src);
        if (person.status && person.status !== 'none') mark.setAttribute('data-kp-idmark-status', person.status);
        mark.setAttribute('data-kp-idmark-alt', 'name');
        setIdmark(mark, person.name, { slot: colours.get(person.name.trim()) });
        return mark;
    });
    /** @type {HTMLElement[]} */
    const tail = [];
    if (rest.length > 0) {
        if (!list) {
            const more = doc.createElement('span');
            more.className = 'kp-idmark-group__more';
            more.textContent = `+${rest.length}`;
            more.title = rest.map((person) => person.name).join(', ');
            tail.push(more);
        } else {
            const id = `kp-idmark-more-${++moreSeq}`;
            const more = doc.createElement('button');
            more.type = 'button';
            more.className = 'kp-idmark-group__more';
            more.textContent = `+${rest.length}`;
            more.setAttribute('aria-haspopup', 'true');
            more.setAttribute('aria-expanded', 'false');
            more.setAttribute('aria-controls', id);
            more.setAttribute('aria-label', strings.idmarkMore(rest.length));
            const panel = doc.createElement('div');
            panel.className = 'kp-idmark-group__list';
            panel.id = id;
            panel.hidden = true;
            const heading = doc.createElement('p');
            heading.className = 'kp-idmark-group__list-title';
            heading.textContent = strings.idmarkMoreTitle(rest.length);
            const ul = doc.createElement('ul');
            for (const person of rest) {
                const li = doc.createElement('li');
                const row = doc.createElement('span');
                row.className = 'kp-idmark-name';
                const mark = doc.createElement('span');
                mark.className = `kp-idmark kp-idmark--sm${round ? ' kp-idmark--round' : ''}`;
                mark.setAttribute('data-kp-idmark', person.name);
                if (person.src) mark.setAttribute('data-kp-idmark-src', person.src);
                mark.setAttribute('aria-hidden', 'true');
                setIdmark(mark, person.name, { slot: colours.get(person.name.trim()), title: false });
                const text = doc.createElement('span');
                text.textContent = person.name;
                row.append(mark, text);
                li.append(row);
                ul.append(li);
            }
            panel.append(heading, ul);
            const close = () => {
                panel.hidden = true;
                more.setAttribute('aria-expanded', 'false');
                doc.removeEventListener('pointerdown', away, true);
            };
            /** @param {Event} event */
            const away = (event) => {
                if (!(event.target instanceof Node) || (!panel.contains(event.target) && !more.contains(event.target))) close();
            };
            more.addEventListener('click', () => {
                const open = panel.hidden;
                panel.hidden = !open;
                more.setAttribute('aria-expanded', String(open));
                if (open) doc.addEventListener('pointerdown', away, true);
                else doc.removeEventListener('pointerdown', away, true);
            });
            panel.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    close();
                    more.focus();
                }
            });
            more.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && !panel.hidden) {
                    event.stopPropagation();
                    close();
                }
            });
            tail.push(more, panel);
        }
    }
    el.replaceChildren(...marks, ...tail);
}

let moreSeq = 0;

/**
 * Fill every `[data-kp-idmark]` under `root`, and each one added or renamed
 * later. Marks inside one `[data-kp-idmark-set]` share out the palette with
 * idmarkColours(), in document order.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachIdmarks(root = document) {
    const paint = () => {
        /** @type {Map<Element, Element[]>} */
        const sets = new Map();
        const all = /** @type {HTMLElement[]} */ ([
            ...(root instanceof Element && root.matches(IDMARK) ? [root] : []),
            ...root.querySelectorAll(IDMARK),
        ]);
        for (const el of all) {
            const set = el.closest('[data-kp-idmark-set]');
            if (set) (sets.get(set) ?? sets.set(set, []).get(set))?.push(el);
        }
        /** @type {Map<Element, number>} */
        const slots = new Map();
        for (const members of sets.values()) {
            const colours = idmarkColours(members.map((el) => el.getAttribute('data-kp-idmark') ?? ''));
            for (const el of members) {
                const slot = colours.get((el.getAttribute('data-kp-idmark') ?? '').trim());
                if (slot) slots.set(el, slot);
            }
        }
        for (const el of all) {
            const name = el.getAttribute('data-kp-idmark') ?? '';
            const before = DRAWN.get(el);
            const want = slots.get(el);
            if (before?.base === baseKey(el) && (want === undefined || want === before.slot) && el.querySelector(':scope > .kp-idmark__letters')) continue;
            setIdmark(el, name, { slot: want });
        }
    };
    paint();
    const View = (root instanceof Document ? root : root.ownerDocument)?.defaultView;
    if (!View?.MutationObserver) return () => {};
    let queued = false;
    const observer = new View.MutationObserver((records) => {
        const relevant = records.some(
            (record) =>
                record.type === 'attributes' ||
                [...record.addedNodes].some((node) => node instanceof View.Element && (node.matches(IDMARK) || node.querySelector(IDMARK) !== null)),
        );
        if (!relevant || queued) return;
        queued = true;
        View.queueMicrotask(() => {
            queued = false;
            paint();
        });
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-kp-idmark', ...AVATAR_ATTRIBUTES] });
    return () => observer.disconnect();
}
