//! K28 (vocabulary) and K29 (row and section actions), in-process like
//! `client_form_hooks.rs`: an `App` on port 0 with generated secrets, a
//! login cookie, then the pages and the API over raw HTTP. Almanac is the
//! case throughout: its clients are "sources", its status section has a
//! "Reload profiles from disk" button, and a source's row gets a "Sync now".

mod support;

#[path = "vocabulary_and_actions/actions.rs"]
mod actions;
#[path = "vocabulary_and_actions/fixtures.rs"]
mod fixtures;
#[path = "vocabulary_and_actions/html_text.rs"]
mod html_text;
#[path = "vocabulary_and_actions/section_rendering.rs"]
mod section_rendering;
#[path = "vocabulary_and_actions/test_it_field.rs"]
mod test_it_field;
#[path = "vocabulary_and_actions/vocabulary_api.rs"]
mod vocabulary_api;
#[path = "vocabulary_and_actions/vocabulary_pages.rs"]
mod vocabulary_pages;
