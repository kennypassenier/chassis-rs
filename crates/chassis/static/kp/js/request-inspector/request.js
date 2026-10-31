// One captured request as a fold: its summary row (method, status, path, source, time), and its body built only when it is
// first opened: the headers (secrets masked with a Show of their own), the body as code, and the copy buttons.

import { setCode } from '../code.js';
import { agoMoment } from '../freshness.js';
import { formatBytes } from '../locale.js';
import { getStrings } from '../strings.js';
import { ITEM_REQUEST, MASK, SECRET_HEADERS, keyOf, make, msOf, pairsOf, pathNodes, toneOf } from './format.js';

/** @typedef {import('./format.js').Memory} Memory */
/** @typedef {import('./format.js').CapturedRequest} CapturedRequest */
/** @typedef {import('./format.js').InspectorOptions} InspectorOptions */
/** @typedef {ReturnType<typeof getStrings>} Strings */

/** The lines a body shows before it folds. */
const BODY_LINES = 10;

/**
 * @param {HTMLElement} el @param {Memory} memory @param {CapturedRequest} request @param {number} index its place among the shown
 * @param {number} slot its place among all, for its key
 */
export function drawRequest(el, memory, request, index, slot) {
    const doc = el.ownerDocument;
    const options = memory.options;
    const key = keyOf(request, slot);
    const tone = toneOf(request.status);
    const failed = request.status === undefined || request.status >= 400;
    const defaultOpen = options.open === 'first' ? index === 0 : options.open === 'failed' ? failed : false;
    const open = memory.opened.has(key) || (defaultOpen && !memory.closed.has(key));
    const item = /** @type {HTMLDetailsElement} */ (make(doc, 'kp-accordion__item kp-inspector__item', 'details'));
    item.setAttribute('role', 'listitem');
    item.dataset.kpRequestKey = key;
    item.dataset.kpRequestTone = tone;
    if (open) item.setAttribute('open', '');
    item.append(summaryOf(doc, request, tone));
    // A folded request holds no body yet: it is drawn when it is first opened, so what is out of sight is not in the page.
    let built = false;
    const ensure = () => {
        if (built) return;
        built = true;
        item.append(bodyOf(doc, request, options));
    };
    if (open) ensure();
    item.addEventListener('toggle', () => {
        if (item.open) {
            ensure();
            memory.opened.add(key);
            memory.closed.delete(key);
        } else {
            memory.opened.delete(key);
            memory.closed.add(key);
        }
    });
    ITEM_REQUEST.set(item, request);
    return item;
}

/** The summary row: method, status in words, path, a test's badge and the time. @param {Document} doc @param {CapturedRequest} request @param {ReturnType<typeof toneOf>} tone */
function summaryOf(doc, request, tone) {
    const strings = getStrings();
    const summary = make(doc, 'kp-accordion__summary kp-inspector__summary', 'summary');
    const method = make(doc, 'kp-inspector__method', 'span');
    method.textContent = request.method.toUpperCase();
    const path = make(doc, 'kp-inspector__path', 'span');
    path.append(...pathNodes(doc, request.path));
    const status = make(doc, `kp-badge kp-inspector__status${tone === 'none' ? '' : ` kp-badge--${tone === 'error' ? 'destructive' : tone}`}`, 'span');
    const word = { success: strings.reqToneSuccess, info: strings.reqToneInfo, warning: strings.reqToneWarning, error: strings.reqToneError, none: strings.reqToneNone }[tone];
    status.textContent = request.status === undefined ? word : `${request.status} ${word}`;
    const row = make(doc, 'kp-inspector__row', 'span');
    row.append(method, status, path);
    if (request.source === 'test') {
        const badge = make(doc, 'kp-badge kp-inspector__source', 'span');
        badge.textContent = strings.reqSourceTest;
        row.append(badge);
    }
    const at = msOf(request.at);
    if (Number.isFinite(at)) {
        const time = /** @type {HTMLTimeElement} */ (make(doc, 'kp-inspector__time', 'time'));
        time.dateTime = new Date(at).toISOString();
        time.title = new Date(at).toISOString();
        time.textContent = agoMoment(at);
        row.append(time);
    }
    summary.append(row);
    summary.setAttribute('aria-label', strings.reqSummary(request.method.toUpperCase(), request.path, status.textContent ?? ''));
    return summary;
}

/** The fold's body: headers, body, copy buttons. @param {Document} doc @param {CapturedRequest} request @param {InspectorOptions} options */
function bodyOf(doc, request, options) {
    const body = make(doc, 'kp-accordion__body kp-inspector__body');
    const secret = new Set((options.secretHeaders ?? SECRET_HEADERS).map((h) => h.toLowerCase()));
    const pairs = pairsOf(request.headers);
    body.append(...headersOf(doc, pairs, secret));
    const text = request.body ?? '';
    const binary = request.binary === true || text.includes('\u0000');
    codeInto(body, request, options, text, binary);
    body.append(actionsOf(doc, options, pairs, secret, text === '' || binary));
    return body;
}

/** Headers as key and value; a secret is drawn masked with a Show of its own. @param {Document} doc @param {[string, string][]} pairs @param {Set<string>} secret */
function headersOf(doc, pairs, secret) {
    const strings = getStrings();
    const title = make(doc, 'kp-inspector__heading', 'h4');
    title.textContent = strings.reqHeaders;
    if (pairs.length === 0) {
        const none = make(doc, 'kp-kv__none', 'p');
        none.textContent = strings.reqNoHeaders;
        return [title, none];
    }
    const kv = make(doc, 'kp-kv kp-kv--lines kp-inspector__headers', 'dl');
    for (const [name, value] of pairs) {
        const row = make(doc, 'kp-kv__row', 'div');
        const dt = make(doc, '', 'dt');
        dt.textContent = name;
        const dd = make(doc, '', 'dd');
        if (secret.has(name.toLowerCase())) dd.append(...maskedValue(doc, value, strings));
        else dd.textContent = value;
        row.append(dt, dd);
        kv.append(row);
    }
    return [title, kv];
}

/** A secret's value, masked, and its Show button. @param {Document} doc @param {string} value @param {Strings} strings */
function maskedValue(doc, value, strings) {
    const text = make(doc, 'kp-inspector__secret', 'span');
    text.textContent = MASK;
    text.dataset.value = value;
    text.setAttribute('aria-label', strings.reqSecretMasked);
    const show = /** @type {HTMLButtonElement} */ (make(doc, 'kp-button kp-button--sm kp-button--ghost', 'button'));
    show.type = 'button';
    show.dataset.kpRequestSecret = '';
    show.setAttribute('aria-pressed', 'false');
    show.textContent = strings.reqSecretShow;
    return [text, show];
}

/**
 * The body as code (js/code.js): binary and truncated say so themselves; no body says so in words.
 * @param {HTMLElement} body @param {CapturedRequest} request @param {InspectorOptions} options @param {string} text @param {boolean} binary
 */
function codeInto(body, request, options, text, binary) {
    const strings = getStrings();
    const doc = body.ownerDocument;
    if (text === '' && !binary) {
        const none = make(doc, 'kp-kv__none', 'p');
        none.textContent = strings.reqNoBody;
        const title = make(doc, 'kp-inspector__heading', 'h4');
        title.textContent = strings.reqBody;
        body.append(title, none);
        return;
    }
    const figure = make(doc, 'kp-code kp-inspector__code', 'figure');
    const bytes = new TextEncoder().encode(text).length;
    const size = request.bodyBytes ?? bytes;
    // The figure is in the body before setCode fills it, as it always was.
    body.append(figure);
    setCode(figure, {
        title: strings.reqBody,
        text: binary ? '' : text,
        language: 'auto',
        size: formatBytes(size),
        maxLines: BODY_LINES,
        lines: true,
        wrap: true,
        state: binary ? 'binary' : 'ready',
        truncated: request.truncated ? { shown: formatBytes(bytes), total: formatBytes(size) } : undefined,
        copy: options.copyAs?.includes('body') ?? true,
    });
}

/**
 * Copy as curl / JSON / body; the secrets go with the copy only when asked. The body has its own Copy in the code block's
 * head; a request without one gets a resting one here.
 * @param {Document} doc @param {InspectorOptions} options @param {[string, string][]} pairs @param {Set<string>} secret @param {boolean} noBody
 */
function actionsOf(doc, options, pairs, secret, noBody) {
    const strings = getStrings();
    const actions = make(doc, 'kp-inspector__actions');
    const what = options.copyAs ?? ['curl', 'json', 'body'];
    /** @param {string} which @param {string} label @param {boolean} real */
    const button = (which, label, real) => {
        const b = /** @type {HTMLButtonElement} */ (make(doc, 'kp-button kp-button--sm', 'button'));
        b.type = 'button';
        b.dataset.kpRequestsCopy = which;
        if (real) b.dataset.kpRequestsReal = '';
        const w = make(doc, 'kp-code__word', 'span');
        w.setAttribute('data-kp-code-words', [label, strings.copied].join('\n'));
        w.textContent = label;
        b.append(w);
        return b;
    };
    if (what.includes('curl')) actions.append(button('curl', strings.reqCopyCurl, false));
    if (what.includes('json')) actions.append(button('json', strings.reqCopyJson, false));
    const offerReal = options.secretsInCopy !== 'masked-only' && options.secretsInCopy !== 'real' && pairs.some(([n]) => secret.has(n.toLowerCase()));
    if (what.includes('curl') && offerReal) actions.append(button('curl', strings.reqCopyCurlSecrets, true));
    if (what.includes('body') && noBody) {
        const b = button('body', strings.reqCopyBody, false);
        b.disabled = true;
        actions.append(b);
    }
    return actions;
}
