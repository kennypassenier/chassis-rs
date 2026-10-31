// One command block: its lines, head and note written, its code made scrollable on request, and everything put back on detach.

import { Controller } from '../controller.js';
import { buildHead, buildWhere } from './head.js';
import { attachPatterns } from '../patterns.js';
import { layoutLines } from './lines.js';
import { placeSecrets, revealButton, showSecrets, takeSecrets } from './secret.js';
import { getStrings } from '../strings.js';
import { COMMAND_SHELLS, OTHER_SHELL, SCROLL_EDGE } from './values.js';

/** The ids of command blocks made so far: every block gets its own. */
const ids = { last: 0 };

/** One command block. */
export class CommandBlock extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** @type {HTMLElement | null} */
        this.head = null;
        /** @type {HTMLElement | null} */
        this.where = null;
    }

    connect() {
        const el = this.host;
        const pre = /** @type {HTMLElement | null} */ (el.querySelector(':scope > pre, :scope > .kp-command__code'));
        if (!pre) return;
        const id = `kp-command-${++ids.last}`;
        const key = (el.dataset.kpCommand ?? '').toLowerCase();
        const shell = COMMAND_SHELLS[/** @type {keyof typeof COMMAND_SHELLS} */ (key)] ?? OTHER_SHELL;
        // The prompt itself is the stylesheet's (`--kp-command-prompt`, by `data-kp-command-shell`); `prompt` above is
        // what it draws, kept here for a page that draws its own.
        const code = pre.querySelector('code') ?? pre;
        this.own(this.restorer(pre, code));

        el.classList.add('kp-command');
        el.dataset.kpCommandShell = key in COMMAND_SHELLS ? key : 'other';
        pre.classList.add('kp-command__code');
        code.id ||= `${id}-code`;
        const secrets = takeSecrets(code);
        layoutLines(el.ownerDocument, code, shell.continues);

        const { head, name } = buildHead(el, { id, key, shell, codeId: code.id });
        this.head = head;
        if (secrets.length) this.secrets(code, secrets, head);
        this.where = buildWhere(el);
        if (el.dataset.kpCommandWrap === 'scroll') this.scrollable(pre, name.id);
        el.setAttribute('role', 'group');
        el.setAttribute('aria-labelledby', name.id);
        el.prepend(head);
        if (this.where) el.append(this.where);
        el.dataset.kpCommandReady = '';
        this.own(attachPatterns(head));
    }

    /**
     * The masked secrets [kyu gap 15]: drawn masked, Copy given the real command, and a Show button unless
     * `data-kp-command-secret-reveal="off"`.
     * @param {Element} code @param {import('./secret.js').CommandSecret[]} secrets @param {HTMLElement} head
     */
    secrets(code, secrets, head) {
        const el = this.host;
        const s = getStrings();
        const look = el.getAttribute('data-kp-command-secret-mask') === 'tail' ? 'tail' : 'dots';
        const copied = placeSecrets(el.ownerDocument, code, secrets, { look, hidden: s.commandSecretHidden });
        const copy = /** @type {HTMLElement | null} */ (head.querySelector('.kp-command__copy:not(.kp-command__ghost)'));
        // Copy takes the real command, never the dots it sees on screen.
        if (copy) {
            copy.dataset.kpCopy = '';
            copy.dataset.kpCopyValue = copied;
        }
        el.toggleAttribute('data-kp-command-secret-on', true);
        this.own(() => el.removeAttribute('data-kp-command-secret-on'));
        if (el.getAttribute('data-kp-command-secret-reveal') === 'off') return;
        const reveal = revealButton(el.ownerDocument, { show: s.commandSecretShow, hide: s.commandSecretHide, label: s.commandSecretShowLabel }, code.id);
        head.querySelector('.kp-command__copy-slot')?.before(reveal);
        this.listen(reveal, 'click', () => {
            const shown = reveal.getAttribute('aria-pressed') !== 'true';
            reveal.setAttribute('aria-pressed', String(shown));
            showSecrets(code, secrets, shown, look, s.commandSecretHidden);
        });
    }

    /**
     * What detach puts back: the head and note gone, the block's own classes, text and attributes as they were.
     * @param {HTMLElement} pre @param {Element} code
     * @returns {() => void}
     */
    restorer(pre, code) {
        const el = this.host;
        const before = { pre: pre.className, code: code.innerHTML, tabIndex: pre.getAttribute('tabindex'), role: pre.getAttribute('role') };
        return () => {
            this.head?.remove();
            this.where?.remove();
            pre.className = before.pre;
            code.innerHTML = before.code;
            if (before.tabIndex === null) pre.removeAttribute('tabindex');
            if (before.role === null) pre.removeAttribute('role');
            pre.removeAttribute('aria-labelledby');
            el.removeAttribute('role');
            el.removeAttribute('aria-labelledby');
            delete el.dataset.kpCommandShell;
            delete el.dataset.kpCommandReady;
        };
    }

    /**
     * A long line stays one line and the code scrolls sideways inside its block, a focusable region so a keyboard can scroll it too.
     * @param {HTMLElement} pre @param {string} nameId
     */
    scrollable(pre, nameId) {
        pre.tabIndex = 0;
        pre.setAttribute('role', 'region');
        pre.setAttribute('aria-labelledby', nameId);
        // The side the code has more on fades, so a cut-off line reads as one that goes on.
        const edges = () => {
            const max = pre.scrollWidth - pre.clientWidth;
            pre.toggleAttribute('data-kp-command-before', pre.scrollLeft > SCROLL_EDGE);
            pre.toggleAttribute('data-kp-command-after', pre.scrollLeft < max - SCROLL_EDGE);
        };
        this.own(() => {
            pre.removeAttribute('data-kp-command-before');
            pre.removeAttribute('data-kp-command-after');
        });
        if (typeof ResizeObserver === 'function') this.observe(new ResizeObserver(edges)).observe(pre);
        this.listen(pre, 'scroll', edges, { passive: true });
        edges();
    }
}
