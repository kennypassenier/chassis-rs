//! Rendering the scaffold: every kit-owned and project-owned file for a
//! `Recorded`, written to disk or compared with what a project has. Shared by
//! `new` (writes them) and `sync` (diffs them), so both see the same bytes.

use std::path::Path;

use chassis::Error;

use crate::recorded::Recorded;
use crate::templates;

/// Every file the scaffold produces for `rec`, as (path, bytes, executable).
pub(crate) fn render_all(
    rec: &Recorded,
    features: &[String],
) -> Result<Vec<(String, String, bool, bool)>, Error> {
    let ctx = rec.context(features);
    let mut out = Vec::new();
    let has = |feature: &str| features.iter().any(|f| f == feature);
    for e in templates::ENTRIES {
        if e.path.contains("latch") && !rec.latch {
            continue;
        }
        // K34 meets K35: the smoke test logs in, issues a client and opens a
        // page, and the `testing` feature it needs implies `dashboard`. A
        // headless project would be handed a test it cannot compile, and
        // `sync` would write it back on every run because the file is
        // kit-owned.
        if e.path == "tests/kit_smoke.rs" && !has("dashboard") {
            continue;
        }
        let path = render_str("path", e.path, &ctx)?;
        let body = if e.render {
            render_str(e.path, e.body, &ctx)?
        } else {
            e.body.to_string()
        };
        out.push((path, body, e.executable, e.project_owned));
    }
    Ok(out)
}

/// fix-14: directive lines (`Key=value`, not comments) in the project's
/// unit that the rendered unit does not contain.
pub(crate) fn dropped_unit_directives(current: &str, rendered: &str) -> Vec<String> {
    let kept: std::collections::HashSet<&str> = rendered.lines().map(str::trim).collect();
    current
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with(';'))
        .filter(|l| !l.starts_with('[') && l.contains('='))
        .filter(|l| !kept.contains(l))
        .map(str::to_string)
        .collect()
}

pub(crate) fn render_str(name: &str, src: &str, ctx: &minijinja::Value) -> Result<String, Error> {
    let mut env = minijinja::Environment::new();
    env.set_keep_trailing_newline(true);
    // Scaffold files are not HTML or JSON: a `.yml` template must not get
    // minijinja's JSON auto-escaping (it quoted the GitHub `${{ }}` guards).
    env.set_auto_escape_callback(|_| minijinja::AutoEscape::None);
    env.add_template(name, src)
        .and_then(|_| env.get_template(name)?.render(ctx))
        .map_err(|e| {
            Error::internal(
                format!("scaffold template {name} failed: {e}"),
                "this is a bug in the scaffold; report it with the message",
            )
        })
}

pub(crate) fn write_file(
    root: &Path,
    rel: &str,
    body: &str,
    executable: bool,
) -> Result<(), Error> {
    let path = root.join(rel);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| io_err(&path, e))?;
    }
    std::fs::write(&path, body).map_err(|e| io_err(&path, e))?;
    #[cfg(unix)]
    if executable {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| io_err(&path, e))?;
    }
    Ok(())
}

pub(crate) fn io_err(path: &Path, e: std::io::Error) -> Error {
    Error::config(
        format!("cannot write {}: {e}", path.display()),
        "check the directory's permissions and free space",
    )
}

/// `Cargo.toml` gets a path dependency when `--chassis-path` was given;
/// the template itself pins the git tag.
pub(crate) fn with_chassis_path(cargo_toml: &str, rec: &Recorded) -> String {
    match &rec.chassis_path {
        Some(p) => {
            let git_line_start = cargo_toml
                .find("chassis = { git =")
                .expect("template has the git dependency");
            let git_line_end = cargo_toml[git_line_start..]
                .find('\n')
                .map(|i| git_line_start + i)
                .unwrap_or(cargo_toml.len());
            let features_start = cargo_toml[git_line_start..git_line_end]
                .find("features =")
                .unwrap_or(0);
            let features = &cargo_toml[git_line_start + features_start..git_line_end];
            // CF-6 a: a path dependency without `version` is a wildcard to
            // cargo-deny too — the E2E found it the moment it ran the check.
            format!(
                "{}chassis = {{ path = \"{}\", version = \"{}\", {} }}{}",
                &cargo_toml[..git_line_start],
                p,
                env!("CARGO_PKG_VERSION"),
                features.trim_end_matches(" }"),
                &cargo_toml[git_line_end..]
            )
        }
        None => cargo_toml.to_string(),
    }
}

/// The line under which a project keeps its own `.gitignore` entries.
pub(crate) const GITIGNORE_MARKER: &str =
    "# --- project additions below (kept by chassis sync) ---";

/// M3 (1.6.0): `.gitignore` is kit-owned, but everything a project wrote
/// under the marker survives a sync — Almanac's guard against a compiled
/// binary in the repository root would otherwise have gone with the first
/// `sync --write`.
pub(crate) fn merge_gitignore(scaffold: &str, current: &str) -> String {
    let Some(tail) = current.split_once(GITIGNORE_MARKER).map(|(_, t)| t) else {
        return scaffold.to_string();
    };
    let tail = tail.trim_matches('\n');
    if tail.is_empty() {
        return scaffold.to_string();
    }
    format!(
        "{}{tail}\n",
        scaffold.trim_end_matches('\n').to_string() + "\n"
    )
}
