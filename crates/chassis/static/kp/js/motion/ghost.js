// The stand-in that plays a leaving element's exit while the element itself folds its space shut.

/** A same-shaped copy of `el`, laid over it and inert, placed to the pixel. @param {HTMLElement} el @returns {HTMLElement} */
export function ghostOf(el) {
    const actor = /** @type {HTMLElement} */ (el.cloneNode(true));
    actor.setAttribute('aria-hidden', 'true');
    actor.inert = true;
    Object.assign(actor.style, {
        position: 'absolute',
        top: `${el.offsetTop}px`,
        left: `${el.offsetLeft}px`,
        width: `${el.offsetWidth}px`,
        height: `${el.offsetHeight}px`,
        margin: '0',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        zIndex: '1',
    });
    el.after(actor);
    // Offsets round to whole pixels and skip some borders; correct by
    // what the two boxes measure.
    const want = el.getBoundingClientRect();
    const got = actor.getBoundingClientRect();
    actor.style.top = `${el.offsetTop + want.top - got.top}px`;
    actor.style.left = `${el.offsetLeft + want.left - got.left}px`;
    return actor;
}
