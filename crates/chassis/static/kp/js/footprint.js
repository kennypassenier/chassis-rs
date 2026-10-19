// The footprint: a data component keeps the height it had while a state shows in its place [t56-statefix-1018, S9].
//
// A data component (the matrix, the heat grid, the pipeline, the entity grid, the checklist, the notices, the activity feed, the gallery, the availability grid, the operations page, the diff view and the request
// inspector) writes its state as `data-kp-state` on its host: `loading`, `empty`, `error`, or `ready`. Loaded, it is as high as its
// rows; loading, empty or failed it used to shrink to the height of a skeleton or one plate, and the page under it jumped twice. Kenny's
// rule (2026-10-16 "de hele grootte van de component gebruiken"): a state fills the component's loaded footprint.
//
// Nothing in a stylesheet can do that, because the loaded height is a value of the moment. This module reads it:
//
//   · while the host is ready (no state, or `ready`) a ResizeObserver remembers its height
//   · the moment the state becomes loading, empty or error, the host gets that height as `min-block-size`, so the plate (or the
//     skeleton with the busy card over it) is as high as the list was; back to ready the minimum goes again
//   · the first load has nothing remembered and is left alone: there is no footprint yet to hold
//
// Three guards, so the hold is never a trap:
//
//   · `--kp-footprint-max` (default 48rem, set it on the host or on any ancestor) caps the hold: a plate in the middle of 1600 px is out
//     of sight, so a very tall list holds a screen, not its full length.
//   · a consumer's own `min-block-size` (inline or from a stylesheet) is kept: the host is held at the larger of the two, and the
//     inline value is put back when the state is ready again.
//   · the box model is honoured: a content-box host is held at its content height, a border-box host at its border box.
//
// Nothing runs on import; attachFootprints(root) returns a detach, and so does holdFootprint(host) for one host.

/** Every host that writes `data-kp-state` and fills its footprint with it. */
export const FOOTPRINT_HOSTS = [
    '[data-kp-matrix]',
    '[data-kp-heat]',
    '[data-kp-uptime]',
    '[data-kp-entity-grid]',
    '[data-kp-checklist]',
    '[data-kp-timers]',
    '[data-kp-notices]',
    '[data-kp-feed]',
    '[data-kp-gallery]',
    '[data-kp-availability]',
    '[data-kp-requests]',
    '[data-kp-pipeline]',
    '[data-kp-diffview]',
    '[data-kp-datatable]',
    '[data-kp-runs]',
    '[data-kp-gantt]',
    '[data-kp-week]',
    '[data-kp-chart]:not([data-kp-chart="spark"])',
    '[data-kp-deplist]',
    '[data-kp-code]:not(.kp-code--cell)',
    '.kp-ops',
].join(', ');

/** The cap on a held height, unless the host (or an ancestor) sets `--kp-footprint-max`. */
export const FOOTPRINT_MAX = '48rem';

/** The states that hold. @type {ReadonlySet<string>} */
const HOLDING = new Set(['loading', 'empty', 'error']);

/** Hosts already held. @type {WeakMap<Element, () => void>} */
const HELD = new WeakMap();

/**
 * Hold one host's loaded height while it shows a state.
 *
 * @param {HTMLElement} host
 * @returns {() => void} detach
 */
export function holdFootprint(host) {
    const existing = HELD.get(host);
    if (existing) return existing;
    /** The last ready height, as the border box and as the content box [px]; 0 until the host has been ready. */
    let border = 0;
    let content = 0;
    /** Whether the minimum on the host is ours, and what stood there before it. */
    let holding = false;
    let ownInline = '';
    let ownPriority = '';
    let ownComputed = '';

    // The data table writes `loading`, `failed` and `ready` as its state, and `data-kp-state-covered` (`empty` or `error`) while its plate
    // stands in the rows' place [states-check-1019]; the covered plate wins, because the table is `ready` with no rows when empty.
    const state = () => host.getAttribute('data-kp-state-covered') ?? (host.getAttribute('data-kp-state') === 'failed' ? 'error' : (host.getAttribute('data-kp-state') ?? 'ready'));

    /**
     * A host that fails or turns up empty on its very first read has no loaded height to hold [statestwo-1019, almanac 26]. A table
     * (and any host that says so with `data-kp-footprint-rows="N"`) is held at what N rows would make it: its own frame (toolbar, head
     * and foot: the host less what stands in the rows' place) plus N rows of `--kp-footprint-row` (default 2.75rem); N is the hint, else the table's
     * `data-kp-page-size`, else 10. Worked out once, when the hold starts; a loaded height, once there is one, wins.
     */
    let guess = 0;
    const rowsHint = () => {
        const given = Number.parseInt(host.getAttribute('data-kp-footprint-rows') ?? '', 10);
        if (given > 0) return given;
        if (!host.matches('[data-kp-datatable]')) return 0;
        const size = Number.parseInt(host.getAttribute('data-kp-page-size') ?? '', 10);
        return size > 0 ? size : 10;
    };
    const estimate = () => {
        const rows = rowsHint();
        if (!rows) return 0;
        const view = host.ownerDocument.defaultView;
        const rem = parseFloat(view?.getComputedStyle(host.ownerDocument.documentElement).fontSize ?? '16') || 16;
        const raw = getComputedStyle(host).getPropertyValue('--kp-footprint-row').trim();
        const unit = /^(\d+(?:\.\d+)?)(px|rem)?$/.exec(raw);
        const row = unit ? Number(unit[1]) * (unit[2] === 'px' ? 1 : rem) : 2.75 * rem;
        // What stands in the rows' place now (skeleton rows, the plate, the empty slot) is not frame.
        const inPlace = [...host.querySelectorAll('tbody, .kp-stateplate, [data-kp-datatable-empty]')].reduce(
            (sum, e) => sum + (e.parentElement?.closest('.kp-stateplate, [data-kp-datatable-empty]') ? 0 : e.getBoundingClientRect().height),
            0,
        );
        return Math.max(0, host.getBoundingClientRect().height - inPlace) + rows * row;
    };

    /** The height to hold, for the host's own box model. */
    const height = () => {
        const loaded = getComputedStyle(host).boxSizing === 'border-box' ? border : content;
        return loaded || guess;
    };

    const release = () => {
        guess = 0;
        if (!holding) return;
        holding = false;
        if (ownInline) host.style.setProperty('min-block-size', ownInline, ownPriority);
        else host.style.removeProperty('min-block-size');
    };

    const hold = () => {
        if (!holding && !border && !guess) guess = estimate();
        const wanted = height();
        if (!wanted) return release();
        if (!holding) {
            // What the consumer set, before our minimum covers it: an inline value, or what a stylesheet gives.
            ownInline = host.style.getPropertyValue('min-block-size');
            ownPriority = host.style.getPropertyPriority('min-block-size');
            ownComputed = ownInline ? '' : getComputedStyle(host).minBlockSize;
            holding = true;
        }
        const own = ownInline || ownComputed;
        const kept = own && own !== 'auto' && own !== 'normal' && parseFloat(own) !== 0 ? own : '';
        const held = `min(${wanted}px, var(--kp-footprint-max, ${FOOTPRINT_MAX}))`;
        host.style.setProperty('min-block-size', kept ? `max(${held}, ${kept})` : held);
    };

    const sync = () => (HOLDING.has(state()) ? hold() : release());

    const sizes = new ResizeObserver((entries) => {
        // A host taken out of the page has nothing to hold: let go of everything.
        if (!host.isConnected) return detach();
        if (HOLDING.has(state())) return;
        const entry = entries[entries.length - 1];
        const rect = host.getBoundingClientRect();
        border = entry?.borderBoxSize?.[0]?.blockSize ?? rect.height;
        content = entry?.contentBoxSize?.[0]?.blockSize ?? rect.height;
    });
    const states = new MutationObserver(sync);
    sizes.observe(host);
    states.observe(host, { attributes: true, attributeFilter: ['data-kp-state', 'data-kp-state-covered'] });

    function detach() {
        sizes.disconnect();
        states.disconnect();
        release();
        HELD.delete(host);
    }
    HELD.set(host, detach);
    return detach;
}

/**
 * Hold the footprint of every data component under `root`.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachFootprints(root = document) {
    const hosts = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(FOOTPRINT_HOSTS) ? [root] : []),
        ...root.querySelectorAll(FOOTPRINT_HOSTS),
    ]);
    const detaches = hosts.filter((host) => !HELD.has(host)).map(holdFootprint);
    return () => {
        for (const detach of detaches) detach();
    };
}
