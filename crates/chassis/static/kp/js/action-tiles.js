// Action tiles: a button or a link with a title and the one sentence that says
// what it does [kpadopt2-tiles; the dashboard's `nx-action`].
//
//   <div class="kp-actions">
//     <button type="button" class="kp-action">
//       <strong class="kp-action__title">Back up now</strong>
//       <span class="kp-action__mark" aria-hidden="true"></span>
//       <span class="kp-action__text">Copies every volume to the backup disk and checks the copy.</span>
//     </button>
//     <a class="kp-action" href="/system/host">…</a>
//   </div>
//
// The styling needs no script. This module does the two things a stylesheet
// cannot:
//
//   - A tile that is busy or disabled does nothing when it is pressed. A
//     `<button disabled>` already does not; a busy button (`aria-busy`, which
//     keeps the focus where it is), an `aria-disabled` link or button and a
//     link are stopped in the capture phase, so the page's own handler never
//     runs for them.
//   - A busy tile gets the theme's own spinner in its mark and a hidden
//     "Working…" after its title, and loses both when it is no longer busy.
//     `setActionBusy(tile, true)` is the way in; a framework that sets
//     `aria-busy` itself is followed too.
//
// The mark column is reserved by the stylesheet, so the spinner arriving
// moves nothing. Every word this module adds is in js/strings.js.

import { getStrings } from './strings.js';

/** The tiles this module looks after. */
export const ACTION_TILE = '.kp-action';
/** Fired on the tile, bubbling, when it becomes busy or stops being busy: `{ tile, busy }`. */
export const ACTION_BUSY_EVENT = 'kp-action-busy';

/** The busy state each tile was last synced to, to tell a change from a first sync. @type {WeakMap<Element, boolean>} */
const synced = new WeakMap();

/** @param {Element} tile */
const inert = (tile) =>
    (tile instanceof HTMLButtonElement && tile.disabled) ||
    tile.getAttribute('aria-disabled') === 'true' ||
    tile.getAttribute('aria-busy') === 'true';

/** @param {string} className @returns {HTMLSpanElement} */
const span = (className) => {
    const el = document.createElement('span');
    el.className = className;
    return el;
};

/**
 * Bring a tile's spinner and spoken word in step with `aria-busy`.
 * @param {Element} tile
 * @param {{ announce?: boolean }} [options]
 */
function syncTile(tile, { announce = false } = {}) {
    const busy = tile.getAttribute('aria-busy') === 'true';
    let mark = tile.querySelector(':scope > .kp-action__mark');
    const spinner = mark?.querySelector('.kp-spinner') ?? null;
    if (busy) {
        if (!mark) {
            mark = span('kp-action__mark');
            mark.setAttribute('aria-hidden', 'true');
            tile.querySelector(':scope > .kp-action__title')?.after(mark) ?? tile.prepend(mark);
        }
        if (!spinner) {
            const wheel = span('kp-spinner');
            wheel.setAttribute('aria-hidden', 'true');
            mark.replaceChildren(wheel);
        }
        let word = tile.querySelector(':scope > .kp-action__state');
        if (!word) {
            word = span('kp-action__state');
            tile.append(word);
        }
        word.textContent = `, ${getStrings().busy}`;
    } else {
        if (spinner) mark?.replaceChildren();
        tile.querySelector(':scope > .kp-action__state')?.remove();
    }
    const before = synced.get(tile);
    synced.set(tile, busy);
    if (announce && before !== undefined && before !== busy) {
        tile.dispatchEvent(new CustomEvent(ACTION_BUSY_EVENT, { bubbles: true, detail: { tile, busy } }));
    }
}

/**
 * Make a tile busy or not busy. `aria-busy` is the single source of truth;
 * the spinner and the spoken word follow it.
 *
 * @param {Element} tile
 * @param {boolean} [busy] true when absent
 * @returns {Element}
 */
export function setActionBusy(tile, busy = true) {
    if (busy) tile.setAttribute('aria-busy', 'true');
    else tile.removeAttribute('aria-busy');
    syncTile(tile, { announce: true });
    return tile;
}

/**
 * Stop a press on a busy or disabled tile, and keep every tile's spinner in
 * step with `aria-busy`, under `root` and for tiles added to it later.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachActionTiles(root = document) {
    /** @param {Event} event */
    const guard = (event) => {
        const tile = event.target instanceof Element ? event.target.closest(ACTION_TILE) : null;
        if (!tile || !inert(tile)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    root.addEventListener('click', guard, true);
    const tiles = /** @type {Element[]} */ ([
        ...(root instanceof Element && root.matches(ACTION_TILE) ? [root] : []),
        ...root.querySelectorAll(ACTION_TILE),
    ]);
    for (const tile of tiles) syncTile(tile);
    /** @type {MutationObserver | null} */
    let watch = null;
    if (typeof MutationObserver !== 'undefined') {
        watch = new MutationObserver((records) => {
            for (const record of records) {
                const target = /** @type {Element} */ (record.target);
                if (target.matches(ACTION_TILE)) syncTile(target, { announce: true });
            }
        });
        watch.observe(root instanceof Document ? root.documentElement : root, {
            attributes: true,
            attributeFilter: ['aria-busy'],
            subtree: true,
        });
    }
    return () => {
        root.removeEventListener('click', guard, true);
        watch?.disconnect();
    };
}
