// The page-ready signal for an app's own module.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

// kit-kp11: the page-ready signal. Everything above has attached by now, so
// an app's own module can attach ITS kp modules after the kit without
// double-attaching what is listed in `attached` (the theme picker above all).
// `chassis.ready` is a promise (awaiting it after the event still works);
// `chassis:ready` fires once on document.
{
  const attached = ['theme-picker', 'contracts', 'confirmations', 'effects', 'skip-links'];
  const ready = new Promise((resolve) => {
    const done = () => {
      resolve(window.chassis);
      document.dispatchEvent(new CustomEvent('chassis:ready', { detail: { attached } }));
    };
    // Module scripts run deferred, so the document is parsed; wait a task
    // so listeners registered by sibling modules in the same pass are in.
    setTimeout(done, 0);
  });
  window.chassis = Object.freeze({ ...(window.chassis || {}), attached, ready });
}
