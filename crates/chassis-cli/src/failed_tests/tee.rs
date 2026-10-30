//! Running a command with its output shown live and kept, so the failures can
//! be read afterwards.

use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::Stdio;
use std::sync::{Arc, Mutex};

use crate::process::command;

/// Runs a command with its output shown live and kept, so the failures can be
/// read afterwards. Returns `(success, combined output)`.
pub fn run_tee(dir: &Path, program: &str, args: &[String]) -> std::io::Result<(bool, String)> {
    let mut child = command(program, dir)
        .args(args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let buf = Arc::new(Mutex::new(String::new()));
    let mut handles = Vec::new();
    if let Some(out) = child.stdout.take() {
        let buf = Arc::clone(&buf);
        handles.push(std::thread::spawn(move || {
            pump(out, std::io::stdout(), &buf)
        }));
    }
    if let Some(err) = child.stderr.take() {
        let buf = Arc::clone(&buf);
        handles.push(std::thread::spawn(move || {
            pump(err, std::io::stderr(), &buf)
        }));
    }
    let status = child.wait()?;
    for h in handles {
        let _ = h.join();
    }
    let text = buf.lock().map(|b| b.clone()).unwrap_or_default();
    Ok((status.success(), text))
}

fn pump<R: std::io::Read, W: Write>(from: R, mut to: W, buf: &Mutex<String>) {
    let mut reader = BufReader::new(from);
    let mut line = String::new();
    while reader.read_line(&mut line).is_ok_and(|n| n > 0) {
        let _ = to.write_all(line.as_bytes());
        let _ = to.flush();
        if let Ok(mut b) = buf.lock() {
            b.push_str(&line);
        }
        line.clear();
    }
}
