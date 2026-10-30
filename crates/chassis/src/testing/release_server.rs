//! The in-process fake release host behind `FakeReleaseServer::start`:
//! a signed manifest written to a temporary directory and a file server
//! on port 0.

use axum::Router;

use super::FakeReleaseServer;

/// Write a release signed by a throwaway key and serve it.
pub(super) async fn serve(
    version: &str,
    binary: &[u8],
    asset: &str,
    trusted_comment: &str,
) -> FakeReleaseServer {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    let dir = tempfile::tempdir().expect("a temporary directory for the fake release");
    let keypair =
        minisign::KeyPair::generate_unencrypted_keypair().expect("a throwaway minisign key");
    let manifest = format!("{}  {}\n", crate::shell::update::sha256_hex(binary), asset);
    let signature = minisign::sign(
        Some(&keypair.pk),
        &keypair.sk,
        manifest.as_bytes(),
        Some(trusted_comment),
        None,
    )
    .expect("signing the fake manifest");
    std::fs::write(dir.path().join("VERSION"), version).expect("write VERSION");
    std::fs::write(dir.path().join("SHA256SUMS"), &manifest).expect("write SHA256SUMS");
    std::fs::write(
        dir.path().join("SHA256SUMS.minisig"),
        signature.into_string(),
    )
    .expect("write SHA256SUMS.minisig");
    std::fs::write(dir.path().join(asset), binary).expect("write the asset");
    let root = dir.path().to_path_buf();
    let version_hits = Arc::new(AtomicUsize::new(0));
    let hits = version_hits.clone();
    let app = Router::new().route(
        "/{name}",
        axum::routing::get(
            move |axum::extract::Path(name): axum::extract::Path<String>| {
                let root = root.clone();
                let hits = hits.clone();
                async move {
                    if name == "VERSION" {
                        hits.fetch_add(1, Ordering::SeqCst);
                    }
                    match std::fs::read(root.join(&name)) {
                        Ok(bytes) => (axum::http::StatusCode::OK, bytes),
                        Err(_) => (axum::http::StatusCode::NOT_FOUND, Vec::new()),
                    }
                }
            },
        ),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind the fake release server on a free port");
    let addr = listener
        .local_addr()
        .expect("the fake release server's address");
    let task = tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("the fake release server serves until the runtime ends");
    });
    FakeReleaseServer {
        url: format!("http://{addr}"),
        pubkey: keypair.pk.to_base64(),
        dir,
        version_hits,
        _task: task,
    }
}
