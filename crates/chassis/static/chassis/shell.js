// The shell: bar, palette, shortcuts, phone tab bar, connection line and
// error page.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { attachForms } from '../kp/js/forms.js';
import { $ } from './shell-dom.js';
import { attachErrorPage } from './shell-error-page.js';
import { attachPalette } from './shell-palette.js';
import { attachConnectionLine } from './shell-connection.js';

// ====================================================================== shell ==
// kit-kp11 (Kenny approved the demo sections shell-bar, shell-phone and
// error-page, 2026-10-19): everything the bar, the search palette, the
// shortcut chords and sheet, the connection line, the phone's tab bar and
// the error page need from script. The markup is server-rendered in
// layout.html and error.html from the page registry (`nav`, `pages`); this
// block only attaches the kp modules and adds what the registry cannot say:
// the chords, one palette entry per client, the exact count on a tab.
// Merge note: this block stands alone; its parts are the shell-*.js files.

{
  const joined = [];

  // Error page: the drawing, the copy button, the way back, the time.
  attachErrorPage(joined);

  const paletteEl = $('#chassis-palette');
  const connectionEl = $('[data-kp-connection]');
  if (paletteEl) attachPalette(paletteEl, joined);

  // ---- Log out is the package's form too (data-kp-form + data-kp-submit +
  // data-kp-form-summary); it still goes out as a plain POST.
  const logoutForm = $('#chassis-logout');
  if (logoutForm) {
    attachForms(logoutForm.parentElement);
    joined.push('logout-form');
  }

  // ---- the connection line: the page's own requests report what they see.
  if (connectionEl) attachConnectionLine(connectionEl, joined);

  if (window.chassis && Array.isArray(window.chassis.attached)) window.chassis.attached.push(...joined);
}
