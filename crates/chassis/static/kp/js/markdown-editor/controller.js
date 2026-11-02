// One Markdown editor: the page's text area with the toolbar above it and the preview beside it (wide) or behind a Write / Preview
// tab (narrow), the shortcuts, list continuation on Enter, and ticks in the preview written back into the text.

import { Controller } from '../controller.js';
import { MARKDOWN_TASK_EVENT, markdownFragment, toggleTaskLine } from '../markdown.js';
import { resolveStrings } from '../strings.js';
import { continueList, lineRange, link, prefixLines, wrap } from './edits.js';
import { buildToolbar, walkToolbar } from './toolbar.js';

/** Under this many rem of its own width the editor shows the text or the preview, under tabs, instead of both. */
const WIDE_REM = 48;
/** The root font size when the document gives none it can read [px]. */
const FALLBACK_REM_PX = 16;
/** The level a `#` heading takes in the preview when the editor names none. */
const PREVIEW_HEADINGS = 3;
/** The keys with Mod and the tool each presses. */
const SHORTCUTS = /** @type {Record<string, string>} */ ({ b: 'bold', i: 'italic', k: 'link' });

/** @param {Document} doc @param {string} tag @param {string} className */
const make = (doc, tag, className) => {
    const el = doc.createElement(tag);
    el.className = className;
    return el;
};

let editorSeq = 0;

export class MarkdownEditor extends Controller {
    /** @param {HTMLElement} host @param {{ strings?: Partial<import('../strings.js').Strings> }} [options] */
    constructor(host, options = {}) {
        super(host, options);
        this.strings = resolveStrings(options.strings);
        this.area = /** @type {HTMLTextAreaElement} */ (host.querySelector('textarea'));
        const doc = host.ownerDocument;
        this.preview = make(doc, 'div', 'kp-markdown kp-md-editor__preview');
        this.tabs = make(doc, 'div', 'kp-tabs__list kp-md-editor__tabs');
        /** What a narrow editor shows: the text or the preview. @type {'write' | 'preview'} */
        this.view = 'write';
        /** The frame a preview waits for, so a burst of typing draws it once. */
        this.frame = 0;
    }

    connect() {
        if (!this.area) throw new Error('kp-md-editor: the element holds no textarea to edit');
        const { host, area, strings } = this;
        const doc = host.ownerDocument;
        editorSeq += 1;
        area.id ||= `kp-md-editor-${editorSeq}`;
        area.classList.add('kp-md-editor__text');
        this.preview.id = `${area.id}-preview`;
        this.preview.setAttribute('role', 'region');
        this.preview.setAttribute('aria-label', strings.mdPreview);
        this.preview.tabIndex = 0;
        const bar = make(doc, 'div', 'kp-md-editor__bar');
        bar.append(buildToolbar(area, strings), this.buildTabs());
        const body = make(doc, 'div', 'kp-md-editor__body');
        area.replaceWith(body);
        body.append(area, this.preview);
        host.prepend(bar);
        host.classList.add('kp-md-editor');
        this.own(() => {
            body.replaceWith(area);
            bar.remove();
        });
        this.listen(bar, 'click', (event) => this.onTool(event));
        this.listen(bar, 'keydown', (event) => this.onBarKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(area, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(area, 'input', () => this.schedule());
        this.listen(this.preview, MARKDOWN_TASK_EVENT, (event) => this.onTick(/** @type {CustomEvent} */ (event)));
        const view = doc.defaultView;
        if (view && 'ResizeObserver' in view) this.observe(new view.ResizeObserver(() => this.layout())).observe(host);
        this.own(() => view?.cancelAnimationFrame(this.frame));
        this.layout();
        this.render();
    }

    /** The Write / Preview tabs of a narrow editor. */
    buildTabs() {
        const doc = this.host.ownerDocument;
        this.tabs.setAttribute('role', 'tablist');
        for (const [view, word] of /** @type {const} */ ([['write', this.strings.mdWrite], ['preview', this.strings.mdPreview]])) {
            const tab = make(doc, 'button', 'kp-tab kp-md-editor__tab');
            tab.setAttribute('type', 'button');
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', view === 'write' ? this.area.id : this.preview.id);
            tab.dataset.kpMdView = view;
            tab.textContent = word;
            this.tabs.append(tab);
        }
        return this.tabs;
    }

    /**
     * `data-kp-md-preview`: `side` (default: beside the text when wide, a tab when narrow), `tabs` (always a tab) or `off`.
     * @returns {'side' | 'tabs' | 'off'}
     */
    mode() {
        const mode = this.host.dataset.kpMdPreview;
        return mode === 'tabs' || mode === 'off' ? mode : 'side';
    }

    /** Lay out for the editor's own width and mode. */
    layout() {
        const rem = Number.parseFloat(getComputedStyle(this.host.ownerDocument.documentElement).fontSize) || FALLBACK_REM_PX;
        const narrow = this.host.clientWidth > 0 && this.host.clientWidth < WIDE_REM * rem;
        const mode = this.mode();
        const tabbed = mode === 'tabs' || (mode === 'side' && narrow);
        this.host.toggleAttribute('data-kp-md-tabbed', tabbed);
        this.tabs.hidden = !tabbed;
        this.area.hidden = tabbed && this.view === 'preview';
        this.preview.hidden = mode === 'off' || (tabbed && this.view === 'write');
        for (const tab of /** @type {HTMLElement[]} */ ([...this.tabs.children])) {
            const on = tab.dataset.kpMdView === this.view;
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
        }
        if (!this.preview.hidden) this.render();
    }

    /** Draw the preview in the next frame, once however often the text changed. */
    schedule() {
        const view = this.host.ownerDocument.defaultView;
        if (!view || this.frame) return;
        this.frame = view.requestAnimationFrame(() => {
            this.frame = 0;
            this.render();
        });
    }

    /** The preview, with ticking boxes; a box that had the focus has it again after the draw. */
    render() {
        if (this.preview.hidden || this.destroyed) return;
        const doc = this.host.ownerDocument;
        const focused = doc.activeElement instanceof HTMLElement && this.preview.contains(doc.activeElement) ? doc.activeElement.dataset.kpMdLine : undefined;
        const headings = Number.parseInt(this.host.dataset.kpMdHeadings ?? '', 10) || PREVIEW_HEADINGS;
        if (this.area.value.trim() === '') {
            const empty = make(doc, 'p', 'kp-md-editor__empty');
            empty.textContent = this.strings.mdPreviewEmpty;
            this.preview.replaceChildren(empty);
        } else this.preview.replaceChildren(markdownFragment(doc, this.area.value, { headings, tasks: 'toggle' }));
        if (focused !== undefined) /** @type {HTMLElement | null} */ (this.preview.querySelector(`[data-kp-md-line="${focused}"]`))?.focus();
    }

    /**
     * Make one change as one step the browser's undo takes back (`insertText`), or, where that is not offered, by hand with an
     * `input` event so the page hears it all the same.
     * @param {import('./edits.js').Edit} edit
     */
    apply({ from, to, text, select }) {
        const area = this.area;
        area.focus();
        area.setSelectionRange(from, to);
        const doc = area.ownerDocument;
        const done = text !== '' && typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, text);
        if (!done) {
            area.setRangeText(text, from, to, 'end');
            area.dispatchEvent(new Event('input', { bubbles: true }));
        }
        area.setSelectionRange(select[0], select[1]);
    }

    /** One tool. @param {string} id */
    use(id) {
        const { value, selectionStart: start, selectionEnd: end } = this.area;
        if (id === 'bold') this.apply(wrap(value, start, end, '**'));
        else if (id === 'italic') this.apply(wrap(value, start, end, '_'));
        else if (id === 'link') this.apply(link(value, start, end, this.strings.mdLinkText));
        else if (id === 'heading' || id === 'list' || id === 'task') this.apply(prefixLines(value, start, end, id));
    }

    /** @param {Event} event */
    onTool(event) {
        const target = event.target instanceof Element ? event.target : null;
        const tool = /** @type {HTMLElement | null} */ (target?.closest('[data-kp-md-tool]') ?? null);
        const tab = /** @type {HTMLElement | null} */ (target?.closest('[data-kp-md-view]') ?? null);
        if (tool) {
            if (this.area.hidden) this.show('write');
            this.use(tool.dataset.kpMdTool ?? '');
        } else if (tab) this.show(tab.dataset.kpMdView === 'preview' ? 'preview' : 'write');
    }

    /** @param {'write' | 'preview'} view */
    show(view) {
        this.view = view;
        this.layout();
    }

    /** @param {KeyboardEvent} event */
    onBarKey(event) {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (target?.closest('[data-kp-md-tool]')) walkToolbar(/** @type {HTMLElement} */ (target.parentElement), event);
        else if (target?.dataset.kpMdView && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            event.preventDefault();
            this.show(target.dataset.kpMdView === 'write' ? 'preview' : 'write');
            /** @type {HTMLElement | null} */ (this.tabs.querySelector(`[data-kp-md-view="${this.view}"]`))?.focus();
        }
    }

    /** Mod+B, Mod+I, Mod+K, and Enter in a list. @param {KeyboardEvent} event */
    onKey(event) {
        if (event.isComposing || event.altKey) return;
        const mod = event.ctrlKey || event.metaKey;
        const tool = mod && !event.shiftKey ? SHORTCUTS[event.key.toLowerCase()] : undefined;
        if (tool) {
            event.preventDefault();
            this.use(tool);
            return;
        }
        if (event.key !== 'Enter' || mod || event.shiftKey) return;
        const edit = continueList(this.area.value, this.area.selectionStart, this.area.selectionEnd);
        if (!edit) return;
        event.preventDefault();
        this.apply(edit);
    }

    /** A box ticked in the preview: its line in the text changes, heard by the page as `input`. @param {CustomEvent} event */
    onTick(event) {
        const range = lineRange(this.area.value, event.detail.line);
        if (!range) return;
        const line = this.area.value.slice(range[0], range[1]);
        this.area.setRangeText(toggleTaskLine(line, 0, event.detail.checked), range[0], range[1], 'preserve');
        this.area.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
