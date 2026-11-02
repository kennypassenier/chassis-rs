// Where the calendar's navigation folds, measured with the words it carries [kitchen-1101 nav-fit].
// The registers' --kp-calendar-nav-fit holds the widest month in English; a page in Dutch ("september 2026",
// "Vorige", "Vandaag") needs more, and its nav ran 24 px past a 390 px phone. The fold point is the larger of the two.
// Previous and Next also take one width, so the nav's buttons of one role match.

/** @typedef {import('./controller.js').CalendarController} Calendar */

/** The last words measured, per calendar, so a repaint of the same month measures nothing. @type {WeakMap<HTMLElement, string>} */
const MEASURED = new WeakMap();

/**
 * Measure the one-row width of the nav with its widest month title and publish it as --kp-calendar-nav-measured.
 * @param {Calendar} c
 */
export function measureNavFit(c) {
    const nav = c.title.parentElement;
    if (!nav || !nav.isConnected) return;
    const titles = c.months.map((month) => c.strings.monthTitle(month, c.year));
    const buttons = [...nav.children].filter((child) => child !== c.title);
    const key = [...titles, ...buttons.map((b) => b.textContent)].join('\n');
    if (MEASURED.get(c.el) === key) return;
    const widest = widestTitle(c.title, nav, titles);
    if (widest === 0) return; // not laid out yet (a closed panel): measured on the next paint
    MEASURED.set(c.el, key);
    equalSteps(c.el, buttons);
    const rest = buttons.reduce((sum, b) => sum + b.getBoundingClientRect().width, 0);
    const gap = Number.parseFloat(getComputedStyle(nav).columnGap) || 0;
    c.el.style.setProperty('--kp-calendar-nav-measured', `${Math.ceil(widest + rest + gap * buttons.length + 1)}px`);
}

/**
 * Previous and Next are one role, so one width: the wider of their own [almanac-1101 nav-widths].
 * @param {HTMLElement} el @param {readonly Element[]} buttons
 */
function equalSteps(el, buttons) {
    el.style.removeProperty('--kp-calendar-step-min');
    const steps = buttons.filter((b) => b.matches('[data-kp-calendar-prev], [data-kp-calendar-next]'));
    const widest = Math.max(0, ...steps.map((b) => b.getBoundingClientRect().width));
    if (widest > 0) el.style.setProperty('--kp-calendar-step-min', `${Math.ceil(widest)}px`);
}

/**
 * The widest of the titles at the title's full size, set in a hidden copy of the title.
 * @param {HTMLElement} title @param {HTMLElement} nav @param {readonly string[]} titles
 */
function widestTitle(title, nav, titles) {
    const probe = /** @type {HTMLElement} */ (title.cloneNode(false));
    probe.removeAttribute('id');
    probe.removeAttribute('aria-live');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;visibility:hidden;inline-size:max-content;font-size:var(--kp-calendar-title-size, 1.125rem)';
    nav.append(probe);
    let widest = 0;
    for (const text of titles) {
        probe.textContent = text;
        widest = Math.max(widest, probe.getBoundingClientRect().width);
    }
    probe.remove();
    return widest;
}
