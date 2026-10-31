// A masked token inside a command line [kyu gap 15]: the page marks the secret part of the command, the block draws it masked,
// a Show button (beside Copy) shows it for as long as it is pressed in, and Copy copies the command with the real value.
//
//   <pre><code>curl -H "Authorization: Bearer <span data-kp-command-secret>kyu_7f3a…</span>" https://kyu.lan/v1/send</code></pre>
//
// Options on the block, each with its default:
//   data-kp-command-secret-mask     dots (default: eight dots, which say nothing of the length) | tail (dots and the last four
//                                   characters, so two tokens can be told apart)
//   data-kp-command-secret-reveal   on (default: a Show button) | off (never shown on screen; Copy still copies the real value)
// A secret's own `data-kp-command-secret="kyu token"` names it for a screen reader ("kyu token, hidden").

/** The dots a masked value shows, whatever its length. */
const MASK_DOTS = 8;
/** How many characters the `tail` mask keeps visible. */
const TAIL = 4;
/** The private-use marks that stand in for a secret while the lines are laid out: start, index, end. */
const OPEN_MARK = '';
const CLOSE_MARK = '';
const MARKED = new RegExp(`${OPEN_MARK}(\\d+)${CLOSE_MARK}`, 'g');

/** @typedef {{ value: string, name: string }} CommandSecret */

/**
 * Take the secrets out of the code: each is replaced by a mark the line layout keeps, and returned in order.
 * @param {Element} code
 * @returns {CommandSecret[]}
 */
export function takeSecrets(code) {
    /** @type {CommandSecret[]} */
    const found = [];
    for (const span of code.querySelectorAll('[data-kp-command-secret]')) {
        found.push({ value: span.textContent ?? '', name: span.getAttribute('data-kp-command-secret') ?? '' });
        span.replaceWith(`${OPEN_MARK}${found.length - 1}${CLOSE_MARK}`);
    }
    return found;
}

/** The masked face of a value. @param {string} value @param {string} look `dots` or `tail` */
export function maskOf(value, look) {
    const dots = '•'.repeat(MASK_DOTS);
    return look === 'tail' && value.length > TAIL * 2 ? `${dots}${value.slice(-TAIL)}` : dots;
}

/**
 * Put every secret back into the laid-out lines as a masked span, and return the command as it is copied (the real values).
 * @param {Document} doc @param {Element} code @param {CommandSecret[]} secrets
 * @param {{ look: string, hidden: (name: string) => string }} how
 * @returns {string}
 */
export function placeSecrets(doc, code, secrets, { look, hidden }) {
    const copied = (code.textContent ?? '').replace(MARKED, (_, i) => secrets[Number(i)]?.value ?? '');
    for (const row of code.querySelectorAll('.kp-command__line')) {
        const text = row.textContent ?? '';
        if (!text.includes(OPEN_MARK)) continue;
        row.replaceChildren();
        let at = 0;
        for (const match of text.matchAll(MARKED)) {
            const secret = secrets[Number(match[1])];
            row.append(text.slice(at, match.index));
            at = (match.index ?? 0) + match[0].length;
            if (!secret) continue;
            const span = doc.createElement('span');
            span.className = 'kp-command__secret';
            span.dataset.kpCommandSecretIndex = match[1];
            const face = doc.createElement('span');
            face.className = 'kp-command__secret-face';
            face.setAttribute('aria-hidden', 'true');
            face.textContent = maskOf(secret.value, look);
            const said = doc.createElement('span');
            said.className = 'kp-sr-only';
            said.textContent = hidden(secret.name);
            span.append(face, said);
            row.append(span);
        }
        row.append(text.slice(at));
    }
    return copied;
}

/**
 * The Show button: pressed in, the secrets show; its cell holds both words, so it keeps one width.
 * @param {Document} doc @param {{ show: string, hide: string, label: string }} words @param {string} codeId
 */
export function revealButton(doc, words, codeId) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'kp-button kp-button--sm kp-command__reveal';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-controls', codeId);
    button.setAttribute('aria-label', words.label);
    const face = doc.createElement('span');
    face.className = 'kp-command__reveal-face';
    for (const [word, when] of [
        [words.show, 'off'],
        [words.hide, 'on'],
    ]) {
        const part = doc.createElement('span');
        part.className = 'kp-command__reveal-word';
        part.dataset.kpWhen = /** @type {string} */ (when);
        part.textContent = /** @type {string} */ (word);
        face.append(part);
    }
    button.append(face);
    return button;
}

/**
 * Show or mask every secret of a block.
 * @param {Element} code @param {CommandSecret[]} secrets @param {boolean} shown @param {string} look
 * @param {(name: string) => string} hidden
 */
export function showSecrets(code, secrets, shown, look, hidden) {
    for (const span of code.querySelectorAll('.kp-command__secret')) {
        const secret = secrets[Number(span.getAttribute('data-kp-command-secret-index'))];
        if (!secret) continue;
        const face = span.querySelector('.kp-command__secret-face');
        const said = span.querySelector('.kp-sr-only');
        if (face) face.textContent = shown ? secret.value : maskOf(secret.value, look);
        if (said) said.textContent = shown ? '' : hidden(secret.name);
        if (face) face.toggleAttribute('aria-hidden', !shown);
        span.toggleAttribute('data-kp-command-secret-shown', shown);
    }
}
