// A menu button with a rich menu: every other action, grouped [scope-143].
//
// The homelab dashboard's "More ▾" (port spec B), moved into the package on
// the menu it already has: the menu is a `.kp-menu` with `.kp-menu__item`
// entries, the registers paint it as they paint every menu, and the keys are
// the ones the data table's column menu answers (↓ ↑ wrap, Home, End). What
// this adds is the rich shape and the wiring a menu button needs:
//
//   <div class="kp-menu-button" data-kp-menu-button data-kp-key="pump-more">
//     <button type="button" class="kp-button">More ▾</button>
//     <div class="kp-menu kp-menu--rich" role="menu" aria-label="Every other action"></div>
//   </div>
//
// setMenu(wrapper, groups) fills it: groups of entries under small muted
// capitals (`.kp-menu__heading`, which names its `role="group"`), each entry
// a label over a one-line hint. An entry that cannot be used now stays in
// the list and in the keyboard's reach (`aria-disabled`, focusable, as the
// APG menu pattern asks), keeps its hint, and says why under it
// (`.kp-menu__reason`), as its accessible description too; it does nothing.
// A fill that shows the same as now is skipped, and while the menu is open a
// new fill waits until it closes, so a live refill never moves an entry
// under the pointer or the focus.
//
// The keys are a menu's: ↓ or ↑ on the button opens it on the first or last
// entry; ↓ ↑ (wrapping), Home and End move; a letter jumps to the next entry
// that starts with it; Esc closes and refocuses the button, and the page's
// own Escape listeners hear nothing; Tab closes and moves on from the
// button. A click outside closes it. A pick fires `kp-menu-select`, which a
// page may cancel to keep the menu open.
//
// The open menu is always whole on the screen (menuPlacement()): it moves
// to the button's other edge, or over the button, or scrolls inside itself,
// and stays clear of a bar the page has stuck over the screen's edge.
//
// Every word is in the dictionary (`menuLoading`, `menuEmpty` in
// js/strings.js). `decorate(part, info)` is called with the button and with
// every entry, each time one is built, so a consumer can mark them. Nothing
// runs on import; attachMenuButtons(root) returns a detach.

import { resolveStrings } from './strings.js';
import { playClose, stopClose } from './motion.js';
import { raiseOverlay } from './top-layer.js';

/** A menu button's wrapper: a button, then its `[role=menu]`. */
export const MENU_BUTTON = '[data-kp-menu-button]';

/** Fired on the wrapper, bubbling, when the menu opened. */
export const MENU_OPEN_EVENT = 'kp-menu-open';
/** Fired on the wrapper, bubbling, when the menu closed. */
export const MENU_CLOSE_EVENT = 'kp-menu-close';
/** Fired on the wrapper, bubbling, when an entry was picked: `{ item, value }`. Cancelable: preventing it keeps the menu open. */
export const MENU_SELECT_EVENT = 'kp-menu-select';

/** @typedef {import('./strings.js').Strings} Strings */

/**
 * One entry of a menu.
 * @typedef {object} MenuItem
 * @property {string} label what the action is called
 * @property {string} [hint] what it does, in one line
 * @property {string} [href] a link rather than a button
 * @property {string} [download] with `href`: the file name to save under
 * @property {string | null} [disabled] why it cannot be used now; the entry stays, keeps its hint, and says this under it
 * @property {boolean} [danger] a destructive action, in the destructive colour
 * @property {Record<string, string | null>} [attrs] more attributes for the entry (`null` removes one)
 * @property {string} [value] what `kp-menu-select` reports (`data-kp-value`); the label when absent
 */

/**
 * A group of entries under its heading. A nameless group, or a menu of one
 * entry, has no heading.
 * @typedef {object} MenuGroup
 * @property {string} group its heading
 * @property {MenuItem[]} items
 */

/**
 * What `decorate` is told about the control it is handed: the same shape every kp module's `decorate` takes.
 * `kind` is `menu-button` (the button that opens the menu) or `menu-item` (an entry; `index` counts from 0 across
 * the groups, `label` is its label, `value` its `data-kp-value`). `host` is the wrapper and `key` its `data-kp-key`.
 * @typedef {{ kind: 'menu-button' | 'menu-item', host: HTMLElement, key?: string, index?: number, label?: string, value?: string }} MenuDecorateInfo
 */

/**
 * @typedef {object} MenuButtonOptions
 * @property {(part: HTMLElement, info: MenuDecorateInfo) => void} [decorate]  Called with the button and every entry the menu builds,
 *   each time it builds one, so the consumer can mark them [R-DRIVE].
 * @property {Partial<Strings>} [strings]  any of the dictionary's `menu…` words, for these menus only
 */

/**
 * @typedef {object} MenuState
 * @property {HTMLElement} wrapper
 * @property {HTMLElement} button
 * @property {HTMLElement} menu
 * @property {((part: HTMLElement, info: MenuDecorateInfo) => void) | undefined} decorate
 * @property {Partial<Strings> | undefined} strings
 * @property {string} drawn what the menu shows now, as `menuSignature` writes it
 * @property {MenuGroup[] | 'loading' | null} pending a fill that waits for the menu to close
 * @property {(() => void) | null} [lower] takes a menu raised over a clipping container out of the top layer again
 * @property {boolean} open
 * @property {boolean} empty
 * @property {(() => void)[]} off what an open menu listens to, undone when it closes
 */

/** @type {WeakMap<Element, MenuState>} */
const menus = new WeakMap();

let idSeq = 0;
/** @param {string} prefix */
const nextId = (prefix) => `${prefix}-${(idSeq += 1)}`;

/** @param {Element} host @returns {string | undefined} */
const keyOf = (host) => host.getAttribute('data-kp-key') ?? undefined;

/**
 * What a fill shows, as one string: a fill that shows the same as the menu
 * does now is skipped.
 * @param {MenuGroup[] | 'loading'} groups
 * @returns {string}
 */
export const menuSignature = (groups) =>
    groups === 'loading'
        ? 'loading'
        : JSON.stringify(
              groups.map((g) => [
                  g.group,
                  g.items.map((i) => [
                      i.label,
                      i.hint ?? '',
                      i.href ?? '',
                      i.download ?? '',
                      i.disabled ?? '',
                      !!i.danger,
                      i.attrs ?? null,
                      i.value ?? '',
                  ]),
              ]),
          );

/**
 * Where a key moves the focus in an open menu, or null when the key is not
 * the menu's: ↓ and ↑ step and wrap, Home and End go to the ends, and a
 * printable letter goes to the next entry after `at` whose label starts with
 * it (wrapping, the entry at `at` itself last). `at` is -1 when no entry has
 * the focus.
 * @param {{ key: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} event
 * @param {number} at
 * @param {readonly string[]} labels every entry's label, in order
 * @returns {number | null}
 */
export function menuKeyTarget(event, at, labels) {
    const n = labels.length;
    if (!n) return null;
    const { key } = event;
    if (key === 'ArrowDown') return (at + 1) % n;
    if (key === 'ArrowUp') return (at - 1 + n) % n;
    if (key === 'Home') return 0;
    if (key === 'End') return n - 1;
    if (key.length !== 1 || key === ' ' || event.ctrlKey || event.metaKey || event.altKey) return null;
    const letter = key.toLocaleLowerCase();
    for (let step = 1; step <= n; step += 1) {
        const index = (((at + step) % n) + n) % n;
        if (labels[index].trim().toLocaleLowerCase().startsWith(letter)) return index;
    }
    return null;
}

/** @param {MenuState} s @returns {HTMLElement[]} */
const menuItems = (s) => /** @type {HTMLElement[]} */ ([...s.menu.querySelectorAll('[role="menuitem"]')]);

/** @param {HTMLElement} item */
const labelOf = (item) => item.querySelector('.kp-menu__label')?.textContent ?? item.textContent ?? '';

/** @param {MenuState} s @param {HTMLElement} item @param {number} index */
const decorateItem = (s, item, index) => {
    if (!s.decorate) return;
    /** @type {MenuDecorateInfo} */
    const info = { kind: 'menu-item', host: s.wrapper, index, label: labelOf(item) };
    const key = keyOf(s.wrapper);
    if (key !== undefined) info.key = key;
    if (item.dataset.kpValue !== undefined) info.value = item.dataset.kpValue;
    s.decorate(item, info);
};

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc
 * @param {K} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    el.className = className;
    if (text != null) el.textContent = text;
    return el;
};

/**
 * One entry: the label over the hint; a disabled one keeps its hint and
 * says why under it.
 * @param {Document} doc
 * @param {MenuItem} item
 * @returns {HTMLElement}
 */
function menuEntry(doc, item) {
    const el = /** @type {HTMLElement} */ (doc.createElement(item.href ? 'a' : 'button'));
    if (item.href) {
        el.setAttribute('href', item.href);
        if (item.download) el.setAttribute('download', item.download);
    } else el.setAttribute('type', 'button');
    el.setAttribute('role', 'menuitem');
    el.className = `kp-menu__item${item.danger ? ' kp-menu__item--destructive' : ''}`;
    el.tabIndex = -1;
    const label = make(doc, 'span', 'kp-menu__label', item.label);
    label.id = nextId('kp-menu-label');
    el.setAttribute('aria-labelledby', label.id);
    el.append(label);
    /** @type {string[]} */
    const described = [];
    if (item.hint) {
        const hint = make(doc, 'span', 'kp-menu__hint', item.hint);
        hint.id = nextId('kp-menu-hint');
        described.push(hint.id);
        el.append(hint);
    }
    if (item.disabled) {
        const reason = make(doc, 'span', 'kp-menu__hint kp-menu__reason', item.disabled);
        reason.id = nextId('kp-menu-reason');
        described.push(reason.id);
        el.append(reason);
        el.setAttribute('aria-disabled', 'true');
        el.dataset.kpReason = item.disabled;
    }
    if (described.length) el.setAttribute('aria-describedby', described.join(' '));
    el.title = item.disabled ?? item.hint ?? '';
    if (item.value) el.dataset.kpValue = item.value;
    for (const [name, value] of Object.entries(item.attrs ?? {})) {
        if (value == null) el.removeAttribute(name);
        else el.setAttribute(name, value);
    }
    return el;
}

/** @param {MenuState} s @param {MenuGroup[] | 'loading'} groups */
function drawMenu(s, groups) {
    const doc = s.menu.ownerDocument;
    const strings = resolveStrings(s.strings);
    s.drawn = menuSignature(groups);
    if (groups === 'loading') {
        // One disabled entry at the final row height: a label over a hint
        // line. The hint is a no-break space, which keeps its line; a plain
        // space collapsed and left the row a line short (39 px for 58.5).
        const entry = menuEntry(doc, { label: strings.menuLoading, hint: '\u00a0' });
        entry.setAttribute('aria-disabled', 'true');
        entry.dataset.kpLoading = '';
        s.menu.replaceChildren(entry);
        s.menu.setAttribute('aria-busy', 'true');
        setEmpty(s, false, strings);
        return;
    }
    s.menu.removeAttribute('aria-busy');
    const used = groups.filter((g) => g.items.length);
    const total = used.reduce((n, g) => n + g.items.length, 0);
    /** @type {HTMLElement[]} */
    const blocks = [];
    let index = 0;
    for (const group of used) {
        const block = make(doc, 'div', 'kp-menu__group');
        // One entry, or a nameless group: no heading, so nothing to name it by.
        if (group.group && total > 1) {
            const heading = make(doc, 'p', 'kp-menu__heading', group.group);
            heading.id = nextId('kp-menu-group');
            heading.setAttribute('role', 'presentation');
            block.setAttribute('role', 'group');
            block.setAttribute('aria-labelledby', heading.id);
            block.append(heading);
        } else block.setAttribute('role', 'none');
        for (const item of group.items) {
            const entry = menuEntry(doc, item);
            block.append(entry);
            decorateItem(s, entry, index);
            index += 1;
        }
        blocks.push(block);
    }
    s.menu.replaceChildren(...blocks);
    setEmpty(s, total === 0, strings);
}

/**
 * No entries: the button hides (`data-kp-menu-empty="hide"`) or stays,
 * `aria-disabled`, and says why it does nothing.
 * @param {MenuState} s
 * @param {boolean} empty
 * @param {Strings} strings
 */
function setEmpty(s, empty, strings) {
    s.empty = empty;
    const hide = s.wrapper.dataset.kpMenuEmpty === 'hide';
    s.wrapper.hidden = empty && hide;
    if (empty && !hide) {
        s.button.setAttribute('aria-disabled', 'true');
        s.button.title = strings.menuEmpty;
    } else if (s.button.getAttribute('aria-disabled') === 'true') {
        s.button.removeAttribute('aria-disabled');
        s.button.removeAttribute('title');
    }
}

/** The space an open menu keeps from the screen's edges, in px. */
export const MENU_GUTTER = 8;

/** @typedef {{ left: number, top: number, right: number, bottom: number }} Edges */
/** How far in from each screen edge the page has something stuck: coveredEdges(). @typedef {Edges} Covered */

/**
 * Where an open menu goes so that all of it is on the screen (Kenny,
 * 2026-10-05: a menu under a button at the left edge opened off the
 * screen). Pure: boxes in, box out, all in viewport px.
 *
 * Across, the place the stylesheet gave it (under the button, at its end
 * edge; spanning the header's buttons on a phone) is kept when it fits;
 * else it lines up with the button's start edge, else with its end edge,
 * else it is pushed inside the room. Down, it hangs under the button when
 * it fits there, else over it when it fits there, else on the roomier side
 * at that side's height, scrolling inside itself.
 *
 * @param {object} at
 * @param {Edges} at.button the button's box
 * @param {Edges} at.menu where the stylesheet put the menu
 * @param {number} at.height the menu's whole height, within the stylesheet's own cap
 * @param {number} at.gap the space between the button and the menu
 * @param {Edges} at.room the screen less its gutter and what is stuck over its edges
 * @returns {{ left: number, top: number, width: number | null, height: number | null, side: 'below' | 'above' }}
 *   `width` and `height` are the caps to set, null where the menu fits whole
 */
export function menuPlacement({ button, menu, height, gap, room }) {
    const width = menu.right - menu.left;
    const across = room.right - room.left;
    const fits = (/** @type {number} */ x) => x >= room.left - 0.5 && x + width <= room.right + 0.5;
    let left = menu.left;
    let capWidth = null;
    if (width > across) {
        left = room.left;
        capWidth = across;
    } else if (!fits(left)) {
        const start = button.left;
        const end = button.right - width;
        left = fits(start) ? start : fits(end) ? end : Math.min(Math.max(left, room.left), room.right - width);
    }
    const below = room.bottom - (button.bottom + gap);
    const above = button.top - gap - room.top;
    /** @type {'below' | 'above'} */
    let side = 'below';
    let capHeight = null;
    if (height > below + 0.5) {
        if (height <= above + 0.5) side = 'above';
        else {
            side = above > below ? 'above' : 'below';
            capHeight = Math.max(0, Math.floor(side === 'above' ? above : below));
        }
    }
    const tall = capHeight ?? height;
    const top = side === 'below' ? button.bottom + gap : button.top - gap - tall;
    return { left, top, width: capWidth, height: capHeight, side };
}

/**
 * How far in from each of the screen's edges a menu must stay: what the page
 * declares as covered (its scrolling box's `scroll-padding`, which the
 * package's sticky nav writes), or a bar stuck (fixed or sticky) along the
 * screen at that edge, whichever reaches further: a header or a footer
 * across it, a side nav down it. A menu over a side nav hung outside the
 * page it belongs to (the review page's nav, Kenny, 2026-10-05). A bar the
 * menu button lives in does not count, nor a small floating control (less
 * than half the screen along its edge).
 * @param {Window} view
 * @param {Element} wrapper
 * @param {Element} [skip] an element to see through (the open menu)
 * @returns {Covered}
 */
function coveredEdges(view, wrapper, skip) {
    const doc = view.document;
    const html = doc.documentElement;
    const width = html.clientWidth;
    const height = html.clientHeight;
    const pad = view.getComputedStyle(doc.scrollingElement ?? html);
    const px = (/** @type {string} */ v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
    const box = wrapper.getBoundingClientRect();
    const midX = Math.min(Math.max(box.left + box.width / 2, 1), width - 1);
    const midY = Math.min(Math.max(box.top + box.height / 2, 1), height - 1);
    /**
     * The stuck bar at this point, if any, long enough along its edge.
     * @param {number} x @param {number} y @param {'width' | 'height'} along
     */
    const barAt = (x, y, along) => {
        for (const hit of doc.elementsFromPoint(x, y)) {
            if (skip?.contains(hit)) continue;
            for (let el = /** @type {Element | null} */ (hit); el && el !== html && el !== doc.body; el = el.parentElement) {
                const { position } = view.getComputedStyle(el);
                if (position !== 'fixed' && position !== 'sticky') continue;
                if (el.contains(wrapper) || wrapper.contains(el)) return null;
                const r = el.getBoundingClientRect();
                return r[along] >= (along === 'width' ? width : height) / 2 ? r : null;
            }
            return null;
        }
        return null;
    };
    /**
     * How far the bars stacked at one edge reach in, probing past each. The
     * first is looked for a little way in too: a body margin keeps a side
     * nav 8 px off the edge (the catalogue's).
     * @param {number} size the screen along this axis
     * @param {(inset: number) => DOMRect | null} at the bar `inset` px in from the edge
     * @param {(bar: DOMRect) => number} reach how far in that bar ends
     */
    const stacked = (size, at, reach) => {
        let inset = 0;
        /** @type {DOMRect | null} */
        let first = null;
        for (const start of [0.5, 8.5, 16.5, 32.5]) if ((first = at(start))) break;
        for (let bar = first, n = 0; bar && n < 4; n += 1) {
            if (reach(bar) <= inset + 0.5) break;
            inset = reach(bar);
            bar = inset < size ? at(inset + 0.5) : null;
        }
        return inset;
    };
    const top = stacked(
        height,
        (d) => barAt(midX, d, 'width'),
        (bar) => bar.bottom,
    );
    const bottom = stacked(
        height,
        (d) => barAt(midX, height - d, 'width'),
        (bar) => height - bar.top,
    );
    const left = stacked(
        width,
        (d) => barAt(d, midY, 'height'),
        (bar) => bar.right,
    );
    const right = stacked(
        width,
        (d) => barAt(width - d, midY, 'height'),
        (bar) => width - bar.left,
    );
    return {
        top: Math.max(top, px(pad.scrollPaddingTop)),
        bottom: Math.max(bottom, px(pad.scrollPaddingBottom)),
        left: Math.max(left, px(pad.scrollPaddingLeft)),
        right: Math.max(right, px(pad.scrollPaddingRight)),
    };
}

/**
 * Whether a container round the menu button cuts off what hangs outside it
 * (a clip-path, or overflow other than visible): cyberpunk's cut card hid
 * the whole menu that opened above its button.
 * @param {Element} wrapper
 * @param {Window} view
 */
function clipped(wrapper, view) {
    const top = view.document.body;
    for (let el = wrapper.parentElement; el && el !== top; el = el.parentElement) {
        const style = view.getComputedStyle(el);
        if (style.clipPath !== 'none' || style.overflowX !== 'visible' || style.overflowY !== 'visible') return true;
    }
    return false;
}

/**
 * Lift the placed menu into the top layer at the spot it was placed on,
 * kept against its button as the page scrolls (js/top-layer.js), when a
 * container would clip it. It stays the button's child, so every register
 * selector still reaches it.
 * @param {MenuState} s
 * @param {Window} view
 */
function raiseMenu(s, view) {
    if (!clipped(s.wrapper, view)) return;
    const box = s.menu.getBoundingClientRect();
    const button = s.button.getBoundingClientRect();
    const dx = box.left - button.left;
    const dy = box.top - button.top;
    s.lower = raiseOverlay(s.menu, (menu) => {
        const at = s.button.getBoundingClientRect();
        menu.style.setProperty('left', `${at.left + dx}px`);
        menu.style.setProperty('top', `${at.top + dy}px`);
        menu.style.setProperty('right', 'auto');
        menu.style.setProperty('bottom', 'auto');
        menu.style.setProperty('width', `${box.width}px`);
    });
}

/** @param {MenuState} s */
function lowerMenu(s) {
    s.lower?.();
    s.lower = null;
}

/** The inline properties placeMenu() writes, undone when the menu closes. */
const PLACED = ['left', 'right', 'top', 'bottom', 'width', 'max-block-size', 'max-inline-size'];

/** @param {HTMLElement} menu */
function unplaceMenu(menu) {
    for (const name of PLACED) menu.style.removeProperty(name);
    menu.removeAttribute('data-kp-menu-side');
}

/**
 * Put the open menu where menuPlacement() says: one read of the boxes, then
 * one write, before the frame is painted, so it never shows in the wrong
 * place first.
 * @param {MenuState} s
 * @param {Window} view
 * @param {Covered} covered
 */
function placeMenu(s, view, covered) {
    const { menu } = s;
    unplaceMenu(menu);
    const html = view.document.documentElement;
    const room = {
        left: covered.left + MENU_GUTTER,
        right: html.clientWidth - covered.right - MENU_GUTTER,
        top: covered.top + MENU_GUTTER,
        bottom: html.clientHeight - covered.bottom - MENU_GUTTER,
    };
    // Side bars that leave less than the button's own width between them
    // are not kept clear: the menu then has the whole screen across.
    const button = s.button.getBoundingClientRect();
    if (room.right - room.left < button.width) {
        room.left = MENU_GUTTER;
        room.right = html.clientWidth - MENU_GUTTER;
    }
    const box = menu.getBoundingClientRect();
    const style = view.getComputedStyle(menu);
    const cap = parseFloat(style.maxBlockSize);
    const borders = box.height - menu.clientHeight;
    const whole = menu.scrollHeight + borders;
    const height = Number.isFinite(cap) ? Math.min(whole, cap) : whole;
    const at = menuPlacement({ button, menu: box, height, gap: Math.max(0, box.top - button.bottom), room });
    // Only what moves is written: the used left or top (px for a positioned
    // box) moved by the difference, so whichever box contains the menu it
    // lands at `at`. A menu the stylesheet sized by its two edges (the
    // phone header's span) keeps its width when it moves across.
    if (Math.abs(at.left - box.left) > 0.5 || at.width != null) {
        const usedLeft = parseFloat(style.left);
        menu.style.setProperty('left', `${(Number.isFinite(usedLeft) ? usedLeft : menu.offsetLeft) + at.left - box.left}px`);
        menu.style.setProperty('right', 'auto');
        menu.style.setProperty('width', `${at.width ?? box.width}px`);
    }
    if (Math.abs(at.top - box.top) > 0.5) {
        const usedTop = parseFloat(style.top);
        menu.style.setProperty('top', `${(Number.isFinite(usedTop) ? usedTop : menu.offsetTop) + at.top - box.top}px`);
        menu.style.setProperty('bottom', 'auto');
    }
    if (at.width != null) menu.style.setProperty('max-inline-size', `${at.width}px`);
    if (at.height != null) menu.style.setProperty('max-block-size', `${at.height}px`);
    menu.setAttribute('data-kp-menu-side', at.side);
}

/**
 * Open a menu button's menu and put the focus on its first (or last) entry;
 * `none` leaves the focus where it is (a page showing the menu on its own,
 * not the reader asking for it).
 * @param {Element} wrapper
 * @param {{ focus?: 'first' | 'last' | 'none' }} [options]
 */
export function openMenu(wrapper, { focus = 'first' } = {}) {
    const s = menus.get(wrapper);
    if (!s || s.open || s.empty) return;
    const doc = s.menu.ownerDocument;
    const view = doc.defaultView;
    s.open = true;
    // Still closing: it turns round where it stands.
    const closing = !s.menu.hidden;
    stopClose(s.menu);
    s.menu.inert = false;
    lowerMenu(s);
    if (closing) unplaceMenu(s.menu);
    s.menu.hidden = true;
    // What the page has stuck over the screen's edges is read while the
    // menu is still hidden, so the probe cannot hit the menu itself.
    const covered = view ? coveredEdges(view, s.wrapper) : null;
    s.menu.hidden = false;
    if (view && covered) {
        placeMenu(s, view, covered);
        raiseMenu(s, view);
        // A turned phone or a resized window: the menu is placed again,
        // once a frame at most.
        let frame = 0;
        const again = () => {
            if (frame) return;
            frame = view.requestAnimationFrame(() => {
                frame = 0;
                if (!s.open) return;
                lowerMenu(s);
                placeMenu(s, view, coveredEdges(view, s.wrapper, s.menu));
                raiseMenu(s, view);
            });
        };
        view.addEventListener('resize', again);
        s.off.push(() => {
            view.removeEventListener('resize', again);
            if (frame) view.cancelAnimationFrame(frame);
        });
    }
    s.button.setAttribute('aria-expanded', 'true');
    /** @param {MouseEvent} event */
    const outside = (event) => {
        if (!s.wrapper.contains(/** @type {Node} */ (event.target))) closeMenu(s.wrapper);
    };
    /** @param {KeyboardEvent} event */
    const escape = (event) => {
        if (event.key !== 'Escape') return;
        // Capture, on the window: the menu's Escape is its own, and the
        // page's Escape (or a dialog's) does not fire as well.
        event.preventDefault();
        event.stopPropagation();
        closeMenu(s.wrapper, { focus: true });
    };
    doc.addEventListener('click', outside, true);
    view?.addEventListener('keydown', escape, true);
    s.off.push(
        () => doc.removeEventListener('click', outside, true),
        () => view?.removeEventListener('keydown', escape, true),
    );
    const items = menuItems(s);
    const target = focus === 'none' ? null : focus === 'last' ? items.at(-1) : items[0];
    target?.focus();
    s.wrapper.dispatchEvent(new CustomEvent(MENU_OPEN_EVENT, { bubbles: true }));
}

/**
 * Close it; with `focus`, the focus goes back to the button. A fill that
 * waited while it was open is drawn now.
 * @param {Element} wrapper
 * @param {{ focus?: boolean }} [options]
 */
export function closeMenu(wrapper, { focus = false } = {}) {
    const s = menus.get(wrapper);
    if (!s || !s.open) return;
    s.open = false;
    s.button.setAttribute('aria-expanded', 'false');
    for (const off of s.off.splice(0)) off();
    if (focus) s.button.focus();
    // It closes as it opened, backwards, before it is hidden (Kenny,
    // 2026-10-06: every close is its open played backwards); meanwhile it
    // takes no pointer or focus. Opened again before that, it turns round.
    s.menu.inert = true;
    const menu = s.menu;
    void playClose(menu).then((played) => {
        if (!played || s.open) return;
        // Hidden first, then out of the top layer: hidden, it has no box
        // for a second close to play on (js/motion.js).
        menu.hidden = true;
        lowerMenu(s);
        menu.inert = false;
        stopClose(menu);
        unplaceMenu(menu);
        if (s.pending) {
            const next = s.pending;
            s.pending = null;
            drawMenu(s, next);
        }
    });
    s.wrapper.dispatchEvent(new CustomEvent(MENU_CLOSE_EVENT, { bubbles: true }));
}

/**
 * Give a menu button its entries. Skipped when they show the same as now;
 * while the menu is open the change waits until it closes, so a live refill
 * never moves an entry under the pointer or the focus. `'loading'` shows one
 * disabled entry at the final row height. A wrapper not attached yet is
 * wired (without listeners) so the fill is kept.
 * @param {Element} wrapper
 * @param {MenuGroup[] | 'loading'} groups
 */
export function setMenu(wrapper, groups) {
    const s = menus.get(wrapper) ?? wireMenu(/** @type {HTMLElement} */ (wrapper), {});
    if (!s) return;
    if (menuSignature(groups) === s.drawn) {
        s.pending = null;
        return;
    }
    if (s.open) {
        s.pending = groups;
        return;
    }
    drawMenu(s, groups);
}

/**
 * @param {HTMLElement} wrapper
 * @param {MenuButtonOptions} options
 * @returns {MenuState | null}
 */
function wireMenu(wrapper, { decorate, strings }) {
    const button = /** @type {HTMLElement | null} */ (wrapper.querySelector(':scope > button'));
    const menu = /** @type {HTMLElement | null} */ (wrapper.querySelector(':scope > [role="menu"]'));
    if (!button || !menu) return null;
    if (!menu.id) menu.id = nextId('kp-menu');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-controls', menu.id);
    button.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
    /** @type {MenuState} */
    const s = { wrapper, button, menu, decorate, strings, drawn: '', pending: null, open: false, empty: false, off: [] };
    menus.set(wrapper, s);
    decorateButton(s);
    menuItems(s).forEach((item, index) => {
        item.tabIndex = -1;
        decorateItem(s, item, index);
    });
    return s;
}

/** @param {MenuState} s */
const decorateButton = (s) => {
    if (!s.decorate) return;
    /** @type {MenuDecorateInfo} */
    const info = { kind: 'menu-button', host: s.wrapper };
    const key = keyOf(s.wrapper);
    if (key !== undefined) info.key = key;
    s.decorate(s.button, info);
};

/** The wrappers some `attachMenuButtons` already listens on, so a second call is a no-op for them. */
const attached = new WeakSet();

/**
 * Wire every menu button under `root`: the button opens and closes the menu,
 * and the menu answers the keys of a menu (APG menu button). A disabled
 * entry (`aria-disabled`) keeps the focus, so its reason is read; it does
 * nothing. Idempotent.
 * @param {ParentNode} [root]
 * @param {MenuButtonOptions} [options]
 * @returns {() => void} detach
 */
export function attachMenuButtons(root = document, { decorate, strings } = {}) {
    /** @type {(() => void)[]} */
    const undo = [];
    for (const wrapper of /** @type {HTMLElement[]} */ ([...root.querySelectorAll(MENU_BUTTON)])) {
        if (attached.has(wrapper)) continue;
        let s = menus.get(wrapper);
        if (s) {
            // Filled before it was attached: the options join now, and the
            // controls already built are handed to `decorate`.
            if (decorate) s.decorate = decorate;
            if (strings) s.strings = strings;
            if (decorate) {
                decorateButton(s);
                menuItems(s).forEach((item, index) => decorateItem(/** @type {MenuState} */ (s), item, index));
            }
        } else s = wireMenu(wrapper, { decorate, strings }) ?? undefined;
        if (!s) continue;
        const state = s;
        attached.add(wrapper);
        const onClick = () => {
            if (state.button.getAttribute('aria-disabled') === 'true') return;
            if (state.open) closeMenu(wrapper);
            else openMenu(wrapper, { focus: 'first' });
        };
        /** @param {KeyboardEvent} event */
        const onButtonKey = (event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            if (state.open) closeMenu(wrapper);
            openMenu(wrapper, { focus: event.key === 'ArrowUp' ? 'last' : 'first' });
        };
        /** @param {MouseEvent} event */
        const onPick = (event) => {
            const item = /** @type {HTMLElement | null} */ (event.target instanceof Element ? event.target.closest('[role="menuitem"]') : null);
            if (!item || !state.menu.contains(item)) return;
            if (item.getAttribute('aria-disabled') === 'true') {
                event.preventDefault();
                return;
            }
            const value = item.dataset.kpValue ?? labelOf(item);
            const go = wrapper.dispatchEvent(new CustomEvent(MENU_SELECT_EVENT, { bubbles: true, cancelable: true, detail: { item, value } }));
            if (!go) {
                event.preventDefault();
                return;
            }
            closeMenu(wrapper, { focus: !item.matches('a[href]') });
        };
        /** @param {KeyboardEvent} event */
        const onMenuKey = (event) => {
            const items = menuItems(state);
            if (!items.length) return;
            const active = /** @type {HTMLElement | null} */ (state.menu.ownerDocument.activeElement);
            if (event.key === 'Tab') {
                // The focus goes back to the button first, so the browser's
                // own Tab moves on from there: to what follows the button,
                // or (with Shift) to what comes before it.
                closeMenu(wrapper, { focus: true });
                return;
            }
            if (event.key === ' ' && active?.matches('a[href]')) {
                event.preventDefault();
                active.click();
                return;
            }
            const to = menuKeyTarget(event, items.indexOf(/** @type {HTMLElement} */ (active)), items.map(labelOf));
            if (to == null) return;
            event.preventDefault();
            items[to].focus();
        };
        state.button.addEventListener('click', onClick);
        state.button.addEventListener('keydown', onButtonKey);
        state.menu.addEventListener('click', onPick);
        state.menu.addEventListener('keydown', onMenuKey);
        undo.push(() => {
            closeMenu(wrapper);
            state.button.removeEventListener('click', onClick);
            state.button.removeEventListener('keydown', onButtonKey);
            state.menu.removeEventListener('click', onPick);
            state.menu.removeEventListener('keydown', onMenuKey);
            attached.delete(wrapper);
            menus.delete(wrapper);
        });
    }
    return () => undo.splice(0).forEach((off) => off());
}
