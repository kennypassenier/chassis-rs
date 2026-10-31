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
//
// Each thread is one ThreadControl controller (js/thread/controller.js over js/thread/view.js, on js/controller.js), made
// by the first setThread() or attachThreads(); the parts are listed in js/README.md.

import { attachOne, controllerOf } from './controller.js';
import { ThreadControl } from './thread/controller.js';
import { THREAD } from './thread/options.js';

export { THREAD, THREAD_RETRY_EVENT, THREAD_ADD_EVENT, THREAD_ACTION_EVENT, THREAD_FOLD_EVENT, THREAD_TIME_ZONE, threadOptions, dayLabel, groupMessages } from './thread/options.js';

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
 * Draw (or redraw) a thread.
 * @param {HTMLElement} el the root, a `.kp-thread`
 * @param {ThreadSpec} spec
 */
export function setThread(el, spec) {
    // The first draw wires the thread, as it always did: its clicks and its options are heard from then on.
    const thread = controllerOf(el, ThreadControl) ?? attachOne(el, ThreadControl);
    thread?.set(spec);
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
        if (json.trim().startsWith('{') && !controllerOf(el, ThreadControl)) {
            try {
                setThread(el, JSON.parse(json));
            } catch (error) {
                console.error(error);
            }
        }
    }
    return () => {};
}
