// The two selector shortcuts the shell's parts share.
// Split out of shell.js by responsibility; the page runs exactly as before.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
