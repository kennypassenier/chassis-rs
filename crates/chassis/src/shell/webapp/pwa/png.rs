//! A minimal PNG writer for 1-bit indexed images, std only: stored (not
//! compressed) deflate blocks, CRC-32 and Adler-32. Its own module because
//! the default icons need an image and the kit takes no image dependency;
//! a two-colour square at 512 px is 33 kB this way, which is small enough.

/// PNG signature.
pub(super) const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

/// CRC-32 (IEEE) of `data`, as PNG chunks carry it.
fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for &b in data {
        crc ^= b as u32;
        for _ in 0..8 {
            crc = if crc & 1 == 1 {
                0xedb8_8320 ^ (crc >> 1)
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

/// Adler-32 of `data`, the zlib trailer.
fn adler32(data: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for &x in data {
        a = (a + x as u32) % 65521;
        b = (b + a) % 65521;
    }
    (b << 16) | a
}

/// One chunk: length, type, data, CRC over type and data.
fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    let mut body = kind.to_vec();
    body.extend_from_slice(data);
    out.extend_from_slice(&body);
    out.extend_from_slice(&crc32(&body).to_be_bytes());
}

/// zlib stream of `raw` in stored blocks of at most 65535 bytes.
fn zlib_stored(raw: &[u8]) -> Vec<u8> {
    let mut out = vec![0x78, 0x01];
    let mut blocks = raw.chunks(65535).peekable();
    while let Some(block) = blocks.next() {
        out.push(u8::from(blocks.peek().is_none()));
        out.extend_from_slice(&(block.len() as u16).to_le_bytes());
        out.extend_from_slice(&(!(block.len() as u16)).to_le_bytes());
        out.extend_from_slice(block);
    }
    out.extend_from_slice(&adler32(raw).to_be_bytes());
    out
}

/// A `size` x `size` PNG with a two-colour palette; `lit(x, y)` says
/// whether a pixel takes the second colour.
pub(super) fn encode_1bit(
    size: u32,
    colors: [[u8; 3]; 2],
    lit: impl Fn(u32, u32) -> bool,
) -> Vec<u8> {
    let row_bytes = size.div_ceil(8) as usize;
    let mut raw = Vec::with_capacity((row_bytes + 1) * size as usize);
    for y in 0..size {
        raw.push(0); // filter: none
        let mut row = vec![0u8; row_bytes];
        for x in 0..size {
            if lit(x, y) {
                row[(x / 8) as usize] |= 0x80 >> (x % 8);
            }
        }
        raw.extend_from_slice(&row);
    }
    let mut header = Vec::new();
    header.extend_from_slice(&size.to_be_bytes());
    header.extend_from_slice(&size.to_be_bytes());
    header.extend_from_slice(&[1, 3, 0, 0, 0]); // 1 bit, indexed, deflate, filter 0, no interlace
    let mut out = SIGNATURE.to_vec();
    chunk(&mut out, b"IHDR", &header);
    chunk(&mut out, b"PLTE", &colors.concat());
    chunk(&mut out, b"IDAT", &zlib_stored(&raw));
    chunk(&mut out, b"IEND", &[]);
    out
}

/// A CSS colour as RGB for the palette: `#rgb` or `#rrggbb`; anything else
/// (a colour name) falls back to `fallback`, because the PNG needs numbers.
pub(super) fn parse_hex(css: &str, fallback: [u8; 3]) -> [u8; 3] {
    let Some(h) = css.strip_prefix('#') else {
        return fallback;
    };
    let digit = |i: usize, len: usize| u8::from_str_radix(&h[i..i + len], 16).ok();
    match (h.len(), h.is_ascii()) {
        (6, true) => match (digit(0, 2), digit(2, 2), digit(4, 2)) {
            (Some(r), Some(g), Some(b)) => [r, g, b],
            _ => fallback,
        },
        (3, true) => match (digit(0, 1), digit(1, 1), digit(2, 1)) {
            (Some(r), Some(g), Some(b)) => [r * 17, g * 17, b * 17],
            _ => fallback,
        },
        _ => fallback,
    }
}
