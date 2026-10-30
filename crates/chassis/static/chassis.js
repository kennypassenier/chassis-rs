// The kit's dashboard behaviours (K12, K13, K14, rule 31). Everything
// else is server-rendered HTML and plain forms. This module is the kit's
// own file, not vendored: the gate does not check it against kp-themes.
//
// It attaches the @kp-soft/themes behaviours the kit's templates use
// (v3.x modules are pure, so somebody has to call them), then wires the
// kit's own controls:
//
//   [data-post]               a POST-and-reload button of a project (a row
//                             or a section action); a kp flash button runs it
//
// The Clients page (the "clients" block below) wires its manage and issue
// dialogs from kp-themes parts: the token is a .kp-secret that asks
// /api/clients/ID/token when it is shown or copied, so a "view source" or a
// cached page holds nothing (K12); the requests are a .kp-inspector.
//
// Clipboard: navigator.clipboard exists only in a secure context (https, or
// http://localhost). On http://inbox.lan:8080 from another machine the
// execCommand fallback runs; it works only inside a real click, which is
// exactly where these buttons live. (kyu's finding, kept.)
//
// The code lives in chassis/*.js, one ES module per page or concern. This
// file only lists them, in the order the single file ran them: the first
// pages' behaviour, then the shell, then the status and storage pages. Each
// module starts only where its page markup is, as before.

import './chassis/boot-kit.js';
import './chassis/actions.js';
import './chassis/clients-page.js';
import './chassis/login-page.js';
import './chassis/passkeys-page.js';
import './chassis/ready-signal.js';
import './chassis/shell.js';
import './chassis/status-page.js';
import './chassis/storage-page.js';
