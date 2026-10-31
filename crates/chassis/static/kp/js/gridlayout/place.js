// Writing a tile's placement from its data attributes, and taking it back: four custom properties and a description in words.

import { getStrings } from '../strings.js';
import { PLACEMENT_PROPERTIES } from './values.js';

/** Write the placement the data attributes describe. @param {HTMLElement} tile */
export function place(tile) {
    const x = Number(tile.dataset.x ?? 0);
    const y = Number(tile.dataset.y ?? 0);
    const w = Number(tile.dataset.w ?? 1);
    const h = Number(tile.dataset.h ?? 1);
    // Four numbers, not two track declarations [AR31]. Up to 4.0.0 this
    // wrote `grid-column` and `grid-row` as inline styles, which beat any
    // rule in any layer — so the collapse-to-one-column rule in
    // css/components.css was dead the moment a grid was attached, and
    // attaching is the only way a grid is used. A custom property is a
    // value the stylesheet reads, so the narrow rule can win again.
    tile.style.setProperty('--kp-tile-x', String(x + 1));
    tile.style.setProperty('--kp-tile-y', String(y + 1));
    tile.style.setProperty('--kp-tile-w', String(w));
    tile.style.setProperty('--kp-tile-h', String(h));
    // Said in words, because a tile that only announces itself by moving
    // is a tile nobody without sight can arrange. As a description, not
    // the label: the label is the tile's name and stays the consumer's.
    const s = getStrings();
    const name = tile.dataset.kpLabel ?? tile.getAttribute('aria-label') ?? tile.dataset.kpTile ?? s.tileFallbackName;
    let description = /** @type {HTMLElement | null} */ (tile.querySelector('[data-kp-tile-position]'));
    if (description === null) {
        description = document.createElement('span');
        description.className = 'kp-sr-only';
        description.dataset.kpTilePosition = '';
        description.id = `${tile.dataset.kpTile ?? 'tile'}-position-${Math.random().toString(36).slice(2, 6)}`;
        tile.append(description);
        tile.setAttribute('aria-describedby', [tile.getAttribute('aria-describedby'), description.id].filter(Boolean).join(' '));
    }
    description.textContent = s.tileLabel(name, x + 1, y + 1, w, h);
    if (!tile.hasAttribute('aria-label') && tile.dataset.kpLabel !== undefined) tile.setAttribute('aria-label', tile.dataset.kpLabel);
}

/** Take back what `place` wrote on a tile: the properties and the description. @param {HTMLElement} tile */
export function unplace(tile) {
    for (const property of PLACEMENT_PROPERTIES) tile.style.removeProperty(property);
    const description = tile.querySelector('[data-kp-tile-position]');
    if (description === null) return;
    const rest = (tile.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== '' && id !== description.id);
    if (rest.length > 0) tile.setAttribute('aria-describedby', rest.join(' '));
    else tile.removeAttribute('aria-describedby');
    description.remove();
}
