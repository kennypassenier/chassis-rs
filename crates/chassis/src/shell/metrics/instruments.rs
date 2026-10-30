//! The behaviour of [`Counter`] and [`Gauge`]. The types stay declared in
//! the parent; the impls live here, apart from the exposition formatting.

use super::exposition::format_f64;
use super::{Counter, Gauge, ScrapeSource};

impl ScrapeSource for Counter {
    fn scrape(&self) -> String {
        self.0.render(|v| v.to_string())
    }
}

impl ScrapeSource for Gauge {
    fn scrape(&self) -> String {
        self.0.render(format_f64)
    }
}
