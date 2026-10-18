// The path of one connection: a row of hops, each allowed or refused, stopping at the first refusal [kpadopt6-ops; homelab's
// firewall path box, `fw-path`, in admin/web/js/pages/firewall.js].
//
//   setTrace(el, [
//       { title: 'tv', note: 'IoT network', verdict: 'allowed' },
//       { title: 'Firewall', note: 'tcp 8096', verdict: 'refused', rule: 'IoT to media' },
//       { title: 'Jellyfin', note: 'media network', verdict: 'allowed' },
//   ]);
//
//   <div class="kp-trace" data-kp-trace></div>
//
// This is the part only: it draws the hops it is given (the host works out the verdicts). It extends the step list
// (`.kp-steplist.kp-steplist--trace`, js/steplist.js): an allowed hop is `done` with the check, a refused one `failed` with
// the cross, the hops after the first refusal `skipped` (dimmed, "Not reached") and a hop that was not measured `pending`
// ("Not measured"). Above the hops a summary line says the outcome in a sentence ("Allowed", "Blocked at rule IoT to
// media"), as a polite status; the deciding rule is a chip that is keyboard-reachable and fires `kp-trace-rule`
// `{ rule, hop }`. Options, as attributes and as the third argument of setTrace():
//
//   data-kp-trace-layout    `auto` (default: a row, a column under 30rem of its own width), `row` or `column`
//   data-kp-trace-stop      `first-refusal` (default: a packet cannot pass a refusal) or `all` (each hop's own verdict, for a "what if")
//   data-kp-trace-rule      `chip` (default), `inline` (the rule in the note) or `off`
//   data-kp-trace-verdict   `both` (default: the mark and the word), `mark` or `word`; never colour alone
//   data-kp-trace-summary   `on` (default) or `off`
//   data-kp-trace-copy      a button that copies the trace as text ("tv > Firewall refused ...")
//   data-kp-trace-swap      a button (and the key S) that fires `kp-trace-swap`, for a form that swaps source and target
//   data-kp-density         `comfortable` (default) or `compact`
//   data-kp-state           `running` (the busy card over placeholder hops), `empty` ("Pick a source and a target") or
//                           `error` (the failed plate with Retry, `kp-trace-retry`), each as high as the trace was
//
// Nothing runs on import.

import { buildSteplist } from './steplist.js';
import { getStrings } from './strings.js';
import { openBusyCard } from './busy-card.js';
import { statePlate } from './state-plate.js';
import { runFlashButton } from './flash.js';
import { registerShortcuts } from './shortcuts.js';

/** The traces this module draws. */
export const TRACE = '[data-kp-trace]';
/** Fired on the trace when the deciding rule is pressed: `{ rule, hop }`. */
export const TRACE_RULE_EVENT = 'kp-trace-rule';
/** Fired on the trace when Swap is pressed or S is typed. */
export const TRACE_SWAP_EVENT = 'kp-trace-swap';
/** Fired on the trace when Retry is pressed. */
export const TRACE_RETRY_EVENT = 'kp-trace-retry';

/**
 * @typedef {object} TraceHop
 * @property {string} title the thing the packet reaches (a device, a network, a rule, a target)
 * @property {string} [note] one line under it
 * @property {'allowed' | 'refused' | 'unknown'} verdict
 * @property {string} [rule] the rule that decided it
 * @property {string} [ports] "tcp 8096"
 */

/**
 * The verdict of each hop once the first refusal stops the packet: `done`, `failed`, `skipped` or `pending`.
 * @param {readonly TraceHop[]} hops
 * @param {'first-refusal' | 'all'} [stop]
 * @returns {{ hop: TraceHop, state: 'done' | 'failed' | 'skipped' | 'pending' }[]}
 */
export function traceStates(hops, stop = 'first-refusal') {
    let stopped = false;
    return hops.map((hop) => {
        if (stopped && stop === 'first-refusal') return { hop, state: 'skipped' };
        if (hop.verdict === 'refused') {
            stopped = true;
            return { hop, state: 'failed' };
        }
        return { hop, state: hop.verdict === 'allowed' ? 'done' : 'pending' };
    });
}

/**
 * The outcome in one sentence.
 * @param {readonly TraceHop[]} hops
 * @param {'first-refusal' | 'all'} [stop]
 */
export function traceSummary(hops, stop = 'first-refusal') {
    const s = getStrings();
    const rows = traceStates(hops, stop);
    const refused = rows.find((r) => r.state === 'failed');
    if (refused) return s.traceBlocked(refused.hop.title, refused.hop.rule ?? '');
    if (rows.some((r) => r.state === 'pending')) return s.traceNotAll;
    return s.traceAllowed;
}

/**
 * The trace as text for a bug report: "tv > Firewall refused (rule IoT to media) > Jellyfin not reached".
 * @param {readonly TraceHop[]} hops
 * @param {'first-refusal' | 'all'} [stop]
 */
export function traceText(hops, stop = 'first-refusal') {
    const s = getStrings();
    return traceStates(hops, stop)
        .map(({ hop, state }) => {
            const word =
                state === 'done'
                    ? s.traceAllowedWord
                    : state === 'failed'
                      ? s.traceRefusedWord
                      : state === 'skipped'
                        ? s.traceNotReached
                        : s.traceNotMeasured;
            return `${hop.title} ${word}${hop.rule ? ` (${s.traceRule(hop.rule)})` : ''}`;
        })
        .join(' > ');
}

/**
 * @typedef {object} TraceHandle
 * @property {HTMLElement} element
 * @property {(hops: readonly TraceHop[]) => void} set draw the hops (clears any state)
 * @property {(state: 'ready' | 'running' | 'empty' | 'error', options?: { message?: string }) => void} setState
 * @property {() => string} text the trace as text
 */

/** @type {WeakMap<Element, TraceHandle>} */
const HANDLES = new WeakMap();

/**
 * The handle of a trace.
 * @param {Element} el
 * @returns {TraceHandle | null}
 */
export function trace(el) {
    return HANDLES.get(el) ?? null;
}

/** @param {Document} doc @param {string} tag @param {string} className */
const made = (doc, tag, className) => {
    const el = doc.createElement(tag);
    el.className = className;
    return el;
};

/**
 * @param {HTMLElement} el
 * @returns {() => void}
 */
function attachOne(el) {
    if (HANDLES.has(el)) return () => undefined;
    const doc = el.ownerDocument;
    /** @type {(() => void)[]} */
    const undo = [];
    el.classList.add('kp-trace');
    undo.push(() => el.classList.remove('kp-trace'));
    const summary = made(doc, 'p', 'kp-trace__summary');
    summary.setAttribute('role', 'status');
    const stage = made(doc, 'div', 'kp-trace__stage');
    const foot = made(doc, 'div', 'kp-trace__foot');
    el.replaceChildren(summary, stage, foot);
    undo.push(() => el.replaceChildren());

    /** @type {readonly TraceHop[]} */
    let hops = [];
    /** @type {'ready' | 'running' | 'empty' | 'error'} */
    let state = 'empty';
    let message = '';
    /** @type {import('./busy-card.js').BusyCard | null} */
    let busy = null;
    let kept = 0;
    const attr = (/** @type {string} */ name, /** @type {string} */ fallback) => el.getAttribute(name) ?? fallback;

    const draw = () => {
        const s = getStrings();
        const stop = attr('data-kp-trace-stop', 'first-refusal') === 'all' ? 'all' : 'first-refusal';
        const ruleMode = attr('data-kp-trace-rule', 'chip');
        busy?.remove();
        busy = null;
        stage.replaceChildren();
        foot.replaceChildren();
        el.setAttribute('data-kp-state', state);
        stage.style.minBlockSize = state === 'ready' || !kept ? '' : `${kept}px`;
        summary.hidden = attr('data-kp-trace-summary', 'on') === 'off';

        if (state === 'empty' || (state === 'ready' && hops.length === 0)) {
            summary.textContent = '';
            stage.append(statePlate(doc, { kind: 'empty', title: s.traceEmpty, text: s.traceEmptyText }));
            return;
        }
        if (state === 'error') {
            summary.textContent = '';
            stage.append(
                statePlate(doc, {
                    kind: 'error',
                    title: s.traceFailed,
                    text: message || s.traceFailedText,
                    actionLabel: s.traceRetry,
                    onAction: () => el.dispatchEvent(new CustomEvent(TRACE_RETRY_EVENT, { bubbles: true })),
                }),
            );
            return;
        }
        const ghost = state === 'running';
        const rows = ghost
            ? [0, 1, 2].map(() => ({ hop: /** @type {TraceHop} */ ({ title: '…', verdict: 'unknown' }), state: /** @type {const} */ ('pending') }))
            : traceStates(hops, stop);
        summary.textContent = ghost ? s.traceRunning : traceSummary(hops, stop);
        const list = buildSteplist(
            rows.map(({ hop, state: st }, i) => ({
                id: `hop-${i}`,
                title: ghost ? '' : hop.title,
                note: ghost ? '' : [hop.note, hop.ports, ruleMode === 'inline' && hop.rule ? s.traceRule(hop.rule) : ''].filter(Boolean).join(' · '),
                state: st,
                time: ghost
                    ? ''
                    : st === 'done'
                      ? s.traceAllowedWord
                      : st === 'failed'
                        ? s.traceRefusedWord
                        : st === 'skipped'
                          ? s.traceNotReached
                          : s.traceNotMeasured,
            })),
            { label: s.traceLabel },
        );
        list.classList.add('kp-steplist--trace');
        stage.append(list);
        if (ghost) {
            list.setAttribute('aria-busy', 'true');
            for (const word of list.querySelectorAll('.kp-steplist__state')) word.remove();
            busy = openBusyCard(stage, { words: s.traceRunning, area: () => [list], className: 'kp-trace__busy', arrive: true });
        } else {
            [...list.querySelectorAll(':scope > .kp-steplist__item')].forEach((item, i) => {
                const { hop, state: st } = rows[i];
                // The words the page says, not the step list's own ("done", "failed").
                const word = item.querySelector('.kp-steplist__state');
                if (word) word.setAttribute('aria-hidden', 'true');
                const spoken = made(doc, 'span', 'kp-sr-only');
                spoken.textContent = `, ${st === 'done' ? s.traceAllowedWord : st === 'failed' ? s.traceRefusedWord : st === 'skipped' ? s.traceNotReached : s.traceNotMeasured}`;
                item.querySelector('.kp-steplist__body')?.append(spoken);
                if (hop.rule && ruleMode === 'chip') {
                    const chip = /** @type {HTMLButtonElement} */ (made(doc, 'button', 'kp-badge kp-trace__rule'));
                    chip.type = 'button';
                    chip.textContent = s.traceRule(hop.rule);
                    chip.addEventListener('click', () =>
                        el.dispatchEvent(new CustomEvent(TRACE_RULE_EVENT, { bubbles: true, detail: { rule: hop.rule, hop: hop.title } })),
                    );
                    item.querySelector('.kp-steplist__body')?.append(chip);
                }
            });
        }
        if (!ghost && el.hasAttribute('data-kp-trace-copy')) {
            const copy = /** @type {HTMLButtonElement} */ (made(doc, 'button', 'kp-button kp-button--ghost kp-trace__copy'));
            copy.type = 'button';
            copy.textContent = s.traceCopy;
            copy.setAttribute('data-kp-flash-words', s.traceCopied);
            copy.addEventListener('click', () => {
                void runFlashButton(copy, async () => {
                    await navigator.clipboard.writeText(traceText(hops, stop));
                    return s.traceCopied;
                });
            });
            foot.append(copy);
        }
        if (!ghost && el.hasAttribute('data-kp-trace-swap')) {
            const swap = /** @type {HTMLButtonElement} */ (made(doc, 'button', 'kp-button kp-button--ghost kp-trace__swap'));
            swap.type = 'button';
            swap.textContent = s.traceSwap;
            swap.addEventListener('click', () => el.dispatchEvent(new CustomEvent(TRACE_SWAP_EVENT, { bubbles: true })));
            foot.append(swap);
        }
    };

    /** @type {TraceHandle} */
    const handle = {
        element: el,
        set(next) {
            hops = next;
            state = 'ready';
            kept = 0;
            draw();
            kept = stage.offsetHeight;
        },
        setState(next, options = {}) {
            if (state === 'ready' && stage.offsetHeight > 0) kept = stage.offsetHeight;
            state = next;
            message = options.message ?? '';
            draw();
        },
        text: () => traceText(hops, attr('data-kp-trace-stop', 'first-refusal') === 'all' ? 'all' : 'first-refusal'),
    };
    HANDLES.set(el, handle);
    undo.push(() => {
        busy?.remove();
        HANDLES.delete(el);
    });

    const watch = new MutationObserver(draw);
    watch.observe(el, {
        attributes: true,
        attributeFilter: [
            'data-kp-trace-stop',
            'data-kp-trace-rule',
            'data-kp-trace-verdict',
            'data-kp-trace-summary',
            'data-kp-trace-copy',
            'data-kp-trace-swap',
        ],
    });
    undo.push(() => watch.disconnect());

    if (el.hasAttribute('data-kp-trace-swap')) {
        const s = getStrings();
        const off = registerShortcuts(
            el,
            [
                {
                    keys: 's',
                    what: s.traceKeySwap,
                    group: s.traceKeyGroup,
                    run: () => el.dispatchEvent(new CustomEvent(TRACE_SWAP_EVENT, { bubbles: true })),
                },
            ],
            { layoutGuard: 'warn' },
        );
        undo.push(off);
    }
    draw();
    return () => undo.reverse().forEach((u) => u());
}

/**
 * Give every trace under `root` its parts; fill one with `setTrace` or the handle.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachTraces(root = document) {
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(TRACE) ? [root] : []),
        ...root.querySelectorAll(TRACE),
    ]);
    const undo = found.map((el) => attachOne(el));
    return () => undo.forEach((u) => u());
}

/**
 * Draw the hops of a trace (attaching it first when it was not yet).
 * @param {HTMLElement} el
 * @param {readonly TraceHop[]} hops
 */
export function setTrace(el, hops) {
    if (!HANDLES.has(el)) attachOne(el);
    HANDLES.get(el)?.set(hops);
}
