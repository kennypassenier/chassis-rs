// Publishes `window.chassisRefresh` [ux-chassis-10]: the kit's one refresh
// control and its API, on every kit page and (through webapp-runtime.js) on
// every page of a project's web app. It mounts the control into the page's
// `<div data-chassis-refresh>` slot, also when a single-page app draws that
// slot later, and refuses a second one: a page has one control.
//
// Idempotent per page, like the web-app runtime: the first install wins. The
// caller installs it after the remembered-choice store is configured, so the
// control reads the reader's interval from the right place.

import { attachAgo, attachRefresh, refreshOf, setAgo } from '../kp/dist/kp-themes.min.js';
import { createRefreshBus } from './refresh-bus.js';
import { mountRefresh } from './refresh-control.js';
import { fetchFragment, rereadSections } from './refresh-sections.js';

const SLOT = '[data-chassis-refresh]';

/**
 * Install the API and mount the slot on `win`/`doc` unless already done.
 * `deps.kp` and `deps.warn` are injectable for a test.
 */
export function installRefresh(win, doc, deps = {}) {
  if (win.chassisRefresh) return win.chassisRefresh;
  const kp = deps.kp ?? { attachAgo, attachRefresh, refreshOf, setAgo };
  const warn = deps.warn ?? ((text) => console.warn(text));
  const { api, internals } = createRefreshBus({ target: doc });
  // Sections that opt in with data-chassis-refresh-section follow the same tick.
  api.onTick(() => rereadSections(doc, deps.fetchText ?? fetchFragment));
  let current = null; // { slot, unmount }

  // Mounts `slot` unless the page already has a live control in another slot.
  function mount(slot) {
    if (current && current.slot.isConnected) {
      if (current.slot !== slot) warn('chassisRefresh: a page has one refresh control; the extra slot is left empty');
      return current.slot === slot;
    }
    current?.unmount();
    current = { slot, unmount: mountRefresh(slot, internals, kp) };
    // The page was just drawn: it is as fresh as it can be until a read says otherwise.
    api.markFresh();
    return true;
  }

  const scan = () => {
    if (current && current.slot.isConnected) return;
    const slot = doc.querySelector(SLOT);
    if (slot) mount(slot);
  };
  scan();
  if (typeof MutationObserver !== 'undefined' && doc.documentElement) {
    new MutationObserver(scan).observe(doc.documentElement, { childList: true, subtree: true });
  }
  win.chassisRefresh = Object.assign(api, { mount });
  return win.chassisRefresh;
}
