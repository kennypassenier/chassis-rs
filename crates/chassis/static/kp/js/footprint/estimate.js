// The first-load estimate of a data component's footprint: what its rows would make it before it has ever loaded.

/** Rows a data table is estimated at when neither a hint nor a page size says otherwise. */
const DEFAULT_ROWS = 10;

/** One row of a table in rem, unless `--kp-footprint-row` says otherwise. */
const ROW_REM = 2.75;

/** The width under which a table with `data-kp-cards` lays its rows out as cards [rem] (css/components/datatable, `kp-table`). */
const CARDS_BELOW_REM = 40;

/** A card's padding, border and gap, and the line it gives each column with words [rem]. */
const CARD_FRAME_REM = 1.75;
const CARD_LINE_REM = 2.5;

/** The root font size when the document cannot say [px]. */
const FALLBACK_REM_PX = 16;

/**
 * @param {HTMLElement} host A host that fails or turns up empty on its very first read has no loaded height to hold [statestwo-1019, almanac 26]. A table
 * (and any host that says so with `data-kp-footprint-rows="N"`) is held at what N rows would make it: its own frame (toolbar, head
 * and foot: the host less what stands in the rows' place) plus N rows of `--kp-footprint-row`; N is the hint, else the table's
 * `data-kp-page-size`, else DEFAULT_ROWS. A loaded height, once there is one, wins.
 */
export function firstLoadEstimate(host) {
    const rows = rowsHint(host);
    if (!rows) return 0;
    return Math.max(0, host.getBoundingClientRect().height - inPlace(host)) + rows * rowHeight(host);
}

/** @param {HTMLElement} host */
function rowsHint(host) {
    const given = Number.parseInt(host.getAttribute('data-kp-footprint-rows') ?? '', 10);
    if (given > 0) return given;
    if (!host.matches('[data-kp-datatable]')) return 0;
    const size = Number.parseInt(host.getAttribute('data-kp-page-size') ?? '', 10);
    return size > 0 ? size : DEFAULT_ROWS;
}

/** @param {HTMLElement} host One row [px]: `--kp-footprint-row` when the page sets it, else a card in the card layout, else ROW_REM. */
function rowHeight(host) {
    const doc = host.ownerDocument;
    const rem = parseFloat(doc.defaultView?.getComputedStyle(doc.documentElement).fontSize ?? '') || FALLBACK_REM_PX;
    const raw = getComputedStyle(host).getPropertyValue('--kp-footprint-row').trim();
    const unit = /^(\d+(?:\.\d+)?)(px|rem)?$/.exec(raw);
    if (unit) return Number(unit[1]) * (unit[2] === 'px' ? 1 : rem);
    // A row in the card layout is a card of one line per column, not one line: on a phone the table's rows are as high as
    // their columns are many [kyugaps-1019, gap kyu 50].
    return cardRow(host, rem) || ROW_REM * rem;
}

/**
 * What one row is as a card [px], or 0 when the table is not laid out as cards: the card layout is on while the table's own
 * width is under CARDS_BELOW_REM and the markup asked for it with `data-kp-cards`.
 * @param {HTMLElement} host @param {number} rem
 */
function cardRow(host, rem) {
    if (!host.matches('[data-kp-datatable]') || !(host.hasAttribute('data-kp-cards') || host.querySelector('table[data-kp-cards]'))) return 0;
    if (host.getBoundingClientRect().width > CARDS_BELOW_REM * rem) return 0;
    const lines = [...host.querySelectorAll('thead th')].filter((th) => (th.textContent ?? '').trim() !== '').length;
    return lines > 0 ? (CARD_FRAME_REM + lines * CARD_LINE_REM) * rem : 0;
}

/** @param {HTMLElement} host What stands in the rows' place now (skeleton rows, the plate, the empty slot) [px]: not frame. */
function inPlace(host) {
    const parts = host.querySelectorAll('tbody, .kp-stateplate, [data-kp-datatable-empty]');
    let sum = 0;
    for (const part of parts) {
        if (!part.parentElement?.closest('.kp-stateplate, [data-kp-datatable-empty]')) sum += part.getBoundingClientRect().height;
    }
    return sum;
}
