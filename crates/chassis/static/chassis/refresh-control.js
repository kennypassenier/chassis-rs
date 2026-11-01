// The kit's refresh control [ux-chassis-10]: puts the kp-themes auto-refresh
// control into a slot (`<div data-chassis-refresh>`) and joins it to the
// refresh bus. The control keeps the interval, its remembered choice and the
// freshness line; this file only gives it the kit's one set of options and
// turns its `kp-refresh` question into a tick every listener on the page
// answers. Its own module so the kit pages and the web-app runtime mount the
// same control the same way, and so the kp calls are injectable for tests.

/** The kit's options. One remembered key for every page: the choice follows the reader. */
export const REFRESH_DEFAULTS = Object.freeze({
  seconds: 30,
  choices: '0,15,30,60,300',
  remember: 'chassis-refresh',
  look: 'menu',
});

/**
 * Give a slot the kit's options where it has none of its own. A page may set
 * `data-chassis-refresh-default` (seconds) for when nothing is remembered yet.
 */
export function prepareSlot(slot) {
  const own = {
    'data-kp-refresh': slot.getAttribute('data-chassis-refresh-default') || String(REFRESH_DEFAULTS.seconds),
    'data-kp-refresh-choices': REFRESH_DEFAULTS.choices,
    'data-kp-remember': REFRESH_DEFAULTS.remember,
    'data-kp-look': REFRESH_DEFAULTS.look,
  };
  for (const [name, value] of Object.entries(own)) if (!slot.hasAttribute(name)) slot.setAttribute(name, value);
  slot.classList.add('kp-refresh');
}

/**
 * Mount the control in `slot` and bind it to the bus internals.
 * @param {HTMLElement} slot
 * @param {object} internals the bus's control side (createRefreshBus().internals)
 * @param {{ attachRefresh: Function, attachAgo: Function, refreshOf: Function, setAgo: Function }} kp
 * @returns {() => void} unmount
 */
export function mountRefresh(slot, internals, kp) {
  prepareSlot(slot);
  const detachControl = kp.attachRefresh(slot);
  kp.attachAgo(slot); // the line only counts on while the freshness ticker runs
  const handle = kp.refreshOf(slot);
  // The newest moment the data on screen is known to be from. The kp control
  // repaints its line from its own record (empty until a read succeeded, which
  // reads "not updated yet" next to a page that was just drawn), so whenever
  // it repaints without a fresh answer this moment is put back.
  let known = null;
  const paint = (ms) => {
    const ago = slot.querySelector('.kp-refresh__ago');
    if (ago && ms !== null) kp.setAgo(ago, ms);
  };

  // The control asks the page to read: every listener answers, then the control hears the outcome.
  const onAsk = (event) => {
    const { done, reason, interval } = event.detail;
    internals.tick({ reason, interval }).then(
      ({ ok, freshAt }) => {
        done(ok);
        if (freshAt !== null) known = freshAt; // the data's own age beats "just now"
        else if (ok) known = null; // the control's own "now" is right
        paint(ok && freshAt === null ? null : known);
      },
      () => {
        done(false);
        paint(known);
      },
    );
  };
  const onInterval = (event) => {
    paint(known);
    internals.intervalChanged(event.detail.seconds);
  };
  slot.addEventListener('kp-refresh', onAsk);
  slot.addEventListener('kp-refresh-interval', onInterval);
  const unbind = internals.bind({
    interval: () => handle.interval(),
    setInterval: (seconds) => handle.setInterval(seconds, 'script'),
    now: (why) => handle.now(why),
  });
  const stopFresh = internals.onFresh((ms) => {
    known = ms;
    paint(ms);
  });

  return () => {
    slot.removeEventListener('kp-refresh', onAsk);
    slot.removeEventListener('kp-refresh-interval', onInterval);
    stopFresh();
    unbind();
    detachControl();
  };
}
