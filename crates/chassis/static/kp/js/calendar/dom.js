// Small helpers of the calendar's parts: an element with a class and text, and the host's `data-kp-key`.

/** @param {Element} host @returns {string | undefined} */
export const keyOf = (host) => host.getAttribute('data-kp-key') ?? undefined;

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc
 * @param {K} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
export const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
};
