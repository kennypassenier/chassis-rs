//! The command line of an `App`: the clap definition (flags, subcommands,
//! one flag per knob) and the reading of its matches into a control
//! command, a backup command and the knob overrides. Its own module so
//! `App::from_args_with_env` stays a short sequence of steps.

use std::collections::BTreeMap;
use std::path::PathBuf;

use clap::{Arg, ArgAction, ArgMatches, Command};

use super::{AppSpec, Control};
use crate::core::config::Knob;
use crate::shell::backup::{BackupCmd, Mode};

/// The whole parser: the kit's flags and subcommands, then one global flag
/// per non-secret knob.
pub(super) fn command(spec: &AppSpec, knobs: &[Knob]) -> Command {
    let mut cmd = Command::new(spec.name.to_string())
        .version(spec.version)
        .disable_version_flag(true)
        .after_help(spec.help_extra.unwrap_or_default())
        .subcommand(
            Command::new("gen-secret")
                .about("Print a fresh login token and secret key for the environment file (terminal only)"),
        )
        .subcommand(
            Command::new("update")
                .about("One supervised update attempt: verify, install, exit 0 (also when already current); never restarts"),
        )
        .subcommand(backup_pause_command())
        .subcommand(backup_resume_command())
        .subcommand(
            Command::new("rekey")
                .about("Re-encrypt every store under a new secret key: set <PREFIX>_OLD_SECRET_KEY to the previous key and <PREFIX>_SECRET_KEY to the new one, then run this once (service stopped)"),
        );
    cmd = control_flags(cmd);
    for k in knobs {
        // S8: secrets never travel on argv (/proc/*/cmdline is world-
        // readable); they come from the environment only.
        if k.secret {
            continue;
        }
        cmd = cmd.arg(knob_flag(spec, k));
    }
    cmd
}

/// `backup-pause`: hold every write of the running service's state.
fn backup_pause_command() -> Command {
    Command::new("backup-pause")
        .about("Ask the running service to hold every write of its state for a backup; returns once the files stand still. Exit 0 paused, 3 no service listening, 4 writes did not drain")
        .arg(
            Arg::new("for")
                .long("for")
                .value_name("SECS")
                .required_unless_present("status")
                .value_parser(clap::value_parser!(u64).range(1..=21600))
                .help("The pause ends by itself after this many seconds (1 to 21600), also when backup-resume never comes"),
        )
        .arg(
            Arg::new("status")
                .long("status")
                .action(ArgAction::SetTrue)
                .conflicts_with_all(["for", "mode", "no-fallback"])
                .help("Print `paused <seconds left> <mode>`, `stopped <unit> <deadline>` or `running` and exit 0"),
        )
        .arg(
            Arg::new("mode")
                .long("mode")
                .value_name("MODE")
                .value_parser(["writes", "full"])
                .default_value("writes")
                .help("writes: only writes wait; full: every request but the probes is answered 503 too. The service may raise it, never lower it"),
        )
        .arg(
            Arg::new("no-fallback")
                .long("no-fallback")
                .action(ArgAction::SetTrue)
                .help("When the service cannot pause in-process, exit 3/4 instead of stopping its systemd unit"),
        )
        .arg(
            Arg::new("unit")
                .long("unit")
                .value_name("UNIT")
                .help("The systemd unit for the fallback (default <name>.service)"),
        )
        .arg(
            Arg::new("socket")
                .long("socket")
                .value_name("PATH")
                .help("The service's backup socket (default /run/<name>/backup.sock)"),
        )
}

/// `backup-resume`: end a pause, or start the unit `backup-pause` stopped.
fn backup_resume_command() -> Command {
    Command::new("backup-resume")
        .about("End a backup pause, or start the unit backup-pause stopped (exit 0 also when nothing was paused)")
        .arg(
            Arg::new("unit")
                .long("unit")
                .value_name("UNIT")
                .help("The systemd unit backup-pause may have stopped (default <name>.service)"),
        )
        .arg(
            Arg::new("socket")
                .long("socket")
                .value_name("PATH")
                .help("The service's backup socket (default /run/<name>/backup.sock)"),
        )
}

/// The flags that ask for a control command instead of a run.
fn control_flags(cmd: Command) -> Command {
    cmd
        .arg(
            Arg::new("version")
                .long("version")
                .short('V')
                .action(ArgAction::SetTrue)
                .help("Print the version of this binary and exit (reads nothing else)"),
        )
        .arg(
            Arg::new("check")
                .long("check")
                .action(ArgAction::SetTrue)
                .help("Validate configuration and the project's own checks, exit 0/1, open no socket"),
        )
        .arg(
            Arg::new("print-config")
                .long("print-config")
                .action(ArgAction::SetTrue)
                .help("Print every knob with its effective value and source; secrets masked"),
        )
        .arg(
            Arg::new("knobs")
                .long("knobs")
                .action(ArgAction::SetTrue)
                .help("Print every knob (key, env, flag, default, feature, meaning) as a Markdown table and exit (reads nothing else)"),
        )
        .arg(
            Arg::new("healthcheck")
                .long("healthcheck")
                .value_name("URL")
                .num_args(0..=1)
                .default_missing_value("")
                .help("Probe /healthz of the running instance (URL optional; derived from listen) and exit 0 when it answers"),
        )
}

/// The global flag of one knob. Knobs are accepted before or after a
/// subcommand, so `<name> update --update-url ...` works as the homelab's
/// update_cmd would write it.
fn knob_flag(spec: &AppSpec, k: &Knob) -> Arg {
    Arg::new(k.key)
        .long(k.flag_name().trim_start_matches("--").to_string())
        .value_name("VALUE")
        .action(ArgAction::Set)
        .global(true)
        .help(if matches!(k.key, "state_dir" | "config") {
            // These two decide WHERE the file is, so the file
            // cannot set them (doc-writer finding, Phase 8).
            format!("Overrides {}", k.env_name(&spec.prefix()))
        } else {
            format!(
                "Overrides {} and the `{}` key in the config file",
                k.env_name(&spec.prefix()),
                k.key
            )
        })
}

/// The control commands that are answered before any configuration is
/// read: `--version`, `--knobs` and `gen-secret`, in that order.
pub(super) fn early_control(matches: &ArgMatches) -> Option<Control> {
    if matches.get_flag("version") {
        Some(Control::Version)
    } else if matches.get_flag("knobs") {
        Some(Control::Knobs)
    } else if matches.subcommand_matches("gen-secret").is_some() {
        Some(Control::GenSecret)
    } else {
        None
    }
}

/// feat-backup-1: the homelab calls these through `pct exec`, without the
/// unit's environment, so they read no configuration at all.
pub(super) fn backup_command(matches: &ArgMatches) -> Option<BackupCmd> {
    let socket = |m: &ArgMatches| m.get_one::<String>("socket").map(PathBuf::from);
    let unit = |m: &ArgMatches| m.get_one::<String>("unit").cloned();
    if let Some(m) = matches.subcommand_matches("backup-pause") {
        Some(if m.get_flag("status") {
            BackupCmd::Status {
                socket: socket(m),
                unit: unit(m),
            }
        } else {
            BackupCmd::Pause {
                secs: *m.get_one::<u64>("for").expect("required"),
                mode: m
                    .get_one::<String>("mode")
                    .and_then(|v| Mode::parse(v))
                    .unwrap_or_default(),
                fallback: !m.get_flag("no-fallback"),
                socket: socket(m),
                unit: unit(m),
            }
        })
    } else {
        matches
            .subcommand_matches("backup-resume")
            .map(|m| BackupCmd::Resume {
                socket: socket(m),
                unit: unit(m),
            })
    }
}

/// The knob values given as flags, by knob key (secrets never are).
pub(super) fn knob_flags(matches: &ArgMatches, knobs: &[Knob]) -> BTreeMap<String, String> {
    let mut flags = BTreeMap::new();
    for k in knobs {
        if k.secret {
            continue;
        }
        if let Some(v) = matches.get_one::<String>(k.key) {
            flags.insert(k.key.to_string(), v.clone());
        }
    }
    flags
}

/// The control command the flags and subcommands ask for, if any; read
/// after configuration is loaded.
pub(super) fn requested_control(matches: &ArgMatches) -> Option<Control> {
    if matches.get_flag("print-config") {
        Some(Control::PrintConfig)
    } else if matches.get_flag("check") {
        Some(Control::Check)
    } else if matches.subcommand_matches("update").is_some() {
        Some(Control::Update)
    } else if matches.subcommand_matches("rekey").is_some() {
        Some(Control::Rekey)
    } else {
        matches
            .get_one::<String>("healthcheck")
            .map(|u| Control::Healthcheck(if u.is_empty() { None } else { Some(u.clone()) }))
    }
}
