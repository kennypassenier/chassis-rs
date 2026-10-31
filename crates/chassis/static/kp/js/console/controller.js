// One console: its parts wired, its history keys, completion, clicks, live options and shortcuts.
import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { registerShortcuts } from '../shortcuts.js';
import { attachNewPills } from '../newpill.js';
import { attachDisabledReasons } from '../reason.js';
import { clearConsole, useTool } from './api.js';
import { drawBar } from './bar.js';
import { blockNode, drawAll, drawBody } from './blocks.js';
import { CONSOLE_RETRY_EVENT } from './constants.js';
import { loadHistory } from './history.js';
import { attr, el, say, stateOf } from './model.js';
import { startTicker, submit } from './run.js';
/** @typedef {import('./types.js').ConsoleRun} ConsoleRun */

/** The most completions a console offers at once. */
const MAX_COMPLETIONS = 12;
/** The console attributes that redraw it when they change: every option is live. */
const LIVE = [
    'disabled',
    'data-kp-disabled',
    'data-kp-disabled-reason',
    ...['hint', 'prompt', 'order', 'status', 'timer', 'cancel', 'max-lines', 'max-blocks', 'context', 'confirm'].map((n) => `data-kp-console-${n}`),
];

/** One console: its state is the `STATE` registry entry every part reads; the order and the new-pill watch sit on the instance. */
export class ConsoleControl extends Controller {
    /** @param {HTMLElement} host @param {{ run?: ConsoleRun, complete?: (prefix: string) => string[] | Promise<string[]> }} [options] */
    constructor(host, options = {}) {
        super(host, options);
        this.st = stateOf(host);
        this.run = options.run;
        this.complete = options.complete;
        /** The order the console is drawn in, so a change of it moves the bar. */
        this.order = attr(host, 'order', 'newest-last');
        /** Stops the new-pill watch of the body; it is made again when the order turns. */
        this.stopPill = () => {};
        /** The console's parts, found once drawAll() has drawn them in connect(). */
        this.parts = /** @type {{ body: HTMLElement, form: HTMLFormElement, input: HTMLInputElement, select: HTMLSelectElement, complete: HTMLElement }} */ (
            /** @type {unknown} */ (null)
        );
    }

    connect() {
        const root = this.host;
        const st = this.st;
        if (this.run) st.run = this.run;
        if (this.complete) st.complete = this.complete;
        st.history = loadHistory(root);
        drawAll(root);
        this.parts = {
            body: /** @type {HTMLElement} */ (root.querySelector('.kp-console__body')),
            form: /** @type {HTMLFormElement} */ (root.querySelector('.kp-console__form')),
            input: /** @type {HTMLInputElement} */ (root.querySelector('.kp-console__input')),
            select: /** @type {HTMLSelectElement} */ (root.querySelector('.kp-console__context')),
            complete: /** @type {HTMLElement} */ (root.querySelector('.kp-console__complete')),
        };
        const { body, form, input, select } = this.parts;
        // Registered first, so it runs last: the clock stops after everything else.
        this.own(() => window.clearInterval(st.tick));
        this.own(attachDisabledReasons(root));
        if (body) this.stopPill = attachNewPills(body.parentElement ?? root);
        this.own(() => this.stopPill());
        this.own(registerShortcuts(root, this.keys(), { layoutGuard: 'off' }));
        this.listen(form, 'submit', (event) => {
            event.preventDefault();
            void submit(root);
        });
        this.listen(input, 'keydown', (event) => void this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(root, 'click', (event) => this.onClick(event));
        this.listen(select, 'change', () => (st.context.value = select.value));
        this.observe(new MutationObserver(() => this.onOptions())).observe(root, { attributes: true, attributeFilter: LIVE });
        startTicker(root);
    }

    /** The keys, through the engine: the clear key, and the one that jumps to the prompt from anywhere. */
    keys() {
        const root = this.host;
        const s = getStrings();
        /** @type {import('../shortcuts.js').Shortcut[]} */
        const keys = [{ keys: 'Mod L', what: s.consoleKeyClear, group: s.consoleKeyGroup, run: () => clearConsole(root) }];
        const focusKey = attr(root, 'focus-key', ':');
        if (focusKey === 'false' || focusKey === '') return keys;
        const input = /** @type {HTMLInputElement} */ (root.querySelector('.kp-console__input'));
        keys.push({ keys: focusKey, what: s.consoleKeyFocus, group: s.consoleKeyGroup, when: () => !input.disabled, reason: s.consoleKeyFocusReason, run: () => input.focus() });
        return keys;
    }

    /** An option changed (its attribute): the console is drawn again; a new order moves the bar and the new-pill watch. */
    onOptions() {
        const root = this.host;
        const now = attr(root, 'order', 'newest-last');
        if (now !== this.order) this.reorder(now);
        drawBar(root);
        drawBody(root);
        for (const b of this.st.blocks) {
            const node = root.querySelector(`.kp-console__block[data-id="${CSS.escape(b.id)}"]`);
            if (node instanceof HTMLElement) blockNode(root, b, node);
        }
    }

    /** @param {string} now the new order */
    reorder(now) {
        const root = this.host;
        const body = this.parts.body;
        this.order = now;
        const stage = root.querySelector(':scope > .kp-console__stage');
        const bar = root.querySelector(':scope > .kp-console__bar');
        if (stage && bar) {
            if (now === 'newest-first') root.prepend(bar);
            else root.append(bar);
        }
        this.stopPill();
        body.setAttribute('data-kp-follow', now === 'newest-first' ? 'head' : 'tail');
        this.stopPill = attachNewPills(body.parentElement ?? root);
    }

    /** Up and Down walk the history, Esc closes the completions or clears the line, Tab completes, a key drops a pending confirm. @param {KeyboardEvent} event */
    async onKey(event) {
        const { st, host: root } = this;
        const { input, complete } = this.parts;
        if (event.isComposing) return;
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') this.walk(event);
        else if (event.key === 'Escape') {
            if (!complete.hidden) {
                complete.hidden = true;
                return;
            }
            if (input.value === '') return;
            event.preventDefault();
            input.value = '';
            st.at = -1;
            st.pending = null;
            drawBar(root);
        } else if (event.key === 'Tab' && attr(root, 'tab', 'none') === 'complete' && st.complete && input.value.trim() !== '' && !event.shiftKey) {
            event.preventDefault();
            this.offer(await st.complete(input.value));
        } else if (st.pending !== null && event.key.length === 1) {
            st.pending = null;
            drawBar(root);
        }
    }

    /** Walk the history; the line typed before the walk comes back at its end. @param {KeyboardEvent} event */
    walk(event) {
        const st = this.st;
        const input = this.parts.input;
        if (st.history.length === 0) return;
        event.preventDefault();
        if (st.at === -1) st.draft = input.value;
        if (event.key === 'ArrowUp') st.at = st.at === -1 ? st.history.length - 1 : Math.max(0, st.at - 1);
        else st.at = st.at === -1 ? -1 : st.at + 1 >= st.history.length ? -1 : st.at + 1;
        input.value = st.at === -1 ? st.draft : st.history[st.at];
        input.setSelectionRange(input.value.length, input.value.length);
    }

    /** One completion fills the line; several are offered as buttons and counted aloud. @param {string[]} found */
    offer(found) {
        const { input, complete } = this.parts;
        if (found.length === 1) {
            input.value = found[0];
            complete.hidden = true;
            return;
        }
        if (found.length === 0) return;
        complete.replaceChildren();
        complete.setAttribute('role', 'group');
        complete.setAttribute('aria-label', getStrings().consoleCompletions);
        for (const f of found.slice(0, MAX_COMPLETIONS)) {
            const b = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-button--sm', 'button'));
            b.type = 'button';
            b.setAttribute('data-kp-console-complete', f);
            b.textContent = f;
            complete.append(b);
        }
        complete.hidden = false;
        say(this.host, getStrings().consoleMatches(found.length));
    }

    /** A block's tool, a completion, Retry, or the earlier blocks. @param {Event} event */
    onClick(event) {
        const root = this.host;
        const t = event.target instanceof Element ? event.target : null;
        if (!t) return;
        const tool = /** @type {HTMLButtonElement | null} */ (t.closest('[data-kp-console-tool]'));
        const pick = t.closest('[data-kp-console-complete]');
        if (tool) {
            const block = t.closest('.kp-console__block');
            const b = this.st.blocks.find((x) => x.id === block?.getAttribute('data-id'));
            if (b) void useTool(root, tool.getAttribute('data-kp-console-tool') ?? '', b, tool);
        } else if (pick) {
            this.parts.input.value = pick.getAttribute('data-kp-console-complete') ?? '';
            this.parts.complete.hidden = true;
            this.parts.input.focus();
        } else if (t.closest('[data-kp-console-retry]')) root.dispatchEvent(new CustomEvent(CONSOLE_RETRY_EVENT, { bubbles: true }));
        else if (t.closest('[data-kp-console-earlier]')) {
            this.st.showAll = true;
            drawBody(root);
        }
    }
}
