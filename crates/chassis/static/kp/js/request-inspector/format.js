// The request inspector's selector, events and numbers, and the pure helpers: a status's tone and class, a request as
// curl or JSON, the options read from the markup, a request's key and its path broken for wrapping.

/** @typedef {import('../request-inspector.js').CapturedRequest} CapturedRequest */
/** @typedef {import('../request-inspector.js').InspectorOptions} InspectorOptions */


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
 * @typedef {object} Memory
 * @property {CapturedRequest[]} list
 * @property {string} filter
 * @property {number} shown
 * @property {Set<string>} opened keys the reader opened
 * @property {Set<string>} closed keys the reader closed
 * @property {InspectorOptions} options
 * @property {InspectorOptions} given what the page passed to attachRequestInspectors()
 */

/** The request each drawn item shows. @type {WeakMap<Element, CapturedRequest>} */
export const ITEM_REQUEST = new WeakMap();

/** @param {Document} doc @param {string} className @param {string} [tag] */
export const make = (doc, className, tag = 'div') => {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
};

/** @param {CapturedRequest['headers']} headers @returns {[string, string][]} */
export const pairsOf = (headers) => (Array.isArray(headers) ? headers : Object.entries(headers ?? {}));

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
export const classOf = (status) => (status === undefined ? 'none' : `${Math.floor(status / 100)}xx`);

/** @param {string | number | undefined} at @returns {number} */
export const msOf = (at) => (typeof at === 'number' ? at : at ? Date.parse(at) : Number.NaN);

/** @param {string} text */
export const quote = (text) => `'${text.replace(/'/g, `'\\''`)}'`;

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
export function readOptions(el) {
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

/** A path that may break after its slashes and query marks. @param {Document} doc @param {string} path */
export function pathNodes(doc, path) {
    /** @type {Node[]} */
    const nodes = [];
    for (const piece of path.split(/(?<=[/?&])/)) {
        nodes.push(doc.createTextNode(piece), doc.createElement('wbr'));
    }
    return nodes;
}

/** @param {CapturedRequest} request @param {number} index */
export const keyOf = (request, index) => `${request.at ?? ''}|${request.method}|${request.path}|${index}`;

