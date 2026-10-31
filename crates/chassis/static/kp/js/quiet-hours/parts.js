// The elements of one control, built but not yet placed: the switch, the label-and-control rows, the problem line, the summary, the reason and the loading bars.

import { WAIT_BONES } from './values.js';

/** @param {Document} doc @param {string} className @param {string} [tag] */
export function make(doc, className, tag = 'div') {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
}

/** The switch. @param {Document} doc */
function buildSwitch(doc) {
    const onLabel = /** @type {HTMLLabelElement} */ (make(doc, 'kp-switch kp-quiet__on', 'label'));
    const onInput = /** @type {HTMLInputElement} */ (make(doc, 'kp-switch__input', 'input'));
    onInput.type = 'checkbox';
    onInput.setAttribute('role', 'switch');
    const onWords = make(doc, 'kp-quiet__on-label', 'span');
    onLabel.append(onInput, onWords);
    return { onLabel, onInput, onWords };
}

/** One label | control row of the body grid. @param {Document} doc @param {string} id @param {string} name @param {string} text @param {HTMLElement} control */
function buildField(doc, id, name, text, control) {
    const row = make(doc, `kp-quiet__field kp-quiet__field--${name}`);
    const label = make(doc, 'kp-quiet__label kp-field__label', 'span');
    label.id = `${id}-${name}`;
    label.textContent = text;
    row.append(label, control);
    return row;
}

/**
 * @param {Document} doc @param {string} id
 * @param {import('../strings.js').Strings} s
 */
export function buildQuiet(doc, id, s) {
    const { onLabel, onInput, onWords } = buildSwitch(doc);
    const body = make(doc, 'kp-quiet__body');
    const fromBox = make(doc, 'kp-time');
    fromBox.setAttribute('data-kp-time', '');
    fromBox.setAttribute('data-kp-name', `${id}-from`);
    const toBox = make(doc, 'kp-time');
    toBox.setAttribute('data-kp-time', '');
    toBox.setAttribute('data-kp-name', `${id}-to`);
    const dayBox = make(doc, 'kp-weekdays');
    dayBox.setAttribute('data-kp-weekdays', '');
    dayBox.setAttribute('data-kp-presets', 'weekdays,weekend,every');
    const through = make(doc, 'kp-quiet__through');
    through.setAttribute('role', 'group');
    const rows = [
        buildField(doc, id, 'from', s.quietFrom, fromBox),
        buildField(doc, id, 'to', s.quietTo, toBox),
        buildField(doc, id, 'days', s.quietDays, dayBox),
        buildField(doc, id, 'through', s.quietThroughLabel, through),
    ];
    through.setAttribute('aria-labelledby', `${id}-through`);
    const problem = make(doc, 'kp-quiet__problem kp-field__error', 'p');
    problem.id = `${id}-problem`;
    problem.hidden = true;
    body.append(...rows, problem);
    const summary = make(doc, 'kp-quiet__summary', 'p');
    summary.id = `${id}-summary`;
    summary.setAttribute('aria-live', 'polite');
    const reason = make(doc, 'kp-quiet__reason kp-field__help', 'p');
    reason.hidden = true;
    const wait = make(doc, 'kp-quiet__wait');
    wait.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < WAIT_BONES; i += 1) wait.append(make(doc, 'kp-skeleton kp-quiet__bone', 'span'));
    return { onLabel, onInput, onWords, body, fromBox, toBox, dayBox, through, problem, summary, reason, wait };
}
