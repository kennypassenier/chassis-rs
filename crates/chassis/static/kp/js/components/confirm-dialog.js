// The confirmation dialog and the buttons that open it.
import { getStrings } from '../strings.js';
import { buildTypeConfirm } from './type-confirm.js';

/** Ids for the dialog's title and description, unique per page. */
let dialogSeq = 0;
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
 * Rich content [mc-1030]: `description` may be a node or a list of nodes (several paragraphs, a list) in place of the dictionary's sentence,
 * and `acceptLook: 'primary'` draws Confirm as a primary button when what it does is not destructive (take a dose anyway, add stock).
 * `className: 'kp-dialog--wide'` gives it a wider step; the default is the narrow question width.
 * A dialog whose body holds a quantity [mc-r2]: `acceptFollows` (the quantity's id, or the quantity itself) makes Confirm say what will happen with the
 * amount chosen ("Add 3 boxes") and go off, with its reason, while the amount makes no sense; `acceptVerb` is the verb ("Add"). The two are written as
 * `data-kp-accept-follows` / `data-kp-accept-verb` on Confirm, and the page wires them with `attachAcceptFollows(dialog)` (js/accept-follows.js) next
 * to `attachQuantities(dialog)`: this module imports neither, so chassis's closure of six modules stays six.
 *
 * @param {HTMLElement} button the control the confirmation belongs to
 * @param {{ phrase?: string, description?: Node | readonly Node[] | string, acceptLook?: 'destructive' | 'primary', strings?: Partial<import('../strings.js').Strings>, onAccept?: () => void, onCancel?: () => void, className?: string, initialFocus?: 'cancel' | 'accept', dependents?: readonly string[], blocked?: string | boolean, typeName?: string, anyCase?: boolean, loses?: Node | readonly string[] | null, acceptLabel?: string, acceptFollows?: string | HTMLElement, acceptVerb?: string }} [options]
 * @returns {HTMLDialogElement} the dialog, so a consumer can reach the state this set [KT6]
 */
export function openConfirmation(
    button,
    { phrase, description: richText, acceptLook = 'destructive', strings, onAccept, onCancel, className = '', initialFocus = 'cancel', dependents, blocked, typeName, anyCase, loses, acceptLabel, acceptFollows, acceptVerb } = {},
) {
    const s = { ...getStrings(), ...strings };
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

    const id = `kp-confirm-${++dialogSeq}`;
    const dialog = document.createElement('dialog');
    dialog.className = `kp-dialog kp-confirm ${className}`.trim();
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
    if (stop === null && rich) description.append(...(Array.isArray(richText) ? richText : [richText]));
    else description.textContent = stop ?? (typeof richText === 'string' ? richText : s.confirmDescription);

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'kp-button';
    cancel.setAttribute('data-kp-confirm-cancel', '');
    cancel.textContent = stop === null ? s.confirmCancel : s.confirmClose;
    cancel.addEventListener('click', () => dialog.close(''));

    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = acceptLook === 'primary' ? 'kp-button kp-button--primary' : 'kp-button kp-button--destructive';
    accept.setAttribute('data-kp-confirm-accept', '');
    accept.textContent = acceptLabel ?? s.confirmAccept;
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
    dialog.append(title, description);

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
        dialog.setAttribute('aria-describedby', `${id}-description ${id}-dependents`);
    }

    // The typed name, opt-in: `typeName` or the button's `data-kp-confirm-type`.
    const name = typeName ?? button.getAttribute('data-kp-confirm-type') ?? '';
    /** @type {HTMLInputElement | null} */
    let field = null;
    if (name.trim() !== '' && stop === null) {
        dialog.classList.add('kp-confirm--typed');
        // The button's own words, without the "…" that said a question comes first: this press is the action.
        const own = (button.textContent ?? '').trim().replace(/\s*(?:…|\.\.\.)$/, '');
        accept.textContent = acceptLabel ?? button.getAttribute('data-kp-confirm-label') ?? (own || s.confirmAccept);
        const lostId = button.getAttribute('data-kp-confirm-loses');
        const lostSource = lostId ? document.getElementById(lostId) : null;
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
    document.body.append(dialog);

    dialog.addEventListener('close', () => {
        const taken = dialog.returnValue === 'accept';
        dialog.remove();
        for (const popover of displaced) {
            if (popover.isConnected && !popover.matches(':popover-open')) /** @type {HTMLElement} */ (popover).showPopover();
        }
        if (button.isConnected) button.focus();
        if (taken) onAccept?.();
        else onCancel?.();
    });

    dialog.showModal();
    // The destructive answer must not be the one a stray Enter takes.
    // A consumer whose confirmation is not destructive says so [KT6].
    // A typed confirmation starts in its field: typing is the question; a notice on its one button.
    (field ?? (initialFocus === 'accept' && stop === null ? accept : cancel)).focus();
    return dialog;
}
