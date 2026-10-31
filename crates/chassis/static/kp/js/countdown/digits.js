// The digit cells: one cell per character, rebuilt only when the format changes, else only the digits that changed are written.

/** What kind of cell a character is. @param {string} ch */
const kindOf = (ch) => (ch === ':' ? 'colon' : /\d/.test(ch) ? 'digit' : 'unit');

/** The digits of one countdown. */
export class Digits {
    /** @param {HTMLElement} cells the element that holds the cells */
    constructor(cells) {
        this.cells = cells;
        /** The text drawn now. */
        this.shown = '';
    }

    /** Draw a text. @param {string} text */
    paint(text) {
        if (text === this.shown) return;
        const doc = this.cells.ownerDocument;
        const shown = this.shown;
        if (text.length !== shown.length || [...text].some((ch, i) => kindOf(ch) !== kindOf(shown[i]))) {
            this.cells.replaceChildren(
                ...[...text].map((ch) => {
                    const cell = doc.createElement('span');
                    cell.className = `kp-countdown__${kindOf(ch)}`;
                    cell.textContent = ch;
                    return cell;
                }),
            );
        } else {
            [...text].forEach((ch, i) => {
                if (ch !== shown[i]) /** @type {HTMLElement} */ (this.cells.children[i]).textContent = ch;
            });
        }
        this.shown = text;
    }
}
