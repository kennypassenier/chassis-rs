// The type-to-confirm field: its constants, matching and markup, and the typed confirmation blocks a page puts in its own dialog.
import { Controller, attachOne } from '../controller.js';
import { getStrings } from '../strings.js';

/** Dispatched on the offending element, bubbling, with the Violation as detail. */
export const VIOLATION_EVENT = 'kp-contract-violation';
/** @typedef {'DI10' | 'DI4'} Rule */
/** @typedef {{ rule: Rule, element: Element, message: string }} Violation */

/**
 * How long the `inline` variant stays armed.
 *
 * DI10's evidence, which is not the folklore: "undo beats confirmation"
 * has no controlled study behind it, while confirmations carrying a small
 * obstacle still worked for 44-74% of users after some twenty exposures,
 * against 20% or less for purely visual ones. Arm-then-act was that
 * obstacle until 4.0.0; it is now the `inline` variant, and the default
 * is the dialog TH107 asks for.
 *
 * Configurable rather than hard-coded, because it is an operational knob:
 * a dashboard whose users delete all day wants a longer window than a
 * settings page. Per element too, as `data-kp-confirm-ms`.
 */
export const CONFIRM_WINDOW_MS = 4000;
/** The two confirmation obstacles: the dialog TH107 asks for, and the arm-then-act 3.x shipped. */
export const CONFIRM_MODES = /** @type {const} */ (['dialog', 'inline']);
/** Marks a button whose confirmation another channel already owns [AR29]. */
export const CONFIRM_OWNED = '[data-kp-confirm-owner]';
/** Fired on a typed confirmation block whenever what is typed starts or stops matching: `{ matched, value, name }`. */
export const TYPE_CONFIRM_EVENT = 'kp-type-confirm';
/** A typed confirmation block a page puts in its own dialog or form. */
export const TYPE_CONFIRM = '[data-kp-type-confirm]';
/**
 * Whether `typed` is the name [kpadopt4-ideas]. Spaces at the start and the
 * end never count (a name pasted with a trailing space is the name); capitals
 * count unless `anyCase`. Nothing else is forgiven: the point is that the
 * reader looked at the name.
 * @param {string} typed @param {string} name @param {{ anyCase?: boolean }} [options]
 */
export function typeConfirmMatches(typed, name, { anyCase = false } = {}) {
    const a = typed.trim();
    const b = name.trim();
    if (b === '') return false;
    return anyCase ? a.toLocaleLowerCase() === b.toLocaleLowerCase() : a === b;
}
let typeSeq = 0;
/**
 * The typed confirmation [kpadopt4-ideas; Kenny, 2026-10-16]: what will be
 * lost, the field the name is typed into, the rule it is matched by and a
 * line that says whether it matches, in one block that keeps its height
 * while the reader types. `onChange(matched)` runs whenever the answer turns.
 * Used by openConfirmation() for `data-kp-confirm-type`, and by
 * attachTypeConfirms() for a block a page puts in its own dialog.
 *
 * `id` is the typed field's own id (a page whose steps address it by a stable name, `act-confirm`); the label points at it and the rule
 * and status lines take `<id>-rule` and `<id>-status`. Without it the id is generated (`kp-type-confirm-N-input`). `fieldName` is the
 * field's `name` for a form. (`name` stays what has to be typed.) [wish-1120, homelab 123]
 *
 * @param {Document} doc
 * @param {{ name: string, id?: string, fieldName?: string, anyCase?: boolean, loses?: Node | readonly string[] | null, strings?: Partial<import('../strings.js').Strings>, onChange?: (matched: boolean, value: string) => void, block?: HTMLElement }} options
 * @returns {{ block: HTMLElement, input: HTMLInputElement, matched: () => boolean }}
 */
export function buildTypeConfirm(doc, { name, id: fieldId, fieldName, anyCase = false, loses = null, strings, onChange, block: given }) {
    const s = { ...getStrings(), ...strings };
    const base = fieldId ? fieldId : `kp-type-confirm-${++typeSeq}`;
    const id = base;
    const inputId = fieldId ? fieldId : `${base}-input`;
    const block = given ?? doc.createElement('div');
    block.classList.add('kp-type-confirm', 'kp-field');
    block.replaceChildren();

    if (loses !== null && (!Array.isArray(loses) || loses.length > 0)) {
        const box = doc.createElement('div');
        box.className = 'kp-type-confirm__loses';
        const head = doc.createElement('p');
        head.className = 'kp-type-confirm__loses-title';
        head.id = `${id}-loses`;
        head.textContent = s.typeConfirmLoses;
        box.append(head);
        if (Array.isArray(loses)) {
            const list = doc.createElement('ul');
            list.className = 'kp-type-confirm__list';
            list.setAttribute('aria-labelledby', head.id);
            for (const line of loses) {
                const item = doc.createElement('li');
                item.textContent = line;
                list.append(item);
            }
            box.append(list);
        } else box.append(/** @type {Node} */ (loses));
        block.append(box);
    }

    // The label is the dictionary's sentence with the name set in as code, wherever the language puts it.
    const label = doc.createElement('label');
    label.className = 'kp-field__label kp-type-confirm__label';
    label.htmlFor = inputId;
    const [before, after = ''] = s.typeConfirmLabel('\u0000').split('\u0000');
    const code = doc.createElement('code');
    code.className = 'kp-type-confirm__name';
    code.textContent = name;
    label.append(before, code, after);

    const input = doc.createElement('input');
    input.type = 'text';
    input.className = 'kp-field__input kp-type-confirm__input';
    input.id = inputId;
    if (fieldName) input.name = fieldName;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('aria-describedby', `${id}-rule ${id}-status`);

    const rule = doc.createElement('p');
    rule.className = 'kp-field__help kp-type-confirm__rule';
    rule.id = `${id}-rule`;
    rule.textContent = anyCase ? s.typeConfirmRuleAnyCase : s.typeConfirmRuleExact;

    // One line, always there, so nothing moves when the answer turns.
    const status = doc.createElement('p');
    status.className = 'kp-type-confirm__status';
    status.id = `${id}-status`;
    status.setAttribute('aria-live', 'polite');

    block.append(label, input, rule, status);

    const field = new TypeConfirmField({ doc, block, input, status, name, anyCase, onChange, words: s });
    input.addEventListener('input', () => field.update());
    field.update();
    return { block, input, matched: () => field.matched };
}

/** One live type-to-confirm field: whether the typed name matches, and the status line and event when that answer turns. */
class TypeConfirmField {
    /**
     * @param {{ doc: Document, block: HTMLElement, input: HTMLInputElement, status: HTMLElement, name: string, anyCase: boolean,
     *   onChange?: (matched: boolean, value: string) => void, words: import('../strings.js').Strings }} parts
     */
    constructor({ doc, block, input, status, name, anyCase, onChange, words }) {
        this.doc = doc;
        this.block = block;
        this.input = input;
        this.status = status;
        this.name = name;
        this.anyCase = anyCase;
        this.onChange = onChange;
        this.words = words;
        /** Whether the typed text matches the name, as last announced. */
        this.matched = false;
    }

    /** Read the field: draw the status line, and announce the answer when it turns. */
    update() {
        const { doc, block, input, status, name, words: s } = this;
        const now = typeConfirmMatches(input.value, name, { anyCase: this.anyCase });
        const typed = input.value.trim() !== '';
        block.dataset.kpMatched = String(now);
        if (now) {
            const badge = doc.createElement('span');
            badge.className = 'kp-badge kp-badge--success kp-type-confirm__match';
            badge.textContent = s.typeConfirmMatched;
            status.replaceChildren(badge);
        } else status.textContent = typed ? s.typeConfirmMismatch : '';
        if (now === this.matched) return;
        this.matched = now;
        this.onChange?.(now, input.value);
        block.dispatchEvent(new CustomEvent(TYPE_CONFIRM_EVENT, { bubbles: true, detail: { matched: now, value: input.value, name } }));
    }
}
/**
 * Wire every typed confirmation block a page put in its own dialog or form
 * [kpadopt4-ideas]:
 *
 *   <div data-kp-type-confirm="media" data-kp-type-confirm-for="wipe" data-kp-type-confirm-loses="wipe-list"></div>
 *   <button type="button" class="kp-button kp-button--destructive" id="wipe">Wipe media</button>
 *
 * The block is filled (what is lost, the field, the rule, the match line),
 * and the button `data-kp-type-confirm-for` names stays disabled until the
 * name is typed; `data-kp-type-confirm-case="any"` lets capitals pass. The
 * block fires `kp-type-confirm` when the answer turns. Detach empties the
 * block and gives the button back its own disabled state.
 *
 * @param {ParentNode} [root]
 * @param {{ strings?: Partial<import('../strings.js').Strings> }} [options]
 * @returns {() => void} detach
 */
export function attachTypeConfirms(root = document, { strings } = {}) {
    // A block marked attached is wired already, by this call's controller or an earlier one.
    const made = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(TYPE_CONFIRM)])
        .filter((block) => !('kpTypeConfirmAttached' in block.dataset))
        .map((block) => attachOne(block, TypeConfirmControl, { strings }));
    return () => {
        for (const control of made.splice(0)) control?.destroy();
    };
}

/** One typed confirmation block a page put in its own dialog or form: the button it holds back and that button's own disabled state. */
class TypeConfirmControl extends Controller {
    /** @param {HTMLElement} host @param {{ strings?: Partial<import('../strings.js').Strings> }} [options] */
    constructor(host, options = {}) {
        super(host, options);
        this.strings = options.strings;
        const target = host.dataset.kpTypeConfirmFor ? host.ownerDocument.getElementById(host.dataset.kpTypeConfirmFor) : null;
        /** The button `data-kp-type-confirm-for` names, kept disabled until the name is typed. */
        this.button = target instanceof HTMLButtonElement || target instanceof HTMLInputElement ? target : null;
        /** Whether the page had disabled that button itself; detach gives it back. */
        this.wasDisabled = this.button?.disabled ?? false;
    }

    connect() {
        const block = this.host;
        const doc = block.ownerDocument;
        block.dataset.kpTypeConfirmAttached = '';
        this.own(() => {
            block.replaceChildren();
            block.classList.remove('kp-type-confirm', 'kp-field');
            delete block.dataset.kpMatched;
            delete block.dataset.kpTypeConfirmAttached;
            if (this.button) this.button.disabled = this.wasDisabled;
        });
        const lostSource = block.dataset.kpTypeConfirmLoses ? doc.getElementById(block.dataset.kpTypeConfirmLoses) : null;
        const lost = lostSource instanceof HTMLTemplateElement ? lostSource.content.cloneNode(true) : lostSource ? lostSource.cloneNode(true) : null;
        if (lost instanceof Element) {
            lost.removeAttribute('id');
            lost.removeAttribute('hidden');
        }
        const typed = buildTypeConfirm(doc, {
            name: block.dataset.kpTypeConfirm ?? '',
            anyCase: block.dataset.kpTypeConfirmCase === 'any',
            loses: lost,
            strings: this.strings,
            block,
            onChange: (matched) => this.hold(matched),
        });
        this.hold(typed.matched());
    }

    /** The button is on only while the name matches, and never when the page had disabled it. @param {boolean} matched */
    hold(matched) {
        if (this.button) this.button.disabled = !matched || this.wasDisabled;
    }
}
