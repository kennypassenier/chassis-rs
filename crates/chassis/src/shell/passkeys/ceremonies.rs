//! The bounded table of pending ceremonies (S6): its constructor, the
//! eviction on `put` and the expiring `take`. It is plain data-structure
//! code with no HTTP in it; the type is declared in the parent.

use std::net::IpAddr;
use std::time::Instant;

use super::{Ceremonies, CeremonyLimits};

impl<P> Ceremonies<P> {
    pub fn new(limits: CeremonyLimits) -> Self {
        Self {
            map: std::collections::HashMap::new(),
            limits,
        }
    }

    /// Admit a ceremony, evicting what must go: expired ones first, then
    /// this IP's oldest when the IP is at its share, then the oldest of all
    /// when the table is at its cap.
    pub fn put(&mut self, now: Instant, ip: IpAddr, id: String, p: P) {
        let ttl = self.limits.ttl;
        self.map.retain(|_, (t, _, _)| now.duration_since(*t) < ttl);
        let mine = self.map.values().filter(|(_, i, _)| *i == ip).count();
        if mine >= self.limits.per_ip {
            self.evict_oldest(|i| i == ip);
        }
        if self.map.len() >= self.limits.cap {
            self.evict_oldest(|_| true);
        }
        self.map.insert(id, (now, ip, p));
    }

    /// Take a ceremony out; `None` when unknown or expired.
    pub fn take(&mut self, id: &str, now: Instant) -> Option<P> {
        let (t, _, p) = self.map.remove(id)?;
        (now.duration_since(t) < self.limits.ttl).then_some(p)
    }

    pub fn len(&self) -> usize {
        self.map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    /// Drop the oldest ceremony among those whose IP satisfies `of`.
    fn evict_oldest(&mut self, of: impl Fn(IpAddr) -> bool) {
        let oldest = self
            .map
            .iter()
            .filter(|(_, (_, i, _))| of(*i))
            .min_by_key(|(_, (t, _, _))| *t)
            .map(|(id, _)| id.clone());
        if let Some(id) = oldest {
            self.map.remove(&id);
        }
    }
}
