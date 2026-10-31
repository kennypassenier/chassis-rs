// The framework-free theme picker [T1, TH8, TH63].
//
// No custom element and no rendering: the consumer's server writes the
// markup, this attaches the behaviour. kyu and almanac render HTML from a
// Rust binary and have no npm step, so a component that only exists after
// JavaScript runs would leave them with an empty box on first paint.
//
// The markup it expects:
//
//   <div data-kp-theme-picker>
//     <button type="button" data-kp-theme="formal">
//       <span class="kp-swatch" data-theme="formal"></span> Formal
//     </button>
//     ...
//   </div>
//   <p data-kp-theme-status hidden></p>
//
// Or the same thing inside a menu — an icon button with a dropdown, the
// shape the consuming projects preferred. `themeMenuMarkup()` below
// writes it for you; the behaviour is identical, because the attribute
// is what this module attaches to, not the layout.
//
// Every attribute above is a contract value [TH26]. The swatch previews a
// theme without activating it by wearing that theme's own token block —
// `data-theme` on any element, not only on <html> — so it reads the live
// colours instead of a copy kept in step by hand [AR11].
//
// A preview [anchors-picker-1019; audhd-recepten 14]. `data-kp-theme-preview="hover"` on the picker (or `preview: true` to
// attachThemePickers) shows a theme while the pointer rests on its button or the keyboard is on it, and goes back when it
// leaves, without choosing it: nothing is announced or stored (js/theme-core.js `previewTheme`). A press chooses it, as ever.
// `data-kp-theme-preview-target` names the element that wears the preview (a selector; default the page's root, the element that
// wears the theme), so a settings page can show a sample instead of the whole page. A touch screen has no hover: a tap chooses.
// Fires `kp-theme-preview` on the picker, bubbling: `{ theme }`, and `{ theme: null }` when it ends.
//
// Pure since 3.0.0 [KT6]: importing this file attaches nothing. Call
// attachThemePickers() when the markup is in the DOM, or load js/auto.js.
//
// Each picker is one ThemePicker (js/theme-picker/controller.js over js/theme-picker/preview.js, on js/controller.js); the parts, and the
// markup writers, are listed in js/README.md.

import { attachOne, controllerOf, hostsOf } from './controller.js';
import { currentTheme, onThemeChange, THEMES } from './theme-core.js';
import { markSelection } from './theme-picker/marks.js';
import { ThemePicker } from './theme-picker/controller.js';
import { PICKER } from './theme-picker/values.js';

export { PICK_EVENT, PREVIEW_EVENT, PREVIEW_LEAVE_MS } from './theme-picker/values.js';
export { THEME_MENU_ICON, themeMenuMarkup, themeOptionsMarkup } from './theme-picker/markup.js';

/**
 * Attach the behaviour to every picker under `root`, and keep them all in
 * step with each other and with any React picker on the same page — they
 * share one bus, so neither channel needs to know the other exists [AR5].
 *
 * Safe to call twice: a picker already attached is skipped. The returned
 * detach restores the marks it made; `refresh()` re-marks options added
 * after attach, which the idempotency guard would otherwise skip.
 *
 * @param {ParentNode} [root]
 * @param {{ persist?: boolean, closePopover?: boolean, status?: ParentNode | null, preview?: boolean }} [options]
 *   persist: store the choice (default true); closePopover: close an
 *   enclosing popover after a choice (default true); status: where the
 *   save-failed message lives (default: the picker's parent); preview:
 *   show a theme on hover and keyboard focus (default: the picker's
 *   `data-kp-theme-preview="hover"`, else off).
 * @returns {(() => void) & { refresh: () => void }} detach
 */
export function attachThemePickers(root = document, { persist = true, closePopover = true, status = null, preview = undefined } = {}) {
    const pickers = hostsOf(root, PICKER).filter((el) => !(el.dataset.kpThemeAttached === '1') && !controllerOf(el, ThemePicker));
    const made = pickers.map((el) => attachOne(el, ThemePicker, { persist, closePopover, status, preview })).filter((picker) => picker !== undefined);
    // One subscription for the whole call, not one per picker: a change
    // announced on the bus updates every mark, including marks belonging
    // to a React picker's neighbour.
    const stop = onThemeChange((theme) => {
        for (const el of (root === document ? document : root).querySelectorAll(PICKER)) markSelection(el, theme);
    });
    const detach = () => {
        for (const picker of made) picker.destroy();
        stop();
    };
    return Object.assign(detach, {
        refresh: () => {
            for (const picker of pickers) markSelection(picker, currentTheme());
        },
    });
}

/**
 * The list a consumer's template needs to render the options. Exported so
 * a page built without a server-side theme list can still write the
 * markup, and so the showcase does not hand-type seven names.
 */
export { THEMES };
