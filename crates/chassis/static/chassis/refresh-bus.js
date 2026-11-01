// The kit's refresh bus [ux-chassis-10]: the one place where "it is time to
// read again" is announced and where the freshness line is told when the data
// is as new as it is. Pure logic with no DOM of its own, so a node test can
// drive it; chassis/refresh-control.js binds it to the kp-themes control and
// refresh-kit.js publishes it as `window.chassisRefresh`.
//
// An app listens to the kit's tick instead of drawing a bar of its own:
//
//   const off = chassisRefresh.onTick(async ({ interval, reason }) => { await reload(); });
//   chassisRefresh.markFresh(new Date(serverTime));   // the data is as old as this
//
// A tick handler may be async. It fails the tick by throwing, rejecting or
// returning `false`; the control then shows its own "Last refresh failed"
// note with Retry now. Anything else counts as read.

/** The DOM event name; it bubbles on the control and fires on the document. */
export const REFRESH_EVENT = 'chassis:refresh';

/**
 * @param {{ target?: EventTarget | null, clock?: () => number, report?: (error: unknown) => void }} [options]
 *   `target` receives the `chassis:refresh` event; `clock` is injected so a
 *   test never reads the real one; `report` shows a handler's error.
 */
export function createRefreshBus({ target = null, clock = () => Date.now(), report = (e) => console.error('chassisRefresh handler', e) } = {}) {
  const tickers = new Set();
  const intervalWatchers = new Set();
  const freshWatchers = new Set();
  let seconds = null;
  let freshAt = null;
  let tickFresh = null; // set by markFresh while a tick is being read
  let driver = null;

  const subscribe = (set, fn) => {
    set.add(fn);
    return () => set.delete(fn);
  };
  const emit = (set, ...args) => {
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch (error) {
        report(error);
      }
    }
  };

  // Runs one handler and folds its outcome into true (read) or false (failed).
  async function settle(fn, detail) {
    try {
      return (await fn(detail)) !== false;
    } catch (error) {
      report(error);
      return false;
    }
  }

  // Announces one tick: `chassis:refresh` for listeners that only observe
  // (they can hand a promise to detail.until), the registered handlers for
  // the rest. Resolves `{ ok, freshAt }`: ok is false when any handler failed.
  async function tick({ reason = 'timer', interval = seconds ?? 0 } = {}) {
    tickFresh = null;
    const pending = [];
    const detail = { reason, interval, until: (promise) => pending.push(Promise.resolve(promise)) };
    target?.dispatchEvent(new CustomEvent(REFRESH_EVENT, { bubbles: true, detail }));
    const outcomes = await Promise.all([...[...tickers].map((fn) => settle(fn, { reason, interval })), ...pending.map((p) => settle(() => p))]);
    return { ok: outcomes.every(Boolean), freshAt: tickFresh };
  }

  const api = {
    /** Run `fn({ reason, interval })` on every kit tick; returns the function that stops it. */
    onTick: (fn) => subscribe(tickers, fn),
    /** Run `fn(seconds)` when the interval changes (0 = paused); returns the stop function. */
    onInterval: (fn) => subscribe(intervalWatchers, fn),
    /** The chosen interval in seconds, 0 when paused, null before the control exists. */
    interval: () => seconds,
    /** Change the interval from code (any whole number of seconds; 0 pauses). */
    setInterval: (value) => driver?.setInterval(value),
    /** Read at once, as the "Refresh now" button does; false when the page has no control. */
    now() {
      if (!driver) return false;
      driver.now('now');
      return true;
    },
    /** Say the data on screen is as new as `date` (default: now); the freshness line follows. */
    markFresh(date = new Date(clock())) {
      const ms = date instanceof Date ? date.getTime() : Number(date);
      if (!Number.isFinite(ms)) return;
      freshAt = ms;
      tickFresh = ms;
      emit(freshWatchers, ms);
    },
    /** The moment passed to markFresh last (ms), or null. */
    freshAt: () => freshAt,
  };

  // The control's side of the bus: used by refresh-control.js, not by apps.
  const internals = {
    tick,
    /** Hand the bus the control's own methods; returns the unbind function. */
    bind(next) {
      driver = next;
      seconds = next.interval();
      return () => {
        if (driver === next) driver = null;
      };
    },
    intervalChanged(value) {
      seconds = value;
      emit(intervalWatchers, value);
    },
    onFresh: (fn) => subscribe(freshWatchers, fn),
  };
  return { api, internals };
}
