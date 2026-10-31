// A live log viewer: the log's lines kept in a ring buffer, found, wrapped, timed and copied [gap-log-viewer; homelab's host log
// explorer `mountHostLog` and the Stack logs tab].
//
//   <div class="kp-logviewer" data-kp-logviewer data-kp-log-max="2000" aria-label="Host log"></div>
//
//   appendLogLines(viewer, [{ id: 'a1', ts: Date.now(), source: 'traefik', level: 'warn', message: 'certificate renews in 6 days' }]);
//
// The split with the app: this part owns the buffer and everything done to it on screen (the cap, the find, the wrap, the time
// column, the level colour and filter, copy and download, the three states). The app owns where the lines come from: it calls
// `appendLogLines` with what arrived (a poll that returns overlapping windows is fine, a line is kept once per `id`) and says
// `setLogViewer(el, { state: 'loading' | 'error' })` while it waits or when the source failed. It builds on what the package
// already had: the rows are `.kp-log` lines (the four-column grid, the severity word and plate, the source's own hue from
// js/log.js) and following the tail, the pause and resume button and the exact "N new lines" pill are js/newpill.js, not
// written again here.
//
// No virtual windowing (docs/FEATURES.md TH42, "Don't do"): every kept line is a real row, so find-in-page, selection and
// screen readers see what is there, and the ring buffer keeps the DOM small. The cap is the option below.
//
// A line is `{ id?, ts, source?, level, message }`; `ts` is a number of milliseconds, a Date or a date string, `level` is
// debug, info, notice, warning, error or critical (trace, warn, err, crit, fatal, alert and emerg are taken for the nearest).
//
// Options (attributes on the root, each also a key of `attachLogViewers` / `setLogViewer`; every one is live: change the
// attribute and the viewer is drawn again):
//   data-kp-log-max          lines kept (2000); the oldest are dropped first and counted, "412 earlier lines dropped"
//   data-kp-log-wrap         `on` (default) wraps a long line; `off` keeps it on one line and scrolls sideways under a time
//                            column that stays put
//   data-kp-log-time         `time` (default, 14:32:07), `datetime` (19/10/2026 14:32:07) or `off`
//   data-kp-log-level        the lowest level shown: `debug` (default, all), `info`, `warning` or `error`
//   data-kp-log-search       the text to find (case ignored); matches are marked, counted, and walked with Enter and Shift+Enter
//   data-kp-log-search-only  `on` hides the lines without a match; default `off`
//   data-kp-log-follow       `live` (default) follows the newest line; `paused` starts held (js/newpill.js does the rest)
//   data-kp-log-tools        the tools shown, comma separated: search, follow, wrap, time, level, copy, download (default all)
//   data-kp-log-filename     the name a download gets, without `.txt` (`log`)
//   data-kp-log-hint         the empty plate's sentence
//   data-kp-log-focus-key    the key that jumps to the search from anywhere (`/`; `false` for none)
//   data-kp-log-error        the failed plate's sentence, the host's own reason (`setLogViewer(el, { state: 'error', message })`); `-error-title` its heading [wish-1120]
//   data-kp-state            `ready` (default), `loading` (the busy card over the viewer) or `error` (the failed plate with Retry);
//                            the lines already kept stay in the buffer and return with `ready`
//
// Events (bubbling, on the root): `kp-logviewer-change` `{ total, shown, dropped, matches, current }` and `kp-logviewer-retry`.
// Every word is in js/strings.js; nothing runs on import.

export { LOGVIEWER, LOGVIEWER_EVENT, LOGVIEWER_RETRY_EVENT, LOGVIEWER_MAX, LOG_LEVELS } from './logviewer/constants.js';
export { logLevel } from './logviewer/levels.js';
export { appendLogLines, logViewerLines, logViewerText, clearLogViewer, searchLogViewer, stepLogMatch, setLogViewer } from './logviewer/api.js';
export { attachLogViewers } from './logviewer/attach.js';

/** @typedef {import('./logviewer/types.js').LogLine} LogLine */
/** @typedef {import('./logviewer/types.js').LogViewerSpec} LogViewerSpec */
/** @typedef {import('./logviewer/types.js').Kept} Kept */
/** @typedef {import('./logviewer/types.js').ViewerState} ViewerState */
