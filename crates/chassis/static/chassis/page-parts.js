// The kp-themes parts the login and passkeys pages attach, fetched only
// when the markup asks for them.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

// ==========================================================================
// kp parts of the login and passkeys pages (kit-kp11)
// The two pages are made of kp-themes parts that need their behaviour
// attached. Only the modules a page's markup asks for are fetched, so the
// other kit pages pay nothing; every attach below is idempotent, so a part
// the shell attaches too is not attached twice.
// ==========================================================================
const PAGE_PARTS = [
  ['[data-kp-dialog], [data-kp-dialog-close]', '../kp/js/overlays.js', (m, root) => m.attachDialogs(root)],
  ['.kp-switch', '../kp/js/forms.js', (m, root) => m.attachSwitches(root)],
  ['[data-kp-flash-button]', '../kp/js/flash.js', (m, root) => m.attachFlashButtons(root)],
  ['[data-kp-ago]', '../kp/js/freshness.js', (m, root) => m.attachAgo(root)],
  ['.kp-lede', '../kp/js/lede.js', (m, root) => m.attachLedes(root)],
  ['[data-kp-qr]', '../kp/js/qr.js', (m, root) => m.attachQr(root)],
  ['.kp-steplist', '../kp/js/steplist.js', (m, root) => m.attachSteplists(root)],
  ['[data-kp-menu-button]', '../kp/js/menu-button.js', (m, root) => m.attachMenuButtons(root)],
];

export async function attachPageParts(root) {
  await Promise.all(
    PAGE_PARTS.filter(([selector]) => root.querySelector(selector)).map(async ([, path, attach]) => {
      try {
        attach(await import(path), root);
      } catch (e) {
        console.warn(`chassis: ${path} did not attach`, e);
      }
    }),
  );
}
