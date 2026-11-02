// The kit runtime for a web app that imports kp-themes' per-module entries
// (kp/dist/js/<entry>.js) and says so with WebApp::kp_modules(): the server
// injects this file instead of webapp-runtime.js. Same wiring (see
// webapp-runtime-core.js), but the kp functions come from the entries, which
// share their chunks with the app's own imports: one copy of kp-themes'
// state, so the remember store syncs to the login and the refresh control
// uses the strings the app set.
//
// The effects, dialogs and theme pickers are not attached here: the app's
// auto.js entry already attaches them, and a second attach would double them.
//
// This file never imports the one-file bundle (locked by one_source.rs).

import { attachAgo, setAgo } from '../kp/dist/js/freshness.js';
import { attachRefresh, refreshOf } from '../kp/dist/js/auto-refresh.js';
import { configureRemember } from '../kp/dist/js/remember.js';
import { installRuntimeWith } from './webapp-runtime-core.js';

const kp = { attachAgo, attachRefresh, configureRemember, refreshOf, setAgo };

/** Install the runtime on `win`/`doc` unless it is already there (see the core). */
export function installRuntime(win, doc, deps = {}) {
    return installRuntimeWith(kp, win, doc, deps);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    installRuntime(window, document);
}
