// Every set the package has, by the name a register shows.
import { CONSOLE } from './console.js';
import { DRAWING } from './drawing.js';
import { FAN } from './fan.js';
import { FIELD_KIT } from './field-kit.js';
import { HORIZON } from './horizon.js';
import { HUD } from './hud.js';
import { LEDGER } from './ledger.js';
import { LOW_SUN } from './low-sun.js';
import { MACHINED } from './machined.js';
import { SLAB } from './slab.js';
import { SPECTRUM } from './spectrum.js';
import { STICKERS } from './stickers.js';
/** @typedef {import('./types.js').ArtKind} ArtKind */
/** @typedef {import('./types.js').ArtStroke} ArtStroke */

/** Every set the package has, by the name a register shows. @type {Record<string, Record<ArtKind, ArtStroke[]>>} */
export const ART_SETS = {
    ledger: LEDGER,
    spectrum: SPECTRUM,
    hud: HUD,
    horizon: HORIZON,
    stickers: STICKERS,
    fieldkit: FIELD_KIT,
    drawing: DRAWING,
    lowsun: LOW_SUN,
    slab: SLAB,
    fan: FAN,
    nostromo: CONSOLE,
    titanium: MACHINED,
};
