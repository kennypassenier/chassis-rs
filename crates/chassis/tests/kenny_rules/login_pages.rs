//! Rules about the login and passkeys pages and their native posts.

use crate::fixtures::kit_file;

/// 2026-10-19 (kit-kp11, approved demos "login" and "passkeys"): the login
/// page's passkey is the one primary button, the token field has Show/Hide,
/// keep-signed-in is a switch, and a failed login says what, why and what
/// now. The passkeys page lists through the kp component with the approved
/// `data-kp-confirm="dialog"` on the list (kp-themes 11.1.0 arms only real
/// controls, so Rename no longer asks to confirm).
#[test]
fn login_and_passkeys_pages_keep_their_approved_parts() {
    let login = kit_file("templates/login.html");
    for part in [
        "kp-switch",
        "data-kit-peek",
        "kp-alert__what",
        "kp-alert__why",
        "kp-alert__remedy",
        "kp-health",
        "kp-ago",
        "data-passkey-login",
    ] {
        assert!(login.contains(part), "login.html lost {part}");
    }
    let pk = kit_file("templates/passkeys.html");
    for part in [
        "data-kp-passkeys",
        "kp-qr",
        "kp-steplist",
        "data-passkey-register",
    ] {
        assert!(pk.contains(part), "passkeys.html lost {part}");
    }
    assert!(
        pk.contains("data-kp-confirm=\"dialog\""),
        "the passkey list removes through the approved confirm dialog"
    );
    assert!(
        !pk.contains("_TRUSTED_PROXIES") && !pk.contains("_PUBLIC_URL"),
        "the not-HTTPS alert speaks plain words, no variable names"
    );
}

/// Round 3 (Kenny approved 4/4, 2026-10-19 11:22): the login card is one
/// form grid, so label, field, passkey button, switch and Log in share one
/// start edge ("HOE VAAK MOET IK NOG ZEGGEN OM ALLES DEFTIG VERTICAAL TE
/// ALIGNEN"); the phone bar's Search is a 36 px square beside the theme menu.
#[test]
fn login_card_is_one_form_grid_and_phone_search_is_a_square() {
    let login = kit_file("templates/login.html");
    assert!(
        login.contains("class=\"kp-formgrid kit-login__grid\"")
            && login.contains("data-kp-formgrid-stack=\"never\""),
        "the login card is one .kp-formgrid that never stacks"
    );
    for part in [
        "kp-formgrid__label\" for=\"token\"",
        "kp-formgrid__actions\"><button type=\"button\" class=\"kp-button kp-button--ghost\" data-kit-peek",
        "kp-formgrid__row--buttons",
    ] {
        assert!(login.contains(part), "login grid lacks {part}");
    }
    assert!(
        !login.contains("kit-login__token") && !login.contains("kp-form\""),
        "no hand-made side-by-side row beside the grid"
    );
    let css = kit_file("static/chassis.css");
    assert!(
        css.contains("align-items: first baseline;\n  max-inline-size: 64rem"),
        "the intro and the card share a first baseline"
    );
    assert!(
        css.contains("inline-size: var(--kit-bar-button, 2.25rem);")
            && css.contains("block-size: var(--kit-bar-button, 2.25rem);"),
        "the phone's Search is a 36 px square"
    );
    let kp = kit_file("static/kp/dist/kp-themes.css");
    assert!(
        kp.contains(".kp-formgrid") && !css.contains("TEMPORARY: .kp-formgrid"),
        "the form grid comes from the vendored kp-themes (11.1.0), not a kit copy"
    );
}

/// 2026-10-19 (Kenny): every loading, empty and failed state is the
/// component's own, never a stand-in. The login health line is the theme's
/// skeleton while it reads and a kp-health with a normal Try again when it
/// fails; the palette retries through its own plate; the connection line
/// stands on the phone's tab bar.
#[test]
fn shell_and_login_states_use_the_components_own() {
    let js = kit_file("static/chassis.js");
    assert!(
        js.contains("bone.className = 'kp-skeleton'") && js.contains("'aria-busy'"),
        "the health line loads as the theme's skeleton"
    );
    assert!(
        js.contains("kp-palette-retry"),
        "the palette's failed plate retries"
    );
    assert!(
        !js.contains("Loading…") && !js.contains("Loading..."),
        "no plain-text loading stand-in"
    );
    let css = kit_file("static/chassis.css");
    assert!(
        css.contains("inset-block-end: var(--kp-tabbar-height, 0px);"),
        "the connection line stands above the tab bar"
    );
}

/// kp-themes 11.3.0 stops a valid `data-kp-form` submit unless the form asks
/// for the browser's own POST. The kit's login and logout are plain POSTs to
/// /login and /logout: without the attribute, nobody could sign in or out.
#[test]
fn login_and_logout_keep_their_native_post() {
    let login = kit_file("templates/login.html");
    assert!(
        login
            .contains(r#"action="/login" id="login-form" data-kp-form data-kp-form-native-submit"#)
    );
    let layout = kit_file("templates/layout.html");
    assert!(layout.contains(r#"id="chassis-logout" data-kp-form data-kp-form-native-submit"#));
}
