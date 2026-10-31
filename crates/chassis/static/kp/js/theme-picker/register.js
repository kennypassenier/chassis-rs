// Where a preview is shown, and the register a theme needs loaded before it can be shown.

/**
 * The element a picker's preview is shown on: `data-kp-theme-preview-target` (a selector), else the root.
 * @param {HTMLElement} picker @returns {Element | undefined} undefined = the theme root
 */
export function previewRoot(picker) {
    const selector = picker.getAttribute('data-kp-theme-preview-target');
    if (!selector) return undefined;
    try {
        return picker.ownerDocument.querySelector(selector) ?? undefined;
    } catch {
        return undefined;
    }
}

/**
 * A register that is loaded on demand has to be there before its theme is shown, or the preview is the tokens without the
 * theme's look. Only when the page uses them (a link carrying data-kp-register), and from the same place as the first one.
 * @param {Document} doc @param {string} theme @returns {Promise<void>}
 */
export async function registerFirst(doc, theme) {
    const first = doc.querySelector('link[data-kp-register]');
    if (!first) return;
    const wearing = first.getAttribute('data-kp-register') ?? '';
    const href = /** @type {HTMLLinkElement} */ (first).href;
    if (!wearing || !href.includes(`${wearing}-register.css`)) return;
    // The same link js/lazy-register.js writes (data-kp-register carries the theme), made here so this module does not import it:
    // the vendored modules are a closed set and lazy-register.js is outside it.
    const url = new URL(href.split(`${wearing}-register.css`).join(`${theme}-register.css`), doc.baseURI).href;
    const found = [...doc.querySelectorAll('link[rel~="stylesheet"]')].find(
        (el) => el.getAttribute('data-kp-register') === theme || /** @type {HTMLLinkElement} */ (el).href === url,
    );
    if (found && /** @type {HTMLLinkElement} */ (found).sheet) return;
    await new Promise((resolve, reject) => {
        const el = /** @type {HTMLLinkElement} */ (found ?? doc.createElement('link'));
        el.addEventListener('load', () => resolve(undefined), { once: true });
        el.addEventListener(
            'error',
            () => {
                if (!found) el.remove();
                // A register that failed to load is the page's own fault to report; the preview is simply not shown.
                reject(new Error('register'));
            },
            { once: true },
        );
        if (!found) {
            el.rel = 'stylesheet';
            el.href = url;
            el.setAttribute('data-kp-register', theme);
            doc.head.append(el);
        }
    });
}
