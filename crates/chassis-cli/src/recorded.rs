//! The record `chassis new` writes to `.chassis.toml` and `sync`, `upgrade`
//! and `release` read back, with the scaffold constants `new` starts from.
//! Its own module because every command shares it and none of them owns it.

use serde::{Deserialize, Serialize};

use crate::{kit_docs, release_config};

/// What `new` recorded and `sync`/`release` read back.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Recorded {
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) repo: String,
    pub(crate) toolchain: String,
    pub(crate) chassis_tag: String,
    pub(crate) chassis_repo: String,
    /// A path dependency instead of the git tag (drills, local work).
    #[serde(default)]
    pub(crate) chassis_path: Option<String>,
    pub(crate) kp_themes: String,
    pub(crate) state_dir: String,
    #[serde(default)]
    pub(crate) latch: bool,
    /// Where the env file lives on the target (M2, 1.6.0). Default
    /// `/etc/<name>/<name>.env`; a migrated project records the path it
    /// was measured at (Almanac: `/appdata/almanac/almanac-config/latch.env`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) env_file: Option<String>,
    /// The latch environment `latch run --env <x>` selects (M2, 1.6.0).
    /// Default `prod`; an empty string means no `--env` at all (latch's
    /// own default, `dev`), which is how CT 112 runs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) latch_env: Option<String>,
    /// RUSTSEC ids cargo-deny may ignore for this project (1.7.0), each a
    /// reviewed decision with its reason in this file's comments; rendered
    /// into the kit-owned `deny.toml`, so a sync keeps them.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) deny_ignore: Vec<String>,
    /// fix-14: the project's own `[Service]` directives (http-switchboard's
    /// `ExecReload=/bin/kill -HUP $MAINPID`), rendered into the kit-owned
    /// unit after `ExecStart=`, so `sync --write` keeps them. A comment
    /// line (`# …`) may explain one.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) unit_service: Vec<String>,
    /// Whether `chassis release` builds and pushes a container image
    /// (3.3.0). Absent: derived from how the project is deployed, see
    /// `release::wants_image`. Almanac, kyu, kyu-runner and
    /// http-switchboard run as native units, and their images on ghcr were
    /// never pulled (Kenny, 2026-10-02).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) image: Option<bool>,
    /// Obsolete since 3.0.0: the CI checks `main` waited for, when the
    /// project ran fewer jobs than the kit's `ci.yml` (Kenny, 2026-09-25).
    /// The kit ships no CI any more, so there is nothing to require; still
    /// read so an old record parses, and `sync` reports a non-empty list as
    /// drift until the line is deleted.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) required_checks: Vec<String>,
    /// The LXC's vmid (1.7.1): `service.yml` names it and the hostname
    /// `<vmid>-app-<name>` the homelab validates. 0 = not adopted yet.
    #[serde(default)]
    pub(crate) vmid: u32,
    /// How the release differs from one musl binary named like the project
    /// (homelab-shared-4): see `release_config.rs`. Last, because it is a
    /// TOML table. Absent = today's behaviour, and not written back.
    #[serde(
        default,
        skip_serializing_if = "release_config::ReleaseConfig::is_default"
    )]
    pub(crate) release: release_config::ReleaseConfig,
}

impl Recorded {
    /// The env file path the deploy files name (M2).
    pub(crate) fn env_file(&self) -> String {
        self.env_file
            .clone()
            .unwrap_or_else(|| format!("/etc/{0}/{0}.env", self.name))
    }

    /// ` --env <x>` for the latch unit, or nothing when `latch_env` is "" (M2).
    pub(crate) fn latch_env_flag(&self) -> String {
        match self.latch_env.as_deref() {
            None => " --env prod".to_string(),
            Some("") => String::new(),
            Some(env) => format!(" --env {env}"),
        }
    }

    /// `features` names the kit features the project's binary is built
    /// with (K35): `new` writes them into the Cargo.toml it generates,
    /// `sync` reads them back from the project's own.
    pub(crate) fn context(&self, features: &[String]) -> minijinja::Value {
        let prefix = self.name.to_ascii_uppercase().replace('-', "_");
        let owner = self.repo.split('/').next().unwrap_or("").to_string();
        minijinja::context! {
            name => self.name,
            prefix => prefix,
            repo => self.repo,
            owner => owner,
            description => self.description,
            toolchain => self.toolchain,
            chassis_tag => self.chassis_tag,
            chassis_version => self.chassis_tag.trim_start_matches('v'),
            chassis_repo => self.chassis_repo,
            chassis_path => self.chassis_path,
            kp_themes => self.kp_themes,
            state_dir => self.state_dir,
            latch => self.latch,
            env_file => self.env_file(),
            latch_env_flag => self.latch_env_flag(),
            deny_ignore => self.deny_ignore.clone(),
            unit_service => self.unit_service.clone(),
            release_pubkey => RELEASE_PUBKEY,
            vmid => self.vmid,
            stack => self.name,
            // K27/K31: pre-rendered so docs/KIT.md always carries the
            // kit's own table, and K35: only the rows this project's
            // binary can act on.
            knobs_table => kit_docs::knobs_markdown(&self.name, features),
            features => features.to_vec(),
            features_sentence => features.join(", "),
            chassis_features_literal => features
                .iter()
                .filter(|f| *f != "core" && *f != "assets")
                .map(|f| format!("\"{f}\""))
                .collect::<Vec<_>>()
                .join(", "),
        }
    }
}

/// Mirrors `chassis::shell::update::RELEASE_PUBKEY` (the shell module is
/// behind a feature the CLI does not enable); a test keeps the two equal.
pub(crate) const RELEASE_PUBKEY: &str = "RWQWCzzUBquIHGkS3YERMkuqEm4C3vBArnlb9rySbr8z5ytgVYuji3bS";

/// What `chassis new` puts on the kit dependency it writes (K35): the
/// generated Cargo.toml and the generated documentation are rendered from
/// this one list, so a new project cannot start out with a document that
/// describes other features than it builds.
///
/// `passkeys` is not on it (feat-build-1). It pulls OpenSSL, which the
/// static musl release build would have to vendor and compile per release,
/// and no consumer builds it: kyu, Almanac and HTTPSwitchboard run
/// core + dashboard + self-update, kyu-runner core + self-update. A
/// project that needs passkeys adds the feature and builds against glibc.
pub(crate) fn scaffold_features() -> Vec<String> {
    [
        "core",
        "storage",
        "dashboard",
        "assets",
        "self-update",
        "notify",
    ]
    .iter()
    .map(|f| (*f).to_string())
    .collect()
}
pub(crate) const TOOLCHAIN: &str = "1.97";
pub(crate) const KP_THEMES: &str = "12.0.0";
pub(crate) const CHASSIS_REPO: &str = "https://github.com/kennypassenier/chassis-rs";
