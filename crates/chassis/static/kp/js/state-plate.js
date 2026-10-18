// The plate an empty or failed area is drawn with [kpadopt5-ops].
//
// Kenny's rules of 2026-10-16 and 2026-10-17 (docs/RULES.md): failed, empty
// and loading states fill the component's full normal footprint with a
// normal-size action, and empty and failed are prominent, centred, set at the
// heading size in the theme's own empty plate or alert, never a small line in
// a corner. The operations components (the master-detail panes, the
// notification centre) each need that plate, so it is built once:
//
//   const plate = statePlate(document, { kind: 'error', title: 'Could not read it', text: 'The host did not answer.', actionLabel: 'Retry', onAction: reload });
//   area.append(plate);
//
// `kind: 'empty'` is the package's empty state (`.kp-empty`, dashed, muted);
// `kind: 'error'` is the destructive alert (`.kp-alert--destructive`). Both
// carry `.kp-stateplate`, which centres the words in the whole box it is
// given (give the plate the area's size: `block-size: 100%` in a grid cell)
// and sets the title at the heading size. The action is a normal-size
// `.kp-button`, never a strip. Nothing runs on import.

/**
 * @typedef {object} StatePlateOptions
 * @property {'empty' | 'error'} kind
 * @property {string} title what is the case, in one line
 * @property {string} [text] one sentence more: why, or what fills it
 * @property {string} [actionLabel] the action's words (an error always has one when `onAction` is given)
 * @property {(event: MouseEvent) => void} [onAction] what the action does
 * @property {string} [actionAttribute] a data attribute written on the action (so a container can listen for it by delegation)
 */

/**
 * Build an empty or failed plate.
 * @param {Document} doc
 * @param {StatePlateOptions} options
 * @returns {HTMLElement}
 */
export function statePlate(doc, { kind, title, text, actionLabel, onAction, actionAttribute }) {
    const plate = doc.createElement('div');
    plate.className =
        kind === 'error' ? 'kp-alert kp-alert--destructive kp-stateplate kp-stateplate--error' : 'kp-empty kp-stateplate kp-stateplate--empty';
    plate.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    const head = doc.createElement('strong');
    head.className = 'kp-stateplate__title';
    head.textContent = title;
    plate.append(head);
    if (text) {
        const line = doc.createElement('span');
        line.className = 'kp-stateplate__text';
        line.textContent = text;
        plate.append(line);
    }
    if (actionLabel) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'kp-button kp-stateplate__action';
        button.textContent = actionLabel;
        if (actionAttribute) button.setAttribute(actionAttribute, '');
        if (onAction) button.addEventListener('click', onAction);
        plate.append(button);
    }
    return plate;
}
