//! The host of a notification address: used to notice that the primary's
//! bearer token is also sent to a kit target on another host.

/// The lower-cased host of an http(s) address, without user info, port,
/// path or query. `None` when the text has no `scheme://host` shape.
pub fn host_of(url: &str) -> Option<String> {
    let rest = url.trim().split_once("://")?.1;
    let authority = rest.split(['/', '?', '#']).next()?;
    let authority = authority.rsplit('@').next()?;
    let host = if let Some(v6) = authority.strip_prefix('[') {
        // `[::1]:8080` keeps its brackets so two IPv6 hosts compare whole.
        format!("[{}]", v6.split(']').next()?)
    } else {
        authority.split(':').next()?.to_string()
    };
    (!host.is_empty()).then(|| host.to_ascii_lowercase())
}

/// The two hosts, when both addresses have one and they differ.
pub fn differing_hosts(a: &str, b: &str) -> Option<(String, String)> {
    let (ha, hb) = (host_of(a)?, host_of(b)?);
    (ha != hb).then_some((ha, hb))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_ignores_scheme_port_path_user_info_and_case() {
        assert_eq!(
            host_of("http://Hub.Lan:8080/t/x?a=b").as_deref(),
            Some("hub.lan")
        );
        assert_eq!(host_of("https://u:p@hub.lan/t").as_deref(), Some("hub.lan"));
        assert_eq!(host_of("http://[::1]:9/t").as_deref(), Some("[::1]"));
        assert_eq!(host_of("not a url"), None);
        assert_eq!(host_of("http:///path"), None);
    }

    #[test]
    fn only_a_real_difference_is_reported() {
        assert_eq!(
            differing_hosts("http://hub.lan:1/a", "https://HUB.lan:2/b"),
            None
        );
        assert_eq!(
            differing_hosts("http://hub.lan/a", "http://other.lan/b"),
            Some(("hub.lan".into(), "other.lan".into()))
        );
        assert_eq!(differing_hosts("http://hub.lan/a", "garbage"), None);
    }
}
