// One date navigation [ux-1101]: the label of the range it shows, then Previous, Today and Next on three equal tracks, and the
// keys PageUp, PageDown and Home anywhere inside it. Its mode, its day and its target are read again when they change.

import { Controller } from '../controller.js';
import { CHART_TIME_ZONE } from '../chart.js';
import { dayKey } from '../calendar/dates.js';
import { watchOptions } from '../live-options.js';
import { calendarNames, resolveLocale, weekStartsOn } from '../locale.js';
import { DEFAULT_STRINGS, getStrings } from '../strings.js';
import { AT_ATTRIBUTE, CURRENT_ATTRIBUTE, DATE_NAV_EVENT, FOR_ATTRIBUTE, SAY_DELAY_MS, TODAY_ATTRIBUTE } from './constants.js';
import { driveTarget } from './link.js';
import { holds, isDay, labelOf, modeOf, rangeOf, stepFrom } from './range.js';
/** @typedef {import('./constants.js').DateNavRange} DateNavRange */

/** The keys that move the range, and which way. @type {Record<string, 'prev' | 'next' | 'today'>} */
const KEYS = { PageUp: 'prev', PageDown: 'next', Home: 'today' };

/** Make an element with a class and, when given, its words. @param {Document} doc @param {string} tag @param {string} className @param {string} [text] */
function make(doc, tag, className, text) {
    const el = doc.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

export class DateNavControl extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        const doc = host.ownerDocument;
        this.label = make(doc, 'p', 'kp-date-nav__label');
        this.steps = make(doc, 'div', 'kp-date-nav__steps');
        this.prev = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-button--sm kp-date-nav__prev'));
        this.today = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-button--sm kp-date-nav__today'));
        this.next = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-button--sm kp-date-nav__next'));
        this.status = make(doc, 'span', 'kp-sr-only kp-date-nav__status');
        /** The day the shown range holds. */
        this.at = '';
    }

    connect() {
        const { host, label, steps, prev, today, next, status } = this;
        if (!host.id) host.id = `kp-date-nav-${Math.random().toString(36).slice(2, 9)}`;
        if (!host.hasAttribute('role') && host.localName !== 'nav') host.setAttribute('role', 'group');
        if (!host.hasAttribute('aria-label') && !host.hasAttribute('aria-labelledby')) host.setAttribute('aria-label', getStrings().dateNavGroup);
        label.id = `${host.id}-label`;
        status.setAttribute('role', 'status');
        for (const [button, by] of /** @type {const} */ ([[prev, 'prev'], [today, 'today'], [next, 'next']])) {
            button.type = 'button';
            button.setAttribute('aria-keyshortcuts', by === 'prev' ? 'PageUp' : by === 'next' ? 'PageDown' : 'Home');
            this.listen(button, 'click', () => this.move(by));
        }
        steps.append(prev, today, next);
        host.replaceChildren(label, steps, status);
        this.listen(host, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.at = this.dayFromMarkup();
        this.own(watchOptions(host, ['data-kp-date-nav', AT_ATTRIBUTE, FOR_ATTRIBUTE, TODAY_ATTRIBUTE], () => this.reread()));
        this.paint();
        driveTarget(host, this.range(), false);
    }

    /** Today, as the page's clock (or `data-kp-date-nav-today`) says. */
    todayDay() {
        const own = this.host.getAttribute(TODAY_ATTRIBUTE);
        return isDay(own) ? /** @type {string} */ (own) : dayKey(Date.now(), this.host.dataset.kpTimeZone ?? CHART_TIME_ZONE);
    }

    /** The day the markup asks for, else today. */
    dayFromMarkup() {
        const own = this.host.getAttribute(AT_ATTRIBUTE);
        return isDay(own) ? /** @type {string} */ (own) : this.todayDay();
    }

    /** The range shown now. @returns {DateNavRange} */
    range() {
        const locale = resolveLocale(this.host.dataset.kpLocale, this.host);
        const own = this.host.dataset.kpWeekStartsOn;
        return rangeOf(modeOf(this.host.getAttribute('data-kp-date-nav')), this.at, weekStartsOn(locale, own === undefined ? undefined : Number(own)));
    }

    /** An attribute changed: the day the markup names (when it names one), the mode and the target are taken as they are now. */
    reread() {
        const own = this.host.getAttribute(AT_ATTRIBUTE);
        if (isDay(own) && own !== this.at) this.at = /** @type {string} */ (own);
        this.paint();
        driveTarget(this.host, this.range(), false);
    }

    /** The label, the buttons' words and names for the mode, and the current mark. */
    paint() {
        const s = getStrings();
        const range = this.range();
        const unit = s.dateNavUnits[range.mode];
        const locale = resolveLocale(this.host.dataset.kpLocale, this.host);
        const text = labelOf(range, calendarNames(s, DEFAULT_STRINGS, locale), s.dateNavWeekLabel);
        const current = holds(range, this.todayDay());
        this.label.replaceChildren(text);
        if (current) this.label.append(' ', make(this.host.ownerDocument, 'span', 'kp-date-nav__current', s.dateNavCurrent));
        this.host.toggleAttribute(CURRENT_ATTRIBUTE, current);
        this.prev.textContent = s.dateNavPrev;
        this.next.textContent = s.dateNavNext;
        this.today.textContent = s.dateNavToday;
        this.prev.setAttribute('aria-label', s.dateNavPrevTitle(unit));
        this.next.setAttribute('aria-label', s.dateNavNextTitle(unit));
        this.prev.title = s.dateNavPrevTitle(unit);
        this.next.title = s.dateNavNextTitle(unit);
        this.today.title = s.dateNavTodayTitle(unit);
        return text;
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const by = KEYS[event.key];
        if (!by || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        this.move(by);
    }

    /** A person moved the range: paint, drive the target, say it and fire the event. @param {'prev' | 'next' | 'today'} by */
    move(by) {
        const mode = this.range().mode;
        this.at = by === 'today' ? this.todayDay() : stepFrom(mode, this.at, by === 'prev' ? -1 : 1);
        const text = this.paint();
        const range = this.range();
        driveTarget(this.host, range, true);
        this.say(getStrings().dateNavShown(text));
        this.host.dispatchEvent(new CustomEvent(DATE_NAV_EVENT, { bubbles: true, detail: { ...range, by } }));
    }

    /** Write a sentence to the status region, cleared first so the same sentence twice is still heard. @param {string} text */
    say(text) {
        const { status } = this;
        status.textContent = '';
        setTimeout(() => (status.textContent = text), SAY_DELAY_MS);
    }

    /** Show a day without an event (the page asked). @param {string} day */
    show(day) {
        if (!isDay(day)) throw new RangeError(`kp-date-nav: "${day}" is not a day (YYYY-MM-DD)`);
        this.at = day;
        this.paint();
        driveTarget(this.host, this.range(), false);
    }
}
