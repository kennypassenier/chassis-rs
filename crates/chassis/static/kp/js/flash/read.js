// Reading a button's attributes with a default.

/** @param {HTMLElement} button @param {string} name @param {string} fallback */
export const attr = (button, name, fallback) => button.getAttribute(name) ?? fallback;

/** A whole number of milliseconds from an attribute, never negative. @param {HTMLElement} button @param {string} name @param {number} fallback */
export const num = (button, name, fallback) => {
    const n = Number.parseInt(button.getAttribute(name) ?? '', 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
};
