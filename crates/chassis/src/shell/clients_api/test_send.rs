//! The "Send test" request: one call with the client's own token to the
//! project's declared test route.

use axum::Json;
use axum::extract::{Extension, Path, State};

use super::lookup::{lookup, revoked};
use super::{ClientsApi, TestRequest, TestResult};
use crate::core::error::Error;
use crate::shell::dashboard::Vocabulary;

/// The longest body the dashboard will send as a test, so a pasted file
/// cannot turn the test button into an upload.
const TEST_BODY_MAX: usize = 64 * 1024;

/// Body of [`super::send_test_body`].
pub(super) async fn send(
    State(api): State<ClientsApi>,
    Extension(vocab): Extension<Vocabulary>,
    Path(id): Path<String>,
    request: Option<Json<TestRequest>>,
) -> Result<Json<TestResult>, Error> {
    let route = api.test_route.as_ref().ok_or_else(|| {
        Error::invalid(
            "this service declares no test route",
            "the project can register one with App::test_route",
        )
    })?;
    let body = request
        .and_then(|Json(r)| r.body)
        .unwrap_or_else(|| route.body.clone());
    if body.len() > TEST_BODY_MAX {
        return Err(Error::invalid(
            format!("the test body is {} bytes", body.len()),
            format!("keep it under {TEST_BODY_MAX} bytes"),
        ));
    }
    let token = lookup(&api, &vocab, &id, true)?
        .token
        .ok_or_else(|| revoked(&vocab, &id))?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| Error::internal(format!("http client: {e}"), "report this"))?;
    let url = format!("{}{}", api.self_base_url, route.path);
    let method = reqwest::Method::from_bytes(route.method.as_bytes()).map_err(|_| {
        Error::internal(
            format!("bad test method {}", route.method),
            "fix App::test_route",
        )
    })?;
    let res = client
        .request(method, &url)
        .bearer_auth(&token)
        .header("content-type", &route.content_type)
        .header(crate::shell::captures::TEST_HEADER, api.captures.test_key())
        .body(body)
        .send()
        .await
        .map_err(|e| {
            Error::dependency(
                format!("test request to {url} failed: {e}"),
                "is the service reachable at its own listen address?",
            )
        })?;
    let status = res.status().as_u16();
    let body = res.text().await.unwrap_or_default();
    // The capture middleware files this request as a test: it carries
    // `x-chassis-test` with the per-process key only this function sends.
    Ok(Json(TestResult { status, body }))
}
