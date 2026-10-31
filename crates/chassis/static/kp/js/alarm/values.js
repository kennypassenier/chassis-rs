// The events and the fixed numbers of the full-screen alarm.

/** Dispatched when an alarm closes, bubbling, on its trigger (or the document): `{ reason, id }`. */
export const ALARM_CLOSE_EVENT = 'kp-alarm-close';
/** Dispatched on the alarm, bubbling, once it is open: `{ id, mode }`. */
export const ALARM_OPEN_EVENT = 'kp-alarm-open';
/** How long an auto alarm stays when the caller names no `seconds`. An operational knob. */
export const ALARM_SECONDS = 8;
/** How often the countdown writes its share. Fast enough for a smooth bar, far below any flash rate: the bar only shrinks. */
export const TICK_MS = 100;
/** Milliseconds in a second. */
export const SECOND_MS = 1000;
