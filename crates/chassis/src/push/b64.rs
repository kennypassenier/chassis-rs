//! Base64url without padding (RFC 4648 section 5), the one encoding Web Push
//! uses for keys, secrets and JWT parts. Thirty lines of our own instead of
//! a new dependency for a trivial table lookup.

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/// `bytes` as base64url text with no `=` padding.
pub fn encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = chunk
            .iter()
            .enumerate()
            .fold(0u32, |acc, (i, b)| acc | (u32::from(*b) << (16 - 8 * i)));
        // A chunk of k bytes yields k + 1 characters.
        for i in 0..=chunk.len() {
            out.push(ALPHABET[((n >> (18 - 6 * i)) & 63) as usize] as char);
        }
    }
    out
}

/// The bytes `text` stands for, or `None` when it is not base64url. A
/// trailing `=` padding is tolerated (some clients add it); the standard
/// alphabet (`+` and `/`) is not.
pub fn decode(text: &str) -> Option<Vec<u8>> {
    let text = text.trim_end_matches('=');
    if text.len() % 4 == 1 {
        return None;
    }
    let mut out = Vec::with_capacity(text.len() * 3 / 4);
    for chunk in text.as_bytes().chunks(4) {
        let mut n = 0u32;
        for (i, c) in chunk.iter().enumerate() {
            let v = ALPHABET.iter().position(|a| a == c)? as u32;
            n |= v << (18 - 6 * i);
        }
        // A chunk of k characters carries k - 1 bytes.
        for i in 0..chunk.len() - 1 {
            out.push((n >> (16 - 8 * i)) as u8);
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_round_trips_every_length_and_matches_rfc_4648_samples() {
        assert_eq!(encode(b""), "");
        assert_eq!(encode(b"f"), "Zg");
        assert_eq!(encode(b"fo"), "Zm8");
        assert_eq!(encode(b"foo"), "Zm9v");
        assert_eq!(encode(&[0xfb, 0xff]), "-_8");
        for len in 0..40usize {
            let bytes: Vec<u8> = (0..len).map(|i| (i * 37 + 11) as u8).collect();
            assert_eq!(decode(&encode(&bytes)).unwrap(), bytes, "length {len}");
        }
    }

    #[test]
    fn it_refuses_text_outside_the_alphabet_and_impossible_lengths() {
        assert_eq!(decode("Zg=="), Some(b"f".to_vec()), "padding is tolerated");
        assert!(decode("a+b/").is_none(), "standard alphabet");
        assert!(decode("Z").is_none(), "one character cannot be a byte");
        assert!(decode("Zm 9").is_none());
    }
}
