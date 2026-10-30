//! Unit tests for `passkeys`; kept in their own file so the module stays small.

use super::*;
use std::net::Ipv4Addr;

fn limits(cap: usize, per_ip: usize) -> CeremonyLimits {
    CeremonyLimits {
        cap,
        ttl: Duration::from_secs(300),
        per_ip,
    }
}
fn ip(n: u8) -> IpAddr {
    IpAddr::V4(Ipv4Addr::new(10, 0, 0, n))
}

/// S6: one machine can never block the table for the others — at its
/// share its own oldest ceremony goes, the table stays at the share.
#[test]
fn one_ip_evicts_only_its_own_oldest_at_its_share() {
    let mut c = Ceremonies::new(limits(64, 3));
    let t0 = Instant::now();
    for i in 0..3 {
        c.put(
            t0 + Duration::from_millis(i),
            ip(1),
            format!("a{i}"),
            i as u32,
        );
    }
    c.put(t0 + Duration::from_millis(9), ip(2), "b0".into(), 100);
    c.put(t0 + Duration::from_millis(10), ip(1), "a3".into(), 3);
    assert_eq!(c.len(), 4, "the share holds, nothing refused");
    assert!(
        c.take("a0", t0 + Duration::from_millis(11)).is_none(),
        "ip 1's oldest went"
    );
    assert_eq!(
        c.take("b0", t0 + Duration::from_millis(11)),
        Some(100),
        "ip 2 untouched"
    );
    assert_eq!(c.take("a3", t0 + Duration::from_millis(11)), Some(3));
}

/// S6: at the global cap the oldest of all makes room — full is never
/// a refusal.
#[test]
fn at_the_cap_the_oldest_of_all_goes_instead_of_refusing() {
    let mut c = Ceremonies::new(limits(4, 8));
    let t0 = Instant::now();
    for i in 0..4u8 {
        c.put(
            t0 + Duration::from_millis(i as u64),
            ip(i),
            format!("c{i}"),
            i as u32,
        );
    }
    c.put(t0 + Duration::from_millis(50), ip(9), "new".into(), 9);
    assert_eq!(c.len(), 4);
    assert!(
        c.take("c0", t0 + Duration::from_millis(51)).is_none(),
        "the oldest went"
    );
    assert_eq!(c.take("new", t0 + Duration::from_millis(51)), Some(9));
}

/// Expired ceremonies are gone on the next put and on take.
#[test]
fn expiry_frees_slots_and_refuses_stale_takes() {
    let mut c = Ceremonies::new(CeremonyLimits {
        cap: 2,
        ttl: Duration::from_secs(1),
        per_ip: 8,
    });
    let t0 = Instant::now();
    c.put(t0, ip(1), "old".into(), 1);
    assert!(
        c.take("old", t0 + Duration::from_secs(2)).is_none(),
        "stale take is refused"
    );
    c.put(t0, ip(1), "old2".into(), 1);
    c.put(t0 + Duration::from_secs(2), ip(1), "fresh".into(), 2);
    assert_eq!(c.len(), 1, "the expired one was swept by the put");
    assert_eq!(c.take("fresh", t0 + Duration::from_secs(2)), Some(2));
}
