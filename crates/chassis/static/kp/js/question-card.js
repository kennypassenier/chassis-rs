// The question card: the host waits for your answer [kpadopt5-ops; spec item 19].
//
// homelab's ask card (js/asksui.js): a question, what each answer sets in motion, and how long it still waits. The app
// asks, the person answers, the app sends and says whether it worked; the card shows every step:
//
//   const card = askQuestion(document.querySelector('[data-kp-questions]'), {
//       id: 'op-42',
//       question: 'Remove the old backups?',
//       text: 'The host asks before it deletes 14 backups.',
//       deadline: Date.now() + 90_000,
//       answers: [
//           { value: 'allow', label: 'Allow', consequence: 'Deletes 14 backups (3.2 GB) and goes on.', outcome: 'Allowed. The operation goes on.' },
//           { value: 'stop', label: 'Stop', consequence: 'Keeps everything and stops the operation.', outcome: 'Stopped. Nothing was deleted.', tone: 'destructive' },
//       ],
//       defaultAnswer: 'stop',
//   });
//   container.addEventListener('kp-question-answer', (e) => send(e.detail.value).then(() => e.detail.respond(true), (why) => e.detail.respond(false, String(why))));
//
// Options of a question, each an attribute on the card too (data-kp-<name>):
//
//   deadline         ISO string or epoch ms; required; the card counts to it
//   asked            when it was asked (default: now); the countdown bar is measured from it
//   default-answer   the value that happens at zero, said on the card ("If nobody answers: stops")
//   urgent-at        seconds (default 30): from here the card is stronger and its time bold, announced once
//   expired          keep (default; Kenny, 2026-10-17: "Kaart blijft met de uitkomst") | remove: what the card does at zero
//   measure          ring (default, Kenny 2026-10-17) | bar | text: how the time left is drawn (`countdown` in the JS options; not
//                    `data-kp-countdown`, which is the digit timer's)
//
// States (`data-kp-state`): waiting; urgent; sending (the buttons busy); answered ("Allowed. The operation goes on.");
// refused ("Not sent: why. Nothing changed; answer again."); expired (the default answer's outcome, the buttons off).
// Several open questions stack, oldest first. A finished card stays with its outcome and a Dismiss button.
//
// What it does for the person: each button's consequence is in its aria-describedby; keys 1 to n answer when the card has
// the focus; the tab title carries "(1) waiting" while a question is open (`data-kp-title="off"` on the container leaves it
// alone); on a phone the buttons are full width with their consequences under them.
//
// Events (bubbling, on the card):
//   kp-question-answer   { id, value, respond(ok, why?) }   the person answered; the app sends and calls respond
//   kp-question-expire   { id, defaultAnswer }              the time ran out unanswered
//   kp-question-dismiss  { id }                             a finished card was dismissed
//
// Every word is in js/strings.js. Nothing runs on import.

import { humanDuration } from './freshness.js';
import { leave } from './motion.js';
import { getStrings } from './strings.js';

/** A container of questions. */
export const QUESTIONS = '[data-kp-questions]';
/** Fired when an answer was chosen. */
export const QUESTION_ANSWER_EVENT = 'kp-question-answer';
/** Fired when the time ran out. */
export const QUESTION_EXPIRE_EVENT = 'kp-question-expire';
/** Fired when a finished card was dismissed. */
export const QUESTION_DISMISS_EVENT = 'kp-question-dismiss';
/** Seconds before the end from which a card is urgent. */
export const QUESTION_URGENT_AT = 30;

/**
 * @typedef {object} QuestionAnswer
 * @property {string} value
 * @property {string} label
 * @property {string} [consequence] what this answer sets in motion
 * @property {string} [outcome] what the card says once it is chosen and sent
 * @property {'destructive' | 'primary' | ''} [tone] a destructive answer is drawn as one
 * @typedef {object} QuestionSpec
 * @property {string} id
 * @property {string} question
 * @property {string} [text]
 * @property {number | string} deadline ISO or epoch ms
 * @property {number | string} [asked]
 * @property {QuestionAnswer[]} [answers] default: Allow and Stop
 * @property {string} [defaultAnswer]
 * @property {number} [urgentAt]
 * @property {'keep' | 'remove'} [expired]
 * @property {'bar' | 'ring' | 'text'} [countdown]
 * @typedef {object} QuestionHandle
 * @property {HTMLElement} element
 * @property {string} id
 * @property {() => string} state
 * @property {(value: string) => void} answer choose an answer as if the person had
 * @property {() => void} dismiss
 */

/** @type {WeakMap<Element, QuestionHandle & { stop: () => void }>} */
const handles = new WeakMap();
/** @type {Set<HTMLElement>} */
const open = new Set();
let baseTitle = '';
let titleOn = false;

/** The handle of a card. @param {Element} element */
export const questionOf = (element) => handles.get(element) ?? null;

/** @param {number | string | undefined} value @returns {number | null} */
const toMs = (value) => {
    if (value === undefined) return null;
    const ms = typeof value === 'number' ? value : /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
};

/** The tab title says how many questions wait. */
function paintTitle() {
    if (typeof document === 'undefined') return;
    const count = [...open].filter(
        (c) =>
            c.isConnected &&
            (c.getAttribute('data-kp-state') === 'waiting' || c.getAttribute('data-kp-state') === 'urgent') &&
            c.closest(QUESTIONS)?.getAttribute('data-kp-title') !== 'off',
    ).length;
    const on = count > 0;
    if (!titleOn && on) baseTitle = document.title;
    if (on) document.title = `${getStrings().questionWaiting(count)} ${baseTitle}`;
    else if (titleOn) document.title = baseTitle;
    titleOn = on;
}

/**
 * Ask a question: put a card in `container` (oldest first).
 * @param {HTMLElement} container a `[data-kp-questions]` (or any element)
 * @param {QuestionSpec} spec
 * @param {{ now?: () => number, frozen?: boolean }} [options] `now` is the clock; `frozen` stops the countdown's motion and its tick (a still demonstration)
 * @returns {QuestionHandle}
 */
export function askQuestion(container, spec, { now = () => Date.now(), frozen = false } = {}) {
    const doc = container.ownerDocument;
    const view = /** @type {Window} */ (doc.defaultView);
    const s = () => getStrings();
    const deadline = toMs(spec.deadline) ?? now();
    const asked = toMs(spec.asked) ?? now();
    const urgentAt = (spec.urgentAt ?? QUESTION_URGENT_AT) * 1000;
    const answers = spec.answers ?? [
        { value: 'allow', label: s().questionAllow },
        { value: 'stop', label: s().questionStop, tone: /** @type {const} */ ('destructive') },
    ];
    const countdown = spec.countdown ?? 'ring';
    const expiredMode = spec.expired ?? 'keep';
    const make = (/** @type {string} */ tag, /** @type {string} */ className, /** @type {string} */ text = '') => {
        const node = doc.createElement(tag);
        node.className = className;
        if (text) node.textContent = text;
        return node;
    };

    const card = make('article', 'kp-question kp-alert kp-alert--warning');
    card.id ||= `kp-question-${spec.id}`;
    card.tabIndex = 0;
    card.setAttribute('role', 'group');
    card.setAttribute('data-kp-key', spec.id);
    card.setAttribute('data-kp-measure', countdown);
    const head = make('div', 'kp-question__head');
    const title = make('strong', 'kp-question__title', spec.question);
    title.id = `${card.id}-title`;
    card.setAttribute('aria-labelledby', title.id);
    head.append(title);
    if (spec.text) head.append(make('span', 'kp-question__text', spec.text));
    const time = make('div', 'kp-question__time');
    const left = make('span', 'kp-question__left');
    const fallback = answers.find((a) => a.value === spec.defaultAnswer);
    const ifNobody = make('span', 'kp-question__default', fallback ? s().questionDefault(fallback.label) : '');
    /** @type {HTMLElement | null} */
    let measure = null;
    if (countdown === 'bar') {
        measure = make('span', 'kp-question__bar');
        measure.setAttribute('aria-hidden', 'true');
        measure.append(make('span', 'kp-question__fill'));
    } else if (countdown === 'ring') {
        measure = make('span', 'kp-question__ring');
        measure.setAttribute('aria-hidden', 'true');
        measure.innerHTML =
            '<svg viewBox="0 0 36 36"><circle class="kp-question__ring-track" cx="18" cy="18" r="15.9155"/><circle class="kp-question__ring-fill" cx="18" cy="18" r="15.9155" pathLength="100"/></svg>';
    }
    time.append(...(measure ? [measure] : []), left, ifNobody);
    const list = make('div', 'kp-question__answers');
    /** @type {Map<string, HTMLButtonElement>} */
    const buttons = new Map();
    answers.forEach((a, at) => {
        const row = make('div', 'kp-question__answer');
        const button = /** @type {HTMLButtonElement} */ (
            make('button', `kp-button kp-question__button${a.tone === 'destructive' ? ' kp-button--destructive' : ''}`)
        );
        button.type = 'button';
        button.textContent = a.label;
        button.setAttribute('data-kp-value', a.value);
        button.setAttribute('aria-keyshortcuts', String(at + 1));
        const why = make('span', 'kp-question__consequence', a.consequence ?? '');
        why.id = `${card.id}-c${at}`;
        if (a.consequence) button.setAttribute('aria-describedby', why.id);
        row.append(button, why);
        list.append(row);
        buttons.set(a.value, button);
    });
    const outcome = make('p', 'kp-question__outcome');
    outcome.setAttribute('role', 'status');
    outcome.hidden = true;
    const dismiss = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-button--sm kp-question__dismiss', s().questionDismiss));
    dismiss.type = 'button';
    dismiss.hidden = true;
    const voice = make('span', 'kp-sr-only');
    voice.setAttribute('role', 'status');
    card.append(head, time, list, outcome, dismiss, voice);

    /** @type {'waiting' | 'urgent' | 'sending' | 'answered' | 'refused' | 'expired'} */
    let state = 'waiting';
    let announcedUrgent = false;
    let timer = 0;
    let sentValue = '';

    const flavour = () => {
        card.classList.toggle('kp-alert--warning', state === 'waiting' || state === 'sending');
        card.classList.toggle('kp-alert--destructive', state === 'urgent' || state === 'refused');
        card.classList.toggle('kp-alert--success', state === 'answered');
        card.classList.toggle('kp-alert--info', false);
    };
    const setState = (/** @type {typeof state} */ next) => {
        state = next;
        card.setAttribute('data-kp-state', next);
        card.toggleAttribute('aria-busy', next === 'sending');
        flavour();
        const live = next === 'waiting' || next === 'urgent' || next === 'refused';
        for (const b of buttons.values()) {
            b.disabled = !live;
            b.toggleAttribute('aria-busy', next === 'sending' && b.getAttribute('data-kp-value') === sentValue);
        }
        dismiss.hidden = !(next === 'answered' || next === 'expired');
        paintTitle();
    };
    const paintTime = () => {
        const remaining = deadline - now();
        const text = humanDuration(Math.max(0, Math.ceil(remaining / 1000)), s());
        if (state === 'answered' || state === 'expired') {
            left.textContent = '';
            return;
        }
        left.textContent = remaining > 0 ? s().questionLeft(text) : s().questionTimeUp;
        if ((state === 'waiting' || state === 'urgent') && remaining > 0) {
            const urgent = remaining <= urgentAt;
            if (urgent && state === 'waiting') {
                setState('urgent');
                if (!announcedUrgent) {
                    announcedUrgent = true;
                    voice.textContent = s().questionUrgent(text);
                }
            }
        }
        if (remaining <= 0 && (state === 'waiting' || state === 'urgent')) expire();
    };
    const run = () => {
        // The shrinking measure is one CSS animation over the whole wait, started part-way in.
        const total = Math.max(1, deadline - asked);
        const elapsed = Math.min(total, Math.max(0, now() - asked));
        card.style.setProperty('--kp-question-total', `${total}ms`);
        card.style.setProperty('--kp-question-elapsed', `-${elapsed}ms`);
        card.toggleAttribute('data-kp-frozen', frozen);
    };
    /** Show what the card says once it has an outcome. @param {string} text */
    const say = (text) => {
        outcome.textContent = text;
        outcome.hidden = !text;
    };
    function expire() {
        if (state === 'expired' || state === 'answered') return;
        view.clearInterval(timer);
        const a = fallback;
        sentValue = '';
        setState('expired');
        say(a ? (a.outcome ? `${s().questionNobody} ${a.outcome}` : s().questionNobodyDefault(a.label)) : s().questionNobody);
        card.dispatchEvent(new CustomEvent(QUESTION_EXPIRE_EVENT, { bubbles: true, detail: { id: spec.id, defaultAnswer: a?.value ?? null } }));
        if (expiredMode === 'remove') void remove();
    }
    async function remove() {
        view.clearInterval(timer);
        open.delete(card);
        paintTitle();
        handles.delete(card);
        await leave(card);
    }
    /** @param {string} value */
    function choose(value) {
        if (state !== 'waiting' && state !== 'urgent' && state !== 'refused') return;
        const picked = answers.find((a) => a.value === value);
        if (!picked) return;
        sentValue = value;
        say('');
        setState('sending');
        let responded = false;
        const respond = (/** @type {boolean} */ ok, /** @type {string} */ why = '') => {
            if (responded || state !== 'sending') return;
            responded = true;
            if (ok) {
                view.clearInterval(timer);
                setState('answered');
                say(picked.outcome ?? s().questionAnswered(picked.label));
                voice.textContent = outcome.textContent ?? '';
                paintTime();
            } else {
                // Refused is the card's own state until the person answers again.
                setState('refused');
                say(s().questionRefused(why));
                voice.textContent = outcome.textContent ?? '';
                paintTitle();
            }
        };
        card.dispatchEvent(new CustomEvent(QUESTION_ANSWER_EVENT, { bubbles: true, detail: { id: spec.id, value, respond } }));
    }

    card.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const button = target?.closest('.kp-question__button');
        if (button instanceof HTMLButtonElement && !button.disabled) choose(button.getAttribute('data-kp-value') ?? '');
        else if (target?.closest('.kp-question__dismiss')) {
            card.dispatchEvent(new CustomEvent(QUESTION_DISMISS_EVENT, { bubbles: true, detail: { id: spec.id } }));
            void remove();
        }
    });
    card.addEventListener('keydown', (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const n = Number(event.key);
        if (Number.isInteger(n) && n >= 1 && n <= answers.length && !(event.target instanceof HTMLInputElement)) {
            const a = answers[n - 1];
            if (a) {
                event.preventDefault();
                choose(a.value);
            }
        }
    });

    // Oldest first: a card goes before the first one asked later.
    const later = /** @type {HTMLElement[]} */ ([...container.querySelectorAll(':scope > .kp-question')]).find(
        (c) => Number(c.getAttribute('data-kp-asked')) > asked,
    );
    card.setAttribute('data-kp-asked', String(asked));
    if (later) later.before(card);
    else container.append(card);
    open.add(card);
    setState('waiting');
    run();
    paintTime();
    if (!frozen) timer = view.setInterval(paintTime, 1000);

    /** @type {QuestionHandle & { stop: () => void }} */
    const handle = {
        element: card,
        id: spec.id,
        state: () => state,
        answer: choose,
        dismiss: () => void remove(),
        stop: () => {
            view.clearInterval(timer);
            open.delete(card);
        },
    };
    handles.set(card, handle);
    return handle;
}

/**
 * Make every `[data-kp-questions]` container a labelled region; the cards are made with askQuestion().
 * @param {ParentNode} [root]
 * @returns {() => void} detach: stops every card's clock
 */
export function attachQuestions(root = document) {
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(QUESTIONS) ? [root] : []),
        ...root.querySelectorAll(QUESTIONS),
    ]);
    for (const container of found) {
        if (!container.hasAttribute('role')) container.setAttribute('role', 'region');
        if (!container.hasAttribute('aria-label') && !container.hasAttribute('aria-labelledby'))
            container.setAttribute('aria-label', getStrings().questionsLabel);
    }
    return () => {
        for (const container of found) for (const card of container.querySelectorAll(':scope > .kp-question')) handles.get(card)?.stop();
    };
}
