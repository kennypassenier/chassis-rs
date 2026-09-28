// The alarm: a full-screen dramatic alert, framework-free [scope-94].
//
// Bigger than a toast on purpose. A toast is polite, positioned and
// stackable; an alarm owns the whole screen until it is dealt with, the way
// a film shows a lockout: a code line, one huge word, the reason under it
// and a single way out. Kenny approved the prototype in research/alarm/
// (2026-09-15, scope-94) with the full drama in every theme and an auto mode
// that blocks the page like the acknowledged one.
//
// What is hard here the browser does, as for every dialog in this package:
// `showModal()` puts the alarm in the top layer, makes the page behind it
// inert (nothing there can be clicked or tabbed to), keeps focus inside and
// hands focus back when it closes. This file adds the two ways out and the
// countdown:
//
//   mode: 'ack'   only its button closes it (a click, Enter or Space).
//                 Escape does nothing unless `escape: true`; a click outside
//                 the words never closes it.
//   mode: 'auto'  closes by itself after `seconds`, with a shrinking bar;
//                 Escape closes it; the first Tab reaches Keep open, which
//                 stops the countdown and turns it into an ack alarm.
//
// The promise resolves with why it closed: 'ack', 'timeout' or 'escape'.
// Every word the component adds itself comes from js/strings.js; the
// headline, the detail and the code line are the caller's.
//
// Motion is the stylesheet's alone (css/components.css, `.kp-alarm`, and
// each register): the package's arrival and a register's own (cyberpunk's
// decode and flicker, since scope-98 its alone) run only under
// `prefers-reduced-motion: no-preference`, so nothing here reads the
// preference. The tree keeps every part a register may opt into — the
// letter cells with their noise glyphs, the split copies' text, the scan and
// the bars — so both channels render the same tree in every theme. The countdown writes two numbers, a continuous share and the
// whole-second share, and the stylesheet picks the second when the reader
// asked for less motion, so the bar steps instead of sliding.

import { GLYPHS } from './effects.js';
import { getStrings } from './strings.js';

/** Dispatched when an alarm closes, bubbling, on its trigger (or the document): `{ reason, id }`. */
export const ALARM_CLOSE_EVENT = 'kp-alarm-close';
/** Dispatched on the alarm, bubbling, once it is open: `{ id, mode }`. */
export const ALARM_OPEN_EVENT = 'kp-alarm-open';
/** How long an auto alarm stays when the caller names no `seconds`. An operational knob. */
export const ALARM_SECONDS = 8;
/** How often the countdown writes its share. Fast enough for a smooth bar, far below any flash rate: the bar only shrinks. */
const TICK_MS = 100;

let serial = 0;

/**
 * @typedef {object} AlarmOptions
 * @property {string} title  The huge word(s). Also the alarm's accessible name.
 * @property {string} [detail]  The line under the headline: what happened and what follows.
 * @property {string} [code]  The small line above the headline ("Security protocol 7 · lockout").
 * @property {'ack' | 'auto'} [mode]  'ack' (default): only its button closes it. 'auto': closes after `seconds`.
 * @property {number} [seconds]  Auto only. Default 8, at least 1.
 * @property {boolean} [escape]  Ack only: Escape closes it as well. An auto alarm always accepts Escape.
 * @property {string} [action]  The button's label. Default: the dictionary's `alarmAction`.
 * @property {Partial<import('./strings.js').Strings>} [strings]  Per-alarm words, over the dictionary.
 * @property {HTMLElement | null} [trigger]  Where focus returns and the close event is dispatched. Default: what had focus.
 */

/** @typedef {'ack' | 'timeout' | 'escape'} AlarmReason */

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 */
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** Two noise glyphs for one letter cell, from the decipher set js/effects.js uses. */
export const noiseGlyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

/**
 * The headline as letter cells for the stylesheet's decode. Each cell carries
 * its place (`--i`) and two noise glyphs drawn in its pseudo-elements, so the
 * letter itself never moves and the layout never changes; a cell changes
 * three times, ever. Words stay whole (`.kp-alarm__word`), so a line breaks
 * between words and never inside one. Spaces count as a place, so the decode
 * keeps its rhythm across them.
 *
 * @param {string} text
 * @returns {{ word: string, chars: { ch: string, i: number }[] }[]} the words, and each run of spaces as `word: ' '` with no cells
 */
export function glyphCells(text) {
    /** @type {{ word: string, chars: { ch: string, i: number }[] }[]} */
    const parts = [];
    let i = 0;
    for (const part of String(text).split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
            parts.push({ word: ' ', chars: [] });
            i++;
            continue;
        }
        parts.push({ word: part, chars: [...part].map((ch) => ({ ch, i: i++ })) });
    }
    return parts;
}

/**
 * Build an alarm's markup, closed and not yet in the document. Both
 * channels write this tree (components/alarm.jsx renders the same), so a
 * consumer's register rule and a test reach the same elements in each.
 *
 * @param {AlarmOptions & { id?: string }} options
 * @returns {{ dialog: HTMLDialogElement, ack: HTMLButtonElement, keep: HTMLButtonElement, when: HTMLElement, left: HTMLElement, strings: import('./strings.js').Strings, action: string, seconds: number }}
 */
export function buildAlarm(
    { title, detail = '', code = '', mode = 'ack', seconds = ALARM_SECONDS, escape = false, action, strings, id } = { title: '' },
) {
    const s = { ...getStrings(), ...strings };
    const auto = mode === 'auto';
    const secs = Math.max(1, Math.round(Number(seconds)) || ALARM_SECONDS);
    const label = action || s.alarmAction;
    const base = id ?? `kp-alarm-${++serial}`;

    const dialog = /** @type {HTMLDialogElement} */ (el('dialog', 'kp-alarm'));
    dialog.id = base;
    dialog.tabIndex = -1;
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', `${base}-title`);
    dialog.setAttribute('aria-describedby', `${detail ? `${base}-detail ` : ''}${base}-when`);
    dialog.dataset.kpAlarmMode = auto ? 'auto' : 'ack';
    // Declares the Escape rule where the engine reads it; the cancel
    // listener in showAlarm() is the fallback where it does not.
    dialog.setAttribute('closedby', auto || escape ? 'closerequest' : 'none');

    const scan = el('div', 'kp-alarm__scan');
    const bars = el('div', 'kp-alarm__bars');
    scan.setAttribute('aria-hidden', 'true');
    bars.setAttribute('aria-hidden', 'true');
    const panel = el('div', 'kp-alarm__panel');
    dialog.append(scan, bars, panel);

    if (code) panel.append(el('p', 'kp-alarm__code', code));

    // A heading by role rather than an <h2>: every register styles its
    // headings, and the alarm's headline is the alarm's, not the page's.
    const heading = el('div', 'kp-alarm__title');
    heading.setAttribute('role', 'heading');
    heading.setAttribute('aria-level', '2');
    const name = el('span', 'kp-sr-only', title);
    name.id = `${base}-title`;
    const glyphs = el('span', 'kp-alarm__glyphs');
    glyphs.dataset.text = title;
    glyphs.setAttribute('aria-hidden', 'true');
    for (const part of glyphCells(title)) {
        if (part.chars.length === 0) {
            glyphs.append(' ');
            continue;
        }
        const word = el('span', 'kp-alarm__word');
        for (const { ch, i } of part.chars) {
            const cell = el('span', 'kp-alarm__char', ch);
            cell.style.setProperty('--i', String(i));
            cell.dataset.n1 = noiseGlyph();
            cell.dataset.n2 = noiseGlyph();
            word.append(cell);
        }
        glyphs.append(word);
    }
    heading.append(name, glyphs);
    panel.append(heading);

    if (detail) {
        const line = el('p', 'kp-alarm__detail', detail);
        line.id = `${base}-detail`;
        panel.append(line);
    }
    const when = el('p', 'kp-sr-only', auto ? s.alarmClosesBy(secs) : s.alarmPressTo(label));
    when.id = `${base}-when`;
    when.setAttribute('aria-live', 'assertive');
    panel.append(when);

    const actions = el('div', 'kp-alarm__actions');
    const ack = /** @type {HTMLButtonElement} */ (el('button', 'kp-button kp-alarm__ack', label));
    ack.type = 'button';
    const hint = el('span', 'kp-alarm__hint', s.alarmHint);
    hint.setAttribute('aria-hidden', 'true');
    actions.append(ack, hint);
    panel.append(actions);

    const countdown = el('div', 'kp-alarm__countdown');
    const track = el('span', 'kp-alarm__track');
    track.setAttribute('aria-hidden', 'true');
    track.append(el('span', 'kp-alarm__fill'));
    const left = el('span', 'kp-alarm__left', s.alarmCountdown(secs));
    left.setAttribute('aria-hidden', 'true');
    const keep = /** @type {HTMLButtonElement} */ (el('button', 'kp-button kp-button--ghost kp-button--sm kp-alarm__keep', s.alarmKeepOpen));
    keep.type = 'button';
    countdown.append(track, left, keep);
    panel.append(countdown);

    return { dialog, ack, keep, when, left, strings: s, action: label, seconds: secs };
}

/**
 * Raise a full-screen alarm and wait for it to close.
 *
 *   const reason = await showAlarm({ title: 'Access denied', detail: '…', mode: 'ack' });
 *
 * @param {AlarmOptions} options
 * @returns {Promise<AlarmReason>}
 */
export function showAlarm(options) {
    const { mode = 'ack', escape = false } = options;
    const trigger = options.trigger !== undefined ? options.trigger : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const { dialog, ack, keep, when, left, strings: s, action, seconds } = buildAlarm(options);
    const id = dialog.id;

    return new Promise((resolve) => {
        /** @type {AlarmReason} */
        let reason = 'escape';
        let timer = 0;
        /** @param {AlarmReason} why */
        const close = (why) => {
            reason = why;
            if (dialog.open) dialog.close(why);
        };
        const escapeAllowed = () => dialog.dataset.kpAlarmMode === 'auto' || escape;

        ack.addEventListener('click', () => close('ack'));
        keep.addEventListener('click', () => {
            window.clearInterval(timer);
            dialog.dataset.kpAlarmMode = 'ack';
            dialog.setAttribute('closedby', escape ? 'closerequest' : 'none');
            when.textContent = s.alarmKeptOpen(action);
            ack.focus();
        });
        dialog.addEventListener('cancel', (event) => {
            if (!escapeAllowed()) event.preventDefault();
            else reason = 'escape';
        });
        // Firefox and Chromium let a second Escape past a prevented cancel
        // when there was no activation in between; the keydown is the door
        // that stays shut.
        dialog.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !escapeAllowed()) event.preventDefault();
        });
        dialog.addEventListener('close', () => {
            window.clearInterval(timer);
            dialog.remove();
            if (trigger?.isConnected) trigger.focus();
            (trigger?.isConnected ? trigger : document).dispatchEvent(new CustomEvent(ALARM_CLOSE_EVENT, { bubbles: true, detail: { reason, id } }));
            resolve(reason);
        });

        document.body.append(dialog);
        dialog.showModal();
        // The acknowledged alarm focuses its one way out. The auto alarm
        // focuses itself, so an Enter meant for the page presses nothing,
        // and the first Tab reaches Keep open.
        if (mode === 'auto') dialog.focus();
        else ack.focus();
        dialog.dispatchEvent(new CustomEvent(ALARM_OPEN_EVENT, { bubbles: true, detail: { id, mode: dialog.dataset.kpAlarmMode } }));

        if (mode === 'auto') {
            const total = seconds * 1000;
            const began = performance.now();
            const tick = () => {
                const remaining = Math.max(0, total - (performance.now() - began));
                const whole = Math.ceil(remaining / 1000);
                writeCountdown(dialog, left, remaining / total, whole / seconds, s.alarmCountdown(whole));
                if (remaining <= 0) close('timeout');
            };
            timer = window.setInterval(tick, TICK_MS);
            tick();
        }
    });
}

/**
 * Write the countdown's two shares and its words. Shared with the React
 * channel, so both bars read the same two custom properties.
 *
 * @param {HTMLElement} dialog
 * @param {HTMLElement | null} left the words under the bar
 * @param {number} share the continuous share of the time left, 1 to 0
 * @param {number} stepped the share in whole seconds, for reduced motion
 * @param {string} words
 */
export function writeCountdown(dialog, left, share, stepped, words) {
    dialog.style.setProperty('--kp-alarm-left', String(share));
    dialog.style.setProperty('--kp-alarm-left-step', String(stepped));
    if (left && left.textContent !== words) left.textContent = words;
}

/**
 * Wire `[data-kp-alarm]` triggers: a press raises the alarm the trigger
 * describes, and the close event is dispatched on the trigger with the
 * reason. The value of `data-kp-alarm` is the headline.
 *
 *   <button type="button" class="kp-button kp-button--destructive"
 *           data-kp-alarm="Access denied"
 *           data-kp-alarm-code="Security protocol 7 · lockout"
 *           data-kp-alarm-detail="Three failed attempts. This console is locked."
 *           data-kp-alarm-mode="auto" data-kp-alarm-seconds="6">Test the alarm</button>
 *
 * `data-kp-alarm-escape` (present) lets Escape close an acknowledged alarm;
 * `data-kp-alarm-action` names its button.
 *
 * @param {ParentNode} [root]
 * @param {{ strings?: Partial<import('./strings.js').Strings> }} [options]
 * @returns {() => void} detach
 */
export function attachAlarms(root = document, { strings } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    for (const node of root.querySelectorAll('[data-kp-alarm]')) {
        const trigger = /** @type {HTMLElement} */ (node);
        if (trigger.dataset.kpAlarmAttached !== undefined) continue;
        trigger.dataset.kpAlarmAttached = '';
        const raise = () => {
            const d = trigger.dataset;
            void showAlarm({
                title: d.kpAlarm ?? '',
                detail: d.kpAlarmDetail,
                code: d.kpAlarmCode,
                mode: d.kpAlarmMode === 'auto' ? 'auto' : 'ack',
                seconds: d.kpAlarmSeconds === undefined ? undefined : Number(d.kpAlarmSeconds),
                escape: d.kpAlarmEscape !== undefined,
                action: d.kpAlarmAction,
                strings,
                trigger,
            });
        };
        trigger.addEventListener('click', raise);
        cleanups.push(() => {
            trigger.removeEventListener('click', raise);
            delete trigger.dataset.kpAlarmAttached;
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}
