// The plate over a calendar's grid: an empty month's centred plate, and a failed month's with Retry.

import { getStrings } from '../strings.js';
import { hostStatePlate, statePlate } from '../state-plate.js';
import { isCalmTones } from '../calm-tones.js';
import { CALENDAR_RETRY_EVENT } from './constants.js';
import { make } from './dom.js';

/**
 * The plate over a calendar's grid, in every tone [r1r2-1019]: an empty month keeps its six quiet rows under a centred plate, a
 * month that could not be read is dimmed under one with Retry (`kp-calendar-retry`). A calm calendar says its own calm words
 * ("Nothing logged this month"); any other says the page's words (`setCalendarState`'s `words`, else the package's "Nothing to
 * show." / "Could not be read."). The state line keeps its row and its words for a screen reader but is not drawn a second time.
 * @param {import('./controller.js').CalendarController} c
 */
export function syncStatePlate(c) {
    const calm = isCalmTones(c.el);
    const kind = c.state === 'empty' ? 'empty' : c.state === 'error' ? 'error' : null;
    const old = c.el.querySelector(':scope > .kp-calendar__plate');
    c.grid.toggleAttribute('data-kp-dim', kind !== null);
    c.grid.toggleAttribute('inert', kind === 'error');
    if (kind === null) {
        old?.remove();
        return;
    }
    const s = getStrings();
    const words = c.stateLine.textContent ?? '';
    const key = `${kind}|${calm ? 'calm' : words}`;
    if (old?.getAttribute('data-kp-plate-key') === key) return;
    old?.remove();
    const retry = () => c.el.dispatchEvent(new CustomEvent(CALENDAR_RETRY_EVENT, { bubbles: true }));
    const inner = calm
        ? statePlate(c.el.ownerDocument, {
              kind,
              title: kind === 'empty' ? s.calmEmptyTitle : s.calmFailedTitle,
              text: kind === 'empty' ? s.calmEmptyText : s.calmFailedText,
              ...(kind === 'error' ? { actionLabel: s.calmRetry, onAction: retry } : {}),
          })
        : hostStatePlate(c.el, {
              kind,
              title: words || (kind === 'error' ? s.heatFailed : s.heatEmpty),
              retryEvent: CALENDAR_RETRY_EVENT,
          });
    const plate = make(c.el.ownerDocument, 'div', 'kp-calendar__plate');
    plate.setAttribute('data-kp-plate', kind);
    plate.setAttribute('data-kp-plate-key', key);
    plate.append(inner);
    c.grid.after(plate);
}
