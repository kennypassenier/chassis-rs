//! The bounded table of pending ceremonies (S6). The type and its public
//! methods stay declared in the parent; the eviction logic is here because it is plain data-structure
//! code with no HTTP in it.

use std::net::IpAddr;
use std::time::Instant;

use super::Ceremonies;

/// Body of [`Ceremonies::put`].
pub(super) fn put<P>(table: &mut Ceremonies<P>, now: Instant, ip: IpAddr, id: String, p: P) {
    let ttl = table.limits.ttl;
    table
        .map
        .retain(|_, (t, _, _)| now.duration_since(*t) < ttl);
    let mine = table.map.values().filter(|(_, i, _)| *i == ip).count();
    if mine >= table.limits.per_ip {
        evict_oldest(table, |i| i == ip);
    }
    if table.map.len() >= table.limits.cap {
        evict_oldest(table, |_| true);
    }
    table.map.insert(id, (now, ip, p));
}

fn evict_oldest<P>(table: &mut Ceremonies<P>, of: impl Fn(IpAddr) -> bool) {
    let oldest = table
        .map
        .iter()
        .filter(|(_, (_, i, _))| of(*i))
        .min_by_key(|(_, (t, _, _))| *t)
        .map(|(id, _)| id.clone());
    if let Some(id) = oldest {
        table.map.remove(&id);
    }
}
