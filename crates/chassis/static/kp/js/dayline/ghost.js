// The copy of a source that follows the pointer while it is carried to the day timeline [parts-1102 r2]. It is the source itself,
// cloned inside an empty copy of its list (so the list's own rules still paint it), inert and without ids, as wide as the source,
// held where it was grabbed. It stands in the top layer (a manual popover), so no scrolling box, transform or dialog clips it or
// lies over it; a browser without popovers places it fixed instead.

/**
 * @param {HTMLElement} source
 * @param {HTMLElement} home where the copy is kept in the document (the day timeline), so it travels with its section
 * @param {PointerEvent} down the press that grabbed it
 * @returns {{ follow: (e: PointerEvent) => void, remove: () => void }}
 */
export function liftCopy(source, home, down) {
    const doc = source.ownerDocument;
    const box = source.getBoundingClientRect();
    const grab = { x: down.clientX - box.left, y: down.clientY - box.top };
    const ghost = doc.createElement('div');
    ghost.className = 'kp-dayline__ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.style.inlineSize = `${box.width}px`;
    const list = /** @type {HTMLElement} */ (source.parentElement?.cloneNode(false) ?? doc.createElement('div'));
    const clone = /** @type {HTMLElement} */ (source.cloneNode(true));
    for (const el of [list, clone, ...clone.querySelectorAll('[id]')]) el.removeAttribute('id');
    for (const name of ['data-kp-dayline-source', 'data-kp-lifted', 'aria-labelledby', 'aria-describedby']) list.removeAttribute(name);
    clone.removeAttribute('data-kp-lifted');
    list.append(clone);
    ghost.append(list);
    const top = typeof ghost.showPopover === 'function';
    if (top) ghost.popover = 'manual';
    home.append(ghost);
    if (top) ghost.showPopover();
    const follow = (/** @type {{ clientX: number, clientY: number }} */ e) => {
        ghost.style.translate = `${Math.round(e.clientX - grab.x)}px ${Math.round(e.clientY - grab.y)}px`;
    };
    follow(down);
    return {
        follow,
        remove: () => ghost.remove(),
    };
}
