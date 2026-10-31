// The uptime strip [kpadopt4-ideas, Kenny 2026-10-16].
//
// One thin strip of cells, one per period (90 days, 48 hours), each toned by
// how the service did in it: up, degraded, down, or no data. Over the strip a
// title and the window's summary in exact figures ("99.4% · 2 incidents"),
// under it the first and the last period's names. Every cell is a button with
// the hover card for its detail (js/hovercard.js) and fires `kp-uptime-pick`
// when pressed, so a page can open that day.
//
//   <div class="kp-uptime" data-kp-uptime data-kp-uptime-label="jellyfin" data-kp-uptime-count="90"></div>
//
//   setUptime(el, { label: 'jellyfin', periods: [{ key: '2026-10-16', label: '16/10/2026', state: 'up' }, …] });
//
// A strip is never wrapped onto a second line. On a narrow page it shows the
// latest periods that fit (each cell at least `--kp-uptime-cell-min` wide) and
// says how many of them it shows ("55 of 90 shown"); with
// `data-kp-uptime-fit="scroll"` it keeps every period and scrolls sideways
// instead, scrolled to the latest. The summary always speaks of the whole
// window the page gave.
//
// The figures are exact: the share is cut, never rounded up (99.96% reads
// 99.9%, and only a window without a minute down reads 100%), and the incident
// count is the number, not "9+". A period's share is its `uptime` (0 to 1)
// when the page measured one, else 1 for up and degraded and 0 for down;
// periods without data do not count. Its incidents are `incidents` when given,
// else 1 for a degraded or down period.
//
// States, each in the same footprint so nothing moves between them: `ready`;
// `loading` (the cells wait as the theme's skeleton and the data table's busy
// card stands over them, js/busy-card.js); `empty` and `error` (the package's state plate over the strip's whole footprint, js/state-plate.js:
// `message` / `error` its heading, `text` its sentence, `art` a picture; a failure has a Retry that fires `kp-uptime-retry`; js/footprint.js
// holds the height the strip had with its cells [kyu-plates-1019]). Before the first
// setUptime() the strip draws the loading state from its attributes, so a
// page shows loading from its first frame.
//
// Strips that load together have ONE busy card over the group, not one card each [state-plates-1019]: mark the box that holds
// them `data-kp-uptime-group` (`="off"` on a strip's ancestor opts out), or let two or more strips that are direct children of
// one parent be a group by themselves. The card covers the strips that load at that moment and leaves when the last one has data.
//
// Keys: the strip is one tab stop (the latest cell); the arrows move through
// the cells that are shown, Home and End go to the first and the latest, and
// Enter or Space picks. The hover card opens at once on focus.
//
// A cell can open something (Kenny, 2026-10-16: "zie dat de items zelf
// klikbaar zijn zodat ze bv iets kunnen openen, ofwel een pagina, ofwel mss
// een tooltip met wat snelle info"), opt-in, two ways:
//   page   a period with `href` is a link to that period's own page: a press,
//          Enter or Space follows it (the hover card stays);
//   info   `open: 'info'` (or `data-kp-uptime-open="info"`) makes a press,
//          Enter or Space open the period's quick info under its cell: the
//          theme's own popover plate with the period, its state as a swatch
//          and a word, its exact figures, the page's `details` lines and,
//          when the period has `href`, a link to its page. One at a time;
//          the arrows carry it along the strip, a second press, Escape or a
//          press outside closes it (Escape gives the focus back to the cell),
//          the hover card rests while it is open. `kp-uptime-open`
//          ({ key, index, period, panel }, cancelable: the page may show its
//          own) fires before it opens.
// `kp-uptime-pick` fires on every press, as before.
//
// Nothing runs on import; attachUptimes(root) returns a detach.

export { UPTIME, UPTIME_PICK_EVENT, UPTIME_OPEN_EVENT, UPTIME_RETRY_EVENT, UPTIME_STATES, UPTIME_COUNT } from './uptime/constants.js';
export { uptimeFigures, uptimePercent, uptimeFit } from './uptime/figures.js';
export { setUptime } from './uptime/draw.js';
export { attachUptimes } from './uptime/attach.js';

/** @typedef {import('./uptime/types.js').UptimePeriod} UptimePeriod */
/** @typedef {import('./uptime/types.js').UptimeSpec} UptimeSpec */
/** @typedef {import('./uptime/types.js').UptimeFigures} UptimeFigures */
