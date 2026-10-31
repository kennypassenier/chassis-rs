// One dated option picker: its options, its choice, its states, radio rows or a combobox, the type-ahead and the page's handle [kpadopt5-time].

import { Controller } from '../controller.js';
import { openBusyCard } from '../busy-card.js';
import { CHANGE_EVENT as COMBOBOX_EVENT, combobox } from '../combobox.js';
import { getStrings } from '../strings.js';
import { COMBOBOX_ROWS, DATED_EVENT, DATED_RETRY_EVENT, DEFAULT_ROWS, TYPEAHEAD_MS } from './constants.js';
import { drawCombobox } from './combobox-draw.js';
import { paintNote } from './note.js';
import { drawRadios } from './radios.js';
import { newestOf, titleOf } from './rows.js';
import { readSettings } from './settings.js';
import { orderDated } from './time.js';

/** The controller of one `[data-kp-dated]` picker. */
export class DatedController extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {{ now?: () => number }} [options] `now` so a test never reads the real clock
     */
    constructor(host, options = {}) {
        super(host, options);
        const doc = host.ownerDocument;
        this.strings = getStrings();
        this.settings = readSettings(host, options.now);
        this.stage = doc.createElement('div');
        this.body = doc.createElement('div');
        this.note = doc.createElement('div');
        this.live = doc.createElement('p');
        /** @type {import('./constants.js').DatedOption[]} */
        this.shown = [];
        /** @type {string | null} */
        this.chosen = null;
        /** The value to choose when the options arrive. @type {string | undefined} */
        this.pendingValue = undefined;
        /** @type {import('./constants.js').DatedState} */
        this.state = 'ready';
        /** @type {import('./constants.js').DatedStateOptions} */
        this.given = {};
        /** @type {'radio' | 'combobox'} */
        this.kind = 'radio';
        /** @type {import('../busy-card.js').BusyCard | null} */
        this.busy = null;
        this.drawn = false;
        /** @type {(() => void) | null} */
        this.detachCombobox = null;
        /** The height the picker had with its options, kept while a state stands in for them. */
        this.kept = 0;
        /** Set while a script's choice goes through the combobox's handle, so the listener does not act twice. */
        this.suppress = false;
        this.typed = '';
        this.typedAt = 0;
        /** What a page gets back from datedOptions(). @type {import('./constants.js').DatedHandle} */
        this.handle = {
            element: host,
            set: (options, value) => this.setOptions(options, value),
            setState: (next, how) => this.setState(next, how),
            value: () => this.chosen,
            select: (value) => this.choose(value, false),
            options: () => this.shown.slice(),
            state: () => this.state,
        };
    }

    connect() {
        const el = this.host;
        const { stage, body, note, live } = this;
        el.classList.add('kp-dated');
        el.dataset.kpDatedAttached = '';
        if (!this.settings.column) el.dataset.kpMetaColumnOff = '';
        stage.className = 'kp-dated__stage';
        body.className = 'kp-dated__body';
        note.className = 'kp-dated__state';
        note.hidden = true;
        stage.append(body, note);
        live.className = 'kp-sr-only';
        live.setAttribute('role', 'status');
        live.setAttribute('aria-live', 'polite');
        el.replaceChildren(stage, live);
        this.listen(el, 'change', (event) => this.onChange(event));
        this.listen(el, COMBOBOX_EVENT, (event) => this.onCombobox(event));
        this.listen(el, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(el, 'keydown', (event) => this.onType(/** @type {KeyboardEvent} */ (event)));
        this.own(() => this.undoDom());
        // A data area shows its loading state from the first frame; the page hands over the options after.
        this.pendingValue = el.dataset.kpValue;
        this.setState('loading');
    }

    /** Take away what the picker drew and marked. */
    undoDom() {
        const el = this.host;
        this.detachCombobox?.();
        this.busy?.remove();
        el.replaceChildren();
        el.style.removeProperty('--kp-dated-rows');
        delete el.dataset.kpDatedAttached;
        delete el.dataset.kpPickerKind;
    }

    // --- Giving the picker its options and its state. ---
    /** Give the picker its options (none: the empty state), and optionally the value to choose. @param {readonly import('./constants.js').DatedOption[]} options @param {string | null} [value] */
    setOptions(options, value) {
        this.shown = orderDated(options, this.settings.order);
        const wanted = value === undefined ? (this.chosen ?? this.pendingValue ?? null) : value;
        const keep = wanted !== null && this.shown.some((o) => o.value === wanted && !o.disabled) ? wanted : null;
        const first = this.settings.preselect ? (newestOf(this.shown) ?? this.shown.find((o) => !o.disabled) ?? null) : null;
        this.chosen = keep ?? (value === null ? null : (first?.value ?? null));
        this.state = this.shown.length === 0 ? 'empty' : 'ready';
        this.sync();
    }

    /** @param {import('./constants.js').DatedState} next @param {import('./constants.js').DatedStateOptions} [options] */
    setState(next, options = {}) {
        this.given = { ...this.given, ...options };
        this.state = next === 'ready' && this.shown.length === 0 ? 'empty' : next;
        this.sync();
    }

    /** Draw the options or the placeholder rows for the picker's kind and state. */
    draw() {
        const { mode, inlineMax, rowsWanted } = this.settings;
        const doc = this.host.ownerDocument;
        this.detachCombobox?.();
        this.detachCombobox = null;
        const placeholders = this.state === 'loading' && this.shown.length === 0;
        this.kind = mode === 'auto' ? (this.shown.length > inlineMax ? 'combobox' : 'radio') : mode;
        this.host.dataset.kpPickerKind = this.kind;
        this.host.style.setProperty('--kp-dated-rows', String(rowsWanted || (this.kind === 'combobox' ? COMBOBOX_ROWS : DEFAULT_ROWS)));
        if (placeholders) {
            const wait = doc.createElement('div');
            wait.className = 'kp-dated__wait';
            wait.setAttribute('aria-hidden', 'true');
            for (let i = 0; i < (rowsWanted || DEFAULT_ROWS); i++) {
                const bar = doc.createElement('span');
                bar.className = 'kp-skeleton kp-dated__bar';
                wait.append(bar);
            }
            this.body.replaceChildren(wait);
        } else if (this.kind === 'radio') drawRadios(this);
        else drawCombobox(this);
        this.body.toggleAttribute('inert', this.state !== 'ready');
        if (this.state === 'loading') this.body.setAttribute('aria-busy', 'true');
        else this.body.removeAttribute('aria-busy');
    }

    /** Bring the picker in step with its state: the kept height, the drawing, the note and the busy card. */
    sync() {
        const { stage, host } = this;
        if (this.state === 'ready') {
            this.kept = 0;
            host.style.removeProperty('--kp-dated-keep');
        } else if (stage.dataset.kpWas === 'ready') {
            this.kept = stage.offsetHeight;
            host.style.setProperty('--kp-dated-keep', `${this.kept}px`);
        }
        stage.dataset.kpWas = this.state;
        this.draw();
        paintNote(this);
        host.dataset.kpState = this.state;
        if (this.state === 'loading' && !this.busy) {
            this.busy = openBusyCard(stage, { words: this.strings.datedLoading, area: () => [stage], className: 'kp-dated__busy', arrive: this.drawn });
        } else if (this.state !== 'loading' && this.busy) {
            const card = this.busy;
            this.busy = null;
            void card.close();
        }
        this.drawn = true;
    }

    // --- Choosing. ---
    /** Choose a value; `fire` is a person's choice (event and announcement), else a script's. @param {string | null} value @param {boolean} fire */
    choose(value, fire) {
        const option = this.shown.find((o) => o.value === value) ?? null;
        if (option?.disabled) return;
        this.chosen = option ? option.value : null;
        if (this.kind === 'radio') {
            for (const input of this.body.querySelectorAll('input[type="radio"]')) {
                /** @type {HTMLInputElement} */ (input).checked = /** @type {HTMLInputElement} */ (input).value === this.chosen;
            }
        } else this.chooseInCombobox(fire);
        if (fire && option) {
            this.live.textContent = this.strings.datedChosen(titleOf(this, option));
            this.host.dispatchEvent(new CustomEvent(DATED_EVENT, { bubbles: true, detail: { value: option.value, option } }));
        }
    }

    /** Write the choice into the hidden value and, for a script's choice, through the combobox's handle. @param {boolean} fire */
    chooseInCombobox(fire) {
        const hidden = this.body.querySelector('.kp-dated__value');
        if (hidden instanceof HTMLInputElement) hidden.value = this.chosen ?? '';
        const box = this.body.querySelector('.kp-combobox');
        if (box && fire === false) {
            // The combobox writes its own field; a script's choice goes through its handle without our listener acting twice.
            this.suppress = true;
            combobox(box)?.set(this.chosen === null ? [] : [this.chosen]);
            this.suppress = false;
        }
    }

    // --- Events. ---
    /** @param {Event} event */
    onChange(event) {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.type === 'radio' && this.body.contains(target)) this.choose(target.value, true);
    }

    /** @param {Event} event */
    onCombobox(event) {
        if (this.suppress || event.target === this.host) return;
        const detail = /** @type {CustomEvent} */ (event).detail;
        if (detail?.action === 'add' || detail?.action === 'set') this.choose(String(detail.value), detail.action === 'add');
    }

    /** @param {MouseEvent} event */
    onClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-kp-dated-retry]')) this.host.dispatchEvent(new CustomEvent(DATED_RETRY_EVENT, { bubbles: true, detail: { element: this.host } }));
    }

    /** Type a few letters on the radio rows: the first option whose name starts with them is chosen. @param {KeyboardEvent} event */
    onType(event) {
        if (this.kind !== 'radio' || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 || !(event.target instanceof HTMLInputElement)) return;
        const t = Date.now();
        this.typed = t - this.typedAt > TYPEAHEAD_MS ? event.key.toLowerCase() : this.typed + event.key.toLowerCase();
        this.typedAt = t;
        const hit = this.shown.find((o) => !o.disabled && titleOf(this, o).toLowerCase().startsWith(this.typed));
        if (!hit) return;
        const input = [...this.body.querySelectorAll('input[type="radio"]')].find((i) => /** @type {HTMLInputElement} */ (i).value === hit.value);
        if (input instanceof HTMLInputElement) {
            input.focus();
            input.checked = true;
            this.choose(hit.value, true);
        }
    }
}
