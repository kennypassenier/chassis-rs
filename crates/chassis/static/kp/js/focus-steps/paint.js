// Paints the focused step.
import { getStrings } from '../strings.js';
import { statePlate } from '../state-plate.js';
import { focusState } from './state.js';
import { el, part, stateOf } from './dom.js';
import { answering, buildResumeAsk, emptyAction, lastIndex, onSummary, opt, summaryOn } from './resume.js';
import { activeTrack, timerIdOf, timerStates, tracksOn } from './tracks.js';
import { dropLanes, ensureLanes, layoutLanes, paintLanes } from './lanes.js';
import { blockerNames, blockersOf, laneSummaries } from './blockers.js';
import { buildAnswer, buildSummary, paintAnswerState } from './flow.js';
import { suggestion, waitLine } from './band.js';
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
        if (blocks.length) {
            // The step waits: what for, how long, and the button to the track that can go on.
            holder.setAttribute('data-kp-focus-steps-locked', '');
            const wait = el('kp-alert kp-alert--info kp-focus-steps__wait', 'div');
            wait.setAttribute('role', 'status');
            const what = el('kp-focus-steps__wait-text');
            const title = el('kp-focus-steps__wait-title', 'strong');
            title.textContent = strings.focusTrackWaitTitle(blockerNames(state, blocks));
            const line = el('kp-focus-steps__wait-line', 'span');
            line.textContent = waitLine(state, blocks, timers, index);
            what.append(title, line);
            wait.append(what);
            const next = suggestion(laneSummaries(root));
            if (next) {
                const go = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--primary kp-focus-steps__wait-go', 'button'));
                go.type = 'button';
                go.setAttribute('data-kp-focus-go', String(state.tracks.indexOf(next.track)));
                go.textContent = strings.focusTrackGo(next.name);
                wait.append(go);
            }
            holder.append(wait);
        }
        if (step.ingredients?.length) {
            const needs = el('kp-focus-steps__needs', 'section');
            const title = el('kp-focus-steps__needs-title', 'h3');
            focusState.serial += 1;
            title.id = `kp-focus-steps-${focusState.serial}-needs`;
            title.textContent = strings.focusNeeds;
            needs.setAttribute('aria-labelledby', title.id);
            const list = el('kp-focus-steps__needs-list', 'ul');
            for (const item of step.ingredients) {
                const row = el('kp-focus-steps__need', 'li');
                const { name, amount } = typeof item === 'string' ? { name: item, amount: '' } : item;
                const a = el('kp-focus-steps__amount', 'span');
                a.textContent = amount ?? '';
                const n = el('kp-focus-steps__name', 'span');
                n.textContent = name;
                row.append(a, n);
                list.append(row);
            }
            needs.append(title, list);
            holder.append(needs);
        }
        if (step.timer && step.timer.seconds > 0) {
            const minutes = Math.round(step.timer.seconds / 60);
            const button = /** @type {HTMLButtonElement} */ (el('kp-button kp-focus-steps__timer', 'button'));
            button.type = 'button';
            button.setAttribute('data-kp-timer-start', String(step.timer.seconds));
            button.setAttribute('data-kp-timer-name', step.timer.name ?? strings.focusCount(index + 1, total));
            // The timer has an id of its own, so the timer list, the lanes and a page that watches it name the same one.
            button.setAttribute('data-kp-timer-id', timerIdOf(state, index));
            if (blocks.length) button.setAttribute('aria-disabled', 'true');
            const list = root.getAttribute('data-kp-focus-steps-timers');
            if (list) button.setAttribute('data-kp-timer-for', list);
            button.textContent = strings.focusTimer(step.timer.seconds < 60 ? `${step.timer.seconds} s` : `${minutes} min`);
            holder.append(button);
        }
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
