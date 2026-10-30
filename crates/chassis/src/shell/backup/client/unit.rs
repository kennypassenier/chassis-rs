//! The systemd fallback of `backup-pause`: stop the unit, arm a dead-man
//! timer that starts it again, and start it again on `backup-resume`.
//! Its own module because it is the only part of the client that talks to
//! systemd; the socket protocol lives in the parent.

use super::*;

async fn systemctl(args: &[&str]) -> Result<std::process::Output, String> {
    tokio::process::Command::new("systemctl")
        .args(args)
        .output()
        .await
        .map_err(|e| format!("cannot run systemctl: {e}"))
}

fn text(out: &std::process::Output) -> String {
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn err(out: &std::process::Output) -> String {
    String::from_utf8_lossy(&out.stderr).trim().to_string()
}

/// What `systemctl show` says about a unit: its load and active state.
/// `Err` carries the exit code after the explanation was printed.
async fn unit_state(unit: &str) -> Result<(String, String), u8> {
    let show = match systemctl(&["show", "--property=LoadState,ActiveState", "--value", unit]).await
    {
        Ok(out) if out.status.success() => text(&out),
        Ok(out) => {
            eprintln!(
                "cannot read {unit} from systemd: {}. What now: stop the service another way for the backup",
                err(&out)
            );
            return Err(EXIT_UNAVAILABLE);
        }
        Err(e) => {
            eprintln!(
                "{e}. What now: without systemd the service has to be stopped another way for the backup"
            );
            return Err(EXIT_UNAVAILABLE);
        }
    };
    let mut lines = show.lines();
    let load = lines.next().unwrap_or_default().to_string();
    let active = lines.next().unwrap_or_default().to_string();
    Ok((load, active))
}

/// Arm the systemd timer that starts `unit` again `secs` from now.
/// `Err` carries the exit code after the marker was removed and the
/// explanation printed.
async fn arm_deadman(unit: &str, secs: u64) -> Result<(), u8> {
    let timer = deadman(unit);
    let _ = systemctl(&["stop", &format!("{timer}.timer")]).await;
    let _ = systemctl(&["reset-failed", &format!("{timer}.service")]).await;
    let armed = tokio::process::Command::new("systemd-run")
        .args([
            &format!("--unit={timer}"),
            &format!("--on-active={secs}s"),
            "--timer-property=AccuracySec=1s",
            "systemctl",
            "start",
            unit,
        ])
        .output()
        .await;
    match armed {
        Ok(out) if out.status.success() => Ok(()),
        Ok(out) => {
            let _ = std::fs::remove_file(marker(unit));
            eprintln!(
                "cannot arm the restart timer for {unit}: {}. Nothing was stopped",
                err(&out)
            );
            Err(1)
        }
        Err(e) => {
            let _ = std::fs::remove_file(marker(unit));
            eprintln!("cannot run systemd-run: {e}. Nothing was stopped");
            Err(1)
        }
    }
}

/// The fallback: stop the unit, with a systemd timer that starts it
/// again at the deadline even if `backup-resume` never comes.
pub(super) async fn stop_unit(unit: &str, secs: u64) -> u8 {
    let (load, active) = match unit_state(unit).await {
        Ok(state) => state,
        Err(code) => return code,
    };
    if load != "loaded" {
        eprintln!(
            "systemd does not know {unit} (LoadState={load}). What now: pass --unit with the unit's real name"
        );
        return EXIT_UNAVAILABLE;
    }
    if matches!(active.as_str(), "inactive" | "failed") {
        println!("not-running {unit}");
        return 0;
    }
    if let Err(e) = std::fs::create_dir_all(MARKER_DIR) {
        eprintln!(
            "cannot create {MARKER_DIR}: {e}. What now: run backup-pause as root (pct exec does)"
        );
        return EXIT_UNAVAILABLE;
    }
    let deadline = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
        + secs;
    if let Err(e) = std::fs::write(marker(unit), format!("{deadline}\n")) {
        eprintln!("cannot write the stop marker: {e}. What now: run backup-pause as root");
        return EXIT_UNAVAILABLE;
    }
    // The dead-man first, so a stopped unit always comes back.
    if let Err(code) = arm_deadman(unit, secs).await {
        return code;
    }
    match systemctl(&["stop", unit]).await {
        Ok(out) if out.status.success() => {
            println!("stopped {unit} {deadline}");
            0
        }
        Ok(out) => {
            eprintln!("stopping {unit} failed: {}; starting it again", err(&out));
            start_unit(unit).await;
            1
        }
        Err(e) => {
            eprintln!("{e}; starting {unit} again");
            start_unit(unit).await;
            1
        }
    }
}

pub(super) async fn start_unit(unit: &str) -> u8 {
    let timer = deadman(unit);
    let _ = systemctl(&["stop", &format!("{timer}.timer")]).await;
    let res = systemctl(&["start", unit]).await;
    let _ = std::fs::remove_file(marker(unit));
    match res {
        Ok(out) if out.status.success() => {
            println!("started {unit}");
            0
        }
        Ok(out) => {
            eprintln!(
                "starting {unit} failed: {}. What now: systemctl status {unit}",
                err(&out)
            );
            1
        }
        Err(e) => {
            eprintln!("{e}. What now: start {unit} by hand");
            1
        }
    }
}
