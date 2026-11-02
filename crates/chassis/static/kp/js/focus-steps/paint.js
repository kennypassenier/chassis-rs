// Paints the focused step.
import { getStrings } from '../strings.js';
import { statePlate } from '../state-plate.js';
import { appendBody } from './detail.js';
import { el, part, stateOf } from './dom.js';
import { answering, buildResumeAsk, emptyAction, lastIndex, onSummary, opt, summaryOn } from './resume.js';
import { activeTrack, timerStates, tracksOn } from './tracks.js';
import { dropLanes, ensureLanes, layoutLanes, paintLanes } from './lanes.js';
import { blockersOf, laneSummaries } from './blockers.js';
import { buildAnswer, buildSummary } from './answer-ui.js';
import { paintAnswerState } from './flow.js';
import { needsList, timerButton, waitBlock } from './paint-extras.js';
import { suggestion } from './band.js';
import { paintLive } from './track-nav.js';

/** Write the step shown, its count and bar, and the buttons. @param {HTMLElement} root @param {boolean} arrive */
export function paint(root, arrive) {
    const strings = getStrings();
    const state = stateOf(root);
    const { steps, index } = state;
    const total = steps.length;
    const step = steps[index];
    const asking = answering(root);
    const onSum = onSummary(root);
    // Parallel tracks: the lanes and the band stand around the head; the count and the bar are the active track's own.
    const tracked = tracksOn(root);
    const track = tracked ? activeTrack(state) : undefined;
    // Loading, empty and failed take the whole box: no lanes stand beside a plate.
    const showLanes = tracked && root.getAttribute('data-kp-focus-steps-error') === null && !root.hasAttribute('aria-busy');
    if (showLanes) {
        root.setAttribute('data-kp-focus-tracked', '');
        ensureLanes(root);
        layoutLanes(root);
    } else if (root.hasAttribute('data-kp-focus-tracked')) dropLanes(root);
    const passed = track !== undefined && track.order.every((i) => state.done.has(i));
    const timers = tracked ? timerStates(root) : [];
    const blocks = tracked && step && !passed ? blockersOf(state, index, timers) : [];
    state.lockKey = blocks.map((b) => b.index).join(',');
    part(root, 'count').textContent = !total
        ? ''
        : onSum
          ? strings.focusSummaryTitle
          : track
            ? strings.focusTrackCount(track.name, track.pos + 1, track.order.length)
            : asking
              ? strings.focusQuestionCount(index + 1, total)
              : strings.focusCount(index + 1, total);
    const bar = part(root, 'bar');
    const shownTotal = total + (summaryOn(root) ? 1 : 0);
    bar.style.setProperty('--kp-value', String(track ? (track.pos + 1) / track.order.length : shownTotal ? (index + 1) / shownTotal : 0));
    // Progress: the count and the bar (default) or nothing; never a timer, never a streak.
    const progress = asking ? (opt(root, 'progress', 'count') ?? 'count') : 'count';
    bar.hidden = progress !== 'count';
    part(root, 'count').hidden = progress === 'off';
    // The screen line is for cook mode; a short check-in does not talk about the screen unless asked to keep it on.
    const wakeLine = /** @type {HTMLElement | null} */ (root.querySelector('.kp-focus-steps__wake'));
    if (wakeLine) wakeLine.hidden = asking && (root.getAttribute('data-kp-wake') ?? root.getAttribute('data-kp-focus-steps-wake')) !== 'true';
    // Read aloud stays a tool: off by default for questions, on with `data-kp-speak="true"`.
    const speakButton = /** @type {HTMLElement | null} */ (root.querySelector('.kp-focus-steps__speak'));
    if (speakButton) speakButton.hidden = typeof speechSynthesis === 'undefined' || (asking && opt(root, 'speak') !== 'true');
    const holder = part(root, 'step');
    const error = root.getAttribute('data-kp-focus-steps-error');
    holder.replaceChildren();
    holder.removeAttribute('data-kp-focus-steps-kind');
    holder.removeAttribute('data-kp-focus-steps-locked');
    const saveError = root.getAttribute('data-kp-state') === 'save-error';
    if (asking || root.getAttribute('data-kp-focus-mode') === 'answer') {
        // Answer mode: empty, failed and save-failed are one plate that fills the step area, centred, with a normal-size action.
        if (saveError) {
            holder.append(
                statePlate(document, {
                    kind: 'error',
                    title: strings.focusSaveFailedTitle,
                    text: error ?? strings.focusSaveFailedText,
                    actionLabel: strings.focusSaveRetry,
                    actionAttribute: 'data-kp-focus-save-retry',
                }),
            );
            holder.setAttribute('data-kp-focus-steps-kind', 'error');
        } else if (error !== null) {
            holder.append(
                statePlate(document, {
                    kind: 'error',
                    title: strings.focusAnswerFailedTitle,
                    text: error === strings.focusFailed ? strings.focusAnswerFailedText : error,
                    actionLabel: strings.focusRetry,
                    actionAttribute: 'data-kp-focus-retry',
                }),
            );
            holder.setAttribute('data-kp-focus-steps-kind', 'error');
        } else if (!step && !onSum && !root.hasAttribute('aria-busy')) {
            holder.append(
                statePlate(document, {
                    kind: 'empty',
                    title: strings.focusAnswerEmptyTitle,
                    text: root.getAttribute('data-kp-focus-steps-empty') ?? strings.focusAnswerEmptyText,
                    ...(emptyAction(root) ? { actionLabel: emptyAction(root), actionAttribute: 'data-kp-focus-empty-action' } : {}),
                }),
            );
            holder.setAttribute('data-kp-focus-steps-kind', 'empty');
        } else if (onSum) buildSummary(root, holder);
        else if (step) {
            if (state.pendingResume) holder.append(buildResumeAsk());
            const text = el('kp-focus-steps__text', 'p');
            text.textContent = step.text;
            holder.append(text);
            appendBody(holder, step);
            if (step.answer) buildAnswer(root, holder, step, text);
            if (step.note) {
                const note = el(`kp-alert kp-alert--${step.noteTone === 'warning' ? 'warning' : 'info'} kp-focus-steps__note`, 'p');
                note.textContent = step.note;
                holder.append(note);
            }
        }
    } else if (error !== null) {
        // Failed and empty are one plate that fills the step area, centred, with a normal-size action [focus-tracks-1019].
        holder.append(
            statePlate(document, {
                kind: 'error',
                title: strings.focusReadFailedTitle,
                text: error === strings.focusFailed ? strings.focusReadFailedText : error,
                actionLabel: strings.focusRetry,
                actionAttribute: 'data-kp-focus-retry',
            }),
        );
        holder.setAttribute('data-kp-focus-steps-kind', 'error');
    } else if (!step) {
        if (!root.hasAttribute('aria-busy')) {
            holder.append(
                statePlate(document, {
                    kind: 'empty',
                    title: strings.focusReadEmptyTitle,
                    text: root.getAttribute('data-kp-focus-steps-empty') ?? strings.focusEmpty,
                    ...(emptyAction(root) ? { actionLabel: emptyAction(root), actionAttribute: 'data-kp-focus-empty-action' } : {}),
                }),
            );
            holder.setAttribute('data-kp-focus-steps-kind', 'empty');
        }
    } else if (track && passed) {
        // The active track has no step left: say so on the plate, and offer the track that can use the person.
        const next = suggestion(laneSummaries(root));
        const plate = statePlate(document, {
            kind: 'empty',
            title: strings.focusTrackFinishedTitle(track.name),
            text: next ? strings.focusTrackFinishedNext(next.name) : strings.focusTrackFinishedText,
            ...(next ? { actionLabel: strings.focusTrackGo(next.name) } : {}),
        });
        if (next) plate.querySelector('.kp-stateplate__action')?.setAttribute('data-kp-focus-go', String(state.tracks.indexOf(next.track)));
        holder.append(plate);
        holder.setAttribute('data-kp-focus-steps-kind', 'finished');
    } else {
        if (state.pendingResume) holder.append(buildResumeAsk());
        const text = el('kp-focus-steps__text', 'p');
        text.textContent = step.text;
        holder.append(text);
        appendBody(holder, step);
        if (blocks.length) waitBlock(root, holder, state, blocks, timers, index);
        if (step.ingredients?.length) holder.append(needsList(step.ingredients));
        if (step.timer && step.timer.seconds > 0) holder.append(timerButton(root, state, step.timer, blocks.length > 0, index, total));
        if (step.note) {
            const note = el(`kp-alert kp-alert--${step.noteTone === 'warning' ? 'warning' : 'info'} kp-focus-steps__note`, 'p');
            note.textContent = step.note;
            holder.append(note);
        }
    }
    const prev = /** @type {HTMLButtonElement} */ (part(root, 'prev'));
    const next = /** @type {HTMLButtonElement} */ (part(root, 'next'));
    const busy = root.hasAttribute('aria-busy');
    const blocked = (!step && !onSum) || error !== null || busy || saveError;
    // On a track the first step has no Back, a finished track has no Next, and a step that waits cannot be passed.
    const atStart = track ? track.pos === 0 && !passed : index === 0;
    if (blocked || atStart) prev.setAttribute('aria-disabled', 'true');
    else prev.removeAttribute('aria-disabled');
    prev.hidden = asking && opt(root, 'back') === 'off';
    if (blocked || passed || blocks.length > 0) next.setAttribute('aria-disabled', 'true');
    else next.removeAttribute('aria-disabled');
    const last = track ? passed || track.pos === track.order.length - 1 : total > 0 && index === lastIndex(root);
    const nextText = /** @type {HTMLElement} */ (next.querySelector('.kp-button__text'));
    nextText.textContent = track
        ? last
            ? passed
                ? strings.focusDone
                : strings.focusTrackFinish(track.name)
            : strings.focusNext
        : last
          ? strings.focusDone
          : asking && summaryOn(root) && index === total - 1
            ? strings.focusReview
            : strings.focusNext;
    next.toggleAttribute('data-kp-focus-steps-last', last);
    if (asking && step?.answer && !blocked) paintAnswerState(root);
    part(root, 'body').scrollTop = 0;
    if (showLanes) {
        paintLanes(root);
        paintLive(root, timers);
    }
    if (arrive) void import('../motion.js').then((m) => holder.isConnected && m.arriveShown(holder));
}
