// The kp-themes parts the login and passkeys pages attach, fetched only
// when the markup asks for them.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { guardImport } from './stale-import.js';

// ==========================================================================
// kp parts of the login and passkeys pages (kit-kp11)
// The two pages are made of kp-themes parts that need their behaviour
// attached. Only the modules a page's markup asks for are fetched, so the
// other kit pages pay nothing; every attach below is idempotent, so a part
// the shell attaches too is not attached twice.
// ==========================================================================
// One source per page: every part comes from kp-themes' dist/js/ folder, the
// same modules the shell imports and auto.js shares chunks with, so no
// singleton exists twice.
const entry = (name) => `../kp/dist/js/${name}.js`;
const PAGE_PARTS = [
  ['[data-kp-dialog], [data-kp-dialog-close]', entry('overlays'), (m, root) => m.attachDialogs(root)],
  ['.kp-switch', entry('forms'), (m, root) => m.attachSwitches(root)],
  ['[data-kp-flash-button]', entry('flash'), (m, root) => m.attachFlashButtons(root)],
  ['[data-kp-ago]', entry('freshness'), (m, root) => m.attachAgo(root)],
  ['.kp-lede', entry('lede'), (m, root) => m.attachLedes(root)],
  ['[data-kp-qr]', entry('qr'), (m, root) => m.attachQr(root)],
  ['.kp-steplist', entry('steplist'), (m, root) => m.attachSteplists(root)],
  ['[data-kp-menu-button]', entry('menu-button'), (m, root) => m.attachMenuButtons(root)],
];

export async function attachPageParts(root) {
  await Promise.all(
    PAGE_PARTS.filter(([selector]) => root.querySelector(selector)).map(async ([, path, attach]) => {
      try {
        attach(await guardImport(import(path)), root);
      } catch (e) {
        console.warn(`chassis: ${path} did not attach`, e);
      }
    }),
  );
}
