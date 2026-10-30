//! Tests of the `backup-pause` / `backup-resume` command line against a real
//! socket. Its own module so the gate tests and the client tests each stay small.

use super::*;

fn pause_cmd(socket: &Path, mode: Mode, fallback: bool) -> BackupCmd {
    BackupCmd::Pause {
        secs: 60,
        mode,
        fallback,
        socket: Some(socket.to_path_buf()),
        // A unit no machine has, so a fallback can never touch a real one.
        unit: Some("chassis-test-no-such-unit-7f3a.service".into()),
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_command_line_pauses_and_resumes_over_the_socket() {
    let _serial = SERIAL.write().await;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(SOCKET_NAME);
    let server = server::Server::start(path.clone(), controller()).expect("bound");
    let socket = Some(path.clone());
    let unit = Some("chassis-test-no-such-unit-7f3a.service".to_string());
    assert_eq!(
        client::run("t", &pause_cmd(&path, Mode::Full, false)).await,
        0
    );
    assert!(is_fully_paused());
    let status = BackupCmd::Status {
        socket: socket.clone(),
        unit: unit.clone(),
    };
    assert_eq!(client::run("t", &status).await, 0);
    let resume = BackupCmd::Resume {
        socket: socket.clone(),
        unit: unit.clone(),
    };
    assert_eq!(client::run("t", &resume).await, 0);
    assert!(!is_paused());
    // A pause still in force when the service stops is ended first.
    assert_eq!(
        client::run("t", &pause_cmd(&path, Mode::Writes, false)).await,
        0
    );
    server.stop().await;
    assert!(!is_paused());
    assert!(!path.exists(), "the socket is removed at stop");
    assert_eq!(
        client::run("t", &pause_cmd(&path, Mode::Writes, false)).await,
        client::EXIT_UNAVAILABLE,
        "nobody listening and no fallback"
    );
    assert_eq!(
        client::run("t", &resume).await,
        0,
        "nothing to resume is not a failure"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn without_a_listener_the_fallback_goes_to_systemd_and_never_claims_a_pause() {
    let _serial = SERIAL.write().await;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(SOCKET_NAME);
    // No server: the fallback asks systemd about a unit that does not
    // exist (or finds no systemd at all) and must not report 0.
    assert_eq!(
        client::run("t", &pause_cmd(&path, Mode::Writes, true)).await,
        client::EXIT_UNAVAILABLE
    );
}

#[tokio::test]
async fn the_protocol_refuses_what_it_does_not_know() {
    let c = controller();
    for line in [
        "pause soon",
        "pause 0",
        "pause 99999",
        "pause 60 everything",
        "pause 60 full extra",
        "dance",
    ] {
        assert!(
            server::answer(line, &c).await.starts_with("error"),
            "{line}"
        );
    }
}
