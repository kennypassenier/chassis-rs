// A wheel that picks for you [kpadopt4; the AuDHD recipe app's "what do we eat tonight"].
//
// A round wheel with a segment per choice. It takes the weight of choosing
// away: the wheel picks, the person says yes or spins again. Weights make a
// segment larger or smaller (long not eaten: larger; yesterday: smaller).
//
//   <div class="kp-wheel" data-kp-wheel aria-label="Tonight's dinner"></div>
//
//   setWheelItems(wheel, [{ id: 'curry', label: 'Chicken curry', weight: 3 }, …]);
//   wheel.addEventListener('kp-wheel-result', (e) => offer(e.detail.item));
//
// Parts, made by the module: the stage (`__stage`) holding the disc
// (`__disc`, an SVG of `__segment`s and `__label`s that turns), the pointer
// at the top (`__pointer`, still) and the Spin button in the middle
// (`__spin`, the theme's primary button); under it the result (`__result`:
// `__caption` and `__outcome`, a status region).
//
// What it does:
//   - The outcome is drawn first, by the weights (pickWeighted()), and the
//     wheel then turns to it: the motion is honest, never decides.
//   - Spin again never lands on the same choice twice in a row while there
//     is another (`data-kp-wheel-repeat="true"` allows it).
//   - Segments are as large as their odds: a segment's angle is its weight's
//     share of the total (a weight of 4 beside 1 and 1 is two thirds of the
//     disc, and two thirds likely). The weights are the whole of "how we
//     divide the chances"; setWheelItems() again with new weights glides the
//     segments to their new size.
//   - It turns a number of whole turns plus the way to the outcome, and the
//     number varies per spin: a whole number drawn between
//     `data-kp-wheel-turns-min` (3) and `data-kp-wheel-turns-max` (6) alike,
//     so no two spins feel the same. `data-kp-wheel-turns="4"` fixes it (min
//     and max both 4). The time follows the travel: `data-kp-wheel-duration`
//     ms (3600) is the time of the mean travel, a longer travel takes
//     proportionally longer (never under 60% nor over 140% of it), so the
//     speed stays alike. The turns only vary the travel: the outcome is drawn
//     by the weights first, and the landing is always on it. It slows on
//     `--kp-wheel-ease` (a long, even settle; a theme may answer its own). For
//     a reader who asked for less motion it takes the short way in
//     `data-kp-wheel-reduced-ms` (600; 0 places it at once), with no whole turn.
//   - Space or Enter on Spin spins it; the outcome is said, once.
//   - A name is never cut: on its segment it takes the largest type the room allows, goes onto two lines when that reads
//     larger, and gives way to the item's `short` form (`{ label: 'Chicken curry with rice', short: 'Curry' }`) when
//     neither fits; a name that fits in no form is not drawn on the disc, it is the segment's tooltip and whole in the
//     result. Segments take
//     the theme's chart colours, soft, and the chosen one is filled deeper
//     while the others step back.
//   - When the choices change (a filter), the segments grow and shrink to
//     their new size in the theme's size time; the wheel keeps its size, so
//     nothing on the page moves. One choice: no spin, the outcome at once. No
//     choice: the empty sentence.
//
// States: setWheelState(wheel, 'loading' | 'error' | 'ready', message):
// loading lays the busy card over the wheel; error says the message where the
// outcome goes.
//
// Events (bubbling, on the root):
//   kp-wheel-spin    { item, index, turns }        the outcome is drawn and the wheel starts (turns: whole turns it will make)
//   kp-wheel-result  { item, index, source }       'spin' | 'only'
//
// Kiosk, tags and the answer card [hover-wheel-1019; the AuDHD recipes app's page for Kenny's parents]:
//   - `data-kp-wheel-kiosk`: no controls. The Spin button in the hub is gone and the wheel itself is the one control: a
//     tap (or Enter / Space with the focus on it) on the disc or on the answer spins it. The hub stays as a quiet plate.
//     A page with only the wheel over a chosen list needs nothing else. Live: set or remove it at any time.
//   - `tag` on an item (`{ label: 'Lasagne', tag: 'Oven, 45 min' }`): a short line about the choice. It stands under the
//     name in the answer card and in the segment's tooltip.
//   - `resting: true` on an item: it stays on the disc so the list is whole, but it is stepped back (faded, dashed edge,
//     its name in italics, "resting" in its tooltip) and the wheel never lands on it while another choice is not resting.
//   - `data-kp-wheel-answer`: the answer card. The caption, the name and the tag stand in one bordered card of reserved
//     size (a tag line is kept even when the choice has none), so nothing under it moves.
//
// Every word it adds is in js/strings.js. Nothing runs on import.

import { getStrings } from './strings.js';
import { openBusyCard } from './busy-card.js';
import { motionAllowed } from './calm.js';

export const WHEEL = '[data-kp-wheel]';
export const WHEEL_SPIN_EVENT = 'kp-wheel-spin';
export const WHEEL_RESULT_EVENT = 'kp-wheel-result';

/**
 * @typedef {object} WheelItem
 * @property {string} id
 * @property {string} label
 * @property {number} [weight]  1 by default; larger is likelier and a larger segment
 * @property {string} [tag]  a short line about the choice, shown in the answer card and the segment's tooltip
 * @property {boolean} [resting]  stays on the wheel, marked, and is never drawn while another choice is not resting
 * @property {string} [short]  a shorter name for the wheel's face, used when the whole label does not fit a thin segment
 */

/**
 * @typedef {object} WheelState
 * @property {WheelItem[]} items
 * @property {Map<string, number>} shown  the weights drawn now (they glide to the items' weights)
 * @property {string[]} order  the ids drawn, in order (a leaving one stays until it has shrunk)
 * @property {number} angle  the disc's turn, degrees
 * @property {boolean} spinning
 * @property {string | null} last  the id the wheel chose last
 * @property {number} glide  the frame of a glide
 * @property {import('./busy-card.js').BusyCard | null} busy
 */

/** @type {WeakMap<Element, WheelState>} */
const STATES = new WeakMap();
/** @type {WeakSet<Element>} */
const WIRED = new WeakSet();
const SVG = 'http://www.w3.org/2000/svg';
/** The disc's radius, the labels' room and the hub's, in the SVG's units. */
const R = 96;
const LABEL_IN = 34;
const LABEL_OUT = 84;
/** Whole turns a spin makes, drawn between these (data-kp-wheel-turns-min / -max). */
const DEFAULT_TURNS_MIN = 3;
const DEFAULT_TURNS_MAX = 6;

/** @param {WheelItem} item */
const weightOf = (item) => Math.max(0.05, Number.isFinite(item.weight) ? Number(item.weight) : 1);

/**
 * Draw an outcome by the weights. `avoid` (an id) is left out while there is
 * another choice. Pure but for `random`.
 * @param {readonly WheelItem[]} items
 * @param {{ random?: () => number, avoid?: string | null }} [options]
 * @returns {number} the index drawn, -1 when there is none
 */
export function pickWeighted(items, { random = Math.random, avoid = null } = {}) {
    // A resting choice is not drawn while another is not resting; when every one rests, they are all in play again.
    const awake = items.some((item) => !item.resting);
    const open = items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => (items.length < 2 || item.id !== avoid) && (!awake || !item.resting));
    const total = open.reduce((sum, { item }) => sum + weightOf(item), 0);
    if (!open.length || total <= 0) return -1;
    let at = random() * total;
    for (const { item, index } of open) {
        at -= weightOf(item);
        if (at < 0) return index;
    }
    return open[open.length - 1].index;
}

/**
 * Each segment's start and end, in degrees clockwise from the top, by weight.
 * @param {readonly number[]} weights
 * @returns {[number, number][]}
 */
export function wheelAngles(weights) {
    const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
    let at = 0;
    return weights.map((w) => {
        const span = total > 0 ? (Math.max(0, w) / total) * 360 : 0;
        const segment = /** @type {[number, number]} */ ([at, at + span]);
        at += span;
        return segment;
    });
}

/** @param {number} deg @param {number} r */
const point = (deg, r) => {
    const rad = (deg * Math.PI) / 180;
    return `${(r * Math.sin(rad)).toFixed(3)} ${(-r * Math.cos(rad)).toFixed(3)}`;
};

/** @param {string} name @param {Record<string, string>} [attrs] */
const svg = (name, attrs = {}) => {
    const node = document.createElementNS(SVG, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
};

/** @param {string} className @param {string} [tag] */
const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} root @returns {WheelState} */
const stateOf = (root) => {
    let state = STATES.get(root);
    if (!state) {
        state = { items: [], shown: new Map(), order: [], angle: 0, spinning: false, last: null, glide: 0, busy: null };
        STATES.set(root, state);
    }
    return state;
};

/** @param {Element} root @param {string} name */
const part = (root, name) => /** @type {HTMLElement} */ (root.querySelector(`.kp-wheel__${name}`));

/** Lay the parts once. @param {HTMLElement} root */
function build(root) {
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
function drawDisc(root, measure) {
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
function paint(root) {
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

/** @returns {boolean} */
const reduced = () => !motionAllowed();

/**
 * Let the drawn weights glide to the items' weights in the theme's size time.
 * @param {HTMLElement} root
 */
async function glideTo(root) {
    const state = stateOf(root);
    const target = new Map(state.items.map((item) => [item.id, weightOf(item)]));
    // The order: the new items in theirs, a leaving one kept after the one it followed.
    /** @type {string[]} */
    const order = state.items.map((item) => item.id);
    state.order.forEach((id, at) => {
        if (target.has(id)) return;
        const before = state.order
            .slice(0, at)
            .reverse()
            .find((other) => order.includes(other));
        order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
    });
    const from = new Map(order.map((id) => [id, state.shown.get(id) ?? 0]));
    // A first drawing, or a wheel that had nothing, is drawn at once.
    const first = state.order.length === 0 || [...from.values()].every((w) => w <= 0.0001);
    let duration = 0;
    let easing = 'ease';
    if (!first && !reduced()) {
        const { themeMotion } = await import('./motion.js');
        ({ size: duration, ease: easing } = themeMotion(root));
    }
    const done = () => {
        state.order = state.items.map((item) => item.id);
        state.shown = new Map(target);
        drawDisc(root, true);
    };
    cancelAnimationFrame(state.glide);
    if (duration <= 0) return done();
    state.order = order;
    // The theme's curve, sampled through a throwaway animation.
    const probe = document.createElement('i').animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing, fill: 'both' });
    probe.pause();
    const start = performance.now();
    const frame = (/** @type {number} */ now) => {
        const t = Math.min(1, (now - start) / duration);
        probe.currentTime = t * duration;
        const style = probe.effect?.getComputedTiming().progress ?? t;
        const k = typeof style === 'number' ? style : t;
        state.shown = new Map(order.map((id) => [id, (from.get(id) ?? 0) + ((target.get(id) ?? 0) - (from.get(id) ?? 0)) * k]));
        drawDisc(root, false);
        if (t < 1) state.glide = requestAnimationFrame(frame);
        else {
            probe.cancel();
            done();
        }
    };
    state.glide = requestAnimationFrame(frame);
}

/**
 * Give the wheel its choices. A new set clears the outcome (a filter is a new
 * question); one choice is the outcome at once.
 * @param {Element} root @param {WheelItem[]} items
 */
export function setWheelItems(root, items) {
    if (!(root instanceof HTMLElement)) return;
    build(root);
    const state = stateOf(root);
    if (state.spinning) {
        root.addEventListener(WHEEL_RESULT_EVENT, () => setWheelItems(root, items), { once: true });
        return;
    }
    state.items = items.map((item) => ({ ...item }));
    root.removeAttribute('data-kp-wheel-won');
    if (state.last !== null && !state.items.some((item) => item.id === state.last)) state.last = null;
    void glideTo(root);
    paint(root);
    if (state.items.length === 1) {
        const [only] = state.items;
        root.setAttribute('data-kp-wheel-won', only.id);
        state.last = only.id;
        paint(root);
        drawDisc(root, true);
        root.dispatchEvent(new CustomEvent(WHEEL_RESULT_EVENT, { bubbles: true, detail: { item: { ...only }, index: 0, source: 'only' } }));
    }
}

/**
 * The wheel's state: `loading` lays the busy card over it, `error` says the
 * message where the outcome goes, `ready` is neither.
 * @param {Element} root @param {'loading' | 'error' | 'ready'} kind @param {string} [message]
 */
export function setWheelState(root, kind, message) {
    if (!(root instanceof HTMLElement)) return;
    build(root);
    const state = stateOf(root);
    root.setAttribute('data-kp-state', kind);
    if (kind === 'error') root.setAttribute('data-kp-wheel-error', message ?? getStrings().wheelFailed);
    else root.removeAttribute('data-kp-wheel-error');
    if (kind === 'loading') {
        root.setAttribute('aria-busy', 'true');
        const stage = part(root, 'stage');
        state.busy ??= openBusyCard(stage, { words: message ?? getStrings().wheelLoading, area: () => [stage], className: 'kp-wheel__busy' });
    } else {
        root.removeAttribute('aria-busy');
        const card = state.busy;
        state.busy = null;
        void card?.close();
    }
    paint(root);
}

/** The outcome the wheel stands on, or null. @param {Element} root @returns {WheelItem | null} */
export function getWheelResult(root) {
    const won = root.getAttribute('data-kp-wheel-won');
    const item = stateOf(root).items.find((i) => i.id === won);
    return item ? { ...item } : null;
}

/**
 * Spin: draw the outcome by the weights, turn the wheel to it, say it.
 * Resolves with the outcome (null when it could not spin).
 * @param {Element} root
 * @param {{ random?: () => number }} [options]
 * @returns {Promise<WheelItem | null>}
 */
export async function spinWheel(root, { random = Math.random } = {}) {
    if (!(root instanceof HTMLElement)) return null;
    const state = stateOf(root);
    if (state.spinning || state.items.length < 2 || root.hasAttribute('aria-busy') || root.hasAttribute('data-kp-wheel-error')) return null;
    const avoid = root.getAttribute('data-kp-wheel-repeat') === 'true' ? null : state.last;
    const index = pickWeighted(state.items, { random, avoid });
    if (index < 0) return null;
    const item = state.items[index];
    // Finish a glide first, so the segment the wheel turns to is where it is drawn.
    cancelAnimationFrame(state.glide);
    state.order = state.items.map((i) => i.id);
    state.shown = new Map(state.items.map((i) => [i.id, weightOf(i)]));
    root.removeAttribute('data-kp-wheel-won');
    drawDisc(root, true);
    const [a0, a1] = wheelAngles(state.items.map(weightOf))[index];
    // Somewhere inside the segment, never on its edge.
    const land = a0 + (a1 - a0) * (0.5 + (random() - 0.5) * 0.6);
    const short = reduced();
    const attr = (/** @type {string} */ name) => {
        const raw = root.getAttribute(name);
        const value = raw === null || raw.trim() === '' ? NaN : Number(raw);
        return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
    };
    const fixed = attr('data-kp-wheel-turns');
    const least = attr('data-kp-wheel-turns-min') ?? fixed ?? DEFAULT_TURNS_MIN;
    const most = Math.max(least, attr('data-kp-wheel-turns-max') ?? fixed ?? DEFAULT_TURNS_MAX);
    // Drawn last, from the same source: the weights decided the outcome above, the turns only lengthen the way to it.
    const turns = short ? 0 : least + Math.min(most - least, Math.floor(random() * (most - least + 1)));
    const base = short
        ? Math.max(0, Number(root.getAttribute('data-kp-wheel-reduced-ms') ?? 600))
        : Math.max(0, Number(root.getAttribute('data-kp-wheel-duration') ?? 3600));
    const from = state.angle;
    const rest = (((-land - from) % 360) + 360) % 360;
    const to = from + turns * 360 + rest;
    // The time follows the travel, around the mean travel (the middle turns and half a turn of rest).
    const mean = ((least + most) / 2 + 0.5) * 360;
    const duration = short ? base : base * Math.min(1.4, Math.max(0.6, (to - from) / mean));
    state.spinning = true;
    root.setAttribute('data-kp-wheel-spinning', '');
    part(root, 'result').setAttribute('aria-busy', 'true');
    paint(root);
    root.dispatchEvent(new CustomEvent(WHEEL_SPIN_EVENT, { bubbles: true, detail: { item: { ...item }, index, turns: (to - from) / 360 } }));
    const disc = part(root, 'disc');
    if (duration > 0 && to !== from) {
        const ease = getComputedStyle(root).getPropertyValue('--kp-wheel-ease').trim() || 'cubic-bezier(0.12, 0.6, 0.1, 1)';
        const motion = disc.animate([{ rotate: `${from}deg` }, { rotate: `${to}deg` }], {
            duration,
            easing: short ? 'ease-out' : ease,
            fill: 'forwards',
        });
        await motion.finished.catch(() => undefined);
        disc.style.rotate = `${to}deg`;
        motion.cancel();
    } else disc.style.rotate = `${to}deg`;
    state.angle = to % 360;
    disc.style.rotate = `${state.angle}deg`;
    state.spinning = false;
    state.last = item.id;
    root.removeAttribute('data-kp-wheel-spinning');
    root.setAttribute('data-kp-wheel-won', item.id);
    drawDisc(root, true);
    paint(root);
    const result = part(root, 'result');
    result.removeAttribute('aria-busy');
    // The status region speaks what changed in it once it is no longer busy: the caption and the name, once. The name
    // simply stands there: the box keeps its two lines, so nothing under the wheel moves.
    root.dispatchEvent(new CustomEvent(WHEEL_RESULT_EVENT, { bubbles: true, detail: { item: { ...item }, index, source: 'spin' } }));
    return { ...item };
}

/**
 * Wire every wheel under `scope`: its parts and its Spin button.
 * @param {ParentNode} [scope]
 * @returns {() => void} detach
 */
export function attachWheels(scope = document) {
    const roots = /** @type {HTMLElement[]} */ ([
        ...(scope instanceof HTMLElement && scope.matches(WHEEL) ? [scope] : []),
        ...scope.querySelectorAll(WHEEL),
    ]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const root of roots) {
        if (WIRED.has(root)) continue;
        WIRED.add(root);
        build(root);
        drawDisc(root, true);
        paint(root);
        /** @param {MouseEvent} event */
        const click = (event) => {
            const kiosk = root.hasAttribute('data-kp-wheel-kiosk');
            const target = event.target instanceof Element ? event.target : null;
            const spin = target?.closest(kiosk ? '.kp-wheel__stage, .kp-wheel__result' : '.kp-wheel__spin');
            if (!spin || !root.contains(spin) || root.hasAttribute('aria-busy')) return;
            if (!kiosk && spin.getAttribute('aria-disabled') === 'true') return;
            void spinWheel(root);
        };
        /** Kiosk: Enter or Space on the focused wheel spins it. @param {KeyboardEvent} event */
        const key = (event) => {
            if (!root.hasAttribute('data-kp-wheel-kiosk') || event.target !== part(root, 'stage')) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            void spinWheel(root);
        };
        root.addEventListener('click', click);
        root.addEventListener('keydown', key);
        // The kiosk attribute is live.
        const watch = new MutationObserver(() => paint(root));
        watch.observe(root, { attributes: true, attributeFilter: ['data-kp-wheel-kiosk'] });
        // Labels are cut to their room in the theme's face: again once the fonts are in.
        void document.fonts?.ready.then(() => root.isConnected && !stateOf(root).spinning && drawDisc(root, true));
        undo.push(() => {
            WIRED.delete(root);
            root.removeEventListener('click', click);
            root.removeEventListener('keydown', key);
            watch.disconnect();
        });
    }
    return () => undo.forEach((u) => u());
}
