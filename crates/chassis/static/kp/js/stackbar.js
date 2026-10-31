// The share bar: one bar split into the parts of a whole [kpadopt4-data; the
// admin dashboard's `hk-stack-bar` on the Host page, "what fills the root
// volume"].
//
//   <figure class="kp-stackbar" data-kp-stackbar></figure>
//
//   setStackbar(el, {
//       title: 'Root volume',
//       total: 120,
//       format: (gb) => `${gb} GB`,
//       parts: [{ key: 'images', label: 'Docker images', value: 41 }, { key: 'logs', label: '/var/log', value: 6.5 }],
//       marks: [{ at: 0.8, label: '80 % warning level' }],
//   });
//
// The parts are drawn in the theme's chart colours in the order given (the
// sixth on takes the palette again, hatched), the rest of `total` is the
// track, labelled "Free" in the legend; every part's exact value stands in
// the legend, and in the hover card with its share. Parts smaller than
// `other` (a share, default 0) are merged into one "Other" part. When the parts
// add up to more than `total`, the bar is their sum, a ▸ stands at its end
// and the free row says "Over by …".
//
// Keyboard: the parts are one tab stop; the arrow keys, Home and End move
// between them, and each part's hover card opens on focus. Pointing at a
// part or its legend row lights both. A press on either fires
// `kp-stackbar-pick` `{ key, part }` on the root (the page may filter).
//
// Picked parts [stackbar-refresh-1019; homelab 61]: `picked: ['images']` (keys, any number, `[]` for none picked yet) says which
// parts the page has pressed, as a chart's filter does. Every part then is a toggle button (`role="button"`, `aria-pressed`
// true or false) and the part and its legend row take `data-kp-stackbar-picked`, drawn as a heavier ring on the bar and a
// start rule with a heavier label in the legend, so the state is not carried by colour alone. The page owns the state: it
// handles `kp-stackbar-pick` and calls setStackbar() again with the new keys. Without `picked` a part is an image, as before.
//
// States: `state: 'loading'` (the bar shows the meter's own loading picture,
// js/kpi.js setMeter, the one every theme draws for a bar that waits: formal
// rules a navy line along it [G10]; the legend keeps its rows as the theme's
// waiting lines, `aria-busy`), `'empty'` (nothing read yet) and `'error'` (a
// sentence; `message` replaces the default, with a normal-size Retry that
// fires `kp-stackbar-retry`, `retry: false` leaves it out). Empty and error
// are one calm note over the bar's and the legend's whole footprint (the
// empty state's frame and each theme's empty-state title, the sentence and
// Retry side by side so the note fits the small footprint), the height they had, the words and
// the button centred in it (Kenny, 2026-10-16: failed, empty and loading fill
// the component's full normal size); a bar without a legend keeps its track
// and says it in its accessible name and hover card. Nothing under it moves.
// A share bar is one figure, as a meter is, not a data area: its own bar
// waits, not the busy card.
//
// Each bar is one Stackbar controller (js/stackbar/controller.js over parts.js and core.js, on js/controller.js; the pure share arithmetic is math.js);
// the parts are listed in js/README.md.

import { attachAll, attachOne, controllerOf } from './controller.js';
import { Stackbar } from './stackbar/controller.js';
import { STACKBAR } from './stackbar/values.js';

export { STACKBAR, STACKBAR_PICK_EVENT, STACKBAR_RETRY_EVENT } from './stackbar/values.js';
export { shareText, stackbarParts } from './stackbar/math.js';

/**
 * @typedef {object} StackbarPart
 * @property {string} [key]    stable id (default the label)
 * @property {string} label
 * @property {number} value    in the unit of `total`
 * @property {string} [tip]    the hover card's text, in place of label, value and share
 * @property {'warning' | 'destructive'} [tone]  a part that needs attention takes the status colour
 */

/**
 * @typedef {object} StackbarSpec
 * @property {StackbarPart[]} [parts]
 * @property {number} [total]       the whole; without it, the sum of the parts
 * @property {string} [title]       a line over the bar
 * @property {string} [summary]     the words at the head's end (default: the sum of the format over the whole)
 * @property {(value: number) => string} [format]  how a value reads (default: the number in the page's language)
 * @property {string} [restLabel]   the free row's label (default the dictionary's `stackbarRest`)
 * @property {number} [other]       parts under this share are merged into "Other" (default 0, none)
 * @property {{ at: number, label?: string }[]} [marks]  ticks across the bar at a share of the whole
 * @property {boolean} [legend]     default true
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]
 * @property {string} [message]     the sentence of an empty or failed bar
 * @property {boolean} [retry]      false leaves Retry out of a failed bar (a read the page cannot repeat)
 * @property {string} [label]       the bar's accessible name (default: every part in order)
 * @property {string[]} [picked]    keys of the parts the page has pressed; given (even empty), the parts are toggle buttons with `aria-pressed`
 */

/**
 * Draw (or redraw) a share bar. Calling it again with new numbers keeps the
 * focus on the part it was on, by key.
 * @param {HTMLElement} el the root, a `.kp-stackbar`
 * @param {StackbarSpec} spec
 */
export function setStackbar(el, spec) {
    (controllerOf(el, Stackbar) ?? attachOne(el, Stackbar))?.set(spec);
}

/**
 * Fill every `[data-kp-stackbar]` under `root` that carries its spec as JSON
 * in `data-kp-stackbar` (a page that draws with setStackbar() needs nothing).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachStackbars(root = document) {
    return attachAll(root, STACKBAR, Stackbar);
}
