// Builds the parts of a viewer and applies its tools.
import { getStrings } from '../strings.js';
import { el } from './model.js';
import { toolsOf } from './reads.js';
import { logViewerState } from './state.js';

/** Build the bar, the stage and the foot once. @param {HTMLElement} root */
export function ensureParts(root) {
    if (root.querySelector(':scope > .kp-logviewer__stage')) return;
    root.classList.add('kp-logviewer');
    logViewerState.serial += 1;
    const s = getStrings();
    if (!root.hasAttribute('aria-label') && !root.hasAttribute('aria-labelledby')) root.setAttribute('aria-label', s.logviewerLabel);
    root.setAttribute('role', 'group');
    const id = `kp-logviewer-${logViewerState.serial}`;

    const bar = el('kp-logviewer__bar');
    const search = el('kp-logviewer__search');
    const field = /** @type {HTMLInputElement} */ (el('kp-field__input kp-logviewer__find', 'input'));
    field.type = 'search';
    field.id = `${id}-find`;
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('spellcheck', 'false');
    field.setAttribute('aria-label', s.logviewerSearch);
    field.placeholder = s.logviewerSearchHint;
    const matches = el('kp-logviewer__matches', 'span');
    /** @param {string} step @param {string} glyph @param {string} words */
    const stepper = (step, glyph, words) => {
        const button = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-button--sm kp-logviewer__step', 'button'));
        button.type = 'button';
        button.setAttribute('data-kp-logviewer-step', step);
        button.setAttribute('aria-label', words);
        button.title = words;
        const mark = el('kp-logviewer__glyph', 'span');
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = glyph;
        button.append(mark);
        return button;
    };
    const previous = stepper('-1', '\u2191', s.logviewerPrevious);
    const next = stepper('1', '\u2193', s.logviewerNext);
    const only = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm', 'button'));
    only.type = 'button';
    only.setAttribute('data-kp-logviewer-only', '');
    only.textContent = s.logviewerOnly;
    search.append(field, matches, previous, next, only);

    const tools = el('kp-logviewer__tools');
    const follow = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm kp-logviewer__follow', 'button'));
    follow.type = 'button';
    follow.setAttribute('data-kp-follow-toggle', id);
    // The pill's draw() sets this too, but a draw inside a lazy attach cannot see a button that attach
    // has just built (js/as-of.js), so it starts here, pressed only while the log is held.
    follow.setAttribute('aria-pressed', 'false');
    follow.textContent = s.newpillPause;
    const wrap = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm', 'button'));
    wrap.type = 'button';
    wrap.setAttribute('data-kp-logviewer-wrap', '');
    wrap.textContent = s.logviewerWrap;
    const time = el('kp-segmented kp-logviewer__time', 'div');
    time.setAttribute('data-kp-segmented', 'single');
    time.setAttribute('data-kp-logviewer-time', '');
    time.setAttribute('role', 'radiogroup');
    time.setAttribute('aria-label', s.logviewerTimeLabel);
    for (const [value, words] of /** @type {const} */ ([
        ['time', s.logviewerTimeShort],
        ['datetime', s.logviewerTimeFull],
        ['off', s.logviewerTimeOff],
    ])) {
        const item = /** @type {HTMLButtonElement} */ (el('kp-segmented__item', 'button'));
        item.type = 'button';
        item.setAttribute('role', 'radio');
        item.setAttribute('data-value', value);
        const label = el('kp-segmented__label', 'span');
        label.textContent = words;
        item.append(label);
        time.append(item);
    }
    const levelWrap = el('kp-logviewer__level-wrap');
    const levelLabel = el('kp-logviewer__level-label', 'label');
    levelLabel.setAttribute('for', `${id}-level`);
    levelLabel.textContent = s.logviewerLevel;
    const level = /** @type {HTMLSelectElement} */ (el('kp-field__input kp-logviewer__level', 'select'));
    level.id = `${id}-level`;
    for (const [value, words] of [
        ['debug', s.logviewerLevelAll],
        ['info', s.logviewerLevelFrom('info')],
        ['warning', s.logviewerLevelFrom('warning')],
        ['error', s.logviewerLevelFrom('error')],
    ]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = words;
        level.append(option);
    }
    levelWrap.append(levelLabel, level);
    const copy = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm', 'button'));
    copy.type = 'button';
    copy.setAttribute('data-kp-logviewer-copy', '');
    copy.setAttribute('data-kp-flash-words', `${s.logviewerCopied},${s.logviewerNotCopied}`);
    copy.setAttribute('data-kp-refusal', 'toast');
    copy.setAttribute('data-kp-disabled-reason', s.logviewerNothing);
    copy.textContent = s.logviewerCopy;
    const download = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm', 'button'));
    download.type = 'button';
    download.setAttribute('data-kp-logviewer-download', '');
    download.setAttribute('data-kp-disabled-reason', s.logviewerNothing);
    download.textContent = s.logviewerDownload;
    tools.append(follow, wrap, time, levelWrap, copy, download);
    bar.append(search, tools);

    const stage = el('kp-logviewer__stage');
    const log = el('kp-log kp-logviewer__log');
    log.id = id;
    log.setAttribute('data-kp-follow', 'tail');
    log.setAttribute('data-kp-pill-unit', s.logviewerUnit);
    log.setAttribute('data-kp-follow-space', '');
    log.setAttribute('tabindex', '0');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'off');
    stage.append(log);

    const foot = el('kp-logviewer__foot');
    const count = el('kp-logviewer__count', 'span');
    const dropped = el('kp-logviewer__dropped', 'span');
    dropped.hidden = true;
    foot.append(count, dropped);
    root.append(bar, stage, foot);
}

/** Hide the tools the page did not ask for. @param {HTMLElement} root */
export function applyTools(root) {
    const wanted = toolsOf(root);
    const bar = root.querySelector('.kp-logviewer__bar');
    if (!bar) return;
    const map = /** @type {[string, string][]} */ ([
        ['search', '.kp-logviewer__search'],
        ['follow', '.kp-logviewer__follow'],
        ['wrap', '[data-kp-logviewer-wrap]'],
        ['time', '.kp-logviewer__time'],
        ['level', '.kp-logviewer__level-wrap'],
        ['copy', '[data-kp-logviewer-copy]'],
        ['download', '[data-kp-logviewer-download]'],
    ]);
    for (const [name, selector] of map) {
        for (const node of /** @type {NodeListOf<HTMLElement>} */ (bar.querySelectorAll(selector))) {
            const anchor = node.closest('.kp-tooltip-anchor') ?? node;
            /** @type {HTMLElement} */ (anchor).hidden = !wanted.includes(name);
        }
    }
    const tools = /** @type {HTMLElement} */ (bar.querySelector('.kp-logviewer__tools'));
    const search = /** @type {HTMLElement} */ (bar.querySelector('.kp-logviewer__search'));
    tools.hidden = ![...tools.children].some((c) => !(/** @type {HTMLElement} */ (c).hidden));
    search.hidden = !wanted.includes('search');
    /** @type {HTMLElement} */ (bar).hidden = tools.hidden && search.hidden;
}
