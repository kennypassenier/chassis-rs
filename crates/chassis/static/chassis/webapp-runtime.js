// The kp-themes runtime every page of a project's web app needs, loaded by
// the kit itself: the web-app file server puts a <script type="module"> for
// this file in every HTML page it serves (WebApp::without_kit_runtime() opts
// out), so an app cannot forget it. Without it the dark theme's background
// glow did not follow the pointer (Medicine Cabinet, Kenny 2026-10-30).
//
// This is the BUNDLE variant: the app links and imports kp-themes' one-file
// bundle, so this module must hold the same copy of kp-themes' state. An app
// that imports the per-module entries calls WebApp::kp_modules() and gets
// webapp-runtime-modules.js instead (same wiring, other imports).
//
// Only what is page-global and safe on any markup is attached here: the
// effects (they act on elements carrying kp hooks and on the document root)
// and the remembered-choice store. Theme pickers, confirmations, contracts
// and skip links stay with the pages that ask for them (boot-kit.js, or the
// app's own code): they rewrite or demand specific markup.
//
// Idempotent per page: `window.chassisRuntime` marks the first load, so the
// same module under another URL (?v=…) or a second tag does nothing.

import { attachAgo, attachEffects, attachRefresh, configureRemember, connectionOf, openConfirmation, refreshOf, setAgo, toast } from '../kp/dist/kp-themes.min.js';
import { installRuntimeWith } from './webapp-runtime-core.js';

const kp = { attachAgo, attachEffects, attachRefresh, configureRemember, connectionOf, openConfirmation, refreshOf, setAgo, toast };

/** Install the runtime on `win`/`doc` unless it is already there (see the core). */
export function installRuntime(win, doc, deps = {}) {
    return installRuntimeWith(kp, win, doc, deps);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    installRuntime(window, document);
}
