// The notification centre's elements: built once per centre, then filled by the controller's render.

/**
 * An element with a class and, optionally, its text.
 * @param {Document} doc @param {string} tag @param {string} className @param {string} [text]
 * @returns {HTMLElement}
 */
export function make(doc, tag, className, text = '') {
    const node = doc.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
}

/**
 * A button of the given classes.
 * @param {Document} doc @param {string} className @param {string} [text]
 */
function button(doc, className, text = '') {
    const node = /** @type {HTMLButtonElement} */ (make(doc, 'button', className, text));
    node.type = 'button';
    return node;
}

/**
 * Build the parts of one centre. The counter, its panel and the voice exist in every look; the page look leaves the counter
 * and the panel out of the document.
 * @param {Document} doc
 * @param {string} id the panel's id, also the anchor name
 * @param {string} listLabel the list's accessible name
 */
export function buildParts(doc, id, listLabel) {
    const trigger = button(doc, 'kp-button kp-notices__trigger');
    const triggerLabel = make(doc, 'span', 'kp-notices__label');
    const badge = make(doc, 'span', 'kp-badge kp-notices__count');
    const moon = make(doc, 'span', 'kp-notices__moon', '☾');
    moon.setAttribute('aria-hidden', 'true');
    trigger.append(moon, triggerLabel, badge);
    const quietLine = make(doc, 'span', 'kp-notices__quiet');
    const panel = make(doc, 'div', 'kp-popover kp-notices__panel');
    panel.id = id;
    panel.setAttribute('popover', 'auto');
    panel.setAttribute('role', 'dialog');
    const head = make(doc, 'div', 'kp-notices__head');
    const heading = make(doc, 'strong', 'kp-notices__heading');
    const tools = make(doc, 'div', 'kp-notices__tools');
    const readAll = button(doc, 'kp-button kp-button--sm kp-notices__read-all');
    const endQuiet = button(doc, 'kp-button kp-button--sm kp-notices__end-quiet');
    tools.append(quietLine, endQuiet, readAll);
    head.append(heading, tools);
    const body = make(doc, 'div', 'kp-notices__body');
    const list = make(doc, 'ul', 'kp-notices__list');
    list.setAttribute('aria-label', listLabel);
    const state = make(doc, 'div', 'kp-notices__state');
    state.hidden = true;
    body.append(list, state);
    const sourcesBox = make(doc, 'div', 'kp-notices__sources');
    const foot = make(doc, 'div', 'kp-notices__foot');
    const inbox = /** @type {HTMLAnchorElement} */ (make(doc, 'a', 'kp-notices__inbox'));
    foot.append(inbox);
    const voice = make(doc, 'span', 'kp-sr-only');
    voice.setAttribute('role', 'status');
    return { trigger, triggerLabel, badge, moon, quietLine, panel, head, heading, readAll, endQuiet, body, list, state, sourcesBox, foot, inbox, voice };
}

/** @typedef {ReturnType<typeof buildParts>} NoticeParts */

/**
 * Put the parts in the host: the page look as a section, the preview as the same section without its head and switches but with
 * the Inbox link, the other looks as a counter that opens an anchored panel.
 * @param {HTMLElement} el @param {NoticeParts} p @param {boolean} isPage @param {boolean} [isPreview]
 */
export function mountParts(el, p, isPage, isPreview = false) {
    if (isPage) {
        const wrap = make(el.ownerDocument, 'section', 'kp-notices__page');
        if (isPreview) wrap.append(p.body, p.foot);
        else wrap.append(p.head, p.body, p.sourcesBox);
        el.replaceChildren(wrap, p.voice);
        return;
    }
    const id = p.panel.id;
    p.trigger.setAttribute('aria-haspopup', 'dialog');
    p.trigger.setAttribute('popovertarget', id);
    p.trigger.style.setProperty('anchor-name', `--${id}`);
    p.panel.style.setProperty('position-anchor', `--${id}`);
    p.panel.append(p.head, p.body, p.sourcesBox, p.foot);
    el.replaceChildren(p.trigger, p.panel, p.voice);
}
