// The request inspector [kpadopt5; chassis' captured requests and the clients dialog, kyu's delivery attempts].
//
// A foldable block per HTTP request the service captured: the method, the path,
// the status (in its tone and in words), when; opened, the headers as key and
// value, the body as code, "showing the first N of M", and Copy as curl, as JSON
// or as the body. It composes parts the package already has (`.kp-card` and its
// four states, `.kp-accordion`, `.kp-kv`, `.kp-code`, `.kp-badge`,
// `.kp-segmented`); the one new piece of logic is toCurl().
//
//   <div class="kp-card kp-inspector" data-kp-requests data-kp-requests-open="failed"></div>
//
//   setRequests(el, [{ at: '2026-10-17T20:18:03+02:00', method: 'POST', path: '/hooks/backup', status: 202,
//       headers: { 'content-type': 'application/json', authorization: 'Bearer …' },
//       body: '{"ok":true}', truncated: false, bodyBytes: 11, source: 'client' }]);
//
// Options, as attributes and as the second argument of attachRequestInspectors():
//
//   data-kp-secret-headers      header names masked on screen and in a copy (default authorization, cookie, set-cookie, x-api-key, proxy-authorization)
//   data-kp-secrets-in-copy     `masked` (default: the copy carries ******** and a separate button, "Copy curl with secrets", carries the real values) |
//                               `masked-only` (no such button) | `real` (every copy carries them)
//   data-kp-requests-open       `none` (default, Kenny 2026-10-17: all folded) | `failed` (the 4xx and 5xx are open) | `first`
//   data-kp-requests-max        how many show before "Show N older" (default 20), newest first
//   data-kp-copy-as             `curl,json,body` (default all three)
//   data-kp-requests-test       `false` leaves the Send test button out of the empty list
//
// The block has the card's four states (js/card-state.js): `setRequestsState(el,
// 'loading')` lays the busy card over the list at least three rows tall, an empty list
// says so, centred, with Send test (event `kp-requests-test`), a failed one has Retry
// (`kp-requests-retry`). The times are dd/mm/yyyy HH:MM with the exact ISO in the title.
// Events on the element: `kp-requests-copy` `{ what, masked }`.

import { getStrings } from './strings.js';
import { setCardState, attachCardStates } from './card-state.js';
import { setCode } from './code.js';
import { formatBytes } from './locale.js';
import { agoMoment } from './freshness.js';
import { attachSegmented } from './segmented.js';

/** The inspectors this module looks after. */
export const REQUESTS = '[data-kp-requests]';
/** The header names masked unless the page says otherwise. */
export const SECRET_HEADERS = Object.freeze(['authorization', 'cookie', 'set-cookie', 'x-api-key', 'proxy-authorization']);
/** What a masked value is drawn as. */
export const MASK = '********';
/** How many requests show before "Show older". */
export const REQUESTS_MAX = 20;
/** Fired on the element after a copy: `{ what: 'curl' | 'json' | 'body', masked }`. */
export const REQUESTS_COPY_EVENT = 'kp-requests-copy';
/** Fired when the empty list's Send test is pressed. */
export const REQUESTS_TEST_EVENT = 'kp-requests-test';
/** Fired when the failed list's Retry is pressed. */
export const REQUESTS_RETRY_EVENT = 'kp-requests-retry';
/** How long "Copied" stays [ms]. */
export const REQUESTS_COPIED_MS = 1500;

/**
 * @typedef {object} CapturedRequest
 * @property {string | number} [at] the moment: ISO text or milliseconds
 * @property {string} method
 * @property {string} path
 * @property {number} [status]
 * @property {Record<string, string> | [string, string][]} [headers]
 * @property {string} [body]
 * @property {boolean} [truncated] only the start of the body was kept
 * @property {number} [bodyBytes] the size of the whole body
 * @property {boolean} [binary]
 * @property {string} [source] `test` marks a request the page sent itself
 * @property {string} [url] the full address, for curl (otherwise `origin` + path)
 */

/**
 * @typedef {object} InspectorOptions
 * @property {readonly string[]} [secretHeaders]
 * @property {'masked' | 'masked-only' | 'real'} [secretsInCopy]
 * @property {'failed' | 'first' | 'none'} [open]
 * @property {number} [max]
 * @property {readonly ('curl' | 'json' | 'body')[]} [copyAs]
 * @property {string} [origin] put before a path that is not a full address
 */

/**
 * @typedef {object} Memory
 * @property {CapturedRequest[]} list
 * @property {string} filter
 * @property {number} shown
 * @property {Set<string>} opened keys the reader opened
 * @property {Set<string>} closed keys the reader closed
 * @property {InspectorOptions} options
 * @property {InspectorOptions} given what the page passed to attachRequestInspectors()
 */

/** @type {WeakMap<HTMLElement, Memory>} */
const MEMORY = new WeakMap();
/** The request each drawn item shows. @type {WeakMap<Element, CapturedRequest>} */
const ITEM_REQUEST = new WeakMap();

/** @param {Document} doc @param {string} className @param {string} [tag] */
const make = (doc, className, tag = 'div') => {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
};

/** @param {CapturedRequest['headers']} headers @returns {[string, string][]} */
const pairsOf = (headers) => (Array.isArray(headers) ? headers : Object.entries(headers ?? {}));

/** @param {number | undefined} status @returns {'success' | 'info' | 'warning' | 'error' | 'none'} */
export function toneOf(status) {
    if (status === undefined || !Number.isFinite(status)) return 'none';
    if (status >= 500) return 'error';
    if (status >= 400) return 'warning';
    if (status >= 300) return 'info';
    if (status >= 200) return 'success';
    return 'none';
}

/** @param {number | undefined} status */
const classOf = (status) => (status === undefined ? 'none' : `${Math.floor(status / 100)}xx`);

/** @param {string | number | undefined} at @returns {number} */
const msOf = (at) => (typeof at === 'number' ? at : at ? Date.parse(at) : Number.NaN);

/** @param {string} text */
const quote = (text) => `'${text.replace(/'/g, `'\\''`)}'`;

/**
 * A request as a curl command.
 * @param {CapturedRequest} request
 * @param {{ mask?: boolean, secretHeaders?: readonly string[], origin?: string }} [options] `mask` draws the secret headers as ********
 * @returns {string}
 */
export function toCurl(request, { mask = true, secretHeaders = SECRET_HEADERS, origin = '' } = {}) {
    const secret = new Set(secretHeaders.map((h) => h.toLowerCase()));
    const url = request.url ?? `${origin}${request.path}`;
    const parts = ['curl'];
    const method = request.method.toUpperCase();
    if (method !== 'GET') parts.push('-X', method);
    parts.push(quote(url));
    for (const [name, value] of pairsOf(request.headers))
        parts.push('-H', quote(`${name}: ${mask && secret.has(name.toLowerCase()) ? MASK : value}`));
    if (request.body) parts.push('--data-raw', quote(request.body));
    return parts.join(' ');
}

/**
 * A request as JSON, with the secret headers masked unless asked.
 * @param {CapturedRequest} request
 * @param {{ mask?: boolean, secretHeaders?: readonly string[] }} [options]
 */
export function toJson(request, { mask = true, secretHeaders = SECRET_HEADERS } = {}) {
    const secret = new Set(secretHeaders.map((h) => h.toLowerCase()));
    const headers = Object.fromEntries(pairsOf(request.headers).map(([k, v]) => [k, mask && secret.has(k.toLowerCase()) ? MASK : v]));
    return JSON.stringify({ ...request, headers }, null, 2);
}

/** @param {HTMLElement} el @returns {InspectorOptions} */
function readOptions(el) {
    const list = (/** @type {string | null} */ v) =>
        v
            ? v
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
            : null;
    const secrets = el.getAttribute('data-kp-secrets-in-copy');
    const open = el.getAttribute('data-kp-requests-open');
    const copyAs = list(el.getAttribute('data-kp-copy-as'));
    return {
        secretHeaders: list(el.getAttribute('data-kp-secret-headers')) ?? SECRET_HEADERS,
        secretsInCopy: secrets === 'real' || secrets === 'masked-only' ? secrets : 'masked',
        open: open === 'first' || open === 'failed' ? open : 'none',
        max: Number(el.getAttribute('data-kp-requests-max')) || REQUESTS_MAX,
        copyAs: /** @type {('curl' | 'json' | 'body')[]} */ (
            copyAs ? copyAs.filter((c) => ['curl', 'json', 'body'].includes(c)) : ['curl', 'json', 'body']
        ),
    };
}

/** @param {HTMLElement} el */
function partsOf(el) {
    const doc = el.ownerDocument;
    if (!el.classList.contains('kp-card')) el.classList.add('kp-card');
    el.classList.add('kp-inspector');
    let bar = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-inspector__bar'));
    let stage = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-card__stage'));
    if (!bar) {
        bar = make(doc, 'kp-inspector__bar');
        const count = make(doc, 'kp-inspector__count', 'p');
        const filter = make(doc, 'kp-segmented kp-inspector__filter');
        filter.setAttribute('data-kp-segmented', 'single');
        filter.setAttribute('role', 'radiogroup');
        filter.setAttribute('aria-label', getStrings().reqFilterLabel);
        const said = make(doc, 'kp-sr-only kp-inspector__live');
        said.setAttribute('role', 'status');
        said.setAttribute('aria-live', 'polite');
        bar.append(count, filter, said);
        el.prepend(bar);
    }
    if (!stage) {
        stage = make(doc, 'kp-card__stage');
        el.append(stage);
    }
    // The card's own module may have made the stage first: the list goes into its data area either way.
    let data = /** @type {HTMLElement | null} */ (stage.querySelector(':scope > .kp-card__data'));
    if (!data) {
        data = make(doc, 'kp-card__data');
        stage.prepend(data);
    }
    if (!data.querySelector('.kp-inspector__list')) {
        const made = make(doc, 'kp-inspector__list');
        made.setAttribute('role', 'list');
        made.setAttribute('aria-label', getStrings().reqLabel);
        data.append(made);
    }
    const list = /** @type {HTMLElement} */ (stage.querySelector('.kp-inspector__list'));
    return {
        bar,
        count: /** @type {HTMLElement} */ (bar.querySelector('.kp-inspector__count')),
        filter: /** @type {HTMLElement} */ (bar.querySelector('.kp-inspector__filter')),
        stage,
        list,
    };
}

/** A path that may break after its slashes and query marks. @param {Document} doc @param {string} path */
function pathNodes(doc, path) {
    /** @type {Node[]} */
    const nodes = [];
    for (const piece of path.split(/(?<=[/?&])/)) {
        nodes.push(doc.createTextNode(piece), doc.createElement('wbr'));
    }
    return nodes;
}

/** @param {CapturedRequest} request @param {number} index */
const keyOf = (request, index) => `${request.at ?? ''}|${request.method}|${request.path}|${index}`;

/** @param {HTMLElement} el @param {Memory} memory */
function draw(el, memory) {
    // The attributes are read each time, so a page that flips one is heard at once.
    memory.options = { ...readOptions(el), ...memory.given };
    const strings = getStrings();
    const doc = el.ownerDocument;
    const p = partsOf(el);
    const all = [...memory.list].sort((a, b) => (msOf(b.at) || 0) - (msOf(a.at) || 0));
    // The filter's counts, exact.
    const byClass = new Map();
    for (const r of all) byClass.set(classOf(r.status), (byClass.get(classOf(r.status)) ?? 0) + 1);
    const choices = [['all', strings.reqFilterAll, all.length], ...['2xx', '3xx', '4xx', '5xx'].map((c) => [c, c, byClass.get(c) ?? 0])];
    if (!p.filter.querySelector('.kp-segmented__item')) {
        for (const [value] of choices) {
            const item = make(doc, 'kp-segmented__item', 'button');
            item.setAttribute('type', 'button');
            item.setAttribute('role', 'radio');
            item.dataset.value = String(value);
            item.append(make(doc, 'kp-segmented__label', 'span'), make(doc, 'kp-segmented__count', 'span'));
            p.filter.append(item);
        }
        attachSegmented(p.bar);
    }
    for (const item of /** @type {NodeListOf<HTMLElement>} */ (p.filter.querySelectorAll('.kp-segmented__item'))) {
        const choice = choices.find((c) => String(c[0]) === item.dataset.value);
        if (!choice) continue;
        /** @type {HTMLElement} */ (item.querySelector('.kp-segmented__label')).textContent = String(choice[1]);
        /** @type {HTMLElement} */ (item.querySelector('.kp-segmented__count')).textContent = String(choice[2]);
        item.setAttribute('aria-checked', String(item.dataset.value === memory.filter));
    }
    const matching = memory.filter === 'all' ? all : all.filter((r) => classOf(r.status) === memory.filter);
    const visible = matching.slice(0, memory.shown);
    p.count.textContent = strings.reqCount(visible.length, matching.length);

    const nodes = /** @type {Node[]} */ ([]);
    visible.forEach((request, i) => nodes.push(drawRequest(el, memory, request, i, all.indexOf(request))));
    if (matching.length === 0 && all.length > 0) {
        const none = make(doc, 'kp-inspector__nomatch');
        const title = make(doc, 'kp-inspector__nomatch-title', 'strong');
        title.textContent = strings.reqNoMatch;
        const reset = /** @type {HTMLButtonElement} */ (make(doc, 'kp-button', 'button'));
        reset.type = 'button';
        reset.dataset.kpRequestsFilter = 'all';
        reset.textContent = strings.reqFilterAll;
        none.append(title, reset);
        nodes.push(none);
    }
    if (matching.length > visible.length) {
        const more = /** @type {HTMLButtonElement} */ (make(doc, 'kp-button kp-inspector__older', 'button'));
        more.type = 'button';
        more.dataset.kpRequestsOlder = '';
        more.textContent = strings.reqShowOlder(matching.length - visible.length);
        nodes.push(more);
    }
    p.list.replaceChildren(...nodes);
}

/** @param {HTMLElement} el @param {Memory} memory @param {CapturedRequest} request @param {number} index @param {number} slot */
function drawRequest(el, memory, request, index, slot) {
    const strings = getStrings();
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
    const summary = make(doc, 'kp-accordion__summary kp-inspector__summary', 'summary');
    const method = make(doc, 'kp-inspector__method', 'span');
    method.textContent = request.method.toUpperCase();
    const path = make(doc, 'kp-inspector__path', 'span');
    path.append(...pathNodes(doc, request.path));
    const status = make(
        doc,
        `kp-badge kp-inspector__status${tone === 'none' ? '' : ` kp-badge--${tone === 'error' ? 'destructive' : tone}`}`,
        'span',
    );
    const word = {
        success: strings.reqToneSuccess,
        info: strings.reqToneInfo,
        warning: strings.reqToneWarning,
        error: strings.reqToneError,
        none: strings.reqToneNone,
    }[tone];
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
    item.append(summary);

    // A folded request holds no body yet: it is drawn when it is first opened, so what is out of sight is not in the page.
    const buildBody = () => {
        const body = make(doc, 'kp-accordion__body kp-inspector__body');
        // Headers as key and value; a secret is drawn masked with a Show of its own.
        const headersTitle = make(doc, 'kp-inspector__heading', 'h4');
        headersTitle.textContent = strings.reqHeaders;
        const secret = new Set((options.secretHeaders ?? SECRET_HEADERS).map((h) => h.toLowerCase()));
        const pairs = pairsOf(request.headers);
        const kv = make(doc, 'kp-kv kp-kv--lines kp-inspector__headers', 'dl');
        for (const [name, value] of pairs) {
            const row = make(doc, 'kp-kv__row', 'div');
            const dt = make(doc, '', 'dt');
            dt.textContent = name;
            const dd = make(doc, '', 'dd');
            if (secret.has(name.toLowerCase())) {
                const text = make(doc, 'kp-inspector__secret', 'span');
                text.textContent = MASK;
                text.dataset.value = value;
                text.setAttribute('aria-label', strings.reqSecretMasked);
                const show = /** @type {HTMLButtonElement} */ (make(doc, 'kp-button kp-button--sm kp-button--ghost', 'button'));
                show.type = 'button';
                show.dataset.kpRequestSecret = '';
                show.setAttribute('aria-pressed', 'false');
                show.textContent = strings.reqSecretShow;
                dd.append(text, show);
            } else dd.textContent = value;
            row.append(dt, dd);
            kv.append(row);
        }
        if (pairs.length === 0) {
            const none = make(doc, 'kp-kv__none', 'p');
            none.textContent = strings.reqNoHeaders;
            body.append(headersTitle, none);
        } else body.append(headersTitle, kv);

        // The body as code (js/code.js): binary and truncated say so themselves.
        const figure = make(doc, 'kp-code kp-inspector__code', 'figure');
        const text = request.body ?? '';
        const binary = request.binary === true || text.includes('\u0000');
        const bytes = new TextEncoder().encode(text).length;
        const size = request.bodyBytes ?? bytes;
        if (text === '' && !binary) {
            const none = make(doc, 'kp-kv__none', 'p');
            none.textContent = strings.reqNoBody;
            const bodyTitle = make(doc, 'kp-inspector__heading', 'h4');
            bodyTitle.textContent = strings.reqBody;
            body.append(bodyTitle, none);
        } else {
            body.append(figure);
            setCode(figure, {
                title: strings.reqBody,
                text: binary ? '' : text,
                language: 'auto',
                size: formatBytes(size),
                maxLines: 10,
                lines: true,
                wrap: true,
                state: binary ? 'binary' : 'ready',
                truncated: request.truncated ? { shown: formatBytes(bytes), total: formatBytes(size) } : undefined,
                copy: options.copyAs?.includes('body') ?? true,
            });
        }

        // Copy as curl / JSON / body; the secrets go with the copy only when asked.
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
        if (
            what.includes('curl') &&
            options.secretsInCopy !== 'masked-only' &&
            options.secretsInCopy !== 'real' &&
            pairs.some(([n]) => secret.has(n.toLowerCase()))
        )
            actions.append(button('curl', strings.reqCopyCurlSecrets, true));
        // The body has its own Copy in the code block's head; a request without one gets this.
        if (what.includes('body') && (text === '' || binary)) {
            const b = button('body', strings.reqCopyBody, false);
            b.disabled = true;
            actions.append(b);
        }
        body.append(actions);
        return body;
    };
    let built = false;
    const ensure = () => {
        if (built) return;
        built = true;
        item.append(buildBody());
    };
    if (open) ensure();

    const onToggle = () => {
        if (item.open) {
            ensure();
            memory.opened.add(key);
            memory.closed.delete(key);
        } else {
            memory.opened.delete(key);
            memory.closed.add(key);
        }
    };
    item.addEventListener('toggle', onToggle);
    ITEM_REQUEST.set(item, request);
    return item;
}

/** @param {HTMLElement} el @param {Memory} memory @param {HTMLButtonElement} button */
async function copy(el, memory, button) {
    const strings = getStrings();
    const item = button.closest('.kp-inspector__item');
    const request = item ? ITEM_REQUEST.get(item) : undefined;
    if (!request) return;
    const options = memory.options;
    const real = button.hasAttribute('data-kp-requests-real') || options.secretsInCopy === 'real';
    const mask = !real;
    const which = button.dataset.kpRequestsCopy;
    const secretHeaders = options.secretHeaders ?? SECRET_HEADERS;
    const text =
        which === 'curl'
            ? toCurl(request, { mask, secretHeaders, origin: options.origin ?? '' })
            : which === 'json'
              ? toJson(request, { mask, secretHeaders })
              : (request.body ?? '');
    const word = /** @type {HTMLElement} */ (button.querySelector('.kp-code__word'));
    const idle = word.getAttribute('data-kp-code-words')?.split('\n')[0] ?? '';
    const view = el.ownerDocument.defaultView;
    try {
        await navigator.clipboard.writeText(text);
        word.textContent = strings.copied;
        const live = el.querySelector('.kp-inspector__live');
        if (live) {
            const named = which === 'curl' ? 'curl' : which === 'json' ? 'JSON' : strings.reqBody;
            live.textContent = [strings.reqCopyDone(named), mask && which !== 'body' ? strings.reqMaskedNote : ''].filter(Boolean).join(', ');
        }
        el.dispatchEvent(new CustomEvent(REQUESTS_COPY_EVENT, { bubbles: true, detail: { what: which, masked: mask && which !== 'body', text } }));
    } catch {
        word.textContent = strings.copyBlocked;
    }
    view?.setTimeout(() => (word.textContent = idle), REQUESTS_COPIED_MS);
}

/**
 * @param {HTMLElement} el
 * @param {InspectorOptions} given
 * @returns {() => void}
 */
function attachOne(el, given) {
    if (MEMORY.has(el)) return () => undefined;
    const options = { ...readOptions(el), ...given };
    /** @type {Memory} */
    const memory = { list: [], filter: 'all', shown: options.max ?? REQUESTS_MAX, opened: new Set(), closed: new Set(), options, given };
    MEMORY.set(el, memory);
    partsOf(el);
    el.style.setProperty('--kp-card-stage-min', 'var(--kp-inspector-min, 22rem)');
    el.setAttribute('data-kp-state', el.getAttribute('data-kp-state') ?? 'loading');
    const detachStates = attachCardStates(el);
    draw(el, memory);

    /** @param {Event} event */
    const onClick = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const strings = getStrings();
        const copyButton = /** @type {HTMLButtonElement | null} */ (target.closest('[data-kp-requests-copy]'));
        if (copyButton) {
            void copy(el, memory, copyButton);
            return;
        }
        const secret = /** @type {HTMLButtonElement | null} */ (target.closest('[data-kp-request-secret]'));
        if (secret) {
            const text = /** @type {HTMLElement | null} */ (secret.previousElementSibling);
            const shown = secret.getAttribute('aria-pressed') !== 'true';
            secret.setAttribute('aria-pressed', String(shown));
            secret.textContent = shown ? strings.reqSecretHide : strings.reqSecretShow;
            if (text) {
                text.textContent = shown ? (text.dataset.value ?? '') : MASK;
                if (shown) text.removeAttribute('aria-label');
                else text.setAttribute('aria-label', strings.reqSecretMasked);
            }
            return;
        }
        if (target.closest('[data-kp-requests-older]')) {
            memory.shown += memory.options.max ?? REQUESTS_MAX;
            draw(el, memory);
            return;
        }
        const filter = /** @type {HTMLElement | null} */ (target.closest('[data-kp-requests-filter]'));
        if (filter) {
            memory.filter = filter.dataset.kpRequestsFilter ?? 'all';
            draw(el, memory);
            return;
        }
        if (target.closest('[data-kp-requests-send]')) el.dispatchEvent(new CustomEvent(REQUESTS_TEST_EVENT, { bubbles: true }));
    };
    /** @param {Event} event */
    const onFilter = (event) => {
        // The code blocks inside have a segmented control of their own: only the status filter counts.
        if (!(event.target instanceof Element) || !event.target.closest('.kp-inspector__filter')) return;
        const detail = /** @type {CustomEvent<{ value: string | null }>} */ (event).detail;
        memory.filter = detail?.value ?? 'all';
        memory.shown = memory.options.max ?? REQUESTS_MAX;
        draw(el, memory);
    };
    const onRetry = () => el.dispatchEvent(new CustomEvent(REQUESTS_RETRY_EVENT, { bubbles: true }));
    const view = el.ownerDocument.defaultView;
    const watch = view && 'MutationObserver' in view ? new view.MutationObserver(() => draw(el, memory)) : null;
    watch?.observe(el, {
        attributes: true,
        attributeFilter: ['data-kp-secrets-in-copy', 'data-kp-requests-open', 'data-kp-copy-as', 'data-kp-secret-headers', 'data-kp-requests-max'],
    });
    el.addEventListener('click', onClick);
    el.addEventListener('kp-segmented-change', onFilter);
    el.addEventListener('kp-card-retry', onRetry);
    return () => {
        el.removeEventListener('click', onClick);
        el.removeEventListener('kp-segmented-change', onFilter);
        el.removeEventListener('kp-card-retry', onRetry);
        watch?.disconnect();
        detachStates();
        MEMORY.delete(el);
    };
}

/**
 * Give every `[data-kp-requests]` under `root` its card, filter and list.
 * @param {ParentNode} [root]
 * @param {InspectorOptions} [options]
 * @returns {() => void} detach
 */
export function attachRequestInspectors(root = document, options = {}) {
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(REQUESTS) ? [root] : []),
        ...root.querySelectorAll(REQUESTS),
    ]);
    const undo = found.map((el) => attachOne(el, options));
    return () => undo.forEach((u) => u());
}

/**
 * Show a list of requests, newest first. An empty list is the empty state.
 * @param {HTMLElement} el
 * @param {readonly CapturedRequest[]} requests
 */
export function setRequests(el, requests) {
    const memory = MEMORY.get(el);
    if (!memory) return;
    memory.list = [...requests];
    memory.shown = memory.options.max ?? REQUESTS_MAX;
    draw(el, memory);
    setRequestsState(el, requests.length === 0 ? 'empty' : 'ready');
}

/**
 * Put the list in one of the card's four states.
 * @param {HTMLElement} el
 * @param {'loading' | 'empty' | 'error' | 'ready'} state
 * @param {{ message?: string }} [options] the sentence of a failed list
 */
export function setRequestsState(el, state, options = {}) {
    const strings = getStrings();
    const doc = el.ownerDocument;
    if (state === 'empty') {
        /** @type {HTMLElement | null} */
        let action = null;
        if (el.getAttribute('data-kp-requests-test') !== 'false') {
            action = make(doc, 'kp-button kp-button--primary', 'button');
            action.setAttribute('type', 'button');
            action.setAttribute('data-kp-requests-send', '');
            action.textContent = strings.reqSendTest;
        }
        setCardState(el, 'empty', { title: strings.reqEmptyTitle, text: strings.reqEmptyText, action });
        return;
    }
    if (state === 'error') {
        setCardState(el, 'error', { title: strings.reqFailedTitle, text: options.message });
        return;
    }
    setCardState(el, state, state === 'loading' ? { words: strings.reqLoading } : undefined);
}
