//! ux-chassis-5 and ux-chassis-6: a client has a page of its own at
//! `/clients/{id}` (behind the login, not a nav entry, 404 for an unknown id),
//! the list links to it, nothing in the manage flow reloads the page, and the
//! revoke confirmation says exactly what happens.

use axum::Router;

use crate::fixtures::{app, http, id_of, issue, login};
use crate::html_text::{says_client, visible_text};

#[tokio::test]
async fn ux5_a_client_has_a_page_behind_the_login() {
    let dir = tempfile::tempdir().unwrap();
    let mut app = app(dir.path(), Router::new());
    app.vocabulary("source", "sources");
    let running = app.start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let admin = [("Cookie", cookie.as_str())];
    let (_, body) = issue(addr, &cookie, "job-tracker").await;
    let id = id_of(&body);

    // Behind the login like the list: a visitor is sent to it.
    let (status, headers, _) = http(addr, "GET", &format!("/clients/{id}"), &[], "").await;
    assert_eq!(status, 303, "{headers}");
    assert!(headers.contains("location: /login"), "{headers}");

    let (status, _, page) = http(addr, "GET", &format!("/clients/{id}"), &admin, "").await;
    assert_eq!(status, 200, "{page}");
    assert!(page.contains(">job-tracker</h1>"), "{page}");
    assert!(
        page.contains("href=\"/clients\" data-client-back>Sources</a>"),
        "a way back to the list, in the page's own label: {page}"
    );
    assert_eq!(says_client(&visible_text(&page)), None, "{page}");
    // Not a nav entry: the bar still lists the kit's pages only, and the
    // Clients entry stays the current one.
    assert!(
        !page.contains(&format!("href=\"&#x2f;clients&#x2f;{id}\"")),
        "{page}"
    );
    assert!(
        page.contains("href=\"&#x2f;clients\" aria-current=\"page\""),
        "{page}"
    );

    // The list links to the page, from the name and from Manage.
    let (_, _, list) = http(addr, "GET", "/clients", &admin, "").await;
    assert_eq!(
        list.matches(&format!("href=\"/clients/{id}\"")).count(),
        2,
        "{list}"
    );
    running.stop().await;
}

#[tokio::test]
async fn ux5_an_unknown_id_is_a_404_in_the_projects_words() {
    let dir = tempfile::tempdir().unwrap();
    let mut app = app(dir.path(), Router::new());
    app.vocabulary("source", "sources");
    let running = app.start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let (status, _, page) = http(
        addr,
        "GET",
        "/clients/00000000-0000-4000-8000-000000000000",
        &[("Cookie", cookie.as_str())],
        "",
    )
    .await;
    assert_eq!(status, 404, "{page}");
    assert_eq!(says_client(&visible_text(&page)), None, "{page}");
    running.stop().await;
}

#[tokio::test]
async fn ux5_the_manage_flow_never_reloads_the_page() {
    let dir = tempfile::tempdir().unwrap();
    let running = app(dir.path(), Router::new()).start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let (_, body) = issue(addr, &cookie, "job-tracker").await;
    let id = id_of(&body);
    let admin = [("Cookie", cookie.as_str())];
    let (_, _, page) = http(addr, "GET", &format!("/clients/{id}"), &admin, "").await;
    let (_, _, list) = http(addr, "GET", "/clients", &admin, "").await;
    for (name, html) in [("client page", &page), ("list", &list)] {
        assert!(
            !html.contains("data-kp-reload=\"page\"") && !html.contains("manage-dialog"),
            "the {name} reloads the page or still holds a manage dialog: {html}"
        );
    }
    // Every confirmation stands in the page: no second dialog is asked for.
    assert!(
        !page.contains("data-kp-confirm=\"Re-issue")
            && !page.contains("data-kp-confirm=\"Revoke")
            && !page.contains("data-kp-confirm=\"Delete"),
        "{page}"
    );
    for panel in ["reissue", "revoke", "delete"] {
        assert!(
            page.contains(&format!("data-client-confirm=\"{panel}\"")),
            "the {panel} confirmation is a panel in the page: {page}"
        );
    }
    running.stop().await;
}

// ux-chassis-6: Revoke says what it does, exactly: the token stops at once and
// is wiped, and the way back is a new token. Delete keeps its "cannot be undone".
#[tokio::test]
async fn ux6_the_revoke_confirmation_says_exactly_what_happens() {
    let dir = tempfile::tempdir().unwrap();
    let running = app(dir.path(), Router::new()).start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let (_, body) = issue(addr, &cookie, "job-tracker").await;
    let id = id_of(&body);
    let (_, _, page) = http(
        addr,
        "GET",
        &format!("/clients/{id}"),
        &[("Cookie", cookie.as_str())],
        "",
    )
    .await;
    let panel = |name: &str| {
        let from = page
            .find(&format!("data-client-confirm=\"{name}\""))
            .unwrap_or_else(|| panic!("no {name} panel: {page}"));
        visible_text(&page[from..from + 900])
    };
    let revoke = panel("revoke");
    assert!(
        revoke.contains(
            "The token stops working at once and is wiped. To use job-tracker again, issue a new token."
        ),
        "{revoke}"
    );
    assert!(!revoke.contains("cannot be undone"), "{revoke}");
    assert!(panel("delete").contains("This cannot be undone."));
    running.stop().await;
}
