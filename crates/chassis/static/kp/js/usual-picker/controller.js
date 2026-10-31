// One usual picker: the combobox it stands on, extended with the band, the guard, the check, its keys and its live options.
import { attachComboboxes, combobox, CHANGE_EVENT } from '../combobox.js';
import { getStrings } from '../strings.js';
import { registerShortcuts } from '../shortcuts.js';
import { memoryFor } from '../remember.js';
import { addName } from './add.js';
import { arrange, paintHeaders, paintTail } from './layout.js';
import { exactItem, pickedValues } from './lookup.js';
import { attr, bandValues, canFold, folded, make, models, readItems } from './model.js';
import { pick, sayAfter } from './picking.js';
import { usualState } from './state.js';
import { render, syncCheck, syncHint, syncPanel } from './sync.js';
import { UsualPickerInput } from './input.js';
/** @typedef {import('./types.js').UsualModel} UsualModel */
/** @typedef {ReturnType<typeof combobox>} ComboboxHandle */

/** The options that draw the picker again when they change at run time. */
const LIVE_OPTIONS = [
    'data-kp-usual',
    'data-kp-usual-source',
    'data-kp-usual-max',
    'data-kp-usual-label',
    'data-kp-usual-while-typing',
    'data-kp-order',
    'data-kp-pinned',
    'data-kp-all',
    'data-kp-add',
    'data-kp-near',
    'data-kp-near-threshold',
    'data-kp-near-max',
    'data-kp-not-today',
    'data-kp-not-today-label',
    'data-kp-usual-undo',
    'data-kp-hint',
    'data-kp-state',
];

/**
 * Make one picker ready for the combobox: tag mode and the empty row it needs, before the combobox attaches.
 * @param {HTMLElement} box
 */
function prepare(box) {
    if (box.hasAttribute('data-kp-multiple') && !box.hasAttribute('data-kp-tags')) {
        box.setAttribute('data-kp-tags', '');
        if (!box.querySelector('[data-kp-tag-list]')) {
            const tags = make('div', 'kp-tag-list');
            tags.setAttribute('data-kp-tag-list', '');
            box.querySelector('input')?.before(tags);
        }
    }
    const list = box.querySelector('[role="listbox"]');
    if (list && !list.querySelector('[data-kp-combobox-empty]')) {
        const empty = make('li', 'kp-combobox__empty kp-usual__empty');
        empty.setAttribute('role', 'presentation');
        empty.setAttribute('data-kp-combobox-empty', '');
        empty.hidden = true;
        list.append(empty);
    }
    box.dataset.kpUsualReady = '';
}

/**
 * The model of a picker whose combobox is wired: its own parts are laid beside the field.
 * @param {HTMLElement} box @param {NonNullable<ComboboxHandle>} handle @param {HTMLInputElement} input @param {HTMLElement} list
 * @returns {UsualModel}
 */
function newModel(box, handle, input, list) {
    const panel = make('div', 'kp-usual__state');
    panel.hidden = true;
    const hintEl = make('p', 'kp-usual__hint');
    hintEl.hidden = true;
    input.after(hintEl);
    const noteEl = make('p', 'kp-usual__note');
    // It says the add itself (the status line keeps its count), so a screen reader hears it once.
    noteEl.setAttribute('aria-live', 'polite');
    noteEl.hidden = true;
    hintEl.after(noteEl);
    box.append(panel);
    const status = /** @type {HTMLElement | null} */ (box.querySelector('[data-kp-combobox-status]'));
    return {
        box,
        input,
        list,
        status,
        handle,
        items: [],
        given: null,
        expanded: false,
        nextFrom: null,
        notToday: new Set(),
        panel,
        busy: null,
        hintEl,
        noteEl,
        check: null,
        checkKey: '',
        checkOff: () => {},
        silent: false,
    };
}

/** One usual picker; its model stays the `models` registry entry that usualPicker() and the setters read. */
export class UsualPickerControl extends UsualPickerInput {
    connect() {
        const box = this.host;
        prepare(box);
        attachComboboxes(box.parentElement ?? document);
        const handle = combobox(box);
        const input = /** @type {HTMLInputElement | null} */ (box.querySelector('input[role="combobox"]'));
        const list = /** @type {HTMLElement | null} */ (box.querySelector('[role="listbox"]'));
        // A box the combobox could not wire is left as it is, and lets go of itself so a later call may try again.
        if (!handle || !input || !list) return this.destroy();
        usualState.serial += 1;
        const m = newModel(box, handle, input, list);
        this.adopt(m);
        models.set(box, m);
        // Registered first, so it runs last: the parts the picker laid go after every listener, as before.
        this.own(() => this.release());
        const memory = box.hasAttribute('data-kp-remember') ? memoryFor(box, 'picker') : null;
        if (memory) m.expanded = Boolean(memory.read('expanded', false));
        box.classList.add('kp-usual');
        readItems(m);
        this.extend(memory);
        arrange(m);
        handle.refresh();
        syncPanel(m);
        this.wire();
        if (attr(m, 'preselect') === 'usual' && box.hasAttribute('data-kp-tags') && handle.values().length === 0) handle.set(bandValues(m));
        syncHint(m);
        syncCheck(m);
    }

    /** The listeners, the Alt U entry and the option watch, set up so that destroy() removes them in the old order. */
    wire() {
        const m = this.m;
        this.listen(m.input, 'input', () => this.onInput());
        this.listen(m.input, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)), { capture: true });
        this.listen(m.box, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(m.box, CHANGE_EVENT, (event) => this.onChange(event));
        const jump = { keys: 'Alt U', what: getStrings().usualJump, group: 'Picker', when: () => bandValues(m).length > 0, run: () => false };
        this.own(registerShortcuts(m.box, [jump]));
        this.observe(new MutationObserver(() => render(m))).observe(m.box, { attributes: true, attributeFilter: LIVE_OPTIONS });
    }

    /** The picker's parts leave, and the box is a plain combobox again. */
    release() {
        const m = this.m;
        m.handle.extend(null);
        m.busy?.remove();
        m.panel.remove();
        m.hintEl.remove();
        m.noteEl.remove();
        m.checkOff();
        m.check?.remove();
        for (const node of m.list.querySelectorAll('[data-kp-synth], .kp-usual__tail')) node.remove();
        models.delete(m.box);
        delete m.box.dataset.kpUsualReady;
    }

    /** Extend the combobox: which rows show, the tail and headings, the status line and the rows the picker answers itself. @param {ReturnType<typeof memoryFor> | null} memory */
    extend(memory) {
        const m = this.m;
        m.handle.extend({
            shown: (option, query, matched) => {
                if (option.hasAttribute('data-kp-more')) return query === '' && canFold(m);
                if (option.hasAttribute('data-kp-pinned')) return query === '' || matched;
                if (option.hasAttribute('data-kp-synth')) return true;
                if (query === '') return !(folded(m) && option.hasAttribute('data-kp-rest'));
                return matched;
            },
            after: () => {
                // The guard first (it folds a near name's own row into its question), then the headings over what is left.
                paintTail(m, m.input.value.trim());
                paintHeaders(m);
            },
            status: (query) => this.statusOf(query),
            choose: (option) => this.choose(option, memory),
        });
    }

    /** The status line: a name typed that is already picked, or how many usual and other choices there are. @param {string} query */
    statusOf(query) {
        const m = this.m;
        if (query !== '') {
            // A name typed that is already picked: the status says what the list's own line says.
            const same = exactItem(m, query);
            return same && pickedValues(m).includes(same.value) ? getStrings().usualAlreadyPicked(same.label) : null;
        }
        const band = bandValues(m).length;
        return band > 0 ? getStrings().usualStatus(band, m.items.length - band) : null;
    }

    /**
     * A row the picker answers itself: More, Add, a near name's question; a pinned row only marks where the pick came from.
     * @param {HTMLElement} option @param {ReturnType<typeof memoryFor> | null} memory
     * @returns {boolean} whether the picker took the row
     */
    choose(option, memory) {
        const m = this.m;
        if (option.hasAttribute('data-kp-more')) {
            m.expanded = !m.expanded;
            memory?.write('expanded', m.expanded);
            arrange(m);
            m.handle.refresh();
            return true;
        }
        if (option.classList.contains('kp-usual__add')) {
            addName(m, m.input.value.trim(), null);
            return true;
        }
        if (option.classList.contains('kp-usual__near')) {
            const value = option.dataset.kpNearValue ?? '';
            pick(m, value, 'typed');
            sayAfter(m, getStrings().usualSelectedExisting(m.items.find((i) => i.value === value)?.label ?? value));
            return true;
        }
        if (option.hasAttribute('data-kp-pinned')) m.nextFrom = 'pinned';
        return false;
    }
}
