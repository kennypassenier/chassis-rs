// A button that shows the result for a moment [kpadopt5].
//
// While its work runs the button shows the theme's spinner; when the work is done it shows a short word ("Copied",
// "Sent", "Refused") for a moment and goes back to its own words. It never changes width: every face it can show
// (rest, busy, result, and the words it may say) shares one grid cell, so the widest sets the width and the row beside
// it does not re-flow under the pointer. It replaces chassis `busy()` / `flash()` / `pinWidth()` (chassis.js) and kyu's
// copy button.
//
//   <button class="kp-button" data-kp-flash-button data-kp-flash-words="Sent,Refused">Send test</button>
//   <button class="kp-button" data-kp-post="/api/clients/7/test" data-kp-flash-word="Sent">Send test</button>
//   runFlashButton(button, async () => { await save(); return 'Saved'; });
//
// Kenny, 2026-10-17 ("Kort woord op de button, zin eronder"): a refusal shows its short word on the button, in the
// button's own width, and the whole sentence (the reason and what to do now) stands in a line right under the button
// until the next press. `data-kp-refusal` chooses another place: `button` (the button grows to hold the sentence) or
// `toast`. The answer shape of a refusal is `{ error, remedy }`, the same as `chassis::Error`.
//
//   data-kp-busy-label       a word beside the spinner while busy (default none: the spinner alone, so nothing widens)
//   data-kp-flash-ms         how long a success stays (default 1500)
//   data-kp-flash-error-ms   how long a refusal's word stays (default 3000)
//   data-kp-flash-word       the success word (default the dictionary's "Done")
//   data-kp-flash-words      every word the button may say, comma separated, so the width holds them all
//   data-kp-width            `keep` (default: the button holds the width of its widest word) or `grow` (as wide as what it says now; set by hand it
//                            works at rest and busy too)
//   data-kp-refusal          `line` (default), `button` or `toast`
//   data-kp-flash-line       a selector for the element that holds the line (default: one made after the button)
//   data-kp-post, data-kp-method, data-kp-post-body, data-kp-reload (`none` default, `page`, `region` with
//                            `data-kp-reload-target`): the chassis pattern, POST then show the answer
//
// A second press while busy does nothing. The result is announced politely whatever its length. Nothing runs on import.

import { toast } from './overlays.js';
import { getStrings } from './strings.js';

/** A button this module drives. */
export const FLASH_BUTTON = '[data-kp-flash-button], [data-kp-post]';
/** Fired on the button, bubbling, at every change of state: `{ state, ok?, word?, line? }`, state `busy` | `success` | `refused` | `rest`. */
export const FLASH_EVENT = 'kp-flash';
/** Fired on the button when `data-kp-reload="region"` wants its region read again: `{ target }`. */
export const FLASH_RELOAD_EVENT = 'kp-flash-reload';
/** How long a success word stays, in ms (chassis' value). */
export const FLASH_MS = 1500;
/** How long a refusal's word stays, in ms: a refusal needs longer to read. */
export const FLASH_ERROR_MS = 3000;

/**
 * What the work may answer: nothing or a word for a success, or a refusal.
 * @typedef {string | void | { word?: string, line?: string } | { error: string, remedy?: string, word?: string }} FlashAnswer
 */

/**
 * @typedef {object} FlashOptions
 * @property {number} [flashMs]
 * @property {number} [errorMs]
 * @property {string} [busyLabel]
 * @property {'keep' | 'grow'} [width]
 * @property {'line' | 'button' | 'toast'} [refusal]
 */

/** @typedef {{ stack: HTMLElement, rest: HTMLElement, busy: HTMLElement, result: HTMLElement, status: HTMLElement, line: HTMLElement, ownLine: boolean, timer: number, running: boolean, off: () => void }} Wired */
/** @type {WeakMap<Element, Wired>} */
const wired = new WeakMap();

/** @param {HTMLElement} button @param {string} name @param {string} fallback */
const attr = (button, name, fallback) => button.getAttribute(name) ?? fallback;

/** @param {HTMLElement} button @param {string} name @param {number} fallback */
const num = (button, name, fallback) => {
    const n = Number.parseInt(button.getAttribute(name) ?? '', 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Give a button its faces, once. @param {HTMLElement} button @param {FlashOptions} options */
function wire(button, options) {
    const known = wired.get(button);
    if (known) return known;
    const doc = button.ownerDocument;
    const s = getStrings();
    const rest = doc.createElement('span');
    rest.className = 'kp-flash__face kp-flash__face--rest';
    rest.append(...button.childNodes);
    const busy = doc.createElement('span');
    busy.className = 'kp-flash__face kp-flash__face--busy';
    busy.setAttribute('aria-hidden', 'true');
    const spin = doc.createElement('span');
    spin.className = 'kp-spinner kp-button__spin';
    busy.append(spin);
    const label = options.busyLabel ?? button.getAttribute('data-kp-busy-label');
    if (label) busy.append(label);
    const result = doc.createElement('span');
    result.className = 'kp-flash__face kp-flash__face--result';
    result.setAttribute('aria-hidden', 'true');
    const stack = doc.createElement('span');
    stack.className = 'kp-flash__stack';
    stack.append(rest, busy, result);
    // Every word the button may say holds its width, unseen.
    const words = (
        button.getAttribute('data-kp-flash-words') ??
        `${attr(button, 'data-kp-flash-word', s.flashDone)},${attr(button, 'data-kp-refused-word', s.flashRefused)}`
    )
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean);
    for (const word of words) {
        const ghost = doc.createElement('span');
        ghost.className = 'kp-flash__ghost';
        ghost.setAttribute('aria-hidden', 'true');
        ghost.textContent = `✓ ${word}`;
        stack.append(ghost);
    }
    button.replaceChildren(stack);
    button.classList.add('kp-flash');
    button.setAttribute('data-kp-flash-state', 'rest');

    const status = doc.createElement('span');
    status.className = 'kp-sr-only';
    status.setAttribute('role', 'status');
    const slot = button.getAttribute('data-kp-flash-line');
    const own = slot ? doc.querySelector(slot) : null;
    const ownLine = own === null;
    const line = /** @type {HTMLElement} */ (own ?? doc.createElement('p'));
    if (ownLine) {
        line.className = 'kp-flash__line';
        line.hidden = true;
    }
    line.setAttribute('role', 'status');
    button.after(status);
    if (ownLine) status.after(line);

    /** @type {Wired} */
    const handle = {
        stack,
        rest,
        busy,
        result,
        status,
        line,
        ownLine,
        timer: 0,
        running: false,
        off: () => {
            window.clearTimeout(handle.timer);
            button.replaceChildren(...rest.childNodes);
            button.classList.remove('kp-flash');
            button.removeAttribute('data-kp-flash-state');
            button.removeAttribute('aria-busy');
            button.removeAttribute('aria-disabled');
            status.remove();
            if (ownLine) line.remove();
            else {
                line.textContent = '';
                line.removeAttribute('data-kp-tone');
            }
            wired.delete(button);
        },
    };
    wired.set(button, handle);
    return handle;
}

/**
 * @param {HTMLElement} button @param {Wired} w @param {'rest' | 'busy' | 'success' | 'refused'} state
 * @param {Record<string, unknown>} [detail]
 */
function setState(button, w, state, detail = {}) {
    button.setAttribute('data-kp-flash-state', state);
    if (state === 'busy') {
        button.setAttribute('aria-busy', 'true');
        button.setAttribute('aria-disabled', 'true');
    } else {
        button.removeAttribute('aria-busy');
        button.removeAttribute('aria-disabled');
    }
    button.dispatchEvent(new CustomEvent(FLASH_EVENT, { bubbles: true, detail: { state, ...detail } }));
}

/**
 * Run `work` behind a button: busy while it runs, then its result for a moment.
 *
 * @param {HTMLElement} button
 * @param {() => Promise<FlashAnswer> | FlashAnswer} work
 * @param {FlashOptions} [options]
 * @returns {Promise<{ ok: boolean, word: string, line: string } | null>} null when the press was ignored (already busy)
 */
export async function runFlashButton(button, work, options = {}) {
    const w = wire(button, options);
    if (w.running) return null;
    const s = getStrings();
    w.running = true;
    window.clearTimeout(w.timer);
    if (w.ownLine) {
        w.line.hidden = true;
    }
    w.line.textContent = '';
    w.line.removeAttribute('data-kp-tone');
    if (options.width) button.setAttribute('data-kp-width', options.width);
    if (options.refusal) button.setAttribute('data-kp-refusal', options.refusal);
    setState(button, w, 'busy');
    const label = options.busyLabel ?? button.getAttribute('data-kp-busy-label') ?? '';
    if (label !== '') w.status.textContent = label;

    let ok = true;
    let word = '';
    let line = '';
    try {
        const answer = await work();
        if (answer && typeof answer === 'object' && 'error' in answer) {
            ok = false;
            word = answer.word ?? attr(button, 'data-kp-refused-word', s.flashRefused);
            line = [answer.error, answer.remedy].filter(Boolean).join(' ');
        } else if (answer && typeof answer === 'object') {
            word = answer.word ?? attr(button, 'data-kp-flash-word', s.flashDone);
            line = answer.line ?? '';
        } else word = typeof answer === 'string' && answer !== '' ? answer : attr(button, 'data-kp-flash-word', s.flashDone);
    } catch (error) {
        ok = false;
        word = attr(button, 'data-kp-failed-word', s.flashFailed);
        line = error instanceof Error ? error.message : String(error);
    }

    const refusal = /** @type {'line' | 'button' | 'toast'} */ (options.refusal ?? attr(button, 'data-kp-refusal', 'line'));
    const onButton = !ok && refusal === 'button' ? line : '';
    w.result.replaceChildren();
    const glyph = button.ownerDocument.createElement('span');
    glyph.className = 'kp-flash__glyph';
    glyph.textContent = ok ? '✓' : '✕';
    w.result.append(glyph, ` ${onButton || word}`);
    // A width a page set by hand (`data-kp-width="grow"`, or `keep`) stays: only the grow this refusal asked for is taken back.
    const handWidth = button.getAttribute('data-kp-width');
    if (onButton) button.setAttribute('data-kp-width', 'grow');
    w.status.textContent = '';
    window.setTimeout(() => {
        w.status.textContent = line ? `${word}. ${line}` : word;
    }, 30);
    if (line && (ok || refusal === 'line')) {
        w.line.textContent = line;
        w.line.setAttribute('data-kp-tone', ok ? 'success' : 'destructive');
        w.line.hidden = false;
    }
    if (!ok && refusal === 'toast' && line) toast(line);
    w.running = false;
    setState(button, w, ok ? 'success' : 'refused', { ok, word, line });
    const ms = ok
        ? num(button, 'data-kp-flash-ms', options.flashMs ?? FLASH_MS)
        : num(button, 'data-kp-flash-error-ms', options.errorMs ?? FLASH_ERROR_MS);
    w.timer = window.setTimeout(() => {
        if (!wired.has(button)) return;
        if (onButton && options.width === undefined) {
            if (handWidth === null) button.removeAttribute('data-kp-width');
            else button.setAttribute('data-kp-width', handWidth);
        }
        setState(button, w, 'rest');
    }, ms);
    return { ok, word, line };
}

/** The chassis pattern: POST (or another method), then show the answer. @param {HTMLElement} button */
async function post(button) {
    const url = button.getAttribute('data-kp-post') ?? '';
    const method = (button.getAttribute('data-kp-method') ?? 'POST').toUpperCase();
    const body = button.getAttribute('data-kp-post-body');
    const response = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        ...(body ? { body } : {}),
    });
    /** @type {any} */
    let json = null;
    try {
        json = await response.clone().json();
    } catch {
        // No JSON body: the status text is the answer.
    }
    if (!response.ok) return { error: json?.error ?? (response.statusText || `HTTP ${response.status}`), remedy: json?.remedy };
    const reload = attr(button, 'data-kp-reload', 'none');
    if (reload === 'page') window.setTimeout(() => location.reload(), 600);
    else if (reload === 'region')
        button.dispatchEvent(
            new CustomEvent(FLASH_RELOAD_EVENT, { bubbles: true, detail: { target: button.getAttribute('data-kp-reload-target') } }),
        );
    return typeof json?.message === 'string' ? { line: json.message } : undefined;
}

/**
 * Wire every flash button under `root`.
 *
 * @param {ParentNode} [root]
 * @param {FlashOptions} [options]
 * @returns {() => void} detach
 */
export function attachFlashButtons(root = document, options = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    for (const found of root.querySelectorAll(FLASH_BUTTON)) {
        const button = /** @type {HTMLElement} */ (found);
        if (wired.has(button)) continue;
        const w = wire(button, options);
        const onClick = (/** @type {Event} */ event) => {
            if (!button.hasAttribute('data-kp-post')) return;
            event.preventDefault();
            void runFlashButton(button, () => post(button), options);
        };
        const guard = (/** @type {Event} */ event) => {
            if (w.running || button.getAttribute('aria-disabled') === 'true') {
                event.stopImmediatePropagation();
                event.preventDefault();
            }
        };
        // The guard runs first (capture), so a consumer's own click handler never sees a press made while busy.
        button.addEventListener('click', guard, true);
        button.addEventListener('click', onClick);
        cleanups.push(() => {
            button.removeEventListener('click', guard, true);
            button.removeEventListener('click', onClick);
            w.off();
        });
    }
    return () => {
        for (const clean of cleanups) clean();
    };
}
