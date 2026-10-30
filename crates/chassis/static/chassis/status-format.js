// How the Status page writes times (dd/mm/yyyy HH:mm, Europe/Brussels) and
// counts.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

const BRUSSELS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Brussels', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export const HOURS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
// dd/mm/yyyy HH:mm, 24 hours (UI principles, rule 52).
export function when(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const p = Object.fromEntries(BRUSSELS.formatToParts(t).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
export const stampTimes = (scope) => {
  for (const el of scope.querySelectorAll('time[data-chassis-when]')) {
    el.textContent = when(el.getAttribute('datetime'));
    el.title = el.getAttribute('datetime');
  }
};
export const plural = (word, n) => `${n} ${word}${n === 1 ? '' : 's'}`;
