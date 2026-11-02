// Task lists in the markdown reader [habits-1101]: `- [ ] item` and `- [x] item` drawn as a checkbox with its words, and the
// source line a toggle edits. Opt-in with the reader's `tasks` option; without it they stay text, as approved.

/** A list item's text that is a task: its box and its words. */
export const TASK_ITEM = /^\[( |x|X)\]\s+(.*)$/;
/** A source line that holds a task (a quote's `>` and a list's indent and marker before the box). */
const TASK_LINE = /^(\s*(?:>\s?)*\s*(?:[-*+]|\d{1,9}[.)])\s+)\[( |x|X)\]/;
/** Fired on the checkbox, bubbling, when a reader drawn with `tasks: 'toggle'` has a task ticked or unticked: `{ line, checked, text }`. */
export const MARKDOWN_TASK_EVENT = 'kp-markdown-task';

/**
 * Draw one task into its list item: a label that holds the checkbox and the words. `fill` writes the inline words into the span.
 * @param {HTMLLIElement} li @param {RegExpExecArray} task the TASK_ITEM match @param {number} line the source line, from 0
 * @param {'show' | 'toggle'} mode `show` draws the box disabled; `toggle` lets it be ticked and reports it
 * @param {(target: HTMLElement, text: string) => void} fill
 */
export function drawTask(li, task, line, mode, fill) {
    const doc = li.ownerDocument;
    li.classList.add('kp-markdown__task');
    const label = doc.createElement('label');
    label.className = 'kp-markdown__check';
    const box = doc.createElement('input');
    box.type = 'checkbox';
    box.className = 'kp-field__check';
    box.checked = task[1] !== ' ';
    box.dataset.kpMdLine = String(line);
    box.disabled = mode !== 'toggle';
    const words = doc.createElement('span');
    fill(words, task[2]);
    label.append(box, words);
    li.append(label);
    if (mode === 'toggle')
        box.addEventListener('change', () => {
            box.dispatchEvent(new CustomEvent(MARKDOWN_TASK_EVENT, { bubbles: true, detail: { line, checked: box.checked, text: words.textContent ?? '' } }));
        });
}

/**
 * The text with the task on `line` ticked or unticked; the text unchanged when that line holds no task.
 * @param {string} text @param {number} line from 0, as `kp-markdown-task` reports it @param {boolean} checked
 * @returns {string}
 */
export function toggleTaskLine(text, line, checked) {
    const lines = String(text ?? '').split(/\r?\n/);
    const at = lines[line];
    if (at === undefined || !TASK_LINE.test(at)) return text;
    lines[line] = at.replace(TASK_LINE, (_, lead) => `${lead}[${checked ? 'x' : ' '}]`);
    return lines.join('\n');
}
