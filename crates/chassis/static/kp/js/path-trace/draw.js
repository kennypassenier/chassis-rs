// Drawing the trace: the empty and error plates, the placeholder hops, the hops as a step list with the words the page says, and the copy and swap buttons.

import { buildSteplist } from '../steplist.js';
import { getStrings } from '../strings.js';
import { statePlate } from '../state-plate.js';
import { runFlashButton } from '../flash.js';
import { TraceCore } from './core.js';
import { traceStates, traceSummary, traceText, verdictWord } from './states.js';
import { GHOST_HOPS, TRACE_RETRY_EVENT, TRACE_RULE_EVENT, TRACE_SWAP_EVENT } from './values.js';

/** @typedef {import('../path-trace.js').TraceHop} TraceHop */
/** @typedef {ReturnType<typeof getStrings>} Strings */

export class TraceDraw extends TraceCore {
    draw() {
        const { host, stage, foot, summary } = this;
        const s = getStrings();
        const stop = this.stop();
        this.clearBusy();
        stage.replaceChildren();
        foot.replaceChildren();
        host.setAttribute('data-kp-state', this.state);
        stage.style.minBlockSize = this.state === 'ready' || !this.kept ? '' : `${this.kept}px`;
        summary.hidden = this.attr('data-kp-trace-summary', 'on') === 'off';
        if (this.state === 'empty' || (this.state === 'ready' && this.hops.length === 0)) return this.drawEmpty(s);
        if (this.state === 'error') return this.drawError(s);
        const ghost = this.state === 'running';
        const rows = ghost
            ? Array.from({ length: GHOST_HOPS }, () => ({ hop: /** @type {TraceHop} */ ({ title: '…', verdict: 'unknown' }), state: /** @type {const} */ ('pending') }))
            : traceStates(this.hops, stop);
        summary.textContent = ghost ? s.traceRunning : traceSummary(this.hops, stop);
        const ruleMode = this.attr('data-kp-trace-rule', 'chip');
        const list = buildSteplist(this.hopItems(rows, ghost, ruleMode, s), { label: s.traceLabel });
        list.classList.add('kp-steplist--trace');
        stage.append(list);
        if (ghost) {
            list.setAttribute('aria-busy', 'true');
            for (const word of list.querySelectorAll('.kp-steplist__state')) word.remove();
            this.openBusy(list);
            return;
        }
        this.dressItems(list, rows, ruleMode, s);
        this.drawFoot(s, stop);
    }

    /** @param {Strings} s */
    drawEmpty(s) {
        this.summary.textContent = '';
        this.stage.append(statePlate(this.doc, { kind: 'empty', title: s.traceEmpty, text: s.traceEmptyText }));
    }

    /** @param {Strings} s */
    drawError(s) {
        this.summary.textContent = '';
        this.stage.append(
            statePlate(this.doc, {
                kind: 'error',
                title: s.traceFailed,
                text: this.message || s.traceFailedText,
                actionLabel: s.traceRetry,
                onAction: () => this.host.dispatchEvent(new CustomEvent(TRACE_RETRY_EVENT, { bubbles: true })),
            }),
        );
    }

    /** The step list's items: a title, a note and the verdict as the time. @param {{ hop: TraceHop, state: 'done' | 'failed' | 'skipped' | 'pending' }[]} rows @param {boolean} ghost @param {string} ruleMode @param {Strings} s */
    hopItems(rows, ghost, ruleMode, s) {
        return rows.map(({ hop, state: st }, i) => ({
            id: `hop-${i}`,
            title: ghost ? '' : hop.title,
            note: ghost ? '' : [hop.note, hop.ports, ruleMode === 'inline' && hop.rule ? s.traceRule(hop.rule) : ''].filter(Boolean).join(' · '),
            state: st,
            time: ghost ? '' : verdictWord(st, s),
        }));
    }

    /** The words the page says, not the step list's own ("done", "failed"), and the deciding rule as a chip. @param {HTMLElement} list @param {{ hop: TraceHop, state: 'done' | 'failed' | 'skipped' | 'pending' }[]} rows @param {string} ruleMode @param {Strings} s */
    dressItems(list, rows, ruleMode, s) {
        [...list.querySelectorAll(':scope > .kp-steplist__item')].forEach((item, i) => {
            const { hop, state: st } = rows[i];
            const word = item.querySelector('.kp-steplist__state');
            if (word) word.setAttribute('aria-hidden', 'true');
            const spoken = this.made('span', 'kp-sr-only');
            spoken.textContent = `, ${verdictWord(st, s)}`;
            item.querySelector('.kp-steplist__body')?.append(spoken);
            if (hop.rule && ruleMode === 'chip') item.querySelector('.kp-steplist__body')?.append(this.ruleChip(hop, s));
        });
    }

    /** @param {TraceHop} hop @param {Strings} s */
    ruleChip(hop, s) {
        const chip = /** @type {HTMLButtonElement} */ (this.made('button', 'kp-badge kp-trace__rule'));
        chip.type = 'button';
        chip.textContent = s.traceRule(hop.rule ?? '');
        chip.addEventListener('click', () => this.host.dispatchEvent(new CustomEvent(TRACE_RULE_EVENT, { bubbles: true, detail: { rule: hop.rule, hop: hop.title } })));
        return chip;
    }

    /** The copy and swap buttons under the hops. @param {Strings} s @param {'first-refusal' | 'all'} stop */
    drawFoot(s, stop) {
        const { host, foot } = this;
        if (host.hasAttribute('data-kp-trace-copy')) {
            const copy = /** @type {HTMLButtonElement} */ (this.made('button', 'kp-button kp-button--ghost kp-trace__copy'));
            copy.type = 'button';
            copy.textContent = s.traceCopy;
            copy.setAttribute('data-kp-flash-words', s.traceCopied);
            copy.addEventListener('click', () => {
                void runFlashButton(copy, async () => {
                    await navigator.clipboard.writeText(traceText(this.hops, stop));
                    return s.traceCopied;
                });
            });
            foot.append(copy);
        }
        if (host.hasAttribute('data-kp-trace-swap')) {
            const swap = /** @type {HTMLButtonElement} */ (this.made('button', 'kp-button kp-button--ghost kp-trace__swap'));
            swap.type = 'button';
            swap.textContent = s.traceSwap;
            swap.addEventListener('click', () => host.dispatchEvent(new CustomEvent(TRACE_SWAP_EVENT, { bubbles: true })));
            foot.append(swap);
        }
    }
}
