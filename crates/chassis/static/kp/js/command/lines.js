// The lines of a command, each with whether it carries on from the line before, laid out one to a line.

/**
 * The lines of a command, each with whether it carries on from the line before.
 * @param {string} text the command as written
 * @param {readonly string[]} continues the line ends that carry the command on (a continuation mark, a pipe)
 * @returns {{ text: string, continued: boolean }[]}
 */
export function commandLines(text, continues) {
    const lines = text
        .replace(/\r\n?/g, '\n')
        .replace(/^\n+|\s+$/g, '')
        .split('\n');
    let carry = false;
    return lines.map((line) => {
        const row = { text: line, continued: carry };
        const end = line.trimEnd();
        carry = continues.some((mark) => end.endsWith(mark));
        return row;
    });
}

/**
 * Every line on a line of its own, behind the prompt the stylesheet draws; the newlines stay in the text (in
 * hidden spans), so a copy is the command as written.
 * @param {Document} doc @param {Element} code @param {readonly string[]} continues
 */
export function layoutLines(doc, code, continues) {
    const lines = commandLines(code.textContent ?? '', continues);
    code.replaceChildren();
    lines.forEach((line, i) => {
        const row = doc.createElement('span');
        row.className = 'kp-command__line';
        if (line.continued) row.dataset.kpContinued = '';
        row.textContent = line.text;
        code.append(row);
        // The newline is kept for the copy but not drawn: each line is already a block of its own.
        if (i < lines.length - 1) {
            const gap = doc.createElement('span');
            gap.hidden = true;
            gap.textContent = '\n';
            code.append(gap);
        }
    });
}
