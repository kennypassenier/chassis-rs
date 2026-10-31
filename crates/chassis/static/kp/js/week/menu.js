// The overflow menu of a day, tab stops and the focus on a pill.
import { WEEK_OPEN_EVENT } from './constants.js';
import { dayName, dm, keyOf, make } from './helpers.js';
/** @typedef {import('./types.js').WeekDay} WeekDay */
/** @typedef {import('./types.js').WeekItem} WeekItem */
/** @typedef {import('./types.js').WeekModel} WeekModel */

let menuModule = /** @type {Promise<typeof import('../menu-button.js')> | null} */ (null);

/** The `+N` of one column: a menu button listing what did not fit. @param {WeekModel} c @param {WeekDay} col @param {number} [top] */
export function foldMenu(c, col, top = 0) {
    const doc = c.el.ownerDocument;
    const n = col.hidden.length;
    if (!n) {
        col.more?.setAttribute('hidden', '');
        return;
    }
    if (!col.more) {
        const wrapper = make(doc, 'div', 'kp-menu-button kp-week__more');
        wrapper.setAttribute('data-kp-menu-button', '');
        const button = make(doc, 'button', 'kp-week__pill kp-week__pill--more');
        button.type = 'button';
        const menu = make(doc, 'div', 'kp-menu kp-menu--rich');
        menu.setAttribute('role', 'menu');
        wrapper.append(button, menu);
        col.track.append(wrapper);
        col.more = wrapper;
        col.moreButton = button;
        c.decorate?.(button, { kind: 'more', host: c.el, key: keyOf(c.el), id: col.iso });
        menuModule ??= import('../menu-button.js');
        void menuModule.then((m) => {
            m.attachMenuButtons(wrapper);
            fillMenu(c, col);
        });
        wrapper.addEventListener('kp-menu-select', (event) => {
            const id = /** @type {CustomEvent} */ (event).detail?.value;
            const item = col.hidden.find((i) => i.event.id === id) ?? col.items.find((i) => i.event.id === id);
            if (item) open(c, item, 'keyboard');
        });
    }
    col.more.removeAttribute('hidden');
    col.more.style.setProperty('--kp-week-top', `${top}px`);
    const text = c.strings.weekMore(n);
    if (col.moreButton && col.moreButton.textContent !== text) col.moreButton.textContent = text;
    col.moreButton?.setAttribute('aria-label', c.strings.weekMoreLabel(n, `${dayName(c, col.iso)} ${dm(col.iso, true)}`));
    void menuModule?.then(() => fillMenu(c, col));
}

/** @param {WeekModel} c @param {WeekDay} col */
function fillMenu(c, col) {
    if (!col.more) return;
    void menuModule?.then((m) => {
        if (!col.more?.isConnected) return;
        m.setMenu(col.more, [
            {
                group: '',
                items: col.hidden.map((i) => ({
                    label: `${i.hhmm} ${i.event.label}`,
                    value: i.event.id,
                    ...(i.event.detail ? { hint: i.event.detail } : {}),
                    ...(i.event.state === 'reference' ? { disabled: c.strings.weekReference } : {}),
                })),
            },
        ]);
    });
}

/** The pills a person can reach, per column, in time order. @param {WeekModel} c @param {WeekDay} col */
export function reachable(c, col) {
    const list = col.items.filter((i) => i.button.tagName === 'BUTTON' && !(c.mode === 'grid' && i.button.hasAttribute('data-kp-overflow')));
    return /** @type {HTMLElement[]} */ (list.map((i) => i.button)).concat(
        col.hidden.length && col.moreButton && c.mode === 'grid' ? [col.moreButton] : [],
    );
}

/** One tab stop: the active pill. @param {WeekModel} c */
export function syncTabStops(c) {
    const all = /** @type {HTMLElement[]} */ (
        c.cols.flatMap((col) => [...col.items.map((i) => i.button), ...(col.moreButton ? [col.moreButton] : [])])
    );
    if (c.upcoming.on) {
        // The upcoming list [kpadopt3]: the tab stop is the active pill when it is listed, else the first listed.
        const listed = c.upcoming.items.map((i) => i.button).filter((b) => b.tagName === 'BUTTON');
        const stop = listed.find((b) => b.dataset.kpId === c.active) ?? listed[0];
        for (const el of all) el.tabIndex = el === stop ? 0 : -1;
        return;
    }
    let target = c.active ? c.pills.get(c.active) : undefined;
    if (!target || !all.includes(target) || (c.mode === 'grid' && target.hasAttribute('data-kp-overflow'))) {
        target = /** @type {HTMLButtonElement | undefined} */ (c.cols.flatMap((col) => reachable(c, col))[0]);
    }
    for (const el of all) el.tabIndex = el === target ? 0 : -1;
}

/** @param {WeekModel} c @param {WeekItem} item @param {'pointer' | 'keyboard'} source */
export function open(c, item, source) {
    c.el.dispatchEvent(new CustomEvent(WEEK_OPEN_EVENT, { bubbles: true, detail: { id: item.event.id, event: item.event, source } }));
}

/** Move the roving focus. @param {WeekModel} c @param {HTMLElement} to */
export function focusPill(c, to) {
    c.active = to.dataset.kpId ?? c.active;
    syncTabStops(c);
    if (to.tabIndex !== 0) to.tabIndex = 0;
    to.focus();
}
