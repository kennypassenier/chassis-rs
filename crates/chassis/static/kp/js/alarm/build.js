// Building an alarm's markup, closed and not yet in the document: the dialog, the headline, the way out and the countdown.

import { getStrings } from '../strings.js';
import { glyphCells, noiseGlyph } from './glyphs.js';
import { ALARM_SECONDS } from './values.js';

/** @typedef {import('../alarm.js').AlarmOptions} AlarmOptions */
/** @typedef {import('../strings.js').Strings} Strings */

let serial = 0;

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

/** The dialog with its role, its names and the rule for Escape. @param {string} base @param {boolean} auto @param {boolean} escape @param {boolean} hasDetail */
function buildDialog(base, auto, escape, hasDetail) {
    const dialog = /** @type {HTMLDialogElement} */ (el('dialog', 'kp-alarm'));
    dialog.id = base;
    dialog.tabIndex = -1;
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', `${base}-title`);
    dialog.setAttribute('aria-describedby', `${hasDetail ? `${base}-detail ` : ''}${base}-when`);
    dialog.dataset.kpAlarmMode = auto ? 'auto' : 'ack';
    // Declares the Escape rule where the engine reads it; the cancel
    // listener in showAlarm() is the fallback where it does not.
    dialog.setAttribute('closedby', auto || escape ? 'closerequest' : 'none');
    return dialog;
}

/**
 * The headline: a heading by role rather than an <h2> (every register styles its headings, and the alarm's headline is the
 * alarm's, not the page's), its accessible name, and the letter cells the decode plays on.
 * @param {string} title @param {string} base
 */
function buildHeadline(title, base) {
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
    return heading;
}

/** The one way out: its button and the hint beside it. @param {Strings} s @param {string} label */
function buildActions(s, label) {
    const actions = el('div', 'kp-alarm__actions');
    const ack = /** @type {HTMLButtonElement} */ (el('button', 'kp-button kp-alarm__ack', label));
    ack.type = 'button';
    const hint = el('span', 'kp-alarm__hint', s.alarmHint);
    hint.setAttribute('aria-hidden', 'true');
    actions.append(ack, hint);
    return { actions, ack };
}

/** The countdown: the bar, the words under it and Keep open. @param {Strings} s @param {number} secs */
function buildCountdown(s, secs) {
    const countdown = el('div', 'kp-alarm__countdown');
    const track = el('span', 'kp-alarm__track');
    track.setAttribute('aria-hidden', 'true');
    track.append(el('span', 'kp-alarm__fill'));
    const left = el('span', 'kp-alarm__left', s.alarmCountdown(secs));
    left.setAttribute('aria-hidden', 'true');
    const keep = /** @type {HTMLButtonElement} */ (el('button', 'kp-button kp-button--ghost kp-button--sm kp-alarm__keep', s.alarmKeepOpen));
    keep.type = 'button';
    countdown.append(track, left, keep);
    return { countdown, left, keep };
}

/**
 * Build an alarm's markup, closed and not yet in the document. Both
 * channels write this tree (components/alarm.jsx renders the same), so a
 * consumer's register rule and a test reach the same elements in each.
 *
 * @param {AlarmOptions & { id?: string }} options
 * @returns {{ dialog: HTMLDialogElement, ack: HTMLButtonElement, keep: HTMLButtonElement, when: HTMLElement, left: HTMLElement, strings: import('../strings.js').Strings, action: string, seconds: number }}
 */
export function buildAlarm(
    { title, detail = '', code = '', mode = 'ack', seconds = ALARM_SECONDS, escape = false, action, strings, id } = { title: '' },
) {
    const s = { ...getStrings(), ...strings };
    const auto = mode === 'auto';
    const secs = Math.max(1, Math.round(Number(seconds)) || ALARM_SECONDS);
    const label = action || s.alarmAction;
    const base = id ?? `kp-alarm-${++serial}`;

    const dialog = buildDialog(base, auto, escape, Boolean(detail));
    const scan = el('div', 'kp-alarm__scan');
    const bars = el('div', 'kp-alarm__bars');
    scan.setAttribute('aria-hidden', 'true');
    bars.setAttribute('aria-hidden', 'true');
    const panel = el('div', 'kp-alarm__panel');
    dialog.append(scan, bars, panel);

    if (code) panel.append(el('p', 'kp-alarm__code', code));
    panel.append(buildHeadline(title, base));
    if (detail) {
        const line = el('p', 'kp-alarm__detail', detail);
        line.id = `${base}-detail`;
        panel.append(line);
    }
    const when = el('p', 'kp-sr-only', auto ? s.alarmClosesBy(secs) : s.alarmPressTo(label));
    when.id = `${base}-when`;
    when.setAttribute('aria-live', 'assertive');
    panel.append(when);

    const { actions, ack } = buildActions(s, label);
    panel.append(actions);

    const { countdown, left, keep } = buildCountdown(s, secs);
    panel.append(countdown);
    return { dialog, ack, keep, when, left, strings: s, action: label, seconds: secs };
}
