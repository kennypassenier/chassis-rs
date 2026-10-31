// The bullet list: rows of a value against a threshold [kpadopt4-data;
// JobTracker's follow-up clock, "days since the last contact against the
// 14-day threshold, for every open application"].
//
//   <div class="kp-bullets" data-kp-bullets></div>
//
//   setBullets(el, {
//       threshold: 14,
//       format: (days) => `${days} d`,
//       rows: [{ key: 'a17', lead: 'Acme Logistics', label: 'Data engineer', detail: 'due since 02/10/2026', value: 18, href: '#a17' }],
//   });
//
// Each row: a lead (a name gives it an identity mark, js/idmark.js; a node is
// used as it is), the label and a detail line, a meter (js/kpi.js setMeter)
// whose tick is the threshold, and the exact figure. The columns are shared
// by every row, so every bar begins and ends in the same place [fix-64];
// under 34rem of the list's width the bar takes a line of its own. The bar
// runs to `max` (default twice the threshold): a value at or past the
// threshold takes the warning tone (the figure on the warning plate), at or
// past `bad` the destructive one, and past `max` the meter's ▸ says so. The
// rows are sorted worst first unless `sort: 'none'`. A row with `href` is a
// link and a row with `pick: true` a button (`kp-bullets-pick` `{ key }`),
// its press area the whole row. A `value` of null is a row with nothing to
// measure: a dash and no bar.
//
// States: `loading` keeps the rows' geometry as waiting rows and lays the
// data table's busy card over them (js/busy-card.js); the rows are drawn once
// the card has gone. `empty` says why there is nothing (`emptyTitle`,
// `emptyText`), `error` says what failed (`message`) with a Retry, a
// normal-size kp-button, that fires `kp-bullets-retry` (`retry: false` leaves
// it out). Both are the package plate (`.kp-stateplate`, js/state-plate.js; each theme's own)
// filling the list's whole footprint, the height it had with its rows, the
// words and the button centred in it, so nothing under it moves (Kenny,
// 2026-10-16: failed, empty and loading fill the component's full normal
// size). A list that never had rows takes `--kp-bullets-state-min`.

import { attachOne, controllerOf } from './controller.js';
import { BulletList } from './bullets/controller.js';
import { BULLETS } from './bullets/values.js';

export { BULLETS, BULLETS_PICK_EVENT, BULLETS_RETRY_EVENT } from './bullets/values.js';
export { bulletTone } from './bullets/tone.js';

/**
 * @typedef {object} BulletRow
 * @property {string} key
 * @property {string} label
 * @property {string} [detail]
 * @property {number | null} value      null: nothing to measure
 * @property {string} [figure]          the figure as written, in place of format(value)
 * @property {string | Node} [lead]     a name (an identity mark is made) or a node
 * @property {string} [href]            the row is a link
 * @property {boolean} [pick]           the row is a button
 */

/**
 * @typedef {object} BulletsSpec
 * @property {BulletRow[]} [rows]
 * @property {number} threshold
 * @property {number} [max]             where the bar ends (default twice the threshold)
 * @property {number} [bad]             at or past this the row is destructive (default none)
 * @property {(value: number) => string} [format]
 * @property {'worst' | 'none'} [sort]  default 'worst'
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]
 * @property {string} [message]         the sentence of a failed list
 * @property {boolean} [retry]          false leaves Retry out of a failed list (a read the page cannot repeat)
 * @property {string} [emptyTitle]
 * @property {string} [emptyText]
 * @property {number} [loadingRows]     how many waiting rows (default: the rows shown last, else 3)
 * @property {string} [loadingWords]    what the busy card says
 */

/**
 * Draw (or redraw) a bullet list.
 * @param {HTMLElement} el the root, a `.kp-bullets`
 * @param {BulletsSpec} spec
 */
export function setBullets(el, spec) {
    attachOne(el, BulletList)?.set(spec);
}

/**
 * Fill every `[data-kp-bullets]` under `root` that carries its spec as JSON
 * in the attribute (a page that draws with setBullets() needs nothing).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachBullets(root = document) {
    for (const el of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(BULLETS))) {
        const json = el.getAttribute('data-kp-bullets') ?? '';
        if (json.trim().startsWith('{') && !controllerOf(el, BulletList)) {
            try {
                setBullets(el, JSON.parse(json));
            } catch (error) {
                console.error(error);
            }
        }
    }
    return () => {};
}
