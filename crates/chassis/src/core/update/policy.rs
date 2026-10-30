//! Reading the update settings: a version string, a hold and a mode, and the
//! rule a hold applies to a candidate version.

use super::{Hold, Mode, Version};
use crate::core::error::Error;

impl Version {
    pub fn parse(text: &str) -> Result<Self, Error> {
        let t = text.trim().trim_start_matches('v');
        let parts: Vec<&str> = t.split('.').collect();
        let bad = || {
            Error::invalid(
                format!("`{text}` is not a version of the form MAJOR.MINOR.PATCH"),
                "the release's VERSION file must contain exactly x.y.z",
            )
        };
        if parts.len() != 3 {
            return Err(bad());
        }
        let n = |s: &str| s.parse::<u64>().map_err(|_| bad());
        Ok(Version {
            major: n(parts[0])?,
            minor: n(parts[1])?,
            patch: n(parts[2])?,
        })
    }
}

impl Hold {
    /// `""` → none; `1.4.0` or `pin:1.4.0` → pin; `skip:1.4.0` → skip.
    pub fn parse(raw: &str) -> Result<Hold, Error> {
        let r = raw.trim();
        if r.is_empty() {
            return Ok(Hold::None);
        }
        if let Some(v) = r.strip_prefix("skip:") {
            return Ok(Hold::Skip(Version::parse(v)?));
        }
        let v = r.strip_prefix("pin:").unwrap_or(r);
        Ok(Hold::Pin(Version::parse(v)?))
    }

    /// Whether `candidate` may be installed over `running` under this hold.
    pub fn allows(&self, running: Version, candidate: Version) -> bool {
        match self {
            Hold::None => true,
            Hold::Pin(v) => candidate == *v && candidate != running,
            Hold::Skip(v) => candidate != *v,
        }
    }
}

impl Mode {
    pub fn parse(raw: &str) -> Result<Mode, Error> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "off" | "" => Ok(Mode::Off),
            "supervised" => Ok(Mode::Supervised),
            "autonomous" => Ok(Mode::Autonomous),
            other => Err(Error::config(
                format!("update_mode `{other}` is not one of off, supervised, autonomous"),
                "supervised = the homelab runs `<binary> update`; autonomous = this process checks and restarts itself; off = never",
            )),
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Mode::Off => "off",
            Mode::Supervised => "supervised",
            Mode::Autonomous => "autonomous",
        }
    }
}
