//! Unit tests for `release_verify`; kept in their own file so the module stays small.

use super::*;

struct Signed {
    pubkey: String,
    sums: String,
    sig: String,
}

fn sign(sums: &str, comment: &str) -> Signed {
    let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
    let sig = minisign::sign(Some(&kp.pk), &kp.sk, sums.as_bytes(), Some(comment), None)
        .unwrap()
        .into_string();
    Signed {
        pubkey: kp.pk.to_base64(),
        sums: sums.to_string(),
        sig,
    }
}

fn release(bytes: &[u8]) -> Signed {
    sign(
        &format!("{}  homelab-host\n", sha256_hex(bytes)),
        "kennypassenier/homelab v1.2.3",
    )
}

#[test]
fn a_signed_listed_asset_verifies() {
    let r = release(b"binary");
    verify_release_asset(&r.sums, Some(&r.sig), &r.pubkey, "homelab-host", b"binary").unwrap();
    // `hash *name` (binary mode) and an upper-case hash are accepted too.
    let star = sign(
        &format!("{} *homelab-host\n", sha256_hex(b"b").to_uppercase()),
        "x v1.0.0",
    );
    verify_release_asset(
        &star.sums,
        Some(&star.sig),
        &star.pubkey,
        "homelab-host",
        b"b",
    )
    .unwrap();
}

#[test]
fn a_missing_or_blank_signature_is_not_signed() {
    let r = release(b"binary");
    for sig in [None, Some(""), Some("  \n")] {
        let e =
            verify_release_asset(&r.sums, sig, &r.pubkey, "homelab-host", b"binary").unwrap_err();
        assert!(matches!(e, ReleaseError::NotSigned { .. }), "{e}");
        assert!(e.to_string().contains("What now"), "{e}");
    }
}

#[test]
fn a_signature_by_another_key_or_over_other_sums_is_refused_before_any_hash() {
    let r = release(b"binary");
    let other = release(b"binary");
    let e = verify_release_asset(
        &r.sums,
        Some(&r.sig),
        &other.pubkey,
        "homelab-host",
        b"binary",
    )
    .unwrap_err();
    assert!(matches!(e, ReleaseError::Signature(_)), "{e}");
    let tampered = r.sums.replace("homelab-host", "homelab-hosx");
    let e = verify_release_asset(
        &tampered,
        Some(&r.sig),
        &r.pubkey,
        "homelab-host",
        b"binary",
    )
    .unwrap_err();
    assert!(matches!(e, ReleaseError::Signature(_)), "{e}");
    let e = verify_release_asset(
        &r.sums,
        Some("not a signature"),
        &r.pubkey,
        "homelab-host",
        b"binary",
    )
    .unwrap_err();
    assert!(matches!(e, ReleaseError::Signature(_)), "{e}");
    let e = verify_release_asset(
        &r.sums,
        Some(&r.sig),
        "not a key",
        "homelab-host",
        b"binary",
    )
    .unwrap_err();
    assert!(matches!(e, ReleaseError::Signature(_)), "{e}");
}

#[test]
fn a_download_that_differs_from_the_signed_list_is_a_checksum_mismatch() {
    let r = release(b"binary");
    let e = verify_release_asset(&r.sums, Some(&r.sig), &r.pubkey, "homelab-host", b"binarY")
        .unwrap_err();
    assert!(matches!(e, ReleaseError::HashMismatch { .. }), "{e}");
    assert!(e.to_string().contains("CHECKSUM MISMATCH"), "{e}");
}

#[test]
fn an_asset_the_signed_list_does_not_name_is_refused() {
    let r = release(b"binary");
    let e =
        verify_release_asset(&r.sums, Some(&r.sig), &r.pubkey, "homelab", b"binary").unwrap_err();
    assert!(matches!(e, ReleaseError::NotListed { .. }), "{e}");
}

#[test]
fn the_bound_check_refuses_a_replayed_release() {
    let r = release(b"binary");
    let v = |s| Version::parse(s).unwrap();
    let ok = |repo, ver| {
        verify_release_asset_for(
            &r.sums,
            Some(&r.sig),
            &r.pubkey,
            "homelab-host",
            b"binary",
            repo,
            ver,
        )
    };
    ok(Some("kennypassenier/homelab"), v("1.2.3")).unwrap();
    ok(None, v("1.2.3")).unwrap();
    assert!(matches!(
        ok(Some("kennypassenier/homelab"), v("1.2.4")),
        Err(ReleaseError::WrongRelease { .. })
    ));
    assert!(matches!(
        ok(Some("someone/else"), v("1.2.3")),
        Err(ReleaseError::WrongRelease { .. })
    ));
}

#[test]
fn the_typed_error_converts_to_the_kit_error_with_its_remedy() {
    let e: Error = ReleaseError::NotSigned { asset: "a".into() }.into();
    assert!(!e.remedy.is_empty());
    assert!(!e.message.contains("What now"), "{}", e.message);
}
