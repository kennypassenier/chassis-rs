// The automatic refresh chooser [kpadopt5-ops; spec item 8].
//
// A small control "Every 30 s / Paused" with "updated 12 s ago" beside it. The
// APP does the fetching: on each tick the control fires `kp-refresh`, the app
// reads its data and calls `detail.done(true | false)` (or refreshDone(el, ok)).
//
//   <div class="kp-refresh" data-kp-refresh="30" data-kp-remember="dashboard"></div>
//
// Options, each an attribute and a JS option of attachRefresh(root, options):
//
//   data-kp-refresh          seconds the page opens with; default 30 (Kenny, 2026-10-17: "default 30 seconden,
//                            maar moet aanpasbaar zijn"); 0 opens paused
//   data-kp-refresh-choices  the seconds offered, 0 = paused; default "0,15,30,60,300". The "Other…" entry takes ANY
//                            whole number of seconds, from the user and (setRefreshInterval) from the consumer
//   data-kp-refresh-mode     event (default: the app fetches) | page (reload the page) | region (fetch the same URL
//                            and swap only `data-kp-refresh-region`, keeping focus and scroll)
//   data-kp-refresh-region   selector of the element to swap in `region` mode
//   data-kp-look             segmented (default, Kenny 2026-10-17: "Segments") | menu; switchable at runtime, like the
//                            choices, the freshness options and a new data-kp-refresh (js/live-options.js)
//   data-kp-refresh-label    words for the bar's own label cell ("Auto-refresh"); in a `.kp-formgrid` it stands in the
//                            label track beside the chooser, the freshness line and Refresh now, on one first baseline;
//                            elsewhere it is a line above the bar. Switchable at runtime; none by default
//   data-kp-refresh-title    words for a title in the bar's grid [wish-1028, almanac 21]: the first cell of the bar, before the chooser, so
//                            "Calendar sync | Every 30 s | updated 12 s ago | Refresh now" stands on one row. In a `.kp-formgrid` it
//                            takes the label track. With a label too, the title is the heading line over the whole bar. Rich
//                            content: put an element marked `data-kp-refresh-slot="title"` inside the control and it is moved into
//                            that cell. Switchable at runtime; `--kp-refresh-title-width` sets the track (default max-content)
//   data-kp-refresh-stack    auto (default) | always | never: outside a `.kp-formgrid` the bar folds to one column under 40rem of
//                            viewport (chooser, freshness line, Refresh now, on the start edge); `always` folds it at any width,
//                            `never` keeps the row. A form grid folds on its own width (data-kp-formgrid-stack). CSS only
//   data-kp-remember         name: the choice per page per device (js/remember.js, component `refresh`)
//   data-kp-stale-after      seconds; the freshness line turns stale after it (default 3 x the interval)
//   data-kp-refresh-hover    "pause": no refresh while the pointer is over a `.kp-table-wrap` being read
//
// What it does for the person: the line says "updated N s ago" (js/freshness.js) and, while the app reads,
// "updating…" in the same width; a thin rule under the control runs down to the next refresh. A failed refresh
// keeps the data and says "Last refresh failed, retrying in 30 s" with Retry now; the retries back off (the
// interval, twice, four times, then that) and return to normal on success. It never eats typing: a refresh waits
// while a dialog is open or a form field has the focus, and while the tab is hidden; on return it refreshes once if
// one was due. The R key refreshes now (not inside a field).
//
// Events (bubbling, on the control):
//   kp-refresh           { reason: 'timer' | 'now' | 'retry' | 'return', interval, done(ok) }
//   kp-refresh-interval  { seconds, by: 'user' | 'script' }
//
// Every word is in js/strings.js. Nothing runs on import; attachRefresh(root) returns a detach.
//
// The module is a facade: a refresh control is a `RefreshController` (closure-pattern B, js/controller.js) in `js/auto-refresh/`, one file per concern.

export { REFRESH, REFRESH_EVENT, REFRESH_INTERVAL_EVENT, REFRESH_DEFAULT, REFRESH_CHOICES } from './auto-refresh/constants.js';
export { refreshOf, refreshDone, setRefreshInterval, setRefreshTitle, attachRefresh } from './auto-refresh/api.js';

/** @typedef {import('./auto-refresh/constants.js').RefreshHandle} RefreshHandle */
