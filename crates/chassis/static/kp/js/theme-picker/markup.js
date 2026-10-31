// The picker as markup: the options grouped light and dark, and the icon button with its dropdown [TH63, S2].

import { THEMES } from '../theme-core.js';
import { getStrings } from '../strings.js';

/** @param {string} text */
function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}

/** The icon the menu button wears by default; pass your own SVG string to `icon`. */
export const THEME_MENU_ICON =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>` +
    `<circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>` +
    `<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16c3.3 0 6-2.7 6-6 0-4.9-4.5-8.6-10-8.6z"/>` +
    `</svg>`;

/**
 * The options of a picker, as markup — grouped light and dark [TH63].
 *
 * Each group is a `<li role="presentation">` carrying a small heading
 * and its own list, so the menu reads "Light: Formal, Light, … — Dark:
 * Dark, Cyberpunk, …" rather than eleven names in one run. The grouping
 * comes from the registry's `dark` flag, which is generated from the
 * tokens, so this cannot disagree with the stylesheet about which is
 * which. Pass `grouped: false` for one flat list.
 *
 * @param {{ themes?: readonly import('../theme-registry.js').ThemeRecord[], labels?: Partial<Record<string, string>>, grouped?: boolean, groupLabels?: { light?: string, dark?: string } }} [options]
 * @returns {string}
 */
export function themeOptionsMarkup({ themes = THEMES, labels = {}, grouped = true, groupLabels = {} } = {}) {
    const s = getStrings();
    /** @param {import('../theme-registry.js').ThemeRecord} t */
    const option = (t) =>
        `<li><button type="button" data-kp-theme="${escapeHtml(t.name)}">` +
        `<span class="kp-swatch" data-theme="${escapeHtml(t.name)}"></span>${escapeHtml(labels[t.name] ?? t.label)}</button></li>`;
    if (!grouped) return themes.map(option).join('');
    const light = themes.filter((t) => !t.dark);
    const dark = themes.filter((t) => t.dark);
    /** @param {string} heading @param {typeof themes} list @param {'light' | 'dark'} kind */
    const group = (heading, list, kind) =>
        list.length === 0
            ? ''
            : `<li role="presentation" class="kp-theme-group" data-kp-theme-group="${kind}">` +
              `<span class="kp-theme-group__label" aria-hidden="true">${escapeHtml(heading)}</span>` +
              `<ul class="kp-theme-group__list" aria-label="${escapeHtml(heading)}">${list.map(option).join('')}</ul></li>`;
    return group(groupLabels.light ?? s.themeGroupLight, light, 'light') + group(groupLabels.dark ?? s.themeGroupDark, dark, 'dark');
}

/**
 * The icon button with a dropdown, as markup [S2].
 *
 * Returned as a string rather than rendered, so a server can print it
 * into a template and a page can insert it — the same choice T1 makes
 * everywhere else in this channel. The id must be unique on the page;
 * pass one when there are two menus. Everything a person reads is
 * escaped; the icon is trusted markup you pass.
 *
 * @param {{ id?: string, label?: string, icon?: string, themes?: readonly import('../theme-registry.js').ThemeRecord[], labels?: Partial<Record<string, string>>, grouped?: boolean, groupLabels?: { light?: string, dark?: string }, className?: string }} [options]
 * @returns {string}
 */
export function themeMenuMarkup({
    id = 'kp-theme-menu',
    label = getStrings().themePicker,
    icon = THEME_MENU_ICON,
    themes,
    labels,
    grouped,
    groupLabels,
    className = '',
} = {}) {
    const safeId = escapeHtml(id);
    const safeLabel = escapeHtml(label);
    const classes = `kp-theme-menu ${escapeHtml(className)}`.trim();
    return (
        `<span class="${classes}">` +
        `<button type="button" class="kp-icon-button" popovertarget="${safeId}" aria-label="${safeLabel}" style="anchor-name: --${safeId}">` +
        icon +
        `</button>` +
        `<div popover="auto" id="${safeId}" class="kp-popover" style="position-anchor: --${safeId}">` +
        `<ul class="kp-menu" data-kp-theme-picker aria-label="${safeLabel}">${themeOptionsMarkup({ themes, labels, grouped, groupLabels })}</ul>` +
        `</div></span>`
    );
}
