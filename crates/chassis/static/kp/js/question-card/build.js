// The card's elements: the head, the time with its measure, the answer buttons with their consequences, the outcome, Dismiss and the voice.

import { getStrings } from '../strings.js';
import { RING_BOX, RING_CENTRE, RING_RADIUS } from './values.js';

/** @typedef {import('./spec.js').ResolvedQuestion} ResolvedQuestion */

/**
 * @typedef {object} CardParts
 * @property {HTMLElement} card
 * @property {HTMLElement} left the time left, in words
 * @property {Map<string, HTMLButtonElement>} buttons by answer value
 * @property {HTMLElement} outcome
 * @property {HTMLButtonElement} dismiss
 * @property {HTMLElement} voice a hidden status that speaks
 */

/** @param {Document} doc @param {string} tag @param {string} className @param {string} [text] */
const make = (doc, tag, className, text = '') => {
    const node = doc.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
};

/** The ring or the bar that shrinks over the whole wait; none for `text`. @param {Document} doc @param {ResolvedQuestion['countdown']} countdown */
function buildMeasure(doc, countdown) {
    if (countdown === 'bar') {
        const measure = make(doc, 'span', 'kp-question__bar');
        measure.setAttribute('aria-hidden', 'true');
        measure.append(make(doc, 'span', 'kp-question__fill'));
        return measure;
    }
    if (countdown !== 'ring') return null;
    const measure = make(doc, 'span', 'kp-question__ring');
    measure.setAttribute('aria-hidden', 'true');
    const circle = (/** @type {string} */ className, /** @type {string} */ extra = '') =>
        `<circle class="${className}" cx="${RING_CENTRE}" cy="${RING_CENTRE}" r="${RING_RADIUS}"${extra}/>`;
    measure.innerHTML = `<svg viewBox="0 0 ${RING_BOX} ${RING_BOX}">${circle('kp-question__ring-track')}${circle('kp-question__ring-fill', ' pathLength="100"')}</svg>`;
    return measure;
}

/** The answer buttons, each with its consequence under it. @param {Document} doc @param {HTMLElement} card @param {ResolvedQuestion['answers']} answers */
function buildAnswers(doc, card, answers) {
    const list = make(doc, 'div', 'kp-question__answers');
    /** @type {Map<string, HTMLButtonElement>} */
    const buttons = new Map();
    answers.forEach((a, at) => {
        const row = make(doc, 'div', 'kp-question__answer');
        const button = /** @type {HTMLButtonElement} */ (
            make(doc, 'button', `kp-button kp-question__button${a.tone === 'destructive' ? ' kp-button--destructive' : ''}`)
        );
        button.type = 'button';
        button.textContent = a.label;
        button.setAttribute('data-kp-value', a.value);
        button.setAttribute('aria-keyshortcuts', String(at + 1));
        const why = make(doc, 'span', 'kp-question__consequence', a.consequence ?? '');
        why.id = `${card.id}-c${at}`;
        if (a.consequence) button.setAttribute('aria-describedby', why.id);
        row.append(button, why);
        list.append(row);
        buttons.set(a.value, button);
    });
    return { list, buttons };
}

/**
 * Build a question card.
 * @param {Document} doc
 * @param {import('../question-card.js').QuestionSpec} spec
 * @param {ResolvedQuestion} q
 * @returns {CardParts}
 */
export function buildCard(doc, spec, q) {
    const s = getStrings();
    const card = make(doc, 'article', 'kp-question kp-alert kp-alert--warning');
    card.id ||= `kp-question-${spec.id}`;
    card.tabIndex = 0;
    card.setAttribute('role', 'group');
    card.setAttribute('data-kp-key', spec.id);
    card.setAttribute('data-kp-measure', q.countdown);
    const head = make(doc, 'div', 'kp-question__head');
    const title = make(doc, 'strong', 'kp-question__title', spec.question);
    title.id = `${card.id}-title`;
    card.setAttribute('aria-labelledby', title.id);
    head.append(title);
    if (spec.text) head.append(make(doc, 'span', 'kp-question__text', spec.text));
    const time = make(doc, 'div', 'kp-question__time');
    const left = make(doc, 'span', 'kp-question__left');
    const ifNobody = make(doc, 'span', 'kp-question__default', q.fallback ? s.questionDefault(q.fallback.label) : '');
    const measure = buildMeasure(doc, q.countdown);
    time.append(...(measure ? [measure] : []), left, ifNobody);
    const { list, buttons } = buildAnswers(doc, card, q.answers);
    const outcome = make(doc, 'p', 'kp-question__outcome');
    outcome.setAttribute('role', 'status');
    outcome.hidden = true;
    const dismiss = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-button--sm kp-question__dismiss', s.questionDismiss));
    dismiss.type = 'button';
    dismiss.hidden = true;
    const voice = make(doc, 'span', 'kp-sr-only');
    voice.setAttribute('role', 'status');
    card.append(head, time, list, outcome, dismiss, voice);
    return { card, left, buttons, outcome, dismiss, voice };
}
