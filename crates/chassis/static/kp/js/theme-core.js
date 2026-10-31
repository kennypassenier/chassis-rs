// The theme state, owned by the document rather than by either channel
// [AR5, AR6, TH26].
//
// The React hook used to keep the current theme and its subscriber list in
// module state. A plain <script> cannot reach a React module's closure, so
// on the comparison page the two pickers would each set the theme
// correctly and each fail to update the other's selection mark — on the
// very surface built to compare them.
//
// So: the truth is `document.documentElement.dataset.theme`, and a change
// is announced as one DOM event both channels listen to. Cross-tab
// following rides the same bus, because a `storage` event is translated
// into the same announcement.
//
// This file is plain ESM with no dependencies. React sits on top of it,
// not underneath.
//
// Since 3.0.0 [KT6]: where the theme lives is a choice — the root
// element, the class that marks a dark theme and the storage key are
// settable once with configureTheme() or per call; a change can be
// refused by a listener on BEFORE_THEME_EVENT; the change event bubbles
// from the root so a scoped listener can catch it; a strict apply
// reports an unknown name instead of silently substituting the default;
// and the cross-tab subscription can be declined.
//
// Not a component, so no controller class: the state is the document's and one `config` object, and there is no per-element wiring to
// own. The module is split by responsibility into js/theme-core/ (values, report, read, apply, preview, store, subscribe); this file
// is the facade that re-exports the names it always exported.

import { THEMES, DEFAULT_THEME, STORAGE_KEY } from './theme-registry.js';

/** @typedef {import('./theme-registry.js').ThemeName} ThemeName */
/** @typedef {import('./theme-core/values.js').ThemeConfig} ThemeConfig */

export {
    THEME_EVENT,
    BEFORE_THEME_EVENT,
    UNKNOWN_THEME_EVENT,
    PENDING_THEME_ATTRIBUTE,
    PREVIEW_THEME_ATTRIBUTE,
    configureTheme,
    isTheme,
} from './theme-core/values.js';
export { currentTheme, pendingTheme } from './theme-core/read.js';
export { applyTheme, initializeTheme } from './theme-core/apply.js';
export { previewTheme, endPreview, previewedTheme } from './theme-core/preview.js';
export { storeTheme, storedTheme } from './theme-core/store.js';
export { onThemeChange } from './theme-core/subscribe.js';

export { THEMES, DEFAULT_THEME, STORAGE_KEY };
