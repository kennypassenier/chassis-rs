// The notification centre [kpadopt5-ops; spec item 20].
//
// A counter with the exact number, a panel with the newest notices, a switch per source and "Quiet until …" in plain
// words, plus the same list as a full Inbox page. Kenny, 2026-10-17: "Paneel met de nieuwste, plus de Inbox-pagina".
//
//   <div class="kp-notices" data-kp-notices data-kp-inbox-href="/inbox"></div>
//   setNotices(el, { state: 'ready', items: [{ key, severity: 'critical', title, since, consequence, remedy, fix: { label } }] })
//
// A notice is what homelab's Inbox rows are (decision of 2026-09-30): what happened, since when, what it affects, what to do
// and a Fix button. Looks (`data-kp-notices-look`):
//
//   both    the default: the counter opens a panel with the newest notices and a link "All 37 in the Inbox"
//   panel   the same panel without that link
//   page    no counter and no panel: the list stands in the page, with the per-source switches (the Inbox page)
//
// Options, each an attribute and a JS option of attachNotices(root, options):
//
//   data-kp-count            the number the counter shows when it is not the number of unread notices (exact, never "9+")
//   data-kp-count-in-title   "off" leaves the tab title alone (default: "(5) " in front of it)
//   data-kp-order            severity (default: worst first, then newest) | time
//   data-kp-read             explicit (default: Mark read per row and Mark all read) | on-open (opening the panel reads all)
//   data-kp-panel-max        newest per severity in the panel (default 10), then "All 37 in the Inbox", exact
//   data-kp-toast-new        none | severe (default: a new critical notice also toasts) | all
//   data-kp-inbox-href       where the Inbox link goes (it also fires `kp-notices-open-inbox`)
//   data-kp-keys             "off" leaves the keys alone: g then i opens the Inbox, m marks the focused notice read
//
// States: ready; loading (rows as the theme's busy card over the list; the counter holds its place); empty ("Nothing
// waiting", the theme's empty plate at the panel's full height); error (the destructive plate with Retry; the counter says
// "?" and its label says why); quiet (`quietUntil`: the counter is muted with a moon and "Quiet until 09:00", End quiet).
// A phone: the panel is a full-height sheet. New notices are announced politely, critical ones assertively, once.
//
// Events (bubbling, on the root):
//   kp-notice-fix          { key }
//   kp-notice-read         { key, read }
//   kp-notices-read-all    {}
//   kp-notices-source      { source, muted }
//   kp-notices-retry       {}
//   kp-notices-end-quiet   {}
//   kp-notices-open-inbox  {}
//
// Every word is in js/strings.js. Nothing runs on import; attachNotices(root) returns a detach.
//
// Each centre is one NoticesCentre controller (js/notices/controller.js over js/notices/view.js, on js/controller.js); the
// parts are in js/notices/ and listed in js/README.md.

import { attachAll, controllerOf } from './controller.js';
import { attachAgo } from './freshness.js';
import { NOTICES } from './notices/events.js';
import { NoticesCentre } from './notices/controller.js';

export {
    NOTICES,
    NOTICE_FIX_EVENT,
    NOTICE_READ_EVENT,
    NOTICES_READ_ALL_EVENT,
    NOTICES_SOURCE_EVENT,
    NOTICES_RETRY_EVENT,
    NOTICES_END_QUIET_EVENT,
    NOTICES_INBOX_EVENT,
    NOTICE_SEVERITIES,
} from './notices/events.js';

/**
 * @typedef {object} Notice
 * @property {string} key stable id: the same key is the same row on every refresh
 * @property {'critical' | 'warning' | 'info'} severity
 * @property {string} title what happened, in one line
 * @property {number} since when, ms since the epoch
 * @property {string} [consequence] what it affects
 * @property {string} [remedy] what to do
 * @property {{ label: string }} [fix] the action that fixes it
 * @property {boolean} [read]
 * @property {string} [source] the source it came from (a key of `sources`)
 * @typedef {object} NoticeSource
 * @property {string} key @property {string} label @property {boolean} [muted]
 * @typedef {object} NoticesModel
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]
 * @property {Notice[]} [items]
 * @property {NoticeSource[]} [sources]
 * @property {number | string | null} [quietUntil] ISO or epoch ms
 * @property {string} [error] why it could not be read
 * @typedef {object} NoticesHandle
 * @property {HTMLElement} element
 * @property {(model: NoticesModel) => void} set
 * @property {() => number} count the number the counter shows
 * @property {() => void} open open the panel
 */

/** The handle of an attached centre. @param {Element} element @returns {NoticesHandle | null} */
export const noticesOf = (element) => controllerOf(element, NoticesCentre)?.handle ?? null;

/**
 * Give a centre its notices.
 * @param {Element} element @param {NoticesModel} model
 */
export function setNotices(element, model) {
    noticesOf(element)?.set(model);
}

/**
 * Wire every notification centre under `root`, and the "since" times in it.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachNotices(root = document) {
    const centres = attachAll(root, NOTICES, NoticesCentre);
    const ago = attachAgo(root);
    return () => {
        centres();
        ago();
    };
}
