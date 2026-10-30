//! The icons an app gets when it supplies none: its initial on the theme
//! colour, drawn from a 5x7 pixel font into a 1-bit PNG. Generated when the
//! server starts, so there are no image files to keep and no image library.

use super::glyphs::GLYPHS;
use super::png::{encode_1bit, parse_hex};

/// The brand's initial for the icon: its first letter or digit, upper case;
/// `None` when the name has neither (the icon then shows a plain disc).
pub(in crate::shell::webapp) fn initial(name: &str) -> Option<char> {
    name.chars()
        .find(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
}

/// Whether the pixel (`px`, `py`) of a glyph (5x7 cells, `k` pixels each,
/// top-left at `ox`, `oy`) is ink.
fn glyph_ink(rows: &[&str; 7], k: u32, (ox, oy): (u32, u32), (px, py): (u32, u32)) -> bool {
    if px < ox || py < oy {
        return false;
    }
    let (cx, cy) = ((px - ox) / k, (py - oy) / k);
    cx < 5 && cy < 7 && rows[cy as usize].as_bytes()[cx as usize] == b'#'
}

/// The icon at `size` px: the theme colour as ground, the initial in the
/// background colour, centred inside the 60 % that Android's maskable
/// crop keeps. One layout serves the normal and the maskable icon.
pub(in crate::shell::webapp) fn default_icon(
    size: u32,
    initial: Option<char>,
    theme: &str,
    background: &str,
) -> Vec<u8> {
    let ground = parse_hex(theme, [0x22, 0x36, 0x59]);
    let ink = parse_hex(background, [0xfa, 0xf8, 0xf5]);
    let rows = initial.and_then(|c| GLYPHS.iter().find(|(g, _)| *g == c).map(|(_, r)| r));
    let k = (size * 46 / 100 / 7).max(1);
    let origin = ((size - 5 * k) / 2, (size - 7 * k) / 2);
    let r = f64::from(size) * 0.2;
    let mid = f64::from(size) / 2.0;
    encode_1bit(size, [ground, ink], |x, y| match rows {
        Some(rows) => glyph_ink(rows, k, origin, (x, y)),
        None => {
            let (dx, dy) = (f64::from(x) - mid, f64::from(y) - mid);
            dx * dx + dy * dy <= r * r
        }
    })
}
