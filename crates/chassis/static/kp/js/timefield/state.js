// What the time fields share: the counter that gives each its own ids, and the field each root has been built into.

/** The fields built so far, by root; a root is built once, by the first thing that needs it. @type {WeakMap<Element, import('./field.js').TimeField>} */
export const FIELDS = new WeakMap();

const counter = { serial: 0 };

/** The next field number, for ids. */
export const nextFieldNumber = () => (counter.serial += 1);
