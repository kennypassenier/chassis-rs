// The elements of one list, built but not yet placed: the title, the stage with its rows and its note, the "show more" button and the status line.

/**
 * @param {HTMLElement} el the host
 * @param {string} id
 * @param {string} titleText the heading over the list
 */
export function buildRunsParts(el, id, titleText) {
    const doc = el.ownerDocument;
    const title = doc.createElement('p');
    title.className = 'kp-runs__title';
    title.id = `${id}-title`;
    title.textContent = titleText;
    const stage = doc.createElement('div');
    stage.className = 'kp-runs__stage';
    const list = doc.createElement('ol');
    list.className = 'kp-runs__list';
    list.setAttribute('aria-labelledby', title.id);
    const note = doc.createElement('div');
    note.className = 'kp-runs__state';
    note.hidden = true;
    stage.append(list, note);
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'kp-button kp-button--ghost kp-button--sm kp-runs__more';
    button.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    const live = doc.createElement('p');
    live.className = 'kp-sr-only';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    return { title, stage, list, note, button, live };
}
