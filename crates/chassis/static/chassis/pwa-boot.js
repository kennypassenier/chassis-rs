// Registers the service worker on a page that does not load the web app's
// runtime: a project's own server-rendered page (App::pwa_page_head adds a
// <script type="module"> for this file next to the manifest link). It is the
// whole of what such a page needs to belong to the installed app; the web
// app's own pages get the same registration through webapp-runtime.js.
//
// A module under `script-src 'self'`, so no inline script and no CSP change.
// registerPwa() does nothing without the manifest link, and a second page
// load re-registers the same worker, which the browser treats as a no-op.

import { registerPwa } from './pwa-register.js';

registerPwa(window, document);
