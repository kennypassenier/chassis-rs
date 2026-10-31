// Colours one line of text as nodes: JSON keys and punctuation, TOML tables and values, shell commands, flags and variables.

import { make, span } from './dom.js';

/**
 * One line of JSON as nodes: keys in `.kp-code__key`, the punctuation in
 * `.kp-code__punct`, the rest as text. A JSON string never holds a raw
 * line break, so a line is always whole.
 * @param {Document} doc @param {string} line
 */
export function jsonLine(doc, line) {
    /** @type {Node[]} */
    const out = [];
    // A run of punctuation (`},` `],` `}]`) is ONE element: two spans side by side sat 0 px from each other.
    const pattern = /("(?:[^"\\]|\\.)*")(\s*:)?|([{}[\],:]+)/g;
    let last = 0;
    for (const match of line.matchAll(pattern)) {
        const at = match.index ?? 0;
        if (at > last) out.push(doc.createTextNode(line.slice(last, at)));
        if (match[1] !== undefined && match[2] !== undefined) {
            const key = make(doc, 'kp-code__key');
            key.textContent = match[1];
            // The colon is plain text of the line: next to the key's own element it would sit 0 px from it.
            out.push(key, doc.createTextNode(match[2]));
        } else if (match[1] !== undefined) out.push(doc.createTextNode(match[1]));
        else {
            const punct = make(doc, 'kp-code__punct');
            punct.textContent = match[3];
            out.push(punct);
        }
        last = at + match[0].length;
    }
    if (last < line.length) out.push(doc.createTextNode(line.slice(last)));
    return out;
}

/**
 * Two coloured spans side by side sit 0 px from each other (`["kenny"]`, `10,`, `$(git`). The punctuation one becomes plain text of
 * the line (as the JSON colon does); with no punctuation in the pair the first one does.
 * @param {Node[]} nodes @returns {Node[]}
 */
export function apart(nodes) {
    const isSpan = (/** @type {Node | undefined} */ n) => n !== undefined && n.nodeType === 1;
    const isPunct = (/** @type {Node} */ n) => /** @type {Element} */ (n).classList.contains('kp-code__punct');
    for (let i = 1; i < nodes.length; i += 1) {
        if (!isSpan(nodes[i - 1]) || !isSpan(nodes[i])) continue;
        const drop = isPunct(nodes[i]) ? i : i - 1;
        nodes[drop] = /** @type {Node} */ (nodes[drop].ownerDocument?.createTextNode(nodes[drop].textContent ?? ''));
    }
    return nodes;
}

/** The length of a TOML triple quote, which opens and closes a multi-line string. */
const TRIPLE = 3;

/**
 * The start of a TOML line: what is left of a multi-line string from the line before, or a [table] header. Pushes its nodes.
 * @param {Document} doc @param {string} line @param {{ open: string }} state @param {Node[]} out
 * @returns {string | null} the rest of the line to colour, or null when the whole line was string
 */
function tomlStart(doc, line, state, out) {
    if (state.open) {
        const end = line.indexOf(state.open);
        if (end === -1) {
            out.push(span(doc, 'kp-code__string', line));
            return null;
        }
        out.push(span(doc, 'kp-code__string', line.slice(0, end + TRIPLE)));
        state.open = '';
        return line.slice(end + TRIPLE);
    }
    const header = /^(\s*)(\[\[?[^\]]*\]\]?)(.*)$/.exec(line);
    if (!header) return line;
    out.push(doc.createTextNode(header[1]), span(doc, 'kp-code__section', header[2]));
    return header[3];
}

/**
 * A triple quote found at `at`: the string up to its closing quote, or to the end of the line when it stays open.
 * @param {Document} doc @param {string} rest @param {number} at @param {RegExpMatchArray} match @param {{ open: string }} state
 * @returns {[Node, number]} the node and how many characters it covers
 */
function tomlTriple(doc, rest, at, match, state) {
    const end = rest.indexOf(match[2], at + TRIPLE);
    if (end === -1) {
        state.open = match[2];
        return [span(doc, 'kp-code__string', rest.slice(at)), rest.length - at];
    }
    return [span(doc, 'kp-code__string', rest.slice(at, end + TRIPLE)), end + TRIPLE - at];
}

/**
 * The node for one TOML token and how many characters it covers.
 * @param {Document} doc @param {string} rest @param {number} at @param {RegExpMatchArray} match @param {{ open: string }} state
 * @returns {[Node, number]}
 */
function tomlToken(doc, rest, at, match, state) {
    const length = match[0].length;
    if (match[1] !== undefined) return [span(doc, 'kp-code__comment', match[1]), length];
    if (match[2] !== undefined) return tomlTriple(doc, rest, at, match, state);
    if (match[3] !== undefined) {
        const asKey = /^\s*=/.test(rest.slice(at + length)) && !rest.slice(0, at).includes('=');
        return [span(doc, asKey ? 'kp-code__key' : 'kp-code__string', match[3]), length];
    }
    if (match[4] !== undefined) return [span(doc, 'kp-code__key', match[4]), length];
    if (match[5] !== undefined) return [span(doc, 'kp-code__value', match[5]), length];
    return [span(doc, 'kp-code__punct', match[6]), length];
}

/**
 * One line of TOML as nodes. `state.open` carries a multi-line string (triple quotes) from one line to the next.
 * @param {Document} doc @param {string} line @param {{ open: string }} state
 */
export function tomlLine(doc, line, state) {
    /** @type {Node[]} */
    const out = [];
    const rest = tomlStart(doc, line, state, out);
    if (rest === null) return out;
    const pattern =
        /(#.*)|("""|''')|("(?:[^"\\]|\\.)*"|'[^']*')|([A-Za-z0-9_-]+(?=\s*(?:\.\s*[A-Za-z0-9_"'-]+\s*)*=))|(\b(?:true|false|inf|nan)\b|[+-]?\d[\w:.+-]*)|([{}[\],=])/g;
    let last = 0;
    for (const match of rest.matchAll(pattern)) {
        const at = match.index ?? 0;
        if (at < last) continue;
        if (at > last) out.push(doc.createTextNode(rest.slice(last, at)));
        const [node, length] = tomlToken(doc, rest, at, match, state);
        out.push(node);
        last = at + length;
    }
    if (last < rest.length) out.push(doc.createTextNode(rest.slice(last)));
    return out;
}

const SHELL_KEYWORDS = new Set([
    'if',
    'then',
    'else',
    'elif',
    'fi',
    'for',
    'while',
    'until',
    'do',
    'done',
    'case',
    'esac',
    'in',
    'function',
    'select',
]);

/** After these a new command starts. */
const SHELL_OPENS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until']);

/** The operators after which a new command starts. */
const SHELL_COMMAND_STARTS = ['&&', '||', '|', ';', '(', '`'];

/**
 * Where a shell line stands between tokens.
 * @typedef {object} ShellContext
 * @property {boolean} expectCommand the next word is a command
 * @property {boolean} assigned a `NAME=value` prefix was just seen: the value is not the command, the command after it still is
 * @property {boolean} commandAfter whether the word after the prefix is a command
 */

/**
 * A bare word of a shell line: a keyword, a command, or an argument.
 * @param {Document} doc @param {string} word @param {ShellContext} ctx @param {Node[]} out
 */
function shellWord(doc, word, ctx, out) {
    const keyword = ctx.expectCommand && SHELL_KEYWORDS.has(word);
    if (keyword) out.push(span(doc, 'kp-code__section', word));
    else if (ctx.expectCommand && !ctx.assigned) out.push(span(doc, 'kp-code__key', word));
    else out.push(doc.createTextNode(word));
    ctx.expectCommand = keyword && SHELL_OPENS.has(word);
}

/**
 * One token of a shell line, pushed as nodes; updates what the line expects next.
 * @param {Document} doc @param {RegExpMatchArray} match @param {ShellContext} ctx @param {Node[]} out
 */
function shellToken(doc, match, ctx, out) {
    const before = ctx.expectCommand;
    if (match[1] !== undefined) out.push(span(doc, 'kp-code__punct', match[1]));
    else if (match[3] !== undefined) {
        if (match[2]) out.push(doc.createTextNode(match[2]));
        out.push(span(doc, 'kp-code__comment', match[3]));
    } else if (match[4] !== undefined) {
        out.push(span(doc, 'kp-code__string', match[4]));
        ctx.expectCommand = false;
    } else if (match[5] !== undefined) {
        out.push(span(doc, 'kp-code__var', match[5]));
        ctx.expectCommand = match[5] === '$(';
    } else if (match[6] !== undefined) {
        out.push(span(doc, 'kp-code__punct', match[6]));
        ctx.expectCommand = SHELL_COMMAND_STARTS.includes(match[6]);
    } else if (match[7] !== undefined) {
        out.push(doc.createTextNode(match[7][0]), span(doc, 'kp-code__value', match[7].slice(1)));
        ctx.expectCommand = false;
    } else if (match[8] !== undefined) {
        out.push(span(doc, 'kp-code__var', match[8]));
        if (before) {
            ctx.assigned = true;
            ctx.commandAfter = true;
        }
        ctx.expectCommand = false;
    } else shellWord(doc, match[9], ctx, out);
}

/**
 * One line of shell as nodes: the command at the start of each command, its flags, quoted text, $variables, operators and comments.
 * @param {Document} doc @param {string} line
 */
export function shellLine(doc, line) {
    /** @type {Node[]} */
    const out = [];
    const pattern =
        /(^\s*\$(?=\s))|(^|\s)(#.*)|("(?:[^"\\]|\\.)*"|'[^']*')|(\$\{[^}]*\}|\$\(|\$[A-Za-z_][A-Za-z0-9_]*|\$[0-9?@#*!$])|(&&|\|\|?|;|>>?|<<?|\d?>&\d|\(|\)|`)|(\s--?[A-Za-z0-9][\w-]*)|([A-Za-z_][A-Za-z0-9_]*)(?==)|([^\s"'$|&;<>()`#=]+)/g;
    /** @type {ShellContext} */
    const ctx = { expectCommand: true, assigned: false, commandAfter: true };
    let last = 0;
    for (const match of line.matchAll(pattern)) {
        const at = match.index ?? 0;
        if (at < last) continue;
        if (at > last) out.push(doc.createTextNode(line.slice(last, at)));
        shellToken(doc, match, ctx, out);
        if (ctx.assigned && match[8] === undefined) {
            ctx.assigned = false;
            ctx.expectCommand = ctx.commandAfter;
        }
        last = at + match[0].length;
    }
    if (last < line.length) out.push(doc.createTextNode(line.slice(last)));
    return out;
}
