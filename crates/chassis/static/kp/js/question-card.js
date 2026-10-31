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
//
// Each card is one QuestionRun (js/question-card/run.js over core.js, on js/controller.js; the card is its host, built by build.js from the spec that
// spec.js resolves); the tab title is title.js. The parts are listed in js/README.md.

import { attachOne, controllerOf, hostsOf } from './controller.js';
import { getStrings } from './strings.js';
import { buildCard } from './question-card/build.js';
import { QuestionRun } from './question-card/run.js';
import { resolveQuestion } from './question-card/spec.js';
import { QUESTIONS } from './question-card/values.js';

export { QUESTIONS, QUESTION_ANSWER_EVENT, QUESTION_EXPIRE_EVENT, QUESTION_DISMISS_EVENT, QUESTION_URGENT_AT } from './question-card/values.js';

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

/**
 * The handle of a card.
 * @param {Element} element
 * @returns {(QuestionHandle & { stop: () => void }) | null}
 */
export function questionOf(element) {
    return controllerOf(element, QuestionRun)?.handle ?? null;
}

/**
 * Ask a question: put a card in `container` (oldest first).
 * @param {HTMLElement} container a `[data-kp-questions]` (or any element)
 * @param {QuestionSpec} spec
 * @param {{ now?: () => number, frozen?: boolean }} [options] `now` is the clock; `frozen` stops the countdown's motion and its tick (a still demonstration)
 * @returns {QuestionHandle}
 */
export function askQuestion(container, spec, { now = () => Date.now(), frozen = false } = {}) {
    const q = resolveQuestion(spec, now);
    const parts = buildCard(container.ownerDocument, spec, q);
    const run = attachOne(parts.card, QuestionRun, { container, spec, q, parts, now, frozen });
    if (!run) throw new Error('The question card could not be set up; the cause was reported.');
    return run.handle;
}

/**
 * Make every `[data-kp-questions]` container a labelled region; the cards are made with askQuestion().
 * @param {ParentNode} [root]
 * @returns {() => void} detach: stops every card's clock
 */
export function attachQuestions(root = document) {
    const found = hostsOf(root, QUESTIONS);
    for (const container of found) {
        if (!container.hasAttribute('role')) container.setAttribute('role', 'region');
        if (!container.hasAttribute('aria-label') && !container.hasAttribute('aria-labelledby'))
            container.setAttribute('aria-label', getStrings().questionsLabel);
    }
    return () => {
        for (const container of found)
            for (const card of container.querySelectorAll(':scope > .kp-question')) controllerOf(card, QuestionRun)?.stop();
    };
}
