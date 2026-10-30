// Text helpers every page shares: HTML escaping and the one way the kit
// writes dates (dd/mm/yyyy HH:mm, Europe/Brussels).
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// feat-ui-1: a timestamp on a page is read by a person, so it is rendered the
// one way the kit writes dates: dd/mm/yyyy HH:mm, 24 hours, Europe/Brussels
// (kit-kp11, UI principles rule 52; it was the reader's locale before). The
// server puts the exact RFC 3339 value in `datetime` and a plain fallback in
// the text; this replaces that text and keeps the exact value in the tooltip, so
// nothing is lost for whoever does want the machine form. Kenny's case was
// `2026-09-10T02:16:47Z` in a live table column.
//
// A value the browser cannot read is left exactly as the server wrote it: a
// wrong date is worse than an ugly one.
export function localiseTimes(root = document) {
  for (const el of root.querySelectorAll('time[datetime]:not([data-localised])')) {
    const when = new Date(el.getAttribute('datetime'));
    if (Number.isNaN(when.getTime())) continue;
    el.textContent = formatBrussels(when);
    el.title = el.getAttribute('datetime');
    el.dataset.localised = 'true';
  }
}
// dd/mm/yyyy HH:mm, 24 hours, Europe/Brussels (UI principles, rule 52).
// A function declaration so localiseTimes() above can call it before this
// block runs; the formatter is built on first use for the same reason.
export function formatBrussels(when) {
  formatBrussels.format ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(formatBrussels.format.formatToParts(when).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
