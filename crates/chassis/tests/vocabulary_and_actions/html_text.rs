//! Reading rendered pages as visible text for the vocabulary assertions.

/// The text a reader sees: tags (attributes included) and comments gone.
pub fn visible_text(html: &str) -> String {
    // Comments are source for developers, never shown to a reader.
    let mut stripped = String::new();
    let mut rest = html;
    while let Some(start) = rest.find("<!--") {
        stripped.push_str(&rest[..start]);
        rest = match rest[start..].find("-->") {
            Some(end) => &rest[start + end + 3..],
            None => "",
        };
    }
    stripped.push_str(rest);
    let html = stripped.as_str();
    let mut out = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' if in_tag => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

/// The RFC 3339 shape a reader must never be shown (feat-ui-1): four digits,
/// a dash, two, a dash, two, then the `T`. Returns what it found so a failure
/// names the string instead of only asserting one exists.
pub fn iso_timestamp_in(text: &str) -> Option<String> {
    let c: Vec<char> = text.chars().collect();
    for i in 0..c.len().saturating_sub(11) {
        let w = &c[i..i + 11];
        let digits = [0, 1, 2, 3, 5, 6, 8, 9]
            .iter()
            .all(|&k| w[k].is_ascii_digit());
        if digits && w[4] == '-' && w[7] == '-' && w[10] == 'T' {
            return Some(c[i..(i + 20).min(c.len())].iter().collect());
        }
    }
    None
}

/// Whole-word, case-insensitive: a word the kit must not use for the thing
/// the project names itself. `client`/`clients` because that is the default
/// vocabulary, and `caller`/`callers` because the kit used to reach for it as
/// a synonym — four times on one page, where no vocabulary could follow
/// (Kenny, 2026-09-10: the name is Clients everywhere, and a project renames
/// it in one place or not at all).
pub fn says_client(text: &str) -> Option<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .map(|w| w.to_ascii_lowercase())
        .find(|w| matches!(w.as_str(), "client" | "clients" | "caller" | "callers"))
}

/// What a confirmation dialog says. `visible_text` strips attributes, so the
/// kit's own `data-kp-confirm` texts were never checked — and that is exactly
/// where "the caller is locked out" survived.
pub fn confirm_texts(html: &str) -> Vec<String> {
    html.split("data-kp-confirm=\"")
        .skip(1)
        .filter_map(|rest| rest.split('"').next().map(str::to_string))
        .collect()
}
