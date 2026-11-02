//! Is a push endpoint's host inside a local network? The server posts to
//! every stored endpoint, so an endpoint naming `127.0.0.1`, a private
//! address or the cloud metadata address would turn a subscription into a
//! request from this machine to its own network. Pure, and a literal check
//! only: a public name that resolves to a private address is not caught
//! (that needs a resolver hook; see `docs/PUSH_DESIGN.md`).

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

use reqwest::Url;

/// Whether `url` names a loopback, private, link-local or otherwise
/// non-public host, or a name that cannot be a public push service.
pub(super) fn is_internal(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return true;
    };
    // `host_str` keeps the brackets of an IPv6 literal; the URL parser has
    // already turned decimal, octal and hex IPv4 spellings into dotted form.
    match host.trim_start_matches('[').trim_end_matches(']').parse() {
        Ok(IpAddr::V4(ip)) => internal_v4(ip),
        Ok(IpAddr::V6(ip)) => internal_v6(ip),
        Err(_) => internal_name(host),
    }
}

/// `localhost`, its subdomains and single-label names (`nas`): none is a
/// public push service, and all resolve on the local network.
fn internal_name(name: &str) -> bool {
    let name = name.trim_end_matches('.').to_ascii_lowercase();
    name.is_empty() || !name.contains('.') || name.ends_with(".localhost")
}

fn internal_v4(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_broadcast()
        // 100.64.0.0/10, carrier-grade NAT (shared address space).
        || (a == 100 && (64..128).contains(&b))
}

fn internal_v6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return internal_v4(v4);
    }
    let first = ip.segments()[0];
    ip.is_loopback()
        || ip.is_unspecified()
        || (first & 0xfe00) == 0xfc00 // fc00::/7 unique local
        || (first & 0xffc0) == 0xfe80 // fe80::/10 link local
}
