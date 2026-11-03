// The confirmation dialog and the buttons that open it.
import { getStrings, DEFAULT_STRINGS } from '../strings.js';
import { buildTypeConfirm } from './type-confirm.js';
import { byId } from '../by-id.js';

/** Ids for the dialog's title and description, unique per page. */
let dialogSeq = 0;

/** The fields a rich description may hold that take the first focus [fix-1031]: a quantity's number, an input, a choice. */
const DESCRIPTION_FIELD = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [contenteditable="true"]';

/**
 * The first field a rich description holds that a person can reach, or null.
 * @param {Element} description
 * @returns {HTMLElement | null}
 */
function firstDescriptionField(description) {
    for (const field of description.querySelectorAll(DESCRIPTION_FIELD)) {
        if (field instanceof HTMLElement && field.getClientRects().length > 0 && !field.closest('[inert]')) return field;
    }
    return null;
}

/**
 * The dictionary's sentence without the one the phrase already says [uxdialogs1101]: "Prune 8 dead letters? This cannot be undone." keeps
 * "Cancel leaves everything as it is." only. The test is the dictionary's own (`confirmSaysIrreversible`), so another language brings its words.
 * @param {string} sentence @param {string} phrase @param {import('../strings.js').Strings} s
 */
function unrepeated(sentence, phrase, s) {
    if (!s.confirmSaysIrreversible(phrase)) return sentence;
    return sentence
        .split(/(?<=[.!?])\s+/)
        .filter((part) => !s.confirmSaysIrreversible(part))
        .join(' ');
}

/**
 * The dialog a confirmation takes the body of instead of opening a second modal over it, or null [uxdialogs1101]: the open modal dialog
 * the button sits in, when `stack` (else the nearest `data-kp-dialog-stack`) says `replace` and it holds no confirmation already.
 * @param {HTMLElement} button @param {'over' | 'replace' | undefined} stack
 * @returns {HTMLDialogElement | null}
 */
function stackHost(button, stack) {
    const host = button.closest('dialog[open]');
    const mode = stack ?? button.closest('[data-kp-dialog-stack]')?.getAttribute('data-kp-dialog-stack');
    if (!(host instanceof HTMLDialogElement) || mode !== 'replace' || !host.matches(':modal')) return null;
    return host.hasAttribute('data-kp-confirm-replaced') ? null : host;
}

/**
 * One level only: the confirmation stands in the host's place, at the host's height, and Escape goes back rather than closing the host.
 * @param {HTMLDialogElement} host @param {HTMLDialogElement} dialog
 * @returns {() => void} gives the host its body back
 */
function takeOver(host, dialog) {
    host.style.minBlockSize = `${Math.round(host.getBoundingClientRect().height)}px`;
    host.setAttribute('data-kp-confirm-replaced', '');
    host.append(dialog);
    /** @param {Event} event */
    const back = (event) => {
        if (event.target !== host) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        dialog.close('');
    };
    window.addEventListener('cancel', back, true);
    // Escape with the focus inside the confirmation reaches no modal's `cancel` (Firefox 153 sends it nowhere): it is Back.
    dialog.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        dialog.close('');
    });
    return () => {
        window.removeEventListener('cancel', back, true);
        host.removeAttribute('data-kp-confirm-replaced');
        host.style.minBlockSize = '';
    };
}

/**
 * Open the modal confirmation for `button`, and call `onAccept` if it is
 * taken [TH107, T14, AR28].
 *
 * A native `<dialog>` shown with `showModal()`: the browser does the
 * focus trap, the Escape close and the focus return, which this package
 * already relies on twice. Escape and Cancel do nothing at all.
 *
 * **Written here rather than imported from `js/overlays.js`, on purpose.**
 * chassis-rs bakes six of this package's JavaScript modules into a Rust
 * binary, and the import closure of those six is exactly those six —
 * `js/overlays.js` is not among them. One import edge makes
 * `/static/kp/overlays.js` a 404, the module graph fail, and their whole
 * `chassis.js` die: the theme picker, the contract enforcer, the
 * confirmations and the skip links with it. `gates/check-closure.mjs`
 * holds that closure at six.
 *
 * Two opt-in checks for a removal that depends on something [kpadopt4]:
 * `dependents` lists what still uses the thing under the description (a
 * heading with the exact count, then one line each); `blocked` (the sentence
 * that says what to do first) makes it a notice instead of a question, with
 * one Close button and no Confirm. Each also comes from the button:
 * `data-kp-confirm-dependents` (one name per `;`) and
 * `data-kp-confirm-blocked` (empty: the dictionary's sentence).
 *
 * With `typeName` (or `data-kp-confirm-type` on the button) the reader
 * types that name before Confirm turns on [kpadopt4-ideas]: the dialog shows
 * what will be lost (`loses`, or the element `data-kp-confirm-loses` names),
 * the field, the rule (`anyCase`, `data-kp-confirm-case="any"`) and whether it
 * matches; Confirm stays disabled until it does, Enter in the field confirms a
 * match, and the field has the focus. Confirm carries `acceptLabel`
 * (`data-kp-confirm-label`), else the button's own words. A blocked removal
 * shows no field: there is nothing to confirm.
 *
 * A plain confirmation reads its words from the button too [kyu-ux-1101]: `data-kp-confirm-label` names Confirm ("Delete 8 dead letters")
 * and `data-kp-confirm-description` replaces the dictionary's sentence; an empty one drops the sentence when the phrase already says it.
 *
 * Words from the sentence [uxdialogs1101]: with no `acceptLabel`, no `data-kp-confirm-label` and the dictionary's own `confirmAccept`, Confirm
 * says what the phrase asks ("Delete 8 dead letters?" gives "Delete 8 dead letters", `confirmLabelFrom`); a phrase that already says it cannot
 * be undone drops that sentence of the dictionary's description (`confirmSaysIrreversible`). A page's own words always win.
 *
 * Restorable [uxdialogs1101]: `restorable: true` (or `data-kp-confirm-restorable` on the button) refuses to open and says why in the console:
 * what can come back is deleted at once with an Undo (`undoToast`, `data-kp-row-delete`), not asked about. It then returns a dialog that never
 * opened (not in the page, `open` false, `data-kp-confirm-refused`), so a caller that keeps the dialog needs no other case.
 *
 * One level [uxdialogs1101]: `stack: 'replace'` (or `data-kp-dialog-stack="replace"` on the dialog it is opened from, or on any element
 * round it) puts the confirmation in that dialog's place instead of a second modal over it, with Back where Cancel was; Back, Escape and
 * Confirm give the dialog its body back. `'over'` (default) opens it over.
 *
 * Rich content [mc-1030]: `description` may be a node or a list of nodes (several paragraphs, a list) in place of the dictionary's sentence,
 * and `acceptLook: 'primary'` draws Confirm as a primary button when what it does is not destructive (take a dose anyway, add stock).
 * `className: 'kp-dialog--wide'` gives it a wider step; the default is the narrow question width.
 * When that description holds a field (a quantity's number, an input, a select), the first one that can be reached takes the first focus,
 * whatever `initialFocus` says, as the typed name's field does [fix-1031]; a description without one keeps the rules above.
 * A dialog whose body holds a quantity [mc-r2]: `acceptFollows` (the quantity's id, or the quantity itself) makes Confirm say what will happen with the
 * amount chosen ("Add 3 boxes") and go off, with its reason, while the amount makes no sense; `acceptVerb` is the verb ("Add"). The two are written as
 * `data-kp-accept-follows` / `data-kp-accept-verb` on Confirm, and the page wires them with `attachAcceptFollows(dialog)` (js/accept-follows.js) next
 * to `attachQuantities(dialog)`: this module imports neither, so chassis's closure of six modules stays six.
 *
 * @param {HTMLElement} button the control the confirmation belongs to
 * @param {{ phrase?: string, description?: Node | readonly Node[] | string, acceptLook?: 'destructive' | 'primary', strings?: Partial<import('../strings.js').Strings>, onAccept?: () => void, onCancel?: () => void, className?: string, initialFocus?: 'cancel' | 'accept', dependents?: readonly string[], blocked?: string | boolean, typeName?: string, anyCase?: boolean, loses?: Node | readonly string[] | null, acceptLabel?: string, acceptFollows?: string | HTMLElement, acceptVerb?: string, restorable?: boolean, stack?: 'over' | 'replace' }} [options]
 * @returns {HTMLDialogElement} the dialog, so a consumer can reach the state this set [KT6]; a restorable action's never opens
 */
export function openConfirmation(
    button,
    { phrase, description: richText, acceptLook = 'destructive', strings, onAccept, onCancel, className = '', initialFocus = 'cancel', dependents, blocked, typeName, anyCase, loses, acceptLabel, acceptFollows, acceptVerb, restorable, stack } = {},
) {
    const s = { ...getStrings(), ...strings };
    if (restorable ?? button.hasAttribute('data-kp-confirm-restorable')) {
        console.error('kp-themes: openConfirmation refused: this action is restorable. Delete at once and offer Undo (undoToast, data-kp-row-delete) instead of asking first.', button);
        const refused = document.createElement('dialog');
        refused.setAttribute('data-kp-confirm-refused', '');
        return refused;
    }
    const text = phrase ?? button.getAttribute('data-kp-confirm') ?? s.confirm;
    const users = (
        dependents ??
        (button.getAttribute('data-kp-confirm-dependents') ?? '')
            .split(';')
            .map((name) => name.trim())
            .filter(Boolean)
    ).slice();
    const blockedAttribute = button.getAttribute('data-kp-confirm-blocked');
    const stop =
        blocked === undefined
            ? blockedAttribute === null
                ? null
                : blockedAttribute.trim() || s.confirmBlocked
            : blocked === false
              ? null
              : blocked === true
                ? s.confirmBlocked
                : blocked;

    // showModal() light-dismisses every open `popover="auto"` — measured
    // for AR28: the menu goes open → closed, the button stays connected
    // but checkVisibility() is false, and focus lands on <body>. TH107
    // requires focus to return to the BUTTON, so the button has to be
    // visible again first. Not a knob: it is what the feature promises.
    const displaced = [...document.querySelectorAll('[popover]')].filter((el) => el.matches(':popover-open'));

    const host = stackHost(button, stack);
    const id = `kp-confirm-${++dialogSeq}`;
    const dialog = document.createElement('dialog');
    dialog.className = `${host ? 'kp-confirm--inline' : 'kp-dialog'} kp-confirm ${className}`.trim();
    dialog.setAttribute('data-kp-confirm-dialog', '');
    dialog.setAttribute('aria-labelledby', `${id}-phrase`);
    dialog.setAttribute('aria-describedby', `${id}-description`);

    const title = document.createElement('h2');
    title.className = 'kp-dialog__title';
    title.id = `${id}-phrase`;
    title.textContent = text;

    const rich = richText !== undefined && typeof richText !== 'string';
    const description = document.createElement(rich ? 'div' : 'p');
    description.className = 'kp-dialog__description';
    description.id = `${id}-description`;
    // From markup [kyu-ux-1101]: `data-kp-confirm-description` is the sentence; empty drops it when the phrase already says it all.
    const describedBy = button.getAttribute('data-kp-confirm-description');
    // In its dialog's place the way out is Back, so the dictionary's sentence names Back where it named Cancel [uxdialogs1101].
    const ownSentence = unrepeated(s.confirmDescription, text, s);
    const plainText = typeof richText === 'string' ? richText : (describedBy ?? (host ? ownSentence.replace(s.confirmCancel, s.confirmBack) : ownSentence));
    if (stop === null && rich) description.append(...(Array.isArray(richText) ? richText : [richText]));
    else description.textContent = stop ?? plainText;
    const silent = stop === null && !rich && plainText.trim() === '';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'kp-button';
    cancel.setAttribute('data-kp-confirm-cancel', '');
    cancel.textContent = host && strings?.confirmCancel === undefined ? s.confirmBack : stop === null ? s.confirmCancel : s.confirmClose;
    cancel.addEventListener('click', () => dialog.close(''));

    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = acceptLook === 'primary' ? 'kp-button kp-button--primary' : 'kp-button kp-button--destructive';
    accept.setAttribute('data-kp-confirm-accept', '');
    const ownWord = s.confirmAccept === DEFAULT_STRINGS.confirmAccept ? s.confirmLabelFrom(text) : '';
    accept.textContent = acceptLabel ?? button.getAttribute('data-kp-confirm-label') ?? (ownWord || s.confirmAccept);
    if (acceptFollows !== undefined) {
        accept.setAttribute('data-kp-accept-follows', typeof acceptFollows === 'string' ? acceptFollows : acceptFollows.id);
        if (acceptVerb !== undefined) accept.setAttribute('data-kp-accept-verb', acceptVerb);
    }
    accept.addEventListener('click', () => {
        if (!accept.disabled) dialog.close('accept');
    });

    const actions = document.createElement('div');
    actions.className = 'kp-dialog__actions';
    // A removal something still depends on is a notice: one way out, nothing to confirm [kpadopt4].
    if (stop === null) actions.append(cancel, accept);
    else actions.append(cancel);
    if (silent) dialog.removeAttribute('aria-describedby');
    dialog.append(...(silent ? [title] : [title, description]));

    if (users.length > 0) {
        const block = document.createElement('section');
        block.className = 'kp-confirm__dependents';
        block.setAttribute('aria-labelledby', `${id}-dependents`);
        const heading = document.createElement('h3');
        heading.className = 'kp-dialog__heading';
        heading.id = `${id}-dependents`;
        heading.textContent = s.confirmDependents(users.length);
        const list = document.createElement('ul');
        list.className = 'kp-confirm__list';
        for (const name of users) {
            const item = document.createElement('li');
            item.textContent = name;
            list.append(item);
        }
        block.append(heading, list);
        dialog.append(block);
        dialog.setAttribute('aria-describedby', silent ? `${id}-dependents` : `${id}-description ${id}-dependents`);
    }

    // The typed name, opt-in: `typeName` or the button's `data-kp-confirm-type`.
    const name = typeName ?? button.getAttribute('data-kp-confirm-type') ?? '';
    /** @type {HTMLElement | null} */
    let field = null;
    if (name.trim() !== '' && stop === null) {
        dialog.classList.add('kp-confirm--typed');
        // The button's own words, without the "…" that said a question comes first: this press is the action.
        const own = (button.textContent ?? '').trim().replace(/\s*(?:…|\.\.\.)$/, '');
        accept.textContent = acceptLabel ?? button.getAttribute('data-kp-confirm-label') ?? (own || s.confirmAccept);
        const lostId = button.getAttribute('data-kp-confirm-loses');
        const lostSource = lostId ? byId(document, lostId) : null;
        const lost =
            loses ??
            (lostSource instanceof HTMLTemplateElement ? lostSource.content.cloneNode(true) : lostSource ? lostSource.cloneNode(true) : null);
        if (lost instanceof Element) {
            lost.removeAttribute('id');
            lost.removeAttribute('hidden');
        }
        const body = document.createElement('div');
        body.className = 'kp-dialog__body';
        const typed = buildTypeConfirm(document, {
            name,
            anyCase: anyCase ?? button.getAttribute('data-kp-confirm-case') === 'any',
            loses: lost,
            strings,
            onChange: (matched) => {
                accept.disabled = !matched;
            },
        });
        accept.disabled = !typed.matched();
        typed.input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !accept.disabled) {
                event.preventDefault();
                dialog.close('accept');
            }
        });
        body.append(typed.block);
        field = typed.input;
        dialog.append(body);
    }
    dialog.append(actions);
    // One level: the open menus go (show() does not light-dismiss them as showModal() does) and come back with the host's body.
    if (host) for (const popover of displaced) /** @type {HTMLElement} */ (popover).hidePopover();
    const giveBack = host ? takeOver(host, dialog) : null;
    if (!host) document.body.append(dialog);

    dialog.addEventListener('close', () => {
        const taken = dialog.returnValue === 'accept';
        dialog.remove();
        giveBack?.();
        for (const popover of displaced) {
            if (popover.isConnected && !popover.matches(':popover-open')) /** @type {HTMLElement} */ (popover).showPopover();
        }
        if (button.isConnected) button.focus();
        if (taken) onAccept?.();
        else onCancel?.();
    });

    if (host) dialog.show();
    else dialog.showModal();
    // The destructive answer must not be the one a stray Enter takes.
    // A consumer whose confirmation is not destructive says so [KT6].
    // A typed confirmation starts in its field: typing is the question; a notice on its one button.
    // A rich description that holds a field (a quantity, an input) starts in that field: choosing it is the question [fix-1031].
    field ??= stop === null && rich ? firstDescriptionField(description) : null;
    (field ?? (initialFocus === 'accept' && stop === null ? accept : cancel)).focus();
    return dialog;
}
