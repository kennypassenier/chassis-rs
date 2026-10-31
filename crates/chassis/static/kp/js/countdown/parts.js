// Builds a countdown's fixed elements (name, digits, status line, live line) and its buttons, whose words keep one width.

/**
 * Build one control of a timer: a package button whose words keep their width.
 * @param {Document} doc @param {string} className @param {string[]} words @param {string} [title]
 */
export function timerButton(doc, className, words, title) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `kp-button kp-button--sm ${className}`;
    const label = doc.createElement('span');
    label.className = 'kp-button__text kp-state-word kp-state-word--center';
    label.setAttribute('data-kp-words', words.join('\n'));
    label.textContent = words[0];
    button.append(label);
    if (title) button.title = title;
    return { button, label };
}

/** An element with a class. @param {Document} doc @param {string} tag @param {string} className */
function made(doc, tag, className) {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
}

/**
 * The parts of a countdown that stay for its whole life.
 * @param {Document} doc
 */
export function buildParts(doc) {
    const title = made(doc, 'p', 'kp-countdown__name');
    // The digits: one cell per character, so nothing moves while they change.
    const time = made(doc, 'p', 'kp-countdown__time');
    time.setAttribute('role', 'timer');
    time.setAttribute('aria-live', 'off');
    const digits = made(doc, 'span', 'kp-countdown__digits');
    digits.setAttribute('aria-hidden', 'true');
    const spoken = made(doc, 'span', 'kp-sr-only');
    time.append(digits, spoken);
    const line = made(doc, 'p', 'kp-countdown__status');
    const said = made(doc, 'span', 'kp-sr-only');
    said.setAttribute('role', 'status');
    return { title, time, digits, spoken, line, said };
}
