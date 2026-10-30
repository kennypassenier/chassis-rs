//! Renaming and deleting stored passkeys, and the name rule they share.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};

use super::{MAX_NAME_CHARS, PasskeyListing, PasskeyState, RenameBody};
use crate::core::error::{Error, Kind};

/// Body of [`super::rename`].
pub(super) async fn rename(
    State(s): State<PasskeyState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<RenameBody>,
) -> Result<Json<PasskeyListing>, Error> {
    let name = clean_name(&body.name)?;
    {
        let mut store = s.store.lock().expect("passkeys lock");
        let Some(p) = store.passkeys.iter_mut().find(|p| p.id == id) else {
            return Err(Error::new(
                Kind::NotFound,
                format!("no passkey {id}"),
                "reload the Passkeys page; it may have been deleted",
            ));
        };
        p.label = name;
    }
    s.save()?;
    let view = s
        .list_for_request(&headers)
        .await
        .into_iter()
        .find(|v| v.view.id == id)
        .expect("just renamed");
    Ok(Json(view))
}

/// Body of [`super::delete`].
pub(super) async fn delete(
    State(s): State<PasskeyState>,
    Path(id): Path<String>,
) -> Result<StatusCode, Error> {
    {
        let mut store = s.store.lock().expect("passkeys lock");
        let before = store.passkeys.len();
        store.passkeys.retain(|p| p.id != id);
        if store.passkeys.len() == before {
            return Err(Error::new(
                Kind::NotFound,
                format!("no passkey {id}"),
                "list them on /passkeys",
            ));
        }
    }
    s.save()?;
    Ok(StatusCode::NO_CONTENT)
}

/// Body of [`super::clean_name`].
pub(super) fn clean_name(raw: &str) -> Result<String, Error> {
    let name = raw.trim();
    let n = name.chars().count();
    if n == 0 {
        return Err(Error::invalid(
            "the name is empty",
            "type a short name, such as \"Kenny's phone\"",
        ));
    }
    if n > MAX_NAME_CHARS {
        return Err(Error::invalid(
            format!("the name is {n} characters long; the limit is {MAX_NAME_CHARS}"),
            "use a shorter name",
        ));
    }
    Ok(name.to_string())
}
