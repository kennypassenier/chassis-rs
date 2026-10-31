// The lanes beside the focus step: build, paint and lay out.
import { buildProgressbar } from '../progressbar.js';
import { getStrings } from '../strings.js';
import { focusState } from './state.js';
import { el, part, stateOf } from './dom.js';
import { blockerNames, clockOfTimer, laneSummaries, setText, stepLabel } from './blockers.js';
import { opt } from './resume.js';
/** @typedef {import('./blockers.js').Lane} Lane */

/** The lanes and the band, made once, around the head. @param {HTMLElement} root */
export function ensureLanes(root) {
    const found = root.querySelector('.kp-focus-steps__lanes');
    if (found) return found;
    const strings = getStrings();
    focusState.serial += 1;
    const lanes = el('kp-focus-steps__lanes', 'section');
    const title = el('kp-focus-steps__lanes-title', 'h3');
    title.id = `kp-focus-steps-${focusState.serial}-lanes`;
    title.textContent = strings.focusTracksTitle;
    const done = el('kp-focus-steps__lanes-done', 'span');
    const list = el('kp-focus-steps__lane-list');
    // The lanes pick which track is shown, which is what tabs do: a tablist, the step area its tabpanel.
    list.id = `kp-focus-steps-${focusState.serial}-tablist`;
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-orientation', 'vertical');
    list.setAttribute('aria-labelledby', title.id);
    const hint = el('kp-focus-steps__lanes-hint', 'p');
    hint.textContent = strings.focusTracksHint;
    lanes.setAttribute('aria-labelledby', title.id);
    lanes.append(title, done, list, hint);
    const band = el('kp-attention kp-focus-steps__band');
    band.setAttribute('aria-label', strings.focusTrackBand);
    const head = part(root, 'head');
    head.before(band);
    head.after(lanes);
    return lanes;
}
/** Take the lanes and the band away again (the steps no longer name two tracks). @param {HTMLElement} root */
export function dropLanes(root) {
    root.querySelector('.kp-focus-steps__lanes')?.remove();
    root.querySelector('.kp-focus-steps__band')?.remove();
    root.removeAttribute('data-kp-focus-tracked');
    root.removeAttribute('data-kp-lanes-at');
    const panel = root.querySelector('.kp-focus-steps__body');
    for (const name of ['role', 'aria-labelledby']) panel?.removeAttribute(name);
}
/** One lane: a button of the package, its words in four places and the theme's progress bar. @param {Lane} lane @param {number} at */
function buildLane(lane, at) {
    const button = /** @type {HTMLButtonElement} */ (el('kp-button kp-focus-steps__lane', 'button'));
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('data-kp-track-at', String(at));
    button.setAttribute('data-kp-track-key', lane.key);
    for (const name of ['name', 'time', 'step', 'state', 'count']) button.append(el(`kp-focus-steps__lane-${name}`, 'span'));
    const bar = el('kp-progressbar kp-focus-steps__lane-bar', 'span');
    bar.setAttribute('aria-hidden', 'true');
    buildProgressbar(bar);
    bar.removeAttribute('role');
    button.append(bar);
    return button;
}
/**
 * Draw the lanes in place: only a word that changed is written, so a focused lane keeps its focus and the clocks cost nothing.
 * @param {HTMLElement} root @param {Lane[]} [lanes]
 */
export function paintLanes(root, lanes = laneSummaries(root)) {
    const section = root.querySelector('.kp-focus-steps__lanes');
    if (!section) return;
    const strings = getStrings();
    const state = stateOf(root);
    const list = /** @type {HTMLElement} */ (section.querySelector('.kp-focus-steps__lane-list'));
    if (list.children.length !== lanes.length || lanes.some((l, i) => list.children[i]?.getAttribute('data-kp-track-key') !== l.key))
        list.replaceChildren(...lanes.map(buildLane));
    list.style.setProperty('--kp-focus-lanes', String(lanes.length));
    lanes.forEach((lane, i) => {
        const button = /** @type {HTMLElement} */ (list.children[i]);
        const total = lane.track.order.length;
        const words =
            lane.status === 'running' && lane.timer
                ? strings.focusLaneRunning(lane.timer.name)
                : lane.status === 'paused' && lane.timer
                  ? strings.focusLanePaused(lane.timer.name)
                  : lane.status === 'waiting'
                    ? strings.focusLaneWaiting(blockerNames(state, lane.blocks))
                    : lane.status === 'ringing'
                      ? strings.focusLaneRinging
                      : lane.status === 'finished'
                        ? strings.focusLaneFinished
                        : lane.active
                          ? strings.focusLaneHere
                          : strings.focusLaneReady;
        setText(button, '.kp-focus-steps__lane-name', lane.name);
        setText(
            button,
            '.kp-focus-steps__lane-time',
            lane.timer ? (lane.status === 'ringing' ? clockOfTimer({ ...lane.timer, remaining: 0 }) : clockOfTimer(lane.timer)) : '',
        );
        setText(button, '.kp-focus-steps__lane-step', stepLabel(state, lane.track.order[lane.track.pos] ?? 0));
        setText(button, '.kp-focus-steps__lane-state', words);
        setText(button, '.kp-focus-steps__lane-count', strings.focusLaneStep(lane.track.pos + 1, total));
        if (button.getAttribute('data-kp-lane-status') !== lane.status) button.setAttribute('data-kp-lane-status', lane.status);
        // Tabs pattern: one tab stop (the selected lane), the arrows move between lanes, the step area is the tabpanel.
        const selected = String(lane.active);
        if (button.getAttribute('aria-selected') !== selected) button.setAttribute('aria-selected', selected);
        const stop = lane.active ? '0' : '-1';
        if (button.getAttribute('tabindex') !== stop) button.setAttribute('tabindex', stop);
        if (!button.id) button.id = `${list.id}-${i}`;
        if (lane.active) {
            const panel = root.querySelector('.kp-focus-steps__body');
            if (panel) {
                if (!panel.id) panel.id = `${list.id}-panel`;
                if (panel.getAttribute('role') !== 'tabpanel') panel.setAttribute('role', 'tabpanel');
                if (panel.getAttribute('aria-labelledby') !== button.id) panel.setAttribute('aria-labelledby', button.id);
                if (button.getAttribute('aria-controls') !== panel.id) button.setAttribute('aria-controls', panel.id);
            }
        } else button.removeAttribute('aria-controls');
        const share = String(lane.status === 'finished' ? 1 : (lane.track.pos + 1) / total);
        const bar = /** @type {HTMLElement} */ (button.querySelector('.kp-focus-steps__lane-bar'));
        if (bar.style.getPropertyValue('--kp-value') !== share) bar.style.setProperty('--kp-value', share);
    });
    setText(section, '.kp-focus-steps__lanes-done', strings.focusTracksDone(state.done.size, state.steps.length));
}
/** Which side the lanes stand on: beside the step on a wide root, above it on a narrow one. @param {HTMLElement} root */
export function layoutLanes(root) {
    const asked = opt(root, 'lanes', 'auto');
    const rem = Number.parseFloat(getComputedStyle(root).fontSize) || 16;
    const at = asked === 'side' || asked === 'top' ? asked : root.clientWidth >= 44 * rem ? 'side' : 'top';
    if (root.getAttribute('data-kp-lanes-at') !== at) root.setAttribute('data-kp-lanes-at', at);
}
