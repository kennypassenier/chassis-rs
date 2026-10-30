//! Tests of the `chassis` binary's own logic, grouped by the command or the
//! output they pin. `rec` is the one record they all start from.

mod kit_dependency;
mod kit_md;
mod new_cmd;
mod record_fields;
mod release_cmd;
mod scaffold_shape;
mod sign_step;
mod sync_cmd;

use crate::recorded::{CHASSIS_REPO, KP_THEMES, Recorded, TOOLCHAIN};

pub(crate) fn rec() -> Recorded {
    Recorded {
        name: "demo-svc".into(),
        description: "A demo".into(),
        repo: "kennypassenier/demo-svc".into(),
        toolchain: TOOLCHAIN.into(),
        chassis_tag: "v0.1.0".into(),
        chassis_repo: CHASSIS_REPO.into(),
        chassis_path: None,
        kp_themes: KP_THEMES.into(),
        state_dir: "/var/lib/demo-svc".into(),
        latch: false,
        env_file: None,
        latch_env: None,
        deny_ignore: Vec::new(),
        unit_service: Vec::new(),
        image: None,
        required_checks: Vec::new(),
        vmid: 0,
        release: Default::default(),
    }
}
