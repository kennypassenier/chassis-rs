// How sizes, counts, dates and levels are written (decimal units,
// Europe/Brussels, dd/mm/yyyy): the Storage page, and the Notifications card
// for its counts and dates.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { formatBrussels } from './format-text.js';

/* ------------------------------------------------------- formatting -- */
// KB under a megabyte, MB with one decimal, GB above; decimal units.
export const size = (bytes) => {
  if (bytes < 1e6) return `${bytes <= 0 ? 0 : Math.max(1, Math.round(bytes / 1e3))} KB`;
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e9).toFixed(1)} GB`;
};
// An exact count; a no-break space between thousands (2 418, 648 000).
export const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const unitOf = (k) => k.unit || 'rows';
const oneOf = (k) => (unitOf(k).endsWith('s') ? unitOf(k).slice(0, -1) : unitOf(k));
export const count = (n, k) => `${num(n)} ${n === 1 ? oneOf(k) : unitOf(k)}`;
export const when = (iso) => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? String(iso) : formatBrussels(t);
};
const BRUSSELS_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', day: '2-digit', month: '2-digit', year: 'numeric' });
export const dmy = (ms) => {
  const p = Object.fromEntries(BRUSSELS_DAY.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year}`;
};
const BRUSSELS_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Brussels', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
});
// The offset of Brussels from UTC at an instant, in ms.
const brusselsOffset = (ms) => {
  const p = Object.fromEntries(BRUSSELS_CLOCK.formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
};
// dd/mm/yyyy to the first instant of that day in Brussels; null when it is no day.
export const startOfDay = (text) => {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(text);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const wall = Date.UTC(y, mo - 1, d);
  if (new Date(wall).getUTCDate() !== d || new Date(wall).getUTCMonth() !== mo - 1) return null;
  let t = wall - brusselsOffset(wall);
  t = wall - brusselsOffset(t);
  return t;
};
// "created_at" is a column's name; the page says "Created at".
export const humane = (name) => {
  const s = String(name).replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const levelWord = (level) => (level === 'over' ? 'Over budget' : level === 'warn' ? 'Getting full' : 'Within budget');
export const levelBadge = (level) =>
  `<span class="kp-badge ${level === 'over' ? 'kp-badge--destructive' : level === 'warn' ? 'kp-badge--warning' : 'kp-badge--success'}">${levelWord(level)}</span>`;
