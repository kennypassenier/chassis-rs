// Calm mode: one page-level switch that turns movement and effects off [kpadopt5].
//
// Kenny, 2026-10-17: "Beweging en effecten, laden blijft zacht bewegen". A root flag, `html[data-kp-calm]`, plus
// one switch that sets and shows it. It extends the reduced-motion paths the package already has instead of adding a
// second system: CSS cannot force a media query, so the stylesheet answers the flag with its own rules (the last block
// of css/components.css), and every script that used to ask `matchMedia('(prefers-reduced-motion: reduce)')` asks
// `motionAllowed(el)` instead, which reads that media query and this flag together.
//
//   <label class="kp-switch">
//       <input class="kp-switch__input" type="checkbox" role="switch" data-kp-calm-switch />
//       <span>Calm mode</span>
//   </label>
//
//   html[data-kp-calm]                  on: the page is calm
//   html[data-kp-calm-scope]            `motion` (transitions only), `effects` (the default: transitions, entrances, glow,
//                                       flicker, glitch), `all` (the same, and loading holds still)
//   html[data-kp-calm-loading]          `slow` (the default: a loading part breathes as one slow pulse) or `still`
//
// The choice is kept per device under `kp-remember:calm:calm:value`, read before the first frame by
// `applyStoredCalm()` (js/auto.js calls it with the stored theme). A system that asks for less motion wins: the switch
// shows on, disabled, with the reason. Every change is announced once, politely. Nothing runs on import.

import { getStrings } from './strings.js';
import { Controller, attachOne, controllerOf } from './controller.js';

/** The root attribute that makes a page calm. */
export const CALM_ATTRIBUTE = 'data-kp-calm';
/** What one press turns off. */
export const CALM_SCOPES = /** @type {const} */ (['motion', 'effects', 'all']);
/** The switch. */
export const CALM_SWITCH = '[data-kp-calm-switch]';
/** Fired on the root, bubbling, when calm changes: `{ calm, scope, loading }`. */
export const CALM_EVENT = 'kp-calm-change';

const STORE_KEY = 'kp-remember:calm:calm:value';
const QUERY = '(prefers-reduced-motion: reduce)';

/** @typedef {'motion' | 'effects' | 'all'} CalmScope */

/** @param {Document | Element | null | undefined} where @returns {Document} */
const docOf = (where) => (where ? (where.ownerDocument ?? /** @type {Document} */ (where)) : document);

/** Whether the system itself asks for less motion. @param {Document} [doc] */
export function systemReduced(doc = document) {
    return doc.defaultView?.matchMedia?.(QUERY).matches ?? false;
}

/** Whether the page is calm by its own flag (not the system's). @param {Document | Element} [where] */
export function isCalm(where) {
    return docOf(where).documentElement.hasAttribute(CALM_ATTRIBUTE);
}

/** @param {Document | Element} [where] @returns {CalmScope} */
export function calmScope(where) {
    const value = docOf(where).documentElement.getAttribute('data-kp-calm-scope');
    return CALM_SCOPES.includes(/** @type {any} */ (value)) ? /** @type {CalmScope} */ (value) : 'effects';
}

/**
 * May this element move? False when the system asks for less motion or the page is calm. Every script that draws
 * movement asks this instead of the media query, so the two switches are one.
 *
 * @param {Element | Document} [where]
 * @returns {boolean}
 */
export function motionAllowed(where) {
    const doc = docOf(where);
    return !systemReduced(doc) && !isCalm(doc);
}

/** @param {Document} doc @param {string} text */
function say(doc, text) {
    let region = /** @type {HTMLElement | null} */ (doc.querySelector('[data-kp-calm-status]'));
    if (!region) {
        region = doc.createElement('span');
        region.className = 'kp-sr-only';
        region.setAttribute('role', 'status');
        region.setAttribute('data-kp-calm-status', '');
        doc.body.append(region);
    }
    region.textContent = '';
    // A change of text in a live region is what is announced; the empty write first makes a repeat count.
    window.setTimeout(() => {
        if (region) region.textContent = text;
    }, 30);
}

/**
 * @typedef {object} CalmOptions
 * @property {Document} [doc]
 * @property {CalmScope} [scope] what one press turns off (default: the page's, else `effects`)
 * @property {'slow' | 'still'} [loading] how a loading part behaves (default: the page's, else `slow`; `all` implies `still`)
 * @property {boolean} [remember] keep the choice on this device (default true)
 * @property {boolean} [announce] say it once, politely (default true)
 */

/**
 * Turn calm mode on or off.
 *
 * @param {boolean} on
 * @param {CalmOptions} [options]
 */
export function setCalm(on, { doc = document, scope, loading, remember = true, announce = true } = {}) {
    const root = doc.documentElement;
    const was = root.hasAttribute(CALM_ATTRIBUTE);
    if (scope !== undefined) root.setAttribute('data-kp-calm-scope', scope);
    if (loading !== undefined) root.setAttribute('data-kp-calm-loading', loading);
    if (on) root.setAttribute(CALM_ATTRIBUTE, '');
    else root.removeAttribute(CALM_ATTRIBUTE);
    if (remember) {
        try {
            if (on) localStorage.setItem(STORE_KEY, '1');
            else localStorage.removeItem(STORE_KEY);
        } catch {
            // Storage refused: the choice lasts for this page only.
        }
    }
    syncSwitches(doc);
    if (was === on && scope === undefined && loading === undefined) return;
    if (announce && was !== on) say(doc, on ? getStrings().calmOn : getStrings().calmOff);
    root.dispatchEvent(
        new CustomEvent(CALM_EVENT, {
            bubbles: true,
            detail: { calm: on, scope: calmScope(doc), loading: root.getAttribute('data-kp-calm-loading') ?? 'slow' },
        }),
    );
}

/**
 * Put the stored choice back onto the root, before the first frame (js/auto.js calls it with the stored theme).
 * @param {Document} [doc]
 */
export function applyStoredCalm(doc = document) {
    try {
        if (localStorage.getItem(STORE_KEY) === '1') doc.documentElement.setAttribute(CALM_ATTRIBUTE, '');
    } catch {
        // No storage: the page's own markup decides.
    }
}

/** @param {Document} doc */
function syncSwitches(doc) {
    const system = systemReduced(doc);
    const calm = isCalm(doc);
    for (const el of doc.querySelectorAll(CALM_SWITCH)) {
        if (!(el instanceof HTMLInputElement)) continue;
        el.checked = calm || system;
        el.disabled = system;
        if (system) el.setAttribute('data-kp-disabled-reason', getStrings().calmSystem);
        else if (el.getAttribute('data-kp-disabled-reason') === getStrings().calmSystem) el.removeAttribute('data-kp-disabled-reason');
    }
}

/** One calm switch: it sets the flag when it changes, with the scope and loading behaviour its attach call was given. */
class CalmSwitch extends Controller {
    connect() {
        const el = /** @type {HTMLInputElement} */ (this.host);
        el.dataset.kpCalmAttached = '';
        this.own(() => {
            delete el.dataset.kpCalmAttached;
        });
        this.listen(el, 'change', () => this.onChange(el));
    }

    /** @param {HTMLInputElement} el */
    onChange(el) {
        const options = /** @type {CalmOptions} */ (this.options);
        setCalm(el.checked, { ...options, remember: options.remember !== false && el.getAttribute('data-kp-calm-remember') !== 'false' });
    }
}

/** The system's own say: while it asks for less motion the switches show on and disabled, and follow it when it changes. */
class CalmSystem extends Controller {
    connect() {
        const doc = this.host.ownerDocument;
        const query = doc.defaultView?.matchMedia?.(QUERY);
        if (query) this.listen(query, 'change', () => syncSwitches(doc));
    }
}

/**
 * Wire every calm switch under `root`: it shows the flag, sets it, and shows on and disabled while the system asks
 * for less motion.
 *
 * @param {ParentNode} [root]
 * @param {CalmOptions} [options] the scope and loading behaviour a press applies
 * @returns {() => void} detach
 */
export function attachCalm(root = document, options = {}) {
    const doc = docOf(/** @type {any} */ (root));
    applyStoredCalm(doc);
    const made = [...root.querySelectorAll(CALM_SWITCH)]
        .filter((el) => el instanceof HTMLInputElement && el.dataset.kpCalmAttached === undefined && !controllerOf(el, CalmSwitch))
        .map((el) => attachOne(/** @type {HTMLInputElement} */ (el), CalmSwitch, { ...options, doc }))
        .filter((controller) => controller !== undefined);
    // Built directly, not keyed on the root: every attach call follows the system on its own, as it always did.
    const system = new CalmSystem(doc.documentElement);
    system.connect();
    syncSwitches(doc);
    return () => {
        for (const controller of made) controller.destroy();
        system.destroy();
    };
}
