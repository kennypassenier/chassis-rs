// One list whose rows swipe [parts-1102]: delegated pointer listeners on the list, the actions read from its attributes each time
// a swipe starts (so a page can change them), touch only unless `data-kp-swipe-pointers="any"`. A row is a direct child of the
// list; the parts it holds that keep their own press (a check box, a handle, a menu button) never start a swipe.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { END_ATTRIBUTE, OWN_CONTROLS, POINTERS_ATTRIBUTE, ROW_OFF_ATTRIBUTE, START_ATTRIBUTE, SWIPE_EVENT, TONES } from './constants.js';
import { begin, finish, moveTo } from './gesture.js';
import { say } from '../live-say.js';

/** @typedef {import('./constants.js').SwipeAction} SwipeAction */

/** `key:Words:tone` → an action, or null. @param {string | null} text @returns {SwipeAction | null} */
export function parseAction(text) {
    const [key = '', label = '', tone = ''] = (text ?? '').split(':').map((part) => part.trim());
    if (!key) return null;
    return { key, label: label || key, tone: TONES.includes(tone) ? tone : 'primary' };
}

/** Let the slide home animate the offset itself, so the plate narrows with the row's parts. Once per window; harmless twice. */
function registerOffset() {
    try {
        globalThis.CSS?.registerProperty?.({ name: '--kp-swipe-x', syntax: '<length>', inherits: true, initialValue: '0px' });
    } catch {
        // Already registered by an earlier list: nothing to do.
    }
}

/** The key a row reports: its own, its row key, its reorder item, or its id. @param {HTMLElement} row */
const keyOf = (row) => row.dataset.kpSwipeKey ?? row.dataset.kpRowKey ?? row.dataset.kpItem ?? row.id;

/** What a row is called in words. @param {HTMLElement} row */
const nameOf = (row) => row.dataset.kpLabel ?? row.getAttribute('aria-label') ?? row.textContent?.trim().slice(0, 80) ?? '';

export class SwipeControl extends Controller {
    connect() {
        const list = this.host;
        registerOffset();
        /** @type {import('./gesture.js').Gesture | null} */
        let g = null;
        this.listen(list, 'pointerdown', (e) => {
            // A second finger is not a press of its own: it must not replace (and so lose) the live gesture.
            if (!(/** @type {PointerEvent} */ (e).isPrimary)) return;
            g = this.start(/** @type {PointerEvent} */ (e));
        });
        this.listen(list, 'pointermove', (e) => {
            const move = /** @type {PointerEvent} */ (e);
            if (g && move.pointerId === g.pointer && !moveTo(g, move, (side) => this.actionOf(side))) g = null;
        }, { passive: false });
        const up = (/** @type {Event} */ e) => {
            const lift = /** @type {PointerEvent} */ (e);
            if (!g || lift.pointerId !== g.pointer) return;
            const done = g;
            g = null;
            const action = finish(done, lift.type === 'pointerup');
            if (action) this.fire(done.row, action);
        };
        this.listen(list, 'pointerup', up);
        this.listen(list, 'pointercancel', up);
    }

    /** A press that may become a swipe, or null. @param {PointerEvent} e */
    start(e) {
        const list = this.host;
        if (list.getAttribute('data-kp-swipe') === 'off' || !e.isPrimary || e.button > 0) return null;
        if (e.pointerType !== 'touch' && list.getAttribute(POINTERS_ATTRIBUTE) !== 'any') return null;
        const target = e.target instanceof Element ? e.target : null;
        const row = /** @type {HTMLElement | null} */ (target ? [...list.children].find((child) => child.contains(target)) ?? null : null);
        if (!row || row.hasAttribute(ROW_OFF_ATTRIBUTE) || row.hasAttribute('data-kp-settled') || target?.closest(OWN_CONTROLS)) return null;
        return begin(e, row);
    }

    /** The action of a side, as the list says now. @param {'start' | 'end'} side */
    actionOf(side) {
        return parseAction(this.host.getAttribute(side === 'start' ? START_ATTRIBUTE : END_ATTRIBUTE));
    }

    /** @param {HTMLElement} row @param {SwipeAction} action */
    fire(row, action) {
        const live = /** @type {HTMLElement} */ (this.host.ownerDocument.querySelector('[data-kp-swipe-status]') ?? this.makeLive());
        say(live, getStrings().swipeSaid(nameOf(row), action.label));
        row.dispatchEvent(new CustomEvent(SWIPE_EVENT, { bubbles: true, detail: { key: keyOf(row), action: action.key, row } }));
    }

    /** The one polite line the swipes are said in. */
    makeLive() {
        const live = this.host.ownerDocument.createElement('span');
        live.className = 'kp-sr-only';
        live.setAttribute('role', 'status');
        live.dataset.kpSwipeStatus = '';
        this.host.after(live);
        this.own(() => live.remove());
        return live;
    }
}
