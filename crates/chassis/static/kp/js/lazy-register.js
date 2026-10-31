// The register of the active theme, fetched when it is needed [scope-50].
//
// A page that links every register pays for twenty-one it does not wear:
// measured on examples/index.html (research/loading/README.md), 1,320,113
// bytes of CSS on first load against 371,900 for the shared stylesheets
// plus one register. This module is the other route, and it is opt-in: a
// page that links all the registers, or the bundle, never imports it and
// behaves exactly as before.
//
// The shared stylesheets (fonts, themes.css, components.css, layout.css,
// utilities.css) are linked as always. The register — the one file that
// differs per theme — is a <link> this module inserts for the theme the
// root wears, and again when the theme changes. It is kept once fetched:
// every rule in a register is scoped to [data-theme='name'], so a register
// whose theme is not worn is inert, and switching back costs nothing.
//
// Every register is wrapped in `@layer kp.register { … }` by its author,
// and the layer ORDER is fixed by the first statement of css/themes.css,
// so a register that arrives later lands in the layer that statement gave
// it: layout and utilities keep beating it, components keep losing to it.
//
// Two contracts come with it, both in README.md under "Per theme":
//
//   1. The first register is not this module's to insert. By the time a
//      module runs the page has painted, so the no-flash snippet writes
//      the first link — `noFlashSnippet({ register: true })` from
//      js/no-flash.js, inlined BELOW the themes.css link. This module
//      finds that link and adopts it.
//   2. A change is HELD until its register has loaded. Tokens without
//      their register are a theme that is not that theme, so the root
//      keeps the previous theme meanwhile: `applyTheme()` returns the
//      previous name, `pendingTheme()` from js/theme-core.js names the one
//      on its way, and the change lands — with its `kp-theme-change` —
//      the moment the file has. A later choice supersedes a held one.
//
// Pure, like every module but js/auto.js: importing it does nothing.

// The module is a facade [closure-pattern B, Kenny 2026-10-30]: the names, the links, the load of one register
// (RegisterLoad) and the LazyRegisters controller that follows the theme live in js/lazy-register/, listed in js/README.md.

import { followRegisters } from './lazy-register/controller.js';

export { REGISTER_ATTRIBUTE, REGISTER_PATTERN, REGISTER_LOAD_EVENT, REGISTER_ERROR_EVENT } from './lazy-register/values.js';
export { registerHref, registerLink, registersPresent, registerLoaded } from './lazy-register/links.js';
export { ensureRegister } from './lazy-register/ensure.js';

/**
 * @typedef {object} LazyRegisterOptions
 * @property {string} [pattern] where a register is served from, with `{theme}` in it (default REGISTER_PATTERN)
 * @property {Document} [doc] the document to insert into (default: the current one)
 */

/**
 * Keep the document's registers in step with its theme.
 *
 * @param {{ pattern?: string, hold?: boolean, prune?: boolean, root?: Element }} [options]
 *   pattern: where a register is served from, with `{theme}` in it (default REGISTER_PATTERN) —
 *     the same value the no-flash snippet was given;
 *   hold: keep a change back until its register has loaded (default true). Off, the root flips at
 *     once and wears the new tokens without their register until the file lands;
 *   prune: remove the previous theme's register after a change (default false: kept, so that
 *     switching back fetches nothing);
 *   root: the element that wears the theme (default: theme-core's root).
 * @returns {() => void} detach: stop following theme changes and drop a held change; links already inserted stay
 */
export function attachLazyRegisters(options = {}) {
    if (typeof document === 'undefined') return () => {};
    return followRegisters(options);
}
