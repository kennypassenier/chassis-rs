//! `TestApp::app_db` and `read_app_db`: an integration test reaches the
//! database the project declared in its configure closure.

use axum::Router;
use chassis::AppSpec;
use chassis::storage::{AppDbSpec, Migration, kit_file_name};
use chassis::testing::TestApp;

fn spec() -> AppSpec {
    AppSpec {
        name: "dbharness",
        version: "0.0.0",
        ..Default::default()
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_test_reads_the_app_database_the_project_declared() {
    let app = TestApp::start_with(spec(), Router::new(), |app| {
        let migrations = vec![Migration::sql("CREATE TABLE t (n INTEGER NOT NULL)")];
        app.app_db(AppDbSpec::new(migrations)).unwrap();
    })
    .await;
    let handle = app.app_db().expect("the app declared a database");
    handle
        .write(|tx| {
            tx.execute("INSERT INTO t (n) VALUES (7)", [])?;
            Ok(())
        })
        .await
        .unwrap();
    let n: i64 = app.read_app_db(|c| Ok(c.query_row("SELECT n FROM t", [], |r| r.get(0))?));
    assert_eq!(n, 7);
    assert!(
        app.state_dir().join(kit_file_name("dbharness")).exists(),
        "kit_file_name names the kit file the app wrote"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn an_app_without_a_database_has_none() {
    let app = TestApp::start(spec(), Router::new()).await;
    assert!(app.app_db().is_none());
}
