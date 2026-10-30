//! Tests of what the updater refuses to trust: signatures, hashes, plain http,
//! oversized assets, a missing `VERSION`, and the compiled-in key.

use super::*;

#[tokio::test]
async fn a_bad_signature_is_refused_before_any_hash_and_a_bad_hash_after() {
    let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
    let dir = tempfile::tempdir().unwrap();
    let bin = installed(dir.path(), GOOD_BINARY);
    // Tamper with the manifest: the signature no longer verifies.
    let manifest_path = release.dir.path().join("SHA256SUMS");
    let mut m = std::fs::read_to_string(&manifest_path).unwrap();
    m.push_str("deadbeef  extra\n");
    std::fs::write(&manifest_path, m).unwrap();
    let up = Updater::new(
        cfg(&release, Mode::Supervised, dir.path().join("c")),
        bin.clone(),
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        Arc::new(|_| {}),
        None,
    )
    .unwrap();
    let err = up.check_once().await.unwrap_err();
    assert!(
        err.message.contains("signature does not verify"),
        "{}",
        err.message
    );

    // Fresh release, but the served binary differs from the signed one.
    let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
    std::fs::write(
        release.dir.path().join("svc"),
        b"#!/bin/sh\nexit 0\n#tampered\n",
    )
    .unwrap();
    let up = Updater::new(
        cfg(&release, Mode::Supervised, dir.path().join("c")),
        bin.clone(),
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        Arc::new(|_| {}),
        None,
    )
    .unwrap();
    let err = up.check_once().await.unwrap_err();
    assert!(err.message.contains("SHA-256"), "{}", err.message);
    assert_eq!(std::fs::read(&bin).unwrap(), GOOD_BINARY);
}

/// S1: a genuine signature over an OLDER manifest, served under a newer
/// VERSION, is refused because the trusted comment names another version.
#[tokio::test]
async fn a_signature_for_another_version_or_repo_is_refused() {
    let release =
        fake_release_signed_as("1.1.0", GOOD_BINARY, "svc", &format!("{TEST_REPO} v1.0.5")).await;
    let dir = tempfile::tempdir().unwrap();
    let bin = installed(dir.path(), GOOD_BINARY);
    let up = Updater::new(
        cfg(&release, Mode::Supervised, dir.path().join("c")),
        bin.clone(),
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        Arc::new(|_| {}),
        None,
    )
    .unwrap();
    let err = up.check_once().await.unwrap_err();
    assert!(err.message.contains("v1.0.5"), "{}", err.message);
    assert!(err.remedy.contains("replaying"), "{}", err.remedy);
    assert_eq!(std::fs::read(&bin).unwrap(), GOOD_BINARY, "untouched");

    let release =
        fake_release_signed_as("1.1.0", GOOD_BINARY, "svc", "kennypassenier/other v1.1.0").await;
    let up = Updater::new(
        cfg(&release, Mode::Supervised, dir.path().join("c")),
        bin.clone(),
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        Arc::new(|_| {}),
        None,
    )
    .unwrap();
    let err = up.check_once().await.unwrap_err();
    assert!(
        err.message.contains("kennypassenier/other"),
        "{}",
        err.message
    );
}

/// S1: a plain-http release host is refused unless the operator says so.
#[tokio::test]
async fn plain_http_needs_allow_insecure() {
    let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
    let dir = tempfile::tempdir().unwrap();
    let bin = installed(dir.path(), GOOD_BINARY);
    let mut c = cfg(&release, Mode::Supervised, dir.path().join("c"));
    c.allow_insecure = false;
    let err = Updater::new(
        c,
        bin,
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        Arc::new(|_| {}),
        None,
    )
    .err()
    .expect("http:// refused");
    assert!(err.message.contains("not https://"), "{}", err.message);
}

/// S8: an asset above the cap is refused before it is read in full.
#[tokio::test]
async fn an_oversized_asset_is_refused() {
    let big = vec![b'x'; 4096];
    let release = fake_release("1.1.0", &big, "svc").await;
    let dir = tempfile::tempdir().unwrap();
    let bin = installed(dir.path(), GOOD_BINARY);
    let mut c = cfg(&release, Mode::Supervised, dir.path().join("c"));
    c.max_download_bytes = 1024;
    let up = Updater::new(
        c,
        bin.clone(),
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        Arc::new(|_| {}),
        None,
    )
    .unwrap();
    let err = up.check_once().await.unwrap_err();
    assert!(
        err.message.contains("update_max_download_bytes"),
        "{}",
        err.message
    );
    assert_eq!(std::fs::read(&bin).unwrap(), GOOD_BINARY);
}

/// fix-10: `releases/latest/download/VERSION` answers 404 while the newest
/// release is published but not signed yet; the check says so.
#[tokio::test]
async fn a_missing_version_says_the_release_is_not_signed_yet() {
    let release = fake_release("1.0.0", GOOD_BINARY, "svc").await;
    let dir = tempfile::tempdir().unwrap();
    let bin = installed(dir.path(), GOOD_BINARY);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, axum::Router::new()).await.unwrap() });
    let mut c = cfg(&release, Mode::Supervised, dir.path().join("c"));
    c.url = format!("http://{addr}");
    let up = Updater::new(
        c,
        bin,
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        Arc::new(|_| {}),
        None,
    )
    .unwrap();
    let err = format!("{:?}", up.latest().await.unwrap_err());
    assert!(err.contains("not signed yet"), "{err}");
}

/// Rule 9 / H5: one REAL artefact signed with Kenny's ecosystem key
/// (Almanac v2.4.0) verifies against the compiled-in `RELEASE_PUBKEY`.
/// Its trusted comment is minisign's default, not the chassis
/// `<repo> v<version>` form: pre-chassis releases are therefore refused
/// by the version binding, which is the intended boundary.
#[test]
fn the_compiled_in_key_verifies_a_real_almanac_release() {
    let manifest = include_bytes!("../../../../tests/fixtures/almanac-v2.4.0/SHA256SUMS");
    let sig = include_str!("../../../../tests/fixtures/almanac-v2.4.0/SHA256SUMS.minisig");
    let verified =
        verify_signature(RELEASE_PUBKEY, manifest, sig).expect("real signature verifies");
    assert!(
        verified.trusted_comment().contains("file:SHA256SUMS"),
        "{}",
        verified.trusted_comment()
    );
    let mut tampered = manifest.to_vec();
    tampered.push(b'\n');
    assert!(
        verify_signature(RELEASE_PUBKEY, &tampered, sig).is_err(),
        "one byte changed → refused"
    );
}
