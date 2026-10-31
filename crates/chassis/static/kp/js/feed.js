// The activity feed: who did what, and when, day by day [gap-activity-feed-1019; the admin dashboard's `feedRow` and `ac-dayhead`].
//
// The homelab dashboard drew this twice (a stack's History tab and the Activity page): a coloured outcome dot, a bold "what", a chip
// naming who started it, a muted detail line, the time on the right, and a heading per day ("Today · Sat 3 Oct", "12 operations ·
// 2 failed"). The package had every part and no row that joins them, so the row is made here from the parts: the status mark's shapes
// (js/statusrow.js), the identity chip (js/idmark.js), the ticking time (js/freshness.js, `kp-ago`), the timeline's rail
// (`kp-timeline`), the thread's day divider (js/thread.js) and the empty and failed plates (js/state-plate.js).
//
//   <div class="kp-feed" data-kp-feed data-kp-feed-unit="operation,operations" aria-label="Activity"></div>
//   setFeed(el, {
//       state: 'ready',
//       rows: [{ key: 'op-1042', state: 'failed', title: 'Update jellyfin', actor: { name: 'Claude', kind: 'agent' },
//                detail: 'Pull failed: registry timeout after 30 s', at: 1760875200000, more: ['$ docker compose pull', '…'] }],
//       total: 129, earlier: 'more', updatedAt: 1760875260000,
//   })
//
// A row is `{ key, title, at }` and, when it has them, a `state` (ok, failed, warn, running or info: a shape and a word as well as a
// colour, as a status row's), an `actor` (`{ name, kind }`: `person` and `agent` get a round chip, anything else a square one), a
// `detail` line, a `href` (the title becomes a link) and `more` (lines that open under the row; the title becomes the disclosure
// button, and a `href` then shows as "Open" inside it). Rows are sorted newest first; the key is the row's identity.
//
// Options, each an attribute (read at every render, so they switch at runtime) and an attribute of the host:
//
//   data-kp-feed-group     `day` (default): a heading per day, "Today", "Yesterday", then the weekday and date, with that day's count
//                          and "N failed" (or "all ok"); `none`: one list
//   data-kp-feed-summary   `on` (default) | `off`: the count on each day heading
//   data-kp-feed-unit      "operation,operations": the app's word for a row; default "event,events"
//   data-kp-feed-time      `auto` (default): "12 min ago" for the first 24 hours (a ticking `kp-ago`), then dd/mm/yyyy HH:mm;
//                          `relative` always the ago line; `clock` the ago line, then HH:mm under a day heading; `moment` always dd/mm/yyyy HH:mm
//   data-kp-feed-actor     `chip` (default): mark and name; `mark`: the mark alone (the name is its title and its screen-reader text); `off`
//   data-kp-feed-expand    `many` (default): any number of rows open; `one`: opening a row closes the others; `off`: rows with `more` are not openable
//   data-kp-feed-rail      `on` (default): the timeline's rule joins the marks of one day; `off`
//   data-kp-feed-head      `on` (default): the count and the freshness line above the list; `off`
//   data-kp-feed-max       a CSS length: the list scrolls inside that height and the day headings stay at its top
//   data-kp-feed-level     the heading level of a day heading (default 3)
//
// States, as `model.state`: `ready`; `loading` (rows' skeleton under the theme's busy card, the loaded height held by js/footprint.js);
// `empty` (the empty plate, "Nothing happened yet", the reason in `emptyText`); `error` (the failed plate with Retry). A refresh that
// failed while the rows are still good is not an error: `model.stale = { reason, since }` keeps the rows and says, in the head line,
// "Not refreshed: …. Rows from 14:02." with a button that reads it again. "Load earlier" is `model.earlier`: `more` (a button),
// `loading` (the button at work), `error` (the sentence and Try again) or `end` (nothing earlier, said once); anything else leaves
// the foot empty. Its room is always reserved, so the rows do not move when it changes.
//
// Events (bubbling, on the host): `kp-feed-retry` {}, `kp-feed-earlier` {} and `kp-feed-open` { key, open }. The page decides what a retry
// is and answers with setFeed(). A re-render keeps the focus on the row it was on, by key, and the rows that were open stay open.
// Every word is in js/strings.js. Nothing runs on import; attachFeeds(root) returns a detach.
//
// The module is a facade: a feed is a `FeedController` (closure-pattern B, js/controller.js) in `js/feed/`, one file per concern.

export {
    FEED,
    FEED_RETRY_EVENT,
    FEED_EARLIER_EVENT,
    FEED_OPEN_EVENT,
    FEED_ROW_STATES,
    FEED_STATES,
    FEED_EARLIER,
    FEED_TIME_ZONE,
    FEED_RELATIVE_MS,
    FEED_TICK_MS,
} from './feed/constants.js';
export { feedOf, setFeed, attachFeeds } from './feed/api.js';

/** @typedef {import('./feed/constants.js').FeedRowState} FeedRowState */
/** @typedef {import('./feed/constants.js').FeedActor} FeedActor */
/** @typedef {import('./feed/constants.js').FeedRow} FeedRow */
/** @typedef {import('./feed/constants.js').FeedStale} FeedStale */
/** @typedef {import('./feed/constants.js').FeedModel} FeedModel */
/** @typedef {import('./feed/constants.js').FeedHandle} FeedHandle */
