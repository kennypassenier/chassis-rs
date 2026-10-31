// Builds the bar's elements, the list entries and the refusal alert; no behaviour, only structure and classes.

/**
 * A button with a type and a class.
 * @param {Document} doc @param {string} className @param {string} [text]
 */
function button(doc, className, text) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = className;
    if (text !== undefined) b.textContent = text;
    return b;
}

/** @param {Document} doc @param {string} tag @param {string} className */
function make(doc, tag, className) {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
}

/**
 * The bar: the "No changes" words, the count chip, Discard, More and Save.
 * @param {Document} doc @param {import('../strings.js').Strings} s @param {string} id
 */
function buildBar(doc, s, id) {
    const bar = make(doc, 'div', 'kp-unsaved__bar');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', s.unsavedGroup);
    const none = make(doc, 'span', 'kp-unsaved__none');
    none.textContent = s.unsavedNone;
    const chip = button(doc, 'kp-badge kp-badge--info kp-unsaved__count');
    chip.setAttribute('aria-haspopup', 'dialog');
    chip.setAttribute('aria-expanded', 'false');
    chip.setAttribute('aria-controls', `${id}-list`);
    chip.hidden = true;
    const actions = make(doc, 'div', 'kp-unsaved__actions');
    const discard = button(doc, 'kp-button kp-unsaved__discard', s.unsavedDiscard);
    const save = button(doc, 'kp-button kp-button--primary kp-unsaved__save');
    const more = make(doc, 'div', 'kp-menu-button kp-unsaved__more');
    more.dataset.kpMenuButton = '';
    const moreButton = button(doc, 'kp-button kp-unsaved__more-button', s.unsavedMore);
    const moreMenu = make(doc, 'div', 'kp-menu kp-menu--rich');
    moreMenu.setAttribute('role', 'menu');
    moreMenu.setAttribute('aria-label', s.unsavedMore);
    more.append(moreButton, moreMenu);
    actions.append(discard, more, save);
    bar.append(none, chip, actions);
    return { bar, none, chip, discard, save, more, moreButton };
}

/**
 * The list of changes, on the popover plate.
 * @param {Document} doc @param {import('../strings.js').Strings} s @param {string} id
 */
function buildPanel(doc, s, id) {
    const panel = make(doc, 'div', 'kp-popover kp-unsaved__panel');
    panel.id = `${id}-list`;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', s.unsavedListTitle);
    panel.hidden = true;
    const head = make(doc, 'div', 'kp-unsaved__panel-head');
    const headTitle = make(doc, 'p', 'kp-unsaved__panel-title');
    const first = button(doc, 'kp-button kp-button--ghost kp-button--sm kp-unsaved__first', s.unsavedGoFirst);
    head.append(headTitle, first);
    const list = make(doc, 'ul', 'kp-unsaved__entries');
    panel.append(head, list);
    return { panel, headTitle, first, list };
}

/**
 * Everything one bar is made of, and the elements that go next to it (the problem line, the live region).
 * @param {Document} doc @param {import('../strings.js').Strings} s @param {string} id
 */
export function buildParts(doc, s, id) {
    const problem = make(doc, 'div', 'kp-unsaved__problem');
    problem.hidden = true;
    const live = make(doc, 'p', 'kp-sr-only');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    return { ...buildBar(doc, s, id), problem, live, ...buildPanel(doc, s, id) };
}

/**
 * The Save button's content: its words, and the spinner layer while the page saves.
 * @param {Document} doc @param {HTMLElement} save @param {string} label @param {boolean} saving
 */
export function paintSaveButton(doc, save, label, saving) {
    save.replaceChildren();
    const text = make(doc, 'span', 'kp-button__text');
    text.textContent = label;
    save.append(text);
    if (saving) {
        const layer = make(doc, 'span', 'kp-button__busy');
        layer.setAttribute('aria-hidden', 'true');
        layer.append(make(doc, 'span', 'kp-spinner'));
        save.append(layer);
    }
    save.toggleAttribute('data-kp-busy', saving);
    save.toggleAttribute('aria-busy', saving);
}

/**
 * One line of the list: the row's name (a jump), `was → now`, and its own Revert.
 * @param {Document} doc @param {import('../strings.js').Strings} s @param {import('./config.js').UnsavedChange} ch
 * @param {(ch: import('./config.js').UnsavedChange) => void} onJump @param {(ch: import('./config.js').UnsavedChange) => void} onRevert
 */
export function buildEntry(doc, s, ch, onJump, onRevert) {
    const li = make(doc, 'li', 'kp-unsaved__entry');
    const key = button(doc, 'kp-unsaved__jump', ch.key);
    key.title = s.unsavedGoTo(ch.key);
    key.addEventListener('click', () => onJump(ch));
    const change = make(doc, 'span', 'kp-unsaved__diff');
    const was = make(doc, 'del', 'kp-unsaved__was');
    was.textContent = ch.was;
    const arrow = make(doc, 'span', 'kp-unsaved__arrow');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    const now = make(doc, 'ins', 'kp-unsaved__now');
    now.textContent = ch.now;
    change.append(was, arrow, now);
    const revert = button(doc, 'kp-button kp-button--ghost kp-button--sm kp-unsaved__revert', s.unsavedRevert);
    revert.setAttribute('aria-label', s.unsavedRevertOne(ch.key));
    revert.addEventListener('click', () => onRevert(ch));
    li.append(key, change, revert);
    return li;
}

/**
 * The alert the bar shows when the page refused some changes.
 * @param {Document} doc @param {import('../strings.js').Strings} s @param {Record<string, string>} refused
 * @param {number} savedCount how many changes were sent @param {() => void} onDismiss
 */
export function buildAlert(doc, s, refused, savedCount, onDismiss) {
    const keys = Object.keys(refused);
    const alert = make(doc, 'div', 'kp-alert kp-alert--destructive kp-unsaved__alert');
    const body = make(doc, 'div', 'kp-alert__body');
    const title = make(doc, 'strong', 'kp-unsaved__alert-title');
    const savedN = savedCount - keys.length;
    title.textContent = savedN > 0 ? s.unsavedPartly(savedN, keys.length) : s.unsavedRefused(keys.length);
    const ul = make(doc, 'ul', 'kp-unsaved__alert-list');
    for (const key of keys) {
        const li = doc.createElement('li');
        li.textContent = s.unsavedWhy(key, refused[key]);
        ul.append(li);
    }
    const dismiss = button(doc, 'kp-button kp-button--ghost kp-button--sm kp-unsaved__dismiss', s.unsavedDismiss);
    dismiss.addEventListener('click', onDismiss);
    body.append(title, ul);
    alert.append(body, dismiss);
    return alert;
}
