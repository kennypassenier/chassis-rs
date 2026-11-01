//! Locks for what Kenny said must always hold (2026-10-02: "Als we altijd
//! in cirkels blijven gaan en fouten terugkomen…"). Each test names the
//! rule and the day it was given; a change that undoes one fails here
//! before it can ship. Rules already locked elsewhere are listed at the
//! bottom with the test that holds them.

mod support;

#[path = "kenny_rules/component_states.rs"]
mod component_states;
#[path = "kenny_rules/fixtures.rs"]
mod fixtures;
#[path = "kenny_rules/kit_page_fit.rs"]
mod kit_page_fit;
#[path = "kenny_rules/layout_and_shell.rs"]
mod layout_and_shell;
#[path = "kenny_rules/login_pages.rs"]
mod login_pages;
#[path = "kenny_rules/runtime_rules.rs"]
mod runtime_rules;

// Locked elsewhere, listed so the inventory stays in one place:
// - the web app at the root, /app/… 308 to the root (Kenny, 2026-10-01):
//   shell::webapp::tests::at_the_root_the_app_answers_what_no_route_claims,
//   tests/webapp_live.rs
// - kit pages in the navigation, Overview hidden under the brand
//   (2026-10-01): shell::pages::tests (5)
// - the brand text is the project's (fix-15): pages::tests asserts brand.title
// - backup pause is start/stop with a dead-man and a heartbeat
//   (2026-10-01/02): shell::backup::tests (10)
// - no image for a native service (2026-10-02): chassis-cli
//   the_image_follows_the_deployment_unless_the_project_says_otherwise,
//   tests/new_project_builds.rs
// - a project's own unit directives survive sync (fix-14): chassis-cli tests
