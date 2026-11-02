// The row editor's DOM pieces: the head row, the add button and status line, the numbering of a new row, the buttons the count decides.

/** @param {string | null} value @param {number} fallback */
export const whole = (value, fallback) => {
    const n = Number.parseInt(value ?? '', 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** The add button and the status line the markup left out. @param {HTMLElement} host */
export function ensureAddAndStatus(host) {
    const doc = host.ownerDocument;
    if (!host.querySelector('[data-kp-rows-add]')) {
        const add = doc.createElement('button');
        add.type = 'button';
        add.className = 'kp-button';
        add.setAttribute('data-kp-rows-add', '');
        host.append(add);
    }
    if (!host.querySelector('.kp-rows__status')) {
        const status = doc.createElement('p');
        status.className = 'kp-rows__status';
        status.setAttribute('role', 'status');
        host.append(status);
    }
}

/** The head row: one label per column, from the `data-label` of the sample row's cells. @param {Document} doc @param {Element[]} labels @returns {HTMLElement | null} */
export function buildHead(doc, labels) {
    if (labels.length === 0) return null;
    const head = doc.createElement('div');
    head.className = 'kp-rows__head';
    head.setAttribute('aria-hidden', 'true');
    for (const cell of labels) {
        const label = doc.createElement('span');
        label.className = 'kp-rows__label';
        label.textContent = cell.getAttribute('data-label');
        head.append(label);
    }
    return head;
}

/** Give `{n}` in a new row's attributes and text its number. @param {Element} row @param {number} n */
export function numberRow(row, n) {
    for (const el of [row, ...row.querySelectorAll('*')]) {
        for (const attribute of el.getAttributeNames()) {
            const value = el.getAttribute(attribute) ?? '';
            if (value.includes('{n}')) el.setAttribute(attribute, value.replaceAll('{n}', String(n)));
        }
        for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE && node.textContent?.includes('{n}')) node.textContent = node.textContent.replaceAll('{n}', String(n));
    }
}

/** Each row's remove button (made when missing), named and disabled at the fewest. @param {HTMLElement[]} rows @param {ReturnType<typeof import('../strings.js').getStrings>} s @param {string} unit @param {boolean} atMin */
export function writeRemoveButtons(rows, s, unit, atMin) {
    for (const [at, row] of rows.entries()) {
        let button = row.querySelector('[data-kp-rows-remove]');
        if (!button) {
            button = row.ownerDocument.createElement('button');
            button.className = 'kp-button kp-rows__remove';
            button.setAttribute('data-kp-rows-remove', '');
            button.setAttribute('type', 'button');
            button.textContent = '×';
            row.append(button);
        }
        button.setAttribute('aria-label', s.rowsRemove(unit, at + 1));
        button.toggleAttribute('aria-disabled', atMin);
        if (atMin) button.setAttribute('aria-disabled', 'true');
    }
}

/** The add button's words (unless the page wrote its own) and its disabled state at the most. @param {Element | null} add @param {ReturnType<typeof import('../strings.js').getStrings>} s @param {string} unit @param {boolean} atMax */
export function writeAddButton(add, s, unit, atMax) {
    if (!add) return;
    if (!add.textContent?.trim() || add.hasAttribute('data-kp-rows-written')) {
        add.textContent = s.rowsAdd(unit);
        add.setAttribute('data-kp-rows-written', '');
    }
    add.toggleAttribute('aria-disabled', atMax);
    if (atMax) add.setAttribute('aria-disabled', 'true');
}

/** Say something to a screen reader, in the live line the host holds. @param {HTMLElement} host @param {string} words */
export function announce(host, words) {
    let live = host.querySelector('.kp-rows__live');
    if (!live) {
        live = host.ownerDocument.createElement('span');
        live.className = 'kp-sr-only kp-rows__live';
        live.setAttribute('role', 'status');
        host.appendChild(live);
    }
    const line = live;
    line.textContent = '';
    queueMicrotask(() => {
        line.textContent = words;
    });
}

/** Fire the add/remove event and the change event. @param {HTMLElement} host @param {string} type @param {HTMLElement} row @param {number} index @param {HTMLElement[]} rows */
export function emitRows(host, type, row, index, rows) {
    host.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { row, index, count: rows.length } }));
    host.dispatchEvent(new CustomEvent('kp-rows-change', { bubbles: true, detail: { count: rows.length, rows } }));
}

/** The list the markup left out, put first in the host. @param {HTMLElement} host @returns {HTMLElement} */
export function makeList(host) {
    const list = host.ownerDocument.createElement('ol');
    list.className = 'kp-rows__list';
    list.setAttribute('data-kp-rows-list', '');
    host.prepend(list);
    return list;
}
