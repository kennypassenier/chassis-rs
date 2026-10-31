// The selectors, the event and the fixed numbers of the key-figure parts.

/** An inline SVG drawn from the numbers in its attribute. */
export const SPARK = 'svg[data-kp-spark]';
/** A KPI tile that turns a filter on this page on or off. */
export const KPI_TOGGLE = 'button.kp-kpi--toggle';
/** Fired on the tile, bubbling, after it was pressed: `detail.pressed`. */
export const KPI_TOGGLE_EVENT = 'kp-kpi-toggle';
/** A used-of-total bar: anywhere, or at the bottom of a key figure. */
export const METER = '.kp-meter, .kp-kpi__meter';
/** A strip whose column count comes from a list of allowed counts. */
export const KPI_STRIP = '.kp-kpis[data-kp-kpis-columns]';
/** A tile's label in a strip with columns: one line, never wrapped and never cut [fix-99, fix-101]. */
export const TILE_LABEL = ':scope > .kp-kpi:not([hidden]) > .kp-kpi__label';

/** The sparkline's box and the room its line keeps from the box's edge. */
export const SPARK_BOX = { width: 100, height: 28, pad: 1.5 };
/** The SVG namespace. */
export const SVG_NS = 'http://www.w3.org/2000/svg';
/** The least width of a tile, its gap, and the allowed counts when the strip names none. */
export const STRIP_DEFAULTS = { minTilePx: 144, gapPx: 16, allowed: 'all 3 2 1' };
/** The font size a length in rem or em falls back to, in px. */
export const FALLBACK_FONT_PX = 16;
/** How far past its tile's edge a label may reach before it counts as cut, in px (sub-pixel rounding). */
export const LABEL_SLACK_PX = 0.5;
/** A full meter in per cent. */
export const FULL_PERCENT = 100;
