// Drawing a wheel: its parts laid once, the disc with its segments and labels (each label fitted to its room), and the
// answer card, the Spin button and the stage painted from the state.

import { getStrings } from '../strings.js';
import { LABEL_IN, LABEL_OUT, R, el, part, point, stateOf, svg, wheelAngles } from './state.js';

/** @typedef {import('../wheel.js').WheelItem} WheelItem */
/** @typedef {import('./state.js').WheelState} WheelState */

/** Lay the parts once. @param {HTMLElement} root */
export function build(root) {
    if (root.querySelector(':scope > .kp-wheel__stage')) return;
    const stage = el('kp-wheel__stage');
    const disc = el('kp-wheel__disc');
    const face = svg('svg', { class: 'kp-wheel__face', viewBox: '-100 -100 200 200', 'aria-hidden': 'true', focusable: 'false' });
    face.append(svg('g', { class: 'kp-wheel__segments' }), svg('circle', { class: 'kp-wheel__rim', r: String(R), cx: '0', cy: '0' }));
    disc.append(face);
    const pointer = svg('svg', { class: 'kp-wheel__pointer', viewBox: '0 0 20 18', 'aria-hidden': 'true', focusable: 'false' });
    pointer.append(svg('path', { d: 'M1 1h18L10 17z' }));
    const spin = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--primary kp-wheel__spin', 'button'));
    spin.type = 'button';
    stage.append(disc, pointer, spin);
    const result = el('kp-wheel__result');
    result.setAttribute('role', 'status');
    const caption = el('kp-wheel__caption', 'p');
    const outcome = el('kp-wheel__outcome', 'p');
    const tag = el('kp-wheel__tag', 'p');
    result.append(caption, outcome, tag);
    root.append(stage, result);
    if (!root.hasAttribute('role')) root.setAttribute('role', 'group');
}

/**
 * Draw the disc from the weights shown now. `measure` fits the labels to
 * their room exactly (else by an estimate, for the frames of a glide).
 * @param {HTMLElement} root @param {boolean} measure
 */
export function drawDisc(root, measure) {
    const state = stateOf(root);
    const group = /** @type {SVGGElement} */ (root.querySelector('.kp-wheel__segments'));
    const items = new Map(state.items.map((item) => [item.id, item]));
    const ids = state.order.filter((id) => (state.shown.get(id) ?? 0) > 0.0001);
    const angles = wheelAngles(ids.map((id) => state.shown.get(id) ?? 0));
    const won = root.getAttribute('data-kp-wheel-won');
    group.replaceChildren();
    root.toggleAttribute('data-kp-wheel-empty', ids.length === 0);
    if (!ids.length) {
        group.append(svg('circle', { class: 'kp-wheel__ghost', r: String(R), cx: '0', cy: '0' }));
        return;
    }
    ids.forEach((id, i) => {
        const [a0, a1] = angles[i];
        const span = a1 - a0;
        // The theme's five chart colours in turn; the last never repeats the first.
        let tone = (i % 5) + 1;
        if (i === ids.length - 1 && i > 0 && tone === 1) tone = 3;
        const shape =
            span >= 359.99
                ? svg('circle', { r: String(R), cx: '0', cy: '0' })
                : svg('path', { d: `M0 0L${point(a0, R)}A${R} ${R} 0 ${span > 180 ? 1 : 0} 1 ${point(a1, R)}Z` });
        shape.setAttribute('class', 'kp-wheel__segment');
        shape.setAttribute('data-tone', String(tone));
        shape.setAttribute('data-id', id);
        if (won !== null) shape.setAttribute(won === id ? 'data-kp-wheel-chosen' : 'data-kp-wheel-other', '');
        const known = items.get(id);
        const resting = known?.resting === true;
        if (resting) shape.setAttribute('data-kp-wheel-resting', '');
        group.append(shape);
        // The label along the radius, reading outward on the right and inward on the left (of the screen, turn included), so it is never upside down at rest.
        const mid = (a0 + a1) / 2;
        const half = Math.min(Math.PI / 2, ((span / 2) * Math.PI) / 180);
        const item = items.get(id);
        const plan = fitLabel(group, [item?.label ?? '', item?.short ?? ''], half, measure);
        // The segment says its whole name, its tag and that it rests when pointed at, whether or not the name fits on the disc.
        const name = svg('title');
        name.textContent = [item?.label ?? '', item?.tag ?? '', resting ? getStrings().wheelResting : ''].filter(Boolean).join(' · ');
        shape.append(name);
        // No size fits the name whole, on one line or two, and it has no shorter form: nothing is drawn rather than a cut name.
        if (!plan) return;
        // Where the slice stands on the screen, not in the unturned disc: the disc is turned (state.angle) and the flip follows the
        // turn, so a label on the left half still reads inward and upright after a spin [KIT 7].
        const left = (((mid + state.angle) % 360) + 360) % 360 > 180;
        const text = svg('text', {
            class: 'kp-wheel__label',
            transform: `rotate(${(left ? mid + 90 : mid - 90).toFixed(3)})`,
            x: String(left ? -plan.start : plan.start),
            y: '0',
            'dominant-baseline': 'central',
            'text-anchor': left ? 'end' : 'start',
            'font-size': plan.size.toFixed(2),
        });
        if (won === id) text.setAttribute('data-kp-wheel-chosen', '');
        if (resting) text.setAttribute('data-kp-wheel-resting', '');
        text.setAttribute('data-span', span.toFixed(3));
        if (plan.lines.length === 1) text.textContent = plan.lines[0];
        else
            plan.lines.forEach((line, n) => {
                const row = svg('tspan', {
                    x: String(left ? -plan.start : plan.start),
                    dy: (n === 0 ? -0.55 * plan.size : 1.1 * plan.size).toFixed(2),
                });
                row.textContent = line;
                text.append(row);
            });
        group.append(text);
    });
}

/** The smallest type a label is drawn in (units of the 200-unit disc). */
const LABEL_MIN = 4.5;
/** A label at or above this size is good as it is; below it a shorter form or a second line is tried first. */
const LABEL_COMFORT = 6.5;
/** The largest type. */
const LABEL_MAX = 9;

/**
 * Where and how large a segment's label goes, never cut: the whole name on one line at the size the room allows, else on
 * two lines, else the item's `short` form the same way; null when none of them fits at LABEL_MIN or more [rule-fixes-1019].
 * @param {SVGGElement} group @param {[string, string]} names the label and its short form
 * @param {number} half half the segment's angle, radians @param {boolean} measure read the real width of the text
 * @returns {{ size: number, start: number, lines: string[] } | null}
 */
function fitLabel(group, names, half, measure) {
    const sin = Math.max(0.0001, Math.sin(half));
    const mid = (LABEL_IN + LABEL_OUT) / 2;
    /** Width of `text` at size 1, from the page's own face when asked, else an estimate. @param {string} text */
    const unit = (text) => {
        if (!measure) return text.length * 0.56;
        const probe = svg('text', { class: 'kp-wheel__label', 'font-size': '10', visibility: 'hidden' });
        probe.textContent = text;
        group.append(probe);
        const width = /** @type {SVGTextElement} */ (probe).getComputedTextLength() / 10;
        probe.remove();
        return width;
    };
    /** The best break of a name into two lines, at a space near its middle. @param {string} text */
    const halves = (text) => {
        const spaces = [...text.matchAll(/ /g)].map((m) => m.index ?? 0);
        if (!spaces.length) return null;
        const at = spaces.reduce((best, i) => (Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2) ? i : best));
        return [text.slice(0, at).trim(), text.slice(at + 1).trim()];
    };
    /** @type {{ size: number, start: number, lines: string[] } | null} */
    let best = null;
    for (const name of names) {
        const text = name.trim();
        if (!text) continue;
        const two = halves(text);
        for (const lines of two ? [[text], two] : [[text]]) {
            const rows = lines.length;
            // The type the segment's width allows at the middle of the label's room: two lines need half of it each.
            const allowed = Math.min(LABEL_MAX, (2 * mid * sin * 0.62) / (rows === 2 ? 1.5 : 1));
            if (allowed < LABEL_MIN) continue;
            // The label starts where the segment is wide enough for it, so labels of narrow neighbours never meet near the hub.
            const start = Math.max(LABEL_IN, (allowed * 0.75 * (rows === 2 ? 1.5 : 1)) / sin);
            const room = LABEL_OUT - start;
            if (room < 16) continue;
            const widest = Math.max(...lines.map(unit));
            const size = Math.min(allowed, room / Math.max(0.0001, widest));
            if (size < LABEL_MIN) continue;
            const grown = Math.max(LABEL_IN, (size * 0.75 * (rows === 2 ? 1.5 : 1)) / sin);
            const plan = { size, start: grown, lines };
            if (size >= LABEL_COMFORT) return plan;
            if (!best || size > best.size) best = plan;
        }
    }
    return best;
}

/** The words under the wheel and the Spin button's state. @param {HTMLElement} root */
export function paint(root) {
    const strings = getStrings();
    const state = stateOf(root);
    const spin = /** @type {HTMLButtonElement} */ (part(root, 'spin'));
    const caption = part(root, 'caption');
    const outcome = part(root, 'outcome');
    const tag = part(root, 'tag');
    const result = part(root, 'result');
    const kiosk = root.hasAttribute('data-kp-wheel-kiosk');
    const error = root.getAttribute('data-kp-wheel-error');
    const busy = root.hasAttribute('aria-busy');
    const won = root.getAttribute('data-kp-wheel-won');
    const chosen = won !== null ? state.items.find((item) => item.id === won) : undefined;
    result.toggleAttribute('data-kp-wheel-failed', error !== null && !busy);
    const note = busy || error !== null || !state.items.length;
    outcome.toggleAttribute('data-kp-wheel-note', note);
    if (busy) {
        caption.textContent = '';
        outcome.textContent = '';
    } else if (error !== null) {
        caption.textContent = '';
        outcome.textContent = error;
    } else if (!state.items.length) {
        caption.textContent = '';
        outcome.textContent = root.getAttribute('data-kp-wheel-empty') ?? strings.wheelEmpty;
    } else if (state.spinning) {
        caption.textContent = strings.wheelSpinning;
        outcome.textContent = '';
    } else if (chosen) {
        caption.textContent = state.items.length === 1 ? strings.wheelOnlyOne : strings.wheelChose;
        outcome.textContent = chosen.label;
    } else {
        caption.textContent = kiosk ? strings.wheelIdleKiosk : strings.wheelIdle;
        outcome.textContent = '';
    }
    tag.textContent = chosen && !state.spinning && !note ? (chosen.tag ?? '') : '';
    tag.title = tag.textContent;
    outcome.title = outcome.textContent ?? '';
    caption.title = caption.textContent ?? '';
    const blocked = busy || error !== null || state.items.length < 2 || state.spinning;
    spin.textContent = won !== null && state.items.length > 1 ? strings.wheelSpinAgain : strings.wheelSpin;
    if (blocked) spin.setAttribute('aria-disabled', 'true');
    else spin.removeAttribute('aria-disabled');
    // Kiosk: the wheel is the one control. The hub's button leaves the tab order and the reading order; the stage takes over.
    const stage = part(root, 'stage');
    spin.hidden = kiosk;
    if (kiosk) {
        stage.setAttribute('role', 'button');
        stage.tabIndex = 0;
        stage.setAttribute('aria-label', strings.wheelSpinKiosk);
        if (blocked) stage.setAttribute('aria-disabled', 'true');
        else stage.removeAttribute('aria-disabled');
    } else {
        for (const name of ['role', 'tabindex', 'aria-label', 'aria-disabled']) stage.removeAttribute(name);
    }
}

