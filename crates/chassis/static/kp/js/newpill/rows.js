// Which elements are rows: what counts as a new row in a list or in a table body, and the key a row returns by.

/** @param {Element} el */
export const isRow = (el) => !el.classList.contains('kp-newpill__since') && !el.hasAttribute('data-kp-newpill-skip');

/** A row of a table body that counts as one: not a detail, group, held or divider row. @param {Element} el */
export const isTableRow = (el) =>
    el.tagName === 'TR' && isRow(el) && !el.matches('[data-kp-row-detail], [data-kp-row-group], [data-kp-row-hidden]');

/** The key a row is known by when a sort or filter brings it back, or `''`. @param {Element} row */
export const rowKeyOf = (row) => /** @type {HTMLElement} */ (row).dataset?.kpRowKey || row.id || '';
